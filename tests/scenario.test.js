import { describe, it, expect } from "vitest";
import {
  isSolarRecord,
  sourceCapacity,
  computeScenario,
  DEFAULT_ASSUMPTIONS,
} from "../src/lib/scenario.js";
import { buildEvidencePacket } from "../src/lib/evidencePacket.js";
import { buildFacilityBrief, renderBriefText } from "../src/lib/compareBrief.js";

const SOLAR = {
  facility_id: "fac_x_01",
  municipality: "SPRINGFIELD",
  facility: "Crane Foundry Sand Landfill",
  type: "Solar",
  status: "Permitted",
  mw_permitted: 3.5,
  mw_operating: null,
  elec_label: "NSTAR Electric d/b/a Eversource Energy",
  ej_block_group_count: 122,
  min_bg_mhhi: 11731,
  max_lim_eng_pct: 59.2,
  max_minority_pct: 97,
  ej_criteria_summary: ["Minority"],
};

const NONSOLAR = { ...SOLAR, facility_id: "fac_y_01", type: "Methane", mw_permitted: null, mw_operating: 2 };

describe("scenario math + gating", () => {
  it("detects solar vs non-solar", () => {
    expect(isSolarRecord(SOLAR)).toBe(true);
    expect(isSolarRecord(NONSOLAR)).toBe(false);
  });

  it("derives source capacity from reported fields (operating preferred)", () => {
    expect(sourceCapacity(SOLAR)).toEqual({ mw: 3.5, basis: "reported MW permitted" });
    expect(sourceCapacity(NONSOLAR)).toEqual({ mw: 2, basis: "reported MW operating" });
    expect(sourceCapacity({})).toBeNull();
  });

  it("computes illustrative figures from the ASSUMED capacity, not source", () => {
    // assumed 5 MW is independent of the 3.5 MW reported source
    const sc = computeScenario(5, true, DEFAULT_ASSUMPTIONS);
    expect(sc.annualGenMwh).toBe(5 * 1350);
    expect(sc.illustrativeHouseholds).toBe(Math.round(5 * 220));
    expect(sc.illustrativeDispatchMw).toBeCloseTo(5 * 0.75, 5);
    // storage off => no dispatch
    expect(computeScenario(5, false).illustrativeDispatchMw).toBe(0);
  });
});

describe("compareBrief 4-question structure", () => {
  it("includes know / assume / unresolved / next and keeps unknowns unresolved", () => {
    const packet = buildEvidencePacket({ record: SOLAR, spatial: null });
    const brief = buildFacilityBrief({
      record: SOLAR,
      packet,
      plan: {
        __source: "template",
        actions: [
          { title: "A", why_it_matters: "x", owner_role: "Town Sustainability Manager", needed_document: "d" },
        ],
      },
      scenario: { applied: false },
      checklist: [],
    });
    expect(brief.know.length).toBeGreaterThan(0);
    expect(brief.assume.length).toBeGreaterThan(0);
    // U_PROXIMITY must be unresolved (no spatial run) and NOT a known fact
    expect(brief.unresolved.map((u) => u.id)).toContain("U_PROXIMITY");
    expect(brief.know.map((k) => k.id)).not.toContain("F_PROXIMITY");
    // Exactly one PLAN action lands in NEXT. (Second Look screening items may
    // also appear in NEXT now; assert the plan contribution specifically.)
    expect(brief.next.filter((n) => n.kind === "plan").length).toBe(1);
  });

  it("marks scenario not-applicable for non-solar records", () => {
    const packet = buildEvidencePacket({ record: NONSOLAR, spatial: null });
    const brief = buildFacilityBrief({
      record: NONSOLAR,
      packet,
      plan: null,
      scenario: { applied: true, assumedMw: 5, bess: false, annualGenMwh: 6750, illustrativeHouseholds: 1100, savingsPerHouseholdYr: 350, illustrativeDispatchMw: 0 },
      checklist: [],
    });
    const assumeText = brief.assume.map((a) => a.value).join(" ");
    expect(assumeText).toMatch(/Not applied/i);
  });

  it("renders text containing all four questions (copy == print source)", () => {
    const packet = buildEvidencePacket({ record: SOLAR, spatial: null });
    const brief = buildFacilityBrief({ record: SOLAR, packet, plan: null, scenario: { applied: false }, checklist: [] });
    const text = renderBriefText([brief]);
    expect(text).toMatch(/What do we know/);
    expect(text).toMatch(/What are we assuming/);
    expect(text).toMatch(/What remains unresolved/);
    expect(text).toMatch(/What should the municipality do next/);
    // no verified-outcome claims leaked into the rendered brief
    expect(text).not.toMatch(/guaranteed savings/i);
    expect(text).toMatch(/NOT verified outcomes/i);
  });
});
