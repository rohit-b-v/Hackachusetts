import { describe, it, expect, afterEach, vi } from "vitest";
import { requestPlan } from "../src/lib/planClient.js";
import { runScreening, baselineAssumptions } from "../src/lib/secondlook/screening.js";
import { secondLookEvidence } from "../src/lib/secondlook/sources.js";
import { buildFacilityBrief } from "../src/lib/compareBrief.js";
import { buildEvidencePacket } from "../src/lib/evidencePacket.js";

// Correctness property 5: model failure does not prevent comparison or
// deterministic checklist/screening generation. Second Look's evidence,
// screening, and brief contribution are pure (no model), so they must be
// identical whether the planner call succeeds, falls back, or is absent.

const RECORD = {
  facility_id: "fac_acton_01",
  municipality: "ACTON",
  town_key: "ACTON",
  facility: "Acton LF",
  type: "Solar",
  status: "Operating",
  mw_permitted: 1.59,
  mw_operating: 1.59,
  elec_label: "NSTAR Electric d/b/a Eversource Energy",
  ej_block_group_count: 3,
  min_bg_mhhi: 91970,
};

const MANIFEST = {
  generated_at: "2026-10-24T19:41:18.300Z",
  inputs: [
    { dataset: "landfills", snapshot_date: "2026-10-18" },
    { dataset: "utilities", snapshot_date: "2026-10-18" },
    { dataset: "ej", snapshot_date: "2026-10-18" },
  ],
};

function packet() {
  return buildEvidencePacket({ record: RECORD, spatial: null, manifest: MANIFEST });
}
function obs() {
  const ev = secondLookEvidence({ record: RECORD, packet: packet(), manifest: MANIFEST });
  return [...ev.grid, ...ev.land, ...ev.unresolved];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("property 5 — model failure does not block the deterministic workflow", () => {
  it("requestPlan returns a usable, labeled template plan when the network fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    const res = await requestPlan({ record: RECORD, spatial: null, manifest: MANIFEST });
    expect(res.plan).toBeTruthy();
    expect(Array.isArray(res.plan.actions)).toBe(true);
    expect(res.plan.actions.length).toBe(3);
    expect(res.source).toBe("template");
    expect(res.label).toBe("Template-generated");
    expect(res.reason).toBe("client_offline");
  });

  it("Second Look screening is identical regardless of planner availability", async () => {
    // Deterministic screening computed WITHOUT any planner call.
    const a = { proposedMw: 9, gridCapacityMw: 5, gridCapacityBasis: "hypothetical" };
    const before = runScreening(obs(), a);

    // Now force the planner to fail; recompute screening — must be unchanged.
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    await requestPlan({ record: RECORD, spatial: null, manifest: MANIFEST });
    const after = runScreening(obs(), a);

    expect(after.results).toEqual(before.results);
    expect(after.priorityOrder).toEqual(before.priorityOrder);
    // And the screen still flags the over-sized proposal (no silent pass).
    expect(after.results.find((r) => r.id === "grid_capacity_headroom").verdict).toBe(
      "potential_constraint"
    );
  });

  it("brief Second Look contribution is unchanged when the planner fails (plan omitted)", async () => {
    const sl = { proposedMw: 9, gridCapacityMw: 5, gridCapacityBasis: "hypothetical" };
    const briefNoPlan = buildFacilityBrief({
      record: RECORD,
      packet: packet(),
      manifest: MANIFEST,
      plan: null,
      scenario: { applied: false },
      checklist: [],
      secondLook: sl,
    });

    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    const res = await requestPlan({ record: RECORD, spatial: null, manifest: MANIFEST });
    const briefWithFallbackPlan = buildFacilityBrief({
      record: RECORD,
      packet: packet(),
      manifest: MANIFEST,
      plan: { ...res.plan, __source: res.source },
      scenario: { applied: false },
      checklist: [],
      secondLook: sl,
    });

    // The Second Look slices (assume + the screening-derived next/unresolved)
    // do not depend on the plan, so they match across both briefs.
    const slAssume = (b) => b.assume.filter((x) => /Second Look/.test(x.label));
    const slNext = (b) => b.next.filter((x) => x.kind === "screening");
    const slUnresolved = (b) =>
      b.unresolved.filter((x) => ["grid_capacity_headroom", "feeder_association", "queued_generation", "land_constraints"].includes(x.id));

    expect(slAssume(briefWithFallbackPlan)).toEqual(slAssume(briefNoPlan));
    expect(slNext(briefWithFallbackPlan)).toEqual(slNext(briefNoPlan));
    expect(slUnresolved(briefWithFallbackPlan)).toEqual(slUnresolved(briefNoPlan));
  });
});
