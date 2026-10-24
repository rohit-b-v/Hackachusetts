import { describe, it, expect } from "vitest";
import { distance as turfDistance } from "@turf/turf";
import { esriRingsToGeoJSON, computeProximity } from "../src/lib/geo.js";
import { resolveFacility } from "../src/lib/massgis.js";

// ---------------------------------------------------------------------------
// Synthetic fixtures (NOT real MassGIS data). Coordinates are small squares in
// eastern-MA lng/lat space. Esri winding: outer ring CLOCKWISE, holes CCW.
// A 0.01° square at ~42°N is roughly 0.5 mi tall / 0.6 mi wide.
// ---------------------------------------------------------------------------

// Clockwise outer square (Esri outer-ring winding), [lng,lat].
// Corners: (-71.02,42.00) (-71.02,42.02) (-71.00,42.02) (-71.00,42.00)
const OUTER_CW = [
  [-71.02, 42.0],
  [-71.02, 42.02],
  [-71.0, 42.02],
  [-71.0, 42.0],
  [-71.02, 42.0],
];

// Counter-clockwise hole inside the outer square (Esri hole winding).
// A small square around center (-71.01, 42.01).
const HOLE_CCW = [
  [-71.012, 42.008],
  [-71.008, 42.008],
  [-71.008, 42.012],
  [-71.012, 42.012],
  [-71.012, 42.008],
];

// A second, separate square to the east for MultiPolygon / neighbor tests.
// Corners near (-70.95 .. -70.93, 42.00 .. 42.02), clockwise.
const OUTER_EAST_CW = [
  [-70.95, 42.0],
  [-70.95, 42.02],
  [-70.93, 42.02],
  [-70.93, 42.0],
  [-70.95, 42.0],
];

function featureFromRings(rings, attributes = {}) {
  return { attributes, geometry: esriRingsToGeoJSON(rings) };
}

describe("esriRingsToGeoJSON", () => {
  it("builds a Polygon with a hole from outer(CW)+hole(CCW)", () => {
    const geom = esriRingsToGeoJSON([OUTER_CW, HOLE_CCW]);
    expect(geom.type).toBe("Polygon");
    expect(geom.coordinates.length).toBe(2); // outer + 1 hole
  });

  it("builds a MultiPolygon from two separate outer rings", () => {
    const geom = esriRingsToGeoJSON([OUTER_CW, OUTER_EAST_CW]);
    expect(geom.type).toBe("MultiPolygon");
    expect(geom.coordinates.length).toBe(2);
  });

  it("returns null for degenerate ring input", () => {
    expect(esriRingsToGeoJSON([])).toBeNull();
    expect(esriRingsToGeoJSON([[[-71, 42]]])).toBeNull();
  });
});

