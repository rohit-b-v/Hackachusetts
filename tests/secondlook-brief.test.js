import { describe, it, expect } from "vitest";
import {
  buildFacilityBrief,
  buildSecondLookContribution,
  renderBriefText,
} from "../src/lib/compareBrief.js";
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

function packetFor(record = RECORD) {
  return buildEvidencePacket({ record, spatial: null, manifest: MANIFEST });
}

describe("Second Look export contribution", () => {
  it("labels the grid-capacity assumption as hypothetical", () => {
    const c = buildSecondLookContribution({
      record: RECORD,
      packet: packetFor(),
      manifest: MANIFEST,
      assumptions: { proposedMw: 9, gridCapacityMw: 5 },
    });
    const grid = c.assume.find((a) => /grid-capacity assumption/i.test(a.label));
    expect(grid).toBeTruthy();
    expect(grid.value).toMatch(/HYPOTHETICAL/);
    expect(grid.value).toMatch(/not an interconnection approval/i);
  });

  it("routes an over-sized proposal to NEXT as a potential-constraint investigation", () => {
    const c = buildSecondLookContribution({
      record: RECORD,
      packet: packetFor(),
      manifest: MANIFEST,
      assumptions: { proposedMw: 9, gridCapacityMw: 5 },
    });
    const flagged = c.next.find((n) => /potential constraint/i.test(n.title));
    expect(flagged).toBeTruthy();
    expect(flagged.kind).toBe("screening");
  });

  it("routes unknown screens (feeder, queued, land) to UNRESOLVED", () => {
    const c = buildSecondLookContribution({
      record: RECORD,
      packet: packetFor(),
      manifest: MANIFEST,
      assumptions: { proposedMw: null, gridCapacityMw: null },
    });
    const ids = c.unresolved.map((u) => u.id);
    expect(ids).toContain("feeder_association");
    expect(ids).toContain("queued_generation");
    expect(ids).toContain("land_constraints");
    // With no capacity entered, the grid screen is unknown too.
    expect(ids).toContain("grid_capacity_headroom");
  });

  it("includes sourced Second Look observations with their source date in KNOW", () => {
    const c = buildSecondLookContribution({
      record: RECORD,
      packet: packetFor(),
      manifest: MANIFEST,
      assumptions: { proposedMw: 2, gridCapacityMw: 5 },
    });
    const util = c.know.find((k) => /town electric distribution utility/i.test(k.label));
    expect(util).toBeTruthy();
    expect(util.value).toMatch(/source 2026-10-18/);
    expect(util.value).toMatch(/site-unverified/);
  });
});

describe("copy == print derive from one source", () => {
  it("renderBriefText contains the same hypothetical label the structure carries", () => {
    const brief = buildFacilityBrief({
      record: RECORD,
      packet: packetFor(),
      manifest: MANIFEST,
      plan: null,
      scenario: { applied: false },
      checklist: [],
      secondLook: { proposedMw: 9, gridCapacityMw: 5 },
    });
    // The structure (used for the on-screen/print DOM) carries the label...
    const structLabel = brief.assume.find((a) => /grid-capacity assumption/i.test(a.label));
    expect(structLabel.value).toMatch(/HYPOTHETICAL/);
    // ...and the copied text, rendered from the SAME structure, shows it too.
    const text = renderBriefText([brief]);
    expect(text).toMatch(/HYPOTHETICAL/);
    expect(text).toMatch(/second-look/);
    expect(text).toMatch(/potential constraint/i);
  });

  it("without Second Look assumptions, grid screen is unresolved (unknown), not a pass", () => {
    const brief = buildFacilityBrief({
      record: RECORD,
      packet: packetFor(),
      manifest: MANIFEST,
      plan: null,
      scenario: { applied: false },
      checklist: [],
      // no secondLook arg → defaults to cleared assumptions
    });
    const text = renderBriefText([brief]);
    expect(text).toMatch(/grid_capacity_headroom/);
    expect(text).not.toMatch(/no flag from available evidence.*grid/i);
  });
});
