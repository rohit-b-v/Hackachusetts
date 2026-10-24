import { describe, it, expect } from "vitest";
import {
  gridCapacityObservations,
  landConstraintObservations,
  unresolvedObservations,
  sourceDates,
  secondLookEvidence,
  SOURCE_URLS,
} from "../src/lib/secondlook/sources.js";
import { buildEvidencePacket } from "../src/lib/evidencePacket.js";

// A realistic record shaped like landfill_opportunities.json rows.
const RECORD = {
  facility_id: "fac_acton_01",
  municipality: "ACTON",
  town_key: "ACTON",
  facility: "Acton LF",
  type: "Solar",
  status: "Operating",
  mw_permitted: 1.59,
  mw_operating: 1.59,
  operating_since: "2013-12-23",
  elec_label: "NSTAR Electric d/b/a Eversource Energy",
  ej_block_group_count: 3,
  min_bg_mhhi: 91970,
  max_lim_eng_pct: 16.4557,
  max_minority_pct: 56.3996,
  ej_criteria_summary: ["Minority"],
};

const MANIFEST = {
  generated_at: "2026-10-24T19:41:18.300Z",
  inputs: [
    {
      dataset: "landfills",
      snapshot_date: "2026-10-18",
      source_url: SOURCE_URLS.landfills,
    },
    {
      dataset: "utilities",
      snapshot_date: "2026-10-18",
      source_url: SOURCE_URLS.utilities,
    },
    { dataset: "ej", snapshot_date: "2026-10-18", source_url: SOURCE_URLS.ej },
  ],
};

function byKey(list, key) {
  return list.find((o) => o.key === key);
}

describe("Second Look source adapters — grid capacity", () => {
  const grid = gridCapacityObservations(RECORD, null, MANIFEST);

  it("reports the town utility as sourced but site-UNVERIFIED", () => {
    const u = byKey(grid, "town_distribution_utility");
    expect(u.provenance).toBe("sourced");
    expect(u.value).toBe(RECORD.elec_label);
    expect(u.association_confidence).toBe("unverified");
    expect(u.evidence_id).toBe("F_UTILITY");
    // Source date comes from the manifest, not hardcoded.
    expect(u.source_timestamp).toBe("2026-10-18");
    expect(u.retrieval_timestamp).toBe(MANIFEST.generated_at);
    expect(u.source_url).toBe(SOURCE_URLS.utilities);
  });

  it("never infers a serving feeder — it is unknown + unverified", () => {
    const f = byKey(grid, "serving_feeder");
    expect(f.provenance).toBe("unknown");
    expect(f.value).toBeNull();
    expect(f.association_confidence).toBe("unverified");
    expect(f.evidence_id).toBe("U_SITE_SERVICE");
  });

  it("emits observed hosting capacity as unknown, separate from any override", () => {
    const h = byKey(grid, "observed_hosting_capacity");
    expect(h.provenance).toBe("unknown");
    expect(h.value).toBeNull();
    expect(h.units).toBe("MW");
    expect(h.evidence_id).toBe("U_INTERCONNECTION");
  });

  it("flags queued-generation accounting as unverified (no adjustment)", () => {
    const q = byKey(grid, "queued_generation_accounted");
    expect(q.provenance).toBe("unknown");
    expect(q.value).toBeNull();
  });

  it("drops the sourced utility to unknown when elec_label is absent", () => {
    const g2 = gridCapacityObservations({ ...RECORD, elec_label: null }, null, MANIFEST);
    const u = byKey(g2, "town_distribution_utility");
    expect(u.provenance).toBe("unknown");
    expect(u.value).toBeNull();
  });
});

describe("Second Look source adapters — land constraints", () => {
  const land = landConstraintObservations(RECORD, MANIFEST);

  it("reports missing land info as unknown (never 'no constraints')", () => {
    for (const key of ["site_address_coordinates", "site_acreage", "cap_condition"]) {
      const o = byKey(land, key);
      expect(o.provenance).toBe("unknown");
      expect(o.value).toBeNull();
    }
  });

  it("keeps reported technology as a sourced observation", () => {
    const t = byKey(land, "reported_technology");
    expect(t.provenance).toBe("sourced");
    expect(t.value).toBe("Solar");
    expect(t.evidence_id).toBe("F_TYPE");
    expect(t.source_timestamp).toBe("2026-10-18");
  });
});

describe("Second Look source adapters — unresolved + dates", () => {
  it("mirrors packet unknowns as unknown observations", () => {
    const packet = buildEvidencePacket({ record: RECORD, spatial: null, manifest: MANIFEST });
    const unresolved = unresolvedObservations(packet);
    expect(unresolved.length).toBe(packet.unknowns.length);
    for (const o of unresolved) {
      expect(o.provenance).toBe("unknown");
      expect(o.value).toBeNull();
      expect(o.evidence_id).toMatch(/^U_/);
    }
  });

  it("returns per-dataset source + retrieval dates from the manifest", () => {
    const dates = sourceDates(MANIFEST);
    expect(dates.map((d) => d.dataset).sort()).toEqual(["ej", "landfills", "utilities"]);
    for (const d of dates) {
      expect(d.source_timestamp).toBe("2026-10-18");
      expect(d.retrieval_timestamp).toBe(MANIFEST.generated_at);
      expect(d.source_url).toBeTruthy();
    }
  });
});

describe("Second Look source adapters — invariants", () => {
  it("every unknown observation has a null value", () => {
    const { grid, land, unresolved } = secondLookEvidence({
      record: RECORD,
      packet: buildEvidencePacket({ record: RECORD, spatial: null, manifest: MANIFEST }),
      manifest: MANIFEST,
    });
    for (const o of [...grid, ...land, ...unresolved]) {
      if (o.provenance === "unknown") expect(o.value).toBeNull();
    }
  });

  it("omits provenance fields that are not available rather than faking them", () => {
    const grid = gridCapacityObservations(RECORD, null, /* no manifest */ null);
    const u = byKey(grid, "town_distribution_utility");
    // With no manifest, source_timestamp should be absent (not null/empty).
    expect("source_timestamp" in u).toBe(false);
    // But the documented source URL still resolves from SOURCE_URLS.
    expect(u.source_url).toBe(SOURCE_URLS.utilities);
  });
});