describe("computeProximity", () => {
  it("reports INSIDE when the point is within a solid polygon", () => {
    const features = [featureFromRings([OUTER_CW])];
    const r = computeProximity([-71.01, 42.01], features); // center
    expect(r.inside).toBe(true);
    expect(r.distanceMiles).toBe(0);
  });

  it("treats a point inside a HOLE as OUTSIDE (not contained)", () => {
    const features = [featureFromRings([OUTER_CW, HOLE_CCW])];
    // Center of the hole -> should NOT be inside the polygon.
    const r = computeProximity([-71.01, 42.01], features);
    expect(r.inside).toBe(false);
    // Nearest boundary is the hole edge; distance should be small but > 0.
    expect(r.distanceMiles).toBeGreaterThan(0);
    expect(r.distanceMiles).toBeLessThan(0.3);
  });

  it("measures distance to the nearest EDGE midpoint, not a vertex", () => {
    const features = [featureFromRings([OUTER_CW])];
    // Point due west of the west edge midpoint (edge at lng -71.02, lat ~42.01).
    // Place it west at lng -71.04, lat 42.01 (aligned with edge midpoint).
    const pt = [-71.04, 42.01];
    const r = computeProximity(pt, features);
    expect(r.inside).toBe(false);

    // Distance to the nearest VERTEX would be larger (corner at 42.00 or 42.02),
    // distance to the EDGE is the perpendicular to lng -71.02 at lat 42.01.
    // Compare: edge distance must be clearly less than nearest-vertex distance.
    const vertDist = Math.min(
      turfDistance([-71.04, 42.01], [-71.02, 42.0], { units: "miles" }),
      turfDistance([-71.04, 42.01], [-71.02, 42.02], { units: "miles" })
    );
    expect(r.distanceMiles).toBeLessThan(vertDist - 0.05);
    // Nearest point should sit on the west edge (lng ~ -71.02, lat ~ 42.01).
    expect(r.nearestPointLngLat[0]).toBeCloseTo(-71.02, 3);
    expect(r.nearestPointLngLat[1]).toBeCloseTo(42.01, 2);
  });

  it("handles a point ON the boundary (edge) as ~0 distance", () => {
    const features = [featureFromRings([OUTER_CW])];
    const r = computeProximity([-71.02, 42.01], features); // on west edge
    // booleanPointInPolygon treats boundary as inside by default.
    expect(r.distanceMiles).toBe(0);
  });

  it("finds nearest polygon across a MultiPolygon", () => {
    const features = [featureFromRings([OUTER_CW, OUTER_EAST_CW])];
    // Point just east of the eastern square -> nearest feature is the east poly.
    const r = computeProximity([-70.92, 42.01], features);
    expect(r.inside).toBe(false);
    expect(r.nearestPointLngLat[0]).toBeCloseTo(-70.93, 2); // east square's east edge
  });

  it("picks the nearest polygon from a NEIGHBORING town, not the shared-name one", () => {
    // Feature 0 = far 'home town' polygon; Feature 1 = closer 'neighbor town'.
    const home = featureFromRings([OUTER_CW], { MUNICIPALITY: "HOME" });
    const neighbor = featureFromRings([OUTER_EAST_CW], { MUNICIPALITY: "NEIGHBOR" });
    const features = [home, neighbor];
    // Point just west of the eastern (neighbor) square.
    const pt = [-70.96, 42.01];
    const r = computeProximity(pt, features);
    expect(features[r.nearestFeatureIndex].attributes.MUNICIPALITY).toBe("NEIGHBOR");
  });

  it("returns null when there is no EJ geometry", () => {
    expect(computeProximity([-71.01, 42.01], [])).toBeNull();
    expect(computeProximity([-71.01, 42.01], null)).toBeNull();
  });

  it("returns null when the point is missing", () => {
    const features = [featureFromRings([OUTER_CW])];
    expect(computeProximity(null, features)).toBeNull();
  });
});

describe("resolveFacility (ambiguous identity, no silent fallback)", () => {
  const mk = (facility, lat, lng) => ({
    attributes: { FACILITY: facility },
    position: [lat, lng],
    lngLat: [lng, lat],
  });

  it("verifies a single unique facility-name match", () => {
    const live = [mk("Barnstable Municipal LF", 41.7, -70.3)];
    const res = resolveFacility(live, "Barnstable Municipal LF");
    expect(res.status).toBe("verified");
    expect(res.primary).toBeTruthy();
  });

  it("reports AMBIGUOUS for two same-named points (the Norfolk case)", () => {
    const live = [
      mk("Norfolk LF", 42.11, -71.32),
      mk("Norfolk LF", 42.12, -71.33),
    ];
    const res = resolveFacility(live, "Norfolk LF");
    expect(res.status).toBe("ambiguous");
    expect(res.primary).toBeNull(); // never guesses
    expect(res.candidates.length).toBe(2);
  });

  it("reports NOT_FOUND when no live point matches the facility name", () => {
    const live = [mk("Some Other LF", 42.0, -71.0)];
    const res = resolveFacility(live, "Nonexistent LF");
    expect(res.status).toBe("not_found");
    expect(res.primary).toBeNull();
  });

  it("reports NOT_FOUND for an empty live result", () => {
    const res = resolveFacility([], "Anything");
    expect(res.status).toBe("not_found");
    expect(res.candidates.length).toBe(0);
  });
});
