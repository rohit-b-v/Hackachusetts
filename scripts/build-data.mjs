#!/usr/bin/env node
/**
 * build-data.mjs — Cap-to-Community Phase 1 data join.
 *
 * Parses the three climate starter datasets (landfills, utilities, ej),
 * handling EITHER Esri JSON (features[].attributes) OR CSV format per folder,
 * normalizes town names, joins utilities + aggregated EJ metrics onto each of
 * the 116 landfill records, computes an opportunity_score (0-100), and writes
 * a unified src/data/landfill_opportunities.json.
 *
 * Usage: node scripts/build-data.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLIMATE = join(ROOT, "climate");
const OUT_PATH = join(ROOT, "src", "data", "landfill_opportunities.json");

// ---------------------------------------------------------------------------
// Parsing helpers: each folder may hold Esri JSON or CSV.
// ---------------------------------------------------------------------------

/** Minimal RFC-4180-ish CSV parser (handles quoted fields with commas/quotes). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore; handled with \n
    } else {
      field += c;
    }
  }
  // flush trailing field/row (file may not end with newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvToRecords(text) {
  const rows = parseCSV(text).filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cells[idx] !== undefined ? cells[idx] : "";
    });
    return obj;
  });
}

/** Parse raw dataset text (Esri JSON or CSV) into flat records. */
function parseDatasetText(raw) {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(raw);
      if (Array.isArray(json)) return json;
      if (Array.isArray(json.features)) {
        return json.features.map((f) => f.attributes ?? f.properties ?? f);
      }
      if (Array.isArray(json.records)) return json.records;
    } catch {
      // fall through to CSV
    }
  }
  return csvToRecords(raw);
}

/**
 * Load a dataset folder's data file. Returns { records, raw, sha256, path }.
 * The raw text + hash feed the source manifest (read-only; never written back).
 */
function loadDataset(folder) {
  const path = join(CLIMATE, folder, "data.csv");
  const raw = readFileSync(path, "utf8");
  const sha256 = createHash("sha256").update(raw, "utf8").digest("hex");
  return { records: parseDatasetText(raw), raw, sha256, path: `climate/${folder}/data.csv` };
}

