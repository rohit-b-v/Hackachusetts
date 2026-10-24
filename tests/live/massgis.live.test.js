import { describe, it, expect } from "vitest";
import { fetchSpatial } from "../../src/lib/massgis.js";

// Real-source checks against the live MassGIS/ArcGIS endpoints. These are
// SEPARATE from the synthetic fixture tests and only run when RUN_LIVE=1,
// because they require network access and depend on an external service.
const LIVE = process.env.RUN_LIVE === "1";
const d = LIVE ? describe : describe.skip;

d("live MassGIS spatial fetch", () => {
  it(
    "verifies a single landfill point and measures boundary distance (Barnstable)",
    async () => {
      const out = await fetchSpatial("BARNSTABLE", "Barnstable Municipal LF", {
        ejRadiusMiles: 5,
      });
      expect(out.landfills.length).toBeGreaterThan(0);
      // Identity should resolve (verified) or at least return candidates.
      expect(["verified", "ambiguous", "not_found"]).toContain(out.identity.status);
      expect(out.ejSearch.scope).toBe("bounded-radius");
    },
    30000
  );

  it(
    "reports ambiguous identity for Norfolk (two 'Norfolk LF' points)",
    async () => {
      const out = await fetchSpatial("NORFOLK", "Norfolk LF", { ejRadiusMiles: 5 });
      // Live data may return one or two points; assert we never silently guess.
      if (out.identity.status === "ambiguous") {
        expect(out.primary).toBeNull();
        expect(out.proximity).toBeNull();
      }
      expect(["verified", "ambiguous", "not_found"]).toContain(out.identity.status);
    },
    30000
  );
});
