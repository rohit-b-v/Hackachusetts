import { describe, it, expect } from "vitest";
import {
  runScreening,
  checkGridCapacityHeadroom,
  checkFeederAssociation,
  computePriority,
  baselineAssumptions,
  SUITABILITY_RANK,
} from "../src/lib/secondlook/screening.js";
import { secondLookEvidence } from "../src/lib/secondlook/sources.js";
import { buildEvidencePacket } from "../src/lib/evidencePacket.js";

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

function allObs(record = RECORD) {
  const packet = buildEvidencePacket({ record, spatial: null, manifest: MANIFEST });
  const ev = secondLookEvidence({ record, packet, manifest: MANIFEST });
  return [...ev.grid, ...ev.land, ...ev.unresolved];
}

function verdictOf(results, id) {
  return results.find((r) => r.id === id)?.verdict;
}

const rank = (v) => SUITABILITY_RANK[v];

describe("verdicts are three-state (no pass)", () => {
  it("only emits potential_constraint | no_flag | unknown", () => {
    const { results } = runScreening(allObs(), { proposedMw: 2, gridCapacityMw: 5 });
    for (const r of results) {
      expect(["potential_constraint", "no_flag", "unknown"]).toContain(r.verdict);
    }
  });
});

describe("property 1 — increasing proposed generation cannot improve grid verdict", () => {
  it("rank is monotonically non-decreasing as proposedMw rises (grid fixed)", () => {
    const grid = 5;
    let prevRank = -1;
    for (const proposed of [0.5, 1, 2, 4, 5, 6, 8, 20]) {
      const r = checkGridCapacityHeadroom({ proposedMw: proposed, gridCapacityMw: grid });
      const cur = rank(r.verdict);
      // never improves (never decreases) as we raise proposed capacity
      expect(cur).toBeGreaterThanOrEqual(prevRank);
      prevRank = cur;
    }
  });
});

describe("property 2 — reducing assumed capacity cannot improve grid verdict", () => {
  it("rank is monotonically non-decreasing as gridCapacityMw falls (proposed fixed)", () => {
    const proposed = 4;
    let prevRank = -1;
    for (const grid of [20, 8, 6, 5, 4, 3, 1]) {
      const r = checkGridCapacityHeadroom({ proposedMw: proposed, gridCapacityMw: grid });
      const cur = rank(r.verdict);
      expect(cur).toBeGreaterThanOrEqual(prevRank);
      prevRank = cur;
    }
  });
});

describe("property 3 — missing capacity / unverified feeder ⇒ unknown, not pass", () => {
  it("null capacity yields unknown (never no_flag/potential_constraint)", () => {
    expect(checkGridCapacityHeadroom({ proposedMw: null, gridCapacityMw: null }).verdict).toBe("unknown");
    expect(checkGridCapacityHeadroom({ proposedMw: 3, gridCapacityMw: null }).verdict).toBe("unknown");
    expect(checkGridCapacityHeadroom({ proposedMw: null, gridCapacityMw: 3 }).verdict).toBe("unknown");
  });

  it("unverified feeder yields unknown, linked to U_SITE_SERVICE", () => {
    const r = checkFeederAssociation(allObs());
    expect(r.verdict).toBe("unknown");
    expect(r.evidence_ids).toContain("U_SITE_SERVICE");
  });

  it("unknown is never ranked more suitable than no_flag", () => {
    expect(rank("unknown")).toBeGreaterThan(rank("no_flag"));
  });
});

describe("property 4 — reset restores baseline results", () => {
  it("identical inputs produce deeply-equal results", () => {
    const obsv = allObs();
    const a = baselineAssumptions(1.59);
    const first = runScreening(obsv, a);
    const second = runScreening(obsv, a);
    expect(second.results).toEqual(first.results);
    expect(second.priorityOrder).toEqual(first.priorityOrder);
  });

  it("changing then resetting assumptions returns the baseline verdicts", () => {
    const obsv = allObs();
    const base = runScreening(obsv, baselineAssumptions(1.59));
    // change: enter a hypothetical and over-size the proposal
    const changed = runScreening(obsv, { proposedMw: 9, gridCapacityMw: 5 }, {
      baselineResults: base.results,
    });
    expect(verdictOf(changed.results, "grid_capacity_headroom")).toBe("potential_constraint");
    expect(changed.results.find((r) => r.id === "grid_capacity_headroom").changed).toBe(true);
    // reset back to baseline
    const reset = runScreening(obsv, baselineAssumptions(1.59));
    expect(reset.results.map((r) => ({ id: r.id, v: r.verdict }))).toEqual(
      base.results.map((r) => ({ id: r.id, v: r.verdict }))
    );
  });
});

describe("explicit-rule priority", () => {
  it("a grid potential_constraint outranks any unknown", () => {
    const pc = computePriority("grid_capacity_headroom", "potential_constraint"); // 100 * 1.0
    const unk = computePriority("feeder_association", "unknown"); // 60 * 0.9
    expect(pc).toBeGreaterThan(unk);
  });

  it("priorityOrder sorts by priority then stable id", () => {
    const { results, priorityOrder } = runScreening(allObs(), { proposedMw: 9, gridCapacityMw: 5 });
    // grid_capacity_headroom is a potential_constraint here → should lead
    expect(priorityOrder[0]).toBe("grid_capacity_headroom");
    // order is a permutation of all check ids
    expect(priorityOrder.slice().sort()).toEqual(results.map((r) => r.id).sort());
  });
});

describe("reason strings are reproducible from visible inputs", () => {
  it("over-capacity reason names both numbers and marks the value hypothetical", () => {
    const r = checkGridCapacityHeadroom({ proposedMw: 9, gridCapacityMw: 5 });
    expect(r.reason).toContain("9 MW");
    expect(r.reason).toContain("5 MW");
    expect(r.reason.toLowerCase()).toContain("hypothetical");
    expect(r.reason.toLowerCase()).toContain("not interconnection approval");
  });
});

describe("technology gating", () => {
  it("non-solar record flags technology_match as potential_constraint", () => {
    const obsv = allObs({ ...RECORD, type: "Methane" });
    const { results } = runScreening(obsv, { proposedMw: 2, gridCapacityMw: 5 });
    expect(verdictOf(results, "technology_match")).toBe("potential_constraint");
  });
});
