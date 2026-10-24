// Canonical evidence packet for a selected facility.
//
// This is the single source of truth handed to the next-action planner. Every
// FACT and every UNKNOWN gets a stable ID so AI output can be validated against
// it: the model may only reference IDs that exist here. Authoritative numbers
// are always rendered from this packet, never from the model's free text.
//
// Pure + isomorphic: imported by the browser (to build the request) and by the
// server (to rebuild/validate independently — the server does NOT trust a
// client-supplied packet for authoritative values; it reconstructs from the
// posted record + spatial result).

import { createHash } from "./hash.js";

/** Round for display without pretending to false precision. */
function num(v) {
  return v === null || v === undefined || Number.isNaN(v) ? null : Number(v);
}

/**
 * Build the canonical evidence packet.
 *
 * @param {object} input
 * @param {object} input.record      a row from landfill_opportunities.json
 * @param {object} [input.spatial]   result shape from fetchSpatial (optional)
 * @param {object} [input.manifest]  dataset manifest (for snapshot dates)
 * @returns {object} packet with { facility_id, facts[], unknowns[], meta, hash }
 */
export function buildEvidencePacket({ record, spatial = null, manifest = null }) {
  const r = record || {};
  const facts = [];
  const unknowns = [];

  const addFact = (id, label, value, note) =>
    facts.push({ id, label, value: value ?? null, ...(note ? { note } : {}) });
  const addUnknown = (id, question, note) =>
    unknowns.push({ id, question, ...(note ? { note } : {}) });

  // --- Reported project facts ------------------------------------------------
  addFact("F_FACILITY", "Reported facility name", r.facility ?? null);
  addFact("F_MUNICIPALITY", "Municipality", r.municipality ?? null);
  addFact("F_STATUS", "Reported project status", r.status ?? null);
  addFact("F_TYPE", "Reported project type", r.type ?? null);
  addFact("F_MW_PERMITTED", "MW permitted (reported)", num(r.mw_permitted));
  addFact("F_MW_OPERATING", "MW operating (reported)", num(r.mw_operating));
  addFact(
    "F_OPERATING_SINCE",
    "Operating since (reported)",
    r.operating_since ?? null
  );

  // --- Town utility context --------------------------------------------------
  addFact(
    "F_UTILITY",
    "Reported town electric distribution utility",
    r.elec_label ?? null,
    "Town-level distribution utility. Service to this specific site and interconnection status are NOT verified."
  );

  // --- Town EJ context -------------------------------------------------------
  addFact(
    "F_EJ_BG_COUNT",
    "EJ block groups reported in town",
    num(r.ej_block_group_count)
  );
  addFact(
    "F_EJ_MIN_INCOME",
    "Lowest block-group median household income in town (min_bg_mhhi)",
    num(r.min_bg_mhhi)
  );
  addFact(
    "F_EJ_MAX_LIMENG",
    "Highest limited-English household % in town",
    num(r.max_lim_eng_pct)
  );
  addFact(
    "F_EJ_MAX_MINORITY",
    "Highest minority % in town",
    num(r.max_minority_pct)
  );
  addFact(
    "F_EJ_CRITERIA",
    "EJ criteria present in town",
    Array.isArray(r.ej_criteria_summary) && r.ej_criteria_summary.length
      ? r.ej_criteria_summary.join("; ")
      : null
  );

  // --- Spatial results / search scope ---------------------------------------
  const identityStatus = spatial?.identity?.status ?? "not_run";
  addFact(
    "F_IDENTITY",
    "Live geometry identity resolution",
    identityStatus,
    "verified = one live point matched; ambiguous = multiple same-named points; not_found = no match; not_run = inspector not opened."
  );

  const ejSearch = spatial?.ejSearch ?? null;
  if (ejSearch && ejSearch.scope === "bounded-radius") {
    addFact(
      "F_EJ_SEARCH_SCOPE",
      "EJ spatial search scope",
      `bounded radius ~${ejSearch.radiusMiles} mi (cross-municipal)${
        ejSearch.complete === false ? ", partial results" : ""
      }`
    );
    addFact(
      "F_EJ_SEARCH_COUNT",
      "EJ block-group polygons returned by live search",
      num(ejSearch.count)
    );
  } else {
    addFact(
      "F_EJ_SEARCH_SCOPE",
      "EJ spatial search scope",
      "not run (town-level context only)"
    );
  }

  const prox = spatial?.proximity ?? null;
  const locationVerified = identityStatus === "verified" && !!spatial?.primary;
  if (locationVerified && prox) {
    if (prox.inside) {
      addFact(
        "F_PROXIMITY",
        "Verified spatial proximity",
        "landfill point falls inside an EJ block group (0 mi)"
      );
    } else {
      addFact(
        "F_PROXIMITY",
        "Verified spatial proximity",
        `${prox.distanceMiles.toFixed(2)} mi to nearest EJ block-group boundary`
      );
    }
  } else {
    // Missing/unverified geometry stays an explicit UNKNOWN, not a guessed fact.
    addUnknown(
      "U_PROXIMITY",
      "What is the verified distance from this landfill to the nearest EJ block group?",
      locationVerified
        ? "No EJ block group found within the search radius."
        : "Location not verified (identity " + identityStatus + "); distance withheld."
    );
  }

  // --- Standing unknowns the data CANNOT answer (guardrails) ------------------
  // These must never be inferred from status/proximity alone.
  addUnknown(
    "U_GRANT_ELIGIBILITY",
    "Is this facility eligible for a specific state/federal grant program, and under what criteria?",
    "Not derivable from status or EJ proximity. Requires program rules + application review."
  );
  addUnknown(
    "U_INTERCONNECTION",
    "What is the available interconnection / hosting capacity at this site's feeder?",
    "Requires a utility interconnection study; not in this dataset."
  );
  addUnknown(
    "U_STORAGE_FEASIBILITY",
    "Is battery storage physically and commercially feasible at this capped landfill?",
    "Requires site geotechnical + engineering feasibility review."
  );
  addUnknown(
    "U_SUBSCRIBER_BENEFIT",
    "What bill-credit benefit would subscribers actually receive, and who qualifies?",
    "Requires program structure + subscriber economics; not derivable here."
  );
  addUnknown(
    "U_LEGAL_REQUIREMENTS",
    "What legal / regulatory requirements (e.g. outreach, siting, permitting) apply?",
    "Requires legal review; limited-English % is a planning signal, not a legal mandate."
  );
  addUnknown(
    "U_SITE_SERVICE",
    "Which utility actually provides service and interconnection at THIS site (vs. the town default)?",
    "Only the town-level distribution utility is reported."
  );

  // --- Meta / provenance -----------------------------------------------------
  const snapshotDates = {};
  if (manifest?.inputs) {
    for (const inp of manifest.inputs) snapshotDates[inp.dataset] = inp.snapshot_date;
  }
  const meta = {
    facility_id: r.facility_id ?? null,
    municipality: r.municipality ?? null,
    town_key: r.town_key ?? null,
    snapshot_dates: snapshotDates,
    identity_status: identityStatus,
    location_verified: locationVerified,
  };

  const packet = {
    packet_version: 1,
    facility_id: r.facility_id ?? null,
    facts,
    unknowns,
    meta,
  };

  // Deterministic hash over the semantic content (not meta timestamps).
  packet.hash = createHash(
    JSON.stringify({ facts, unknowns, facility_id: packet.facility_id })
  );
  return packet;
}

/** The set of all valid IDs in a packet (for output validation). */
export function packetIdSet(packet) {
  const ids = new Set();
  for (const f of packet.facts || []) ids.add(f.id);
  for (const u of packet.unknowns || []) ids.add(u.id);
  return ids;
}
