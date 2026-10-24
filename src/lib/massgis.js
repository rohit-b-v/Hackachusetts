// Live MassGIS / ArcGIS REST query helpers for the Spatial Inspector.
//
// The starter CSVs are returnGeometry=false (no coordinates). To verify
// physical proximity we re-query the layers live with
// returnGeometry=true&outSR=4326 and parse the Esri JSON geometry.
//
// Coordinate convention:
//   - GeoJSON geometry kept on features uses [lng, lat] (Esri/outSR=4326 order)
//     and is consumed by src/lib/geo.js for correct distance/containment.
//   - Leaflet rendering needs [lat, lng]; we expose that separately as
//     `.position` (points) / `.rings` (polygons) / `.paths` (lines).

import { esriRingsToGeoJSON, computeProximity } from "./geo.js";

const LANDFILL_BASE =
  "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/DEP/RenewablesAtMaLandfills/MapServer/0/query";
const EJ_BASE =
  "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/EJ2020/MapServer/0/query";
const TRANSMISSION_BASE =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query";

// Degrees of latitude per mile (~1/69). Longitude is scaled by cos(lat).
const DEG_PER_MILE_LAT = 1 / 69.0;

/** Escape single quotes for an ArcGIS SQL string literal. */
function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function buildLandfillUrl(cleanTown) {
  const where = `UPPER(MUNICIPALITY) LIKE '${sqlEscape(cleanTown)}%'`;
  const params = new URLSearchParams({
    where,
    outFields:
      "MUNICIPALITY,FACILITY,TYPE_,MW_PERMITTED,MW_OPERATING,STATUS_1,OPERATING_SINCE",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  return `${LANDFILL_BASE}?${params.toString()}`;
}

/**
 * Build one page of an EJ envelope query. We search by a geographic envelope
 * (NOT a single MUNICIPALITY = clause) so EJ block groups in NEIGHBORING towns
 * that are physically closer to the landfill are included. This is an
 * explicitly BOUNDED-AREA search (radius around the landfill point).
 */
function buildEjEnvelopeUrl(envelope, offset) {
  const { xmin, ymin, xmax, ymax } = envelope;
  const params = new URLSearchParams({
    where: "EJ='Yes'",
    geometry: `${xmin},${ymin},${xmax},${ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "MUNICIPALITY,TOTAL_POP,PCT_MINORITY,LIMENGHHPCT,BG_MHHI,EJ_CRIT_DESC",
    returnGeometry: "true",
    outSR: "4326",
    resultOffset: String(offset),
    f: "json",
  });
  return `${EJ_BASE}?${params.toString()}`;
}

function buildTransmissionUrl(envelope) {
  const { xmin, ymin, xmax, ymax } = envelope;
  const params = new URLSearchParams({
    geometry: `${xmin},${ymin},${xmax},${ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OWNER,VOLTAGE,VOLT_CLASS,TYPE,STATUS",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  return `${TRANSMISSION_BASE}?${params.toString()}`;
}

/** Envelope of a given radius (miles) around a [lat, lng] point. */
export function envelopeAroundLatLng([lat, lng], radiusMiles) {
  const dLat = radiusMiles * DEG_PER_MILE_LAT;
  const cos = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = (radiusMiles * DEG_PER_MILE_LAT) / cos;
  return { xmin: lng - dLng, ymin: lat - dLat, xmax: lng + dLng, ymax: lat + dLat };
}

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Fetch + parse JSON with a hard timeout. An optional external `signal` (from
 * the caller) is combined with an internal timeout controller so either an
 * upstream cancellation (component unmount / stale request) OR the timeout
 * aborts the request. Throws a descriptive Error on timeout/abort/HTTP error.
 */
async function fetchJson(url, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  // Abort our timeout controller if the caller's signal fires.
  const onExternalAbort = () => timeoutController.abort();
  if (signal) {
    if (signal.aborted) timeoutController.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(url, { signal: timeoutController.signal });
    if (!res.ok) throw new Error(`ArcGIS request failed: ${res.status} ${res.statusText}`);
    const json = await res.json();
    if (json.error) {
      throw new Error(json.error.message || "ArcGIS returned an error");
    }
    return json;
  } catch (err) {
    if (err && err.name === "AbortError") {
      // Distinguish caller-cancellation from a genuine timeout.
      if (signal && signal.aborted) throw new Error("request cancelled");
      throw new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }
}

// ---------------------------------------------------------------------------
// Esri -> parsed feature conversion.
// ---------------------------------------------------------------------------

/** Parse Esri point features -> { attributes, position:[lat,lng], lngLat:[lng,lat] }. */
function parsePointFeatures(json) {
  const features = Array.isArray(json?.features) ? json.features : [];
  return features
    .map((f) => {
      const g = f.geometry;
      if (!g || typeof g.x !== "number" || typeof g.y !== "number") return null;
      return {
        attributes: f.attributes || {},
        position: [g.y, g.x], // Leaflet [lat, lng]
        lngLat: [g.x, g.y], // GeoJSON [lng, lat]
      };
    })
    .filter(Boolean);
}

/**
 * Parse Esri polygon features. Keeps:
 *   - rings: Leaflet [lat,lng] rings (for <Polygon positions>)
 *   - geometry: GeoJSON Polygon/MultiPolygon in [lng,lat] (for Turf math)
 */
function parsePolygonFeatures(json) {
  const features = Array.isArray(json?.features) ? json.features : [];
  return features
    .map((f) => {
      const rings = f.geometry?.rings;
      if (!Array.isArray(rings) || rings.length === 0) return null;
      const leafletRings = rings.map((ring) =>
        ring
          .filter((pt) => Array.isArray(pt) && pt.length >= 2)
          .map(([lng, lat]) => [lat, lng])
      );
      const geometry = esriRingsToGeoJSON(rings);
      return { attributes: f.attributes || {}, rings: leafletRings, geometry };
    })
    .filter((x) => x && x.geometry);
}

/** Parse Esri polyline features -> { attributes, paths:[[ [lat,lng] ]] }. */
function parsePolylineFeatures(json) {
  const features = Array.isArray(json?.features) ? json.features : [];
  return features
    .map((f) => {
      const paths = f.geometry?.paths;
      if (!Array.isArray(paths) || paths.length === 0) return null;
      const converted = paths.map((path) =>
        path
          .filter((pt) => Array.isArray(pt) && pt.length >= 2)
          .map(([lng, lat]) => [lat, lng])
      );
      return { attributes: f.attributes || {}, paths: converted };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Transmission (unchanged behavior, envelope now reused).
// ---------------------------------------------------------------------------

export async function fetchTransmission(position, radiusMiles = 15, opts = {}) {
  if (!position) return [];
  const env = envelopeAroundLatLng(position, radiusMiles);
  const json = await fetchJson(buildTransmissionUrl(env), opts);
  return parsePolylineFeatures(json);
}

// ---------------------------------------------------------------------------
// EJ: paginated, bounded-area (cross-municipal) search.
// ---------------------------------------------------------------------------

const EJ_MAX_PAGES = 10; // safety cap

/**
 * Fetch EJ polygons intersecting an envelope, following ArcGIS pagination
 * (exceededTransferLimit + resultOffset) until exhausted or capped.
 * Returns { polygons, complete, pages }.
 */
async function fetchEjInEnvelope(envelope, opts = {}) {
  const polygons = [];
  let offset = 0;
  let pages = 0;
  let complete = true;

  for (; pages < EJ_MAX_PAGES; ) {
    const json = await fetchJson(buildEjEnvelopeUrl(envelope, offset), opts);
    const page = parsePolygonFeatures(json);
    polygons.push(...page);
    pages += 1;

    const more =
      json.exceededTransferLimit === true &&
      Array.isArray(json.features) &&
      json.features.length > 0;
    if (!more) {
      complete = true;
      break;
    }
    offset += json.features.length;
    if (pages >= EJ_MAX_PAGES) {
      // Hit the safety cap with more data still available upstream.
      complete = false;
    }
  }
  return { polygons, complete, pages };
}

// ---------------------------------------------------------------------------
// Facility identity resolution (no silent first-point fallback).
// ---------------------------------------------------------------------------

/**
 * Resolve which live landfill point corresponds to the selected record.
 *
 * Returns one of:
 *   { status:"verified", primary, candidates }
 *   { status:"ambiguous", primary:null, candidates }   // >1 match, cannot pick
 *   { status:"not_found", primary:null, candidates:[] } // zero live points
 *
 * We intentionally do NOT fall back to candidates[0] when identity is unclear.
 * The two Norfolk records share the facility name "Norfolk LF", so a town with
 * multiple same-named points is reported as ambiguous rather than guessed.
 */
export function resolveFacility(landfills, selectedFacility) {
  if (!landfills || landfills.length === 0) {
    return { status: "not_found", primary: null, candidates: [] };
  }

  const target = String(selectedFacility || "").trim().toLowerCase();
  const matches = target
    ? landfills.filter(
        (l) => String(l.attributes.FACILITY || "").trim().toLowerCase() === target
      )
    : landfills.slice();

  if (matches.length === 1) {
    return { status: "verified", primary: matches[0], candidates: matches };
  }
  if (matches.length === 0) {
    // No name match at all: cannot verify which point it is.
    return { status: "not_found", primary: null, candidates: landfills.slice() };
  }
  // More than one live point shares this facility name -> ambiguous.
  return { status: "ambiguous", primary: null, candidates: matches };
}

// ---------------------------------------------------------------------------
// Top-level spatial fetch.
// ---------------------------------------------------------------------------

/**
 * Fetch live geometry for a selected site.
 *
 * @param {string} cleanTown         suffix-stripped town (e.g. "NORFOLK")
 * @param {string} selectedFacility  facility name from the local record
 * @param {object} opts              { ejRadiusMiles }
 * @returns {{
 *   landfills, ejPolygons, primary, identity, proximity, ejSearch
 * }}
 */
export async function fetchSpatial(cleanTown, selectedFacility, opts = {}) {
  const ejRadiusMiles = opts.ejRadiusMiles ?? 5;
  const { signal, timeoutMs } = opts;
  const req = { signal, timeoutMs }; // threaded to every underlying fetch
  const town = String(cleanTown || "").trim().toUpperCase();
  if (!town) throw new Error("Missing town name for spatial query");

  const landfillJson = await fetchJson(buildLandfillUrl(town), req);
  const landfills = parsePointFeatures(landfillJson);

  // Resolve identity explicitly (may be verified / ambiguous / not_found).
  const identity = resolveFacility(landfills, selectedFacility);
  const primary = identity.primary;

  // EJ: bounded-area search around the resolved point when available, else
  // around the mean of returned landfill points, else skip (no anchor).
  let anchor = primary?.position || null;
  if (!anchor && landfills.length > 0) {
    // Use the first candidate ONLY as a search center for context, not as the
    // verified site. Proximity is not computed against an unverified point.
    anchor = landfills[0].position;
  }

  let ejPolygons = [];
  let ejSearch = {
    scope: "none",
    radiusMiles: ejRadiusMiles,
    complete: true,
    pages: 0,
    count: 0,
  };

  if (anchor) {
    const env = envelopeAroundLatLng(anchor, ejRadiusMiles);
    const { polygons, complete, pages } = await fetchEjInEnvelope(env, req);
    ejPolygons = polygons;
    ejSearch = {
      scope: "bounded-radius",
      radiusMiles: ejRadiusMiles,
      centerLatLng: anchor,
      complete,
      pages,
      count: polygons.length,
      crossMunicipal: true,
    };
  }

  // Proximity ONLY when identity is verified (we have a trustworthy point).
  let proximity = null;
  if (primary) {
    proximity = computeProximity(primary.lngLat, ejPolygons);
  }

  return { landfills, ejPolygons, primary, identity, proximity, ejSearch };
}
