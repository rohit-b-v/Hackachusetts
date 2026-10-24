import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Known-good source hashes captured before this correctness pass. The build
// must NOT modify these inputs.
const EXPECTED_SOURCE_SHA = {
  "climate/landfills/data.csv":
    "61328309c8fb0ab78243eb3a807e6bcb41bfe1115a0006cd503e87cb5559da73",
  "climate/utilities/data.csv":
    "7662e09dc7cd08cbb49a19dcd0d0a7dc9003fa2fb798c3abcebfea85998ff234",
  "climate/ej/data.csv":
    "3616a34c7336da3bd7b4e7960e0dd8f9722f42305108bb7493ae113770daa557",
};

let data;

beforeAll(() => {
  // Rebuild deterministically from the untouched source snapshots.
  execFileSync("node", ["scripts/build-data.mjs"], { cwd: ROOT, stdio: "pipe" });
  data = JSON.parse(
    readFileSync(join(ROOT, "src/data/landfill_opportunities.json"), "utf8")
  );
});

describe("source inputs are unchanged (read-only)", () => {
  it("matches the baseline sha256 for all three source files", () => {
    for (const [rel, expected] of Object.entries(EXPECTED_SOURCE_SHA)) {
      const buf = readFileSync(join(ROOT, rel), "utf8");
      const got = createHash("sha256").update(buf, "utf8").digest("hex");
      expect(got, `${rel} changed`).toBe(expected);
    }
  });
});

describe("built dataset preserves required counts", () => {
  it("has 116 facility rows", () => {
    expect(data.records.length).toBe(116);
  });

  it("has 116 utility matches", () => {
    expect(data.records.filter((r) => r.elec_label).length).toBe(116);
  });

  it("has 89 rows with town EJ context", () => {
    expect(data.records.filter((r) => r.ej_block_group_count > 0).length).toBe(89);
  });
});

describe("stable facility IDs + ambiguous Norfolk rows preserved", () => {
  it("assigns a unique facility_id to every record", () => {
    const ids = data.records.map((r) => r.facility_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps both Norfolk records distinct despite identical facility names", () => {
    const norfolk = data.records.filter((r) => r.town_key === "NORFOLK");
    expect(norfolk.length).toBe(2);
    expect(norfolk.every((r) => r.facility === "Norfolk LF")).toBe(true);
    expect(norfolk[0].facility_id).not.toBe(norfolk[1].facility_id);
  });

  it("no longer emits an opportunity_score field", () => {
    expect(data.records[0]).not.toHaveProperty("opportunity_score");
  });
});

describe("source manifest", () => {
  it("records input hashes, snapshot dates, counts, missing values, links", () => {
    const m = data.manifest;
    expect(m).toBeTruthy();
    expect(m.inputs).toHaveLength(3);
    for (const inp of m.inputs) {
      expect(inp.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(inp.snapshot_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(inp.source_url).toMatch(/^https?:\/\//);
      expect(inp.row_count).toBeGreaterThan(0);
    }
    expect(m.counts.landfill_records).toBe(116);
    expect(m.counts.utility_matched).toBe(116);
    expect(m.counts.records_with_town_ej_context).toBe(89);
    expect(m.missing_values).toHaveProperty("ej_bg_mhhi_zero_or_null");
  });

  it("manifest input hashes equal the real source file hashes", () => {
    const byName = Object.fromEntries(data.manifest.inputs.map((i) => [i.dataset, i]));
    expect(byName.landfills.sha256).toBe(EXPECTED_SOURCE_SHA["climate/landfills/data.csv"]);
    expect(byName.utilities.sha256).toBe(EXPECTED_SOURCE_SHA["climate/utilities/data.csv"]);
    expect(byName.ej.sha256).toBe(EXPECTED_SOURCE_SHA["climate/ej/data.csv"]);
  });
});