/** Extract the "Saved YYYY-MM-DD" snapshot date from a folder README, if present. */
function readSnapshotDate(folder) {
  try {
    const txt = readFileSync(join(CLIMATE, folder, "README.md"), "utf8");
    const m = txt.match(/Saved\s+(\d{4}-\d{2}-\d{2})/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Source URLs documented in each folder README (for the manifest). */
const SOURCE_LINKS = {
  landfills:
    "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/DEP/RenewablesAtMaLandfills/MapServer/0",
  utilities:
    "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0",
  ej: "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/EJ2020/MapServer/0",
};

/** Stable, snapshot-local facility ID: fac_<slug-town>_<NN> (NN = per-town seq). */
function makeFacilityIdFactory() {
  const perTown = new Map();
  return function facilityId(townKeyNorm, facilityName) {
    const slug = String(townKeyNorm)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const seq = (perTown.get(townKeyNorm) || 0) + 1;
    perTown.set(townKeyNorm, seq);
    return `fac_${slug}_${String(seq).padStart(2, "0")}`;
  };
}

// ---------------------------------------------------------------------------
// Field accessors: tolerate either Esri JSON field names (PRD) or CSV headers.
// ---------------------------------------------------------------------------

/** Return the first present (non-undefined) value among candidate keys. */
function pick(rec, keys) {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null) return rec[k];
  }
  return undefined;
}

function normTown(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim().toUpperCase();
}

/**
 * Join key for a municipality. Some landfill rows carry a facility suffix on
 * the town name (e.g. "Norfolk #1", "Norfolk #2"); strip a trailing " #N" so
 * the town matches the utility and EJ datasets. The original full value is
 * preserved separately on the output record.
 */
function townKey(v) {
  return normTown(v).replace(/\s+#\d+\s*$/, "");
}

function toNumber(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Load the three datasets.
// ---------------------------------------------------------------------------

const landfillsDs = loadDataset("landfills");
const utilitiesDs = loadDataset("utilities");
const ejDs = loadDataset("ej");

const landfillsRaw = landfillsDs.records;
const utilitiesRaw = utilitiesDs.records;
const ejRaw = ejDs.records;

// Missing-value tallies for the manifest.
const missing = {
  landfill_mw_permitted_null: 0,
  landfill_mw_operating_null: 0,
  landfill_operating_since_null: 0,
  ej_bg_mhhi_zero_or_null: 0,
};

// ---------------------------------------------------------------------------
// Utilities: town -> { elec, elec_label }  (1:1 per town)
// CSV headers: town, utility_code, utility ; Esri: TOWN, ELEC, ELEC_LABEL
// ---------------------------------------------------------------------------

const utilityByTown = new Map();
for (const r of utilitiesRaw) {
  const town = normTown(pick(r, ["TOWN", "town"]));
  if (!town) continue;
  const elec = pick(r, ["ELEC", "utility_code"]);
  const elecLabel = pick(r, ["ELEC_LABEL", "utility"]);
  utilityByTown.set(town, {
    elec: elec !== undefined ? String(elec) : null,
    elec_label: elecLabel !== undefined ? String(elecLabel) : null,
  });
}

// ---------------------------------------------------------------------------
// EJ: aggregate block groups by normalized town.
// CSV headers: municipality, population, minority_pct, limited_english_hh_pct,
//              block_group_income, ej, criteria
// Esri:        MUNICIPALITY, TOTAL_POP, PCT_MINORITY, LIMENGHHPCT, BG_MHHI,
//              EJ, EJ_CRIT_DESC
// ---------------------------------------------------------------------------

const ejByTown = new Map();
for (const r of ejRaw) {
  const town = normTown(pick(r, ["MUNICIPALITY", "municipality"]));
  if (!town) continue;

  // BG_MHHI of 0 is a missing-data placeholder in this layer, not a real $0
  // median household income, so treat it as null for the min calculation.
  let bgMhhi = toNumber(pick(r, ["BG_MHHI", "block_group_income"]));
  if (bgMhhi === 0 || bgMhhi === null) missing.ej_bg_mhhi_zero_or_null += 1;
  if (bgMhhi === 0) bgMhhi = null;
  const limEng = toNumber(pick(r, ["LIMENGHHPCT", "limited_english_hh_pct"]));
  const minority = toNumber(pick(r, ["PCT_MINORITY", "minority_pct"]));
  const critRaw = pick(r, ["EJ_CRIT_DESC", "criteria"]);
  const crit = critRaw !== undefined && critRaw !== null ? String(critRaw).trim() : "";

  let agg = ejByTown.get(town);
  if (!agg) {
    agg = {
      ej_block_group_count: 0,
      min_bg_mhhi: null,
      max_lim_eng_pct: null,
      max_minority_pct: null,
      _criteria: new Set(),
    };
    ejByTown.set(town, agg);
  }

  agg.ej_block_group_count += 1;
  if (bgMhhi !== null) {
    agg.min_bg_mhhi = agg.min_bg_mhhi === null ? bgMhhi : Math.min(agg.min_bg_mhhi, bgMhhi);
  }
  if (limEng !== null) {
    agg.max_lim_eng_pct = agg.max_lim_eng_pct === null ? limEng : Math.max(agg.max_lim_eng_pct, limEng);
  }
  if (minority !== null) {
    agg.max_minority_pct = agg.max_minority_pct === null ? minority : Math.max(agg.max_minority_pct, minority);
  }
  if (crit) agg._criteria.add(crit);
}

// ---------------------------------------------------------------------------
// Build landfill records joined with utility + EJ aggregates.
// CSV headers: municipality, facility, type, mw_permitted, mw_operating,
//              status, operating_since
// Esri:        MUNICIPALITY, FACILITY, TYPE_, MW_PERMITTED, MW_OPERATING,
//              STATUS_1, OPERATING_SINCE
// ---------------------------------------------------------------------------

const facilityId = makeFacilityIdFactory();

const records = landfillsRaw.map((r, rowIndex) => {
  const rawMunicipality = pick(r, ["MUNICIPALITY", "municipality"]);
  const town = normTown(rawMunicipality); // full normalized label (may include " #1")
  const key = townKey(rawMunicipality); // join key with facility suffix stripped
  const util = utilityByTown.get(key) || { elec: null, elec_label: null };
  const ej = ejByTown.get(key);

  const status = pick(r, ["STATUS_1", "status"]);
  const statusStr = status !== undefined && status !== null ? String(status).trim() : null;

  const mwPermitted = toNumber(pick(r, ["MW_PERMITTED", "mw_permitted"]));
  const mwOperating = toNumber(pick(r, ["MW_OPERATING", "mw_operating"]));
  const operatingSinceRaw = pick(r, ["OPERATING_SINCE", "operating_since"]);
  const operatingSince =
    operatingSinceRaw !== undefined &&
    operatingSinceRaw !== null &&
    String(operatingSinceRaw).trim() !== ""
      ? String(operatingSinceRaw).trim()
      : null;
  const facility = (() => {
    const v = pick(r, ["FACILITY", "facility"]);
    return v !== undefined && v !== null ? String(v) : null;
  })();

  if (mwPermitted === null) missing.landfill_mw_permitted_null += 1;
  if (mwOperating === null) missing.landfill_mw_operating_null += 1;
  if (operatingSince === null) missing.landfill_operating_since_null += 1;

  return {
    // Stable snapshot-local identity. Keyed per join-town so the two Norfolk
    // rows (same facility name, town_key NORFOLK) get distinct sequential IDs
    // fac_norfolk_01 / fac_norfolk_02.
    facility_id: facilityId(key, facility),
    source_row_index: rowIndex, // 0-based row within the landfills snapshot

    municipality: town,
    // Clean town name for live ArcGIS queries (facility suffix like " #1" stripped).
    town_key: key,
    clean_town: key,
    facility,
    type: (() => {
      const v = pick(r, ["TYPE_", "type"]);
      return v !== undefined && v !== null ? String(v) : null;
    })(),
    mw_permitted: mwPermitted,
    mw_operating: mwOperating,
    status: statusStr,
    operating_since: operatingSince,

    // Utility join (1:1 per town; reported town-level utility, not site service)
    elec: util.elec,
    elec_label: util.elec_label,

    // EJ aggregates (town-level)
    ej_block_group_count: ej ? ej.ej_block_group_count : 0,
    min_bg_mhhi: ej ? ej.min_bg_mhhi : null,
    max_lim_eng_pct: ej ? ej.max_lim_eng_pct : null,
    max_minority_pct: ej ? ej.max_minority_pct : null,
    ej_criteria_summary: ej ? Array.from(ej._criteria).sort() : [],
  };
});

// Stable deterministic order: town, then source row (preserves both Norfolk
// rows distinctly). No equity/readiness score is computed — ranking by a
// blended score was removed because its "EJ population share" term was a
// percentile of record counts, not a population share.
records.sort((a, b) => {
  if (a.municipality !== b.municipality)
    return a.municipality < b.municipality ? -1 : 1;
  return a.source_row_index - b.source_row_index;
});

// ---------------------------------------------------------------------------
// Write output.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Source manifest: provenance for every input (read-only inputs, hashed).
// ---------------------------------------------------------------------------

const utilityMatched = records.filter((r) => r.elec_label).length;
const withEJ = records.filter((r) => r.ej_block_group_count > 0).length;

const manifest = {
  schema_version: 2,
  generated_at: new Date().toISOString(),
  note:
    "Values are reported from snapshot inputs and joined on normalized town name. " +
    "Town-level EJ context does NOT confirm a landfill is physically near an EJ " +
    "block group; use the live Spatial Inspector for boundary-distance evidence.",
  inputs: [
    {
      dataset: "landfills",
      path: landfillsDs.path,
      sha256: landfillsDs.sha256,
      snapshot_date: readSnapshotDate("landfills"),
      source_url: SOURCE_LINKS.landfills,
      row_count: landfillsRaw.length,
    },
    {
      dataset: "utilities",
      path: utilitiesDs.path,
      sha256: utilitiesDs.sha256,
      snapshot_date: readSnapshotDate("utilities"),
      source_url: SOURCE_LINKS.utilities,
      row_count: utilitiesRaw.length,
    },
    {
      dataset: "ej",
      path: ejDs.path,
      sha256: ejDs.sha256,
      snapshot_date: readSnapshotDate("ej"),
      source_url: SOURCE_LINKS.ej,
      row_count: ejRaw.length,
    },
  ],
  counts: {
    landfill_records: records.length,
    utility_matched: utilityMatched,
    records_with_town_ej_context: withEJ,
    ej_towns: new Set(
      records.filter((r) => r.ej_block_group_count > 0).map((r) => r.town_key)
    ).size,
  },
  missing_values: missing,
};

const output = {
  generated_at: manifest.generated_at,
  source: "climate/landfills, climate/utilities, climate/ej (starter snapshots)",
  record_count: records.length,
  manifest,
  records,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

// ---------------------------------------------------------------------------
// Console summary.
// ---------------------------------------------------------------------------

const byStatus = records.reduce((acc, r) => {
  const k = r.status || "(none)";
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});

console.log("Wrote:", OUT_PATH);
console.log("Landfill records:", records.length);
console.log("Status breakdown:", JSON.stringify(byStatus));
console.log("Records with utility matched:", utilityMatched, "/", records.length);
console.log("Records with town EJ context:", withEJ, "/", records.length);
console.log("EJ towns:", manifest.counts.ej_towns);
console.log("Missing values:", JSON.stringify(missing));
console.log("Input hashes:");
for (const inp of manifest.inputs) {
  console.log(`  ${inp.dataset.padEnd(10)} rows=${String(inp.row_count).padStart(5)} ${inp.sha256.slice(0, 12)}… (${inp.snapshot_date})`);
}
console.log("\nNorfolk (ambiguous identity) rows:");
for (const r of records.filter((r) => r.municipality.startsWith("NORFOLK"))) {
  console.log(`  ${r.facility_id}  ${r.municipality}  "${r.facility}"`);
}
