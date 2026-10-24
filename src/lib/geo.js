// Correct geospatial proximity using Turf.js (documented GeoJSON geometry lib).
//
// Replaces the previous vertex-only / hole-ignorant approximation. We convert
// Esri polygon geometry into valid GeoJSON Polygon/MultiPolygon (respecting
// ring winding so holes are treated as holes), then use Turf for:
//   - containment            (booleanPointInPolygon, honors holes)
//   - distance to boundary   (pointToLineDistance against every ring = edges)
//   - nearest boundary point (nearestPointOnLine, for the connector line)
//
// Coordinate convention in THIS module: GeoJSON order [lng, lat] everywhere,
// matching Esri's outSR=4326 output. Leaflet's [lat, lng] conversion happens
// only at the rendering boundary (parse step in massgis.js / SpatialMap).

import {
  point as turfPoint,
  polygon as turfPolygon,
  multiPolygon as turfMultiPolygon,
  lineString as turfLineString,
  booleanPointInPolygon,
  pointToLineDistance,
  nearestPointOnLine,
  distance as turfDistance,
} from "@turf/turf";

const MILES = { units: "miles" };

/**
 * Signed area of a ring of [lng, lat] pairs (shoelace). Esri uses clockwise
 * for outer rings and counter-clockwise for holes. In standard x/y math a
 * clockwise ring has NEGATIVE signed area, counter-clockwise POSITIVE.
 */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    sum += xj * yi - xi * yj;
  }
  return sum / 2;
}

/** Ensure a ring is explicitly closed (first point repeated at the end). */
function closeRing(ring) {
  if (ring.length === 0) return ring;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) return [...ring, [fx, fy]];
  return ring;
}

/**
 * Convert an Esri polygon feature's rings ([lng,lat] order, possibly many
 * rings including holes) into a GeoJSON geometry (Polygon or MultiPolygon).
 *
 * Esri convention: clockwise = outer boundary, counter-clockwise = hole.
 * We assign each hole to the last-seen outer ring (Esri emits each outer ring
 * followed by its holes), which matches the ArcGIS output ordering.
 */
export function esriRingsToGeoJSON(ringsLngLat) {
  const rings = (ringsLngLat || [])
    .filter((r) => Array.isArray(r) && r.length >= 3)
    .map(closeRing);
  if (rings.length === 0) return null;

  const polygons = []; // array of [outer, ...holes]
  for (const ring of rings) {
    const area = signedArea(ring);
    const isOuter = area < 0; // clockwise => outer (Esri convention)
    if (isOuter || polygons.length === 0) {
      polygons.push([ring]);
    } else {
      polygons[polygons.length - 1].push(ring); // hole of current outer
    }
  }

  try {
    if (polygons.length === 1) {
      return turfPolygon(polygons[0]).geometry;
    }
    return turfMultiPolygon(polygons.map((p) => p)).geometry;
  } catch {
    // If winding/closure is malformed, fall back to treating each ring as its
    // own simple outer polygon so distance/containment still work approximately.
    return turfMultiPolygon(rings.map((r) => [r])).geometry;
  }
}

/** All rings (outer + holes) of a GeoJSON Polygon/MultiPolygon as line coords. */
function ringLineStrings(geom) {
  const out = [];
  if (!geom) return out;
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) out.push(ring);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) for (const ring of poly) out.push(ring);
  }
  return out;
}

/**
 * Compute proximity from a landfill point to a set of EJ polygons.
 *
 * @param {[number,number]} pointLngLat  [lng, lat] of the landfill
 * @param {Array<{attributes:object, geometry:object}>} ejFeatures GeoJSON geoms
 * @returns {{
 *   inside: boolean,
 *   distanceMiles: number,
 *   nearestPointLngLat: [number,number]|null,
 *   nearestFeatureIndex: number|null
 * } | null}
 */
export function computeProximity(pointLngLat, ejFeatures) {
  if (!pointLngLat || !Array.isArray(ejFeatures) || ejFeatures.length === 0) {
    return null;
  }
  const pt = turfPoint(pointLngLat);

  // 1. Containment (honors holes): a point in a hole is NOT inside.
  for (let i = 0; i < ejFeatures.length; i++) {
    const geom = ejFeatures[i].geometry;
    if (!geom) continue;
    try {
      if (booleanPointInPolygon(pt, geom)) {
        return {
          inside: true,
          distanceMiles: 0,
          nearestPointLngLat: pointLngLat,
          nearestFeatureIndex: i,
        };
      }
    } catch {
      /* ignore malformed geometry for this feature */
    }
  }

  // 2. Nearest boundary (edge) distance across all rings of all features.
  let minDist = Infinity;
  let nearestPt = null;
  let nearestIdx = null;
  for (let i = 0; i < ejFeatures.length; i++) {
    const geom = ejFeatures[i].geometry;
    for (const ring of ringLineStrings(geom)) {
      if (ring.length < 2) continue;
      const line = turfLineString(ring);
      let d;
      try {
        d = pointToLineDistance(pt, line, MILES);
      } catch {
        continue;
      }
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
        try {
          const np = nearestPointOnLine(line, pt, MILES);
          nearestPt = np.geometry.coordinates;
        } catch {
          nearestPt = ring[0];
        }
      }
    }
  }

  if (!Number.isFinite(minDist)) return null;
  return {
    inside: false,
    distanceMiles: minDist,
    nearestPointLngLat: nearestPt,
    nearestFeatureIndex: nearestIdx,
  };
}

/** Great-circle distance in miles between two [lng,lat] points (Turf). */
export function distanceMiles(aLngLat, bLngLat) {
  return turfDistance(turfPoint(aLngLat), turfPoint(bLngLat), MILES);
}
