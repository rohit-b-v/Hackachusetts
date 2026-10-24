// Second Look — source adapters.
//
// Pure, isomorphic functions that turn a reported facility record (+ dataset
// manifest + optional live spatial result) into provenance-tagged Observations.
// This is the ONLY layer that touches reported data; the deterministic
// screening layer (screening.js) consumes Observations and never re-reads the
// raw record. Keeping provenance here lets the UI classify every value and the
// export preserve the distinction.
//
// Honesty rules enforced here (see .kiro/steering/product.md and the spec):
//   - Absent grid/land values are provenance:"unknown" with value:null. We
//     never fabricate a value and never imply "no constraints" from absence.
//   - Any site-to-grid / site-to-feeder association defaults to
//     association_confidence:"unverified" — the serving feeder is NEVER inferred
//     from the nearest mapped line or the town distribution utility.
//   - Observed hosting capacity (none exists in the climate/ snapshots) is
//     emitted as "unknown", kept entirely separate from any hypothetical
//     scenario override supplied later by the planner.
//   - Source/retrieval timestamps come from the dataset manifest, not hardcoded.

/**
 * @typedef {Object} Observation
 * @property {string} key
 * @property {string} label
 * @property {*} value                      null when unknown
 * @property {"sourced"|"assumption"|"unknown"} provenance
 * @property {string} [source_url]
 * @property {string} [source_record_id]
 * @property {string} [units]
 * @property {string} [source_timestamp]    snapshot/published date (from manifest)
 * @property {string} [retrieval_timestamp] when the snapshot was generated/fetched
 * @property {string} [coverage]            e.g. "town-level", "area (MA bbox)"
 * @property {"verified"|"unverified"|"n/a"} [association_confidence]
 * @property {string} [evidence_id]         linked F_ or U_ id when one exists
 * @property {string} [note]
 */

// Documented source request URLs (from each climate/<folder>/README.md). These
// describe the live endpoint each snapshot was taken from.
export const SOURCE_URLS = {
  landfills:
    "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/DEP/RenewablesAtMaLandfills/MapServer/0",
  utilities:
    "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0",
  ej: "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/EJ2020/MapServer/0",
  // The transmission dataset ships with the project but is NOT joined into the
  // built record; it is area context only (and carries no geometry, no hosting
  // capacity). URL retained so a transmission Observation can cite its origin.
  transmission:
    "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0",
};

/** Build an Observation, dropping any provenance field that is not available. */
function obs(base) {
  const o = { key: base.key, label: base.label, value: base.value ?? null, provenance: base.provenance };
  const optional = [
    "source_url",
    "source_record_id",
    "units",
    "source_timestamp",
    "retrieval_timestamp",
    "coverage",
    "association_confidence",
    "evidence_id",
    "note",
  ];
  for (const k of optional) {
    if (base[k] !== undefined && base[k] !== null && base[k] !== "") o[k] = base[k];
  }
  // Invariant: unknown observations never carry a non-null value.
  if (o.provenance === "unknown") o.value = null;
  return o;
}

/** Pull per-dataset snapshot dates + the manifest generation time. */
function manifestDates(manifest, dataset) {
  const inputs = Array.isArray(manifest?.inputs) ? manifest.inputs : [];
  const inp = inputs.find((i) => i.dataset === dataset) || null;
  return {
    source_timestamp: inp?.snapshot_date || undefined,
    retrieval_timestamp: manifest?.generated_at || undefined,
    source_url: inp?.source_url || SOURCE_URLS[dataset],
  };
}

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

/**
 * Grid-capacity evidence group.
 *
 * NB: This is context only. None of these Observations is hosting capacity or
 * interconnection approval. The town distribution utility and any area
 * transmission context are site-UNVERIFIED by construction.
 *
 * @param {object} record     a landfill_opportunities record
 * @param {object} [spatial]  optional live spatial result (unused for capacity today)
 * @param {object} [manifest] dataset manifest
 * @returns {Observation[]}
 */
export function gridCapacityObservations(record, spatial = null, manifest = null) {
  const r = record || {};
  const fid = r.facility_id || null;
  const util = manifestDates(manifest, "utilities");

  const out = [];

  // Town distribution utility — reported, but site service is NOT verified.
  out.push(
    obs({
      key: "town_distribution_utility",
      label: "Reported town electric distribution utility",
      value: hasValue(r.elec_label) ? r.elec_label : null,
      provenance: hasValue(r.elec_label) ? "sourced" : "unknown",
      source_url: util.source_url,
      source_record_id: r.town_key || fid || undefined,
      source_timestamp: util.source_timestamp,
      retrieval_timestamp: util.retrieval_timestamp,
      coverage: "town-level",
      association_confidence: "unverified",
      evidence_id: "F_UTILITY",
      note:
        "Town default distribution utility. Service and interconnection at THIS site are not verified.",
    })
  );

  // Serving feeder / site-to-line association — NEVER inferred. Always unknown
  // unless a verified association is supplied (none is available today).
  out.push(
    obs({
      key: "serving_feeder",
      label: "Serving feeder / site-to-line association",
      value: null,
      provenance: "unknown",
      coverage: "n/a",
      association_confidence: "unverified",
      evidence_id: "U_SITE_SERVICE",
      note:
        "Not inferred from the nearest mapped line or the town utility. Requires a verified utility record.",
    })
  );

  // Observed hosting capacity — no such dataset in climate/, so unknown. Kept
  // separate from the planner's hypothetical grid-capacity assumption.
  out.push(
    obs({
      key: "observed_hosting_capacity",
      label: "Observed hosting capacity at this feeder",
      value: null,
      provenance: "unknown",
      units: "MW",
      coverage: "n/a",
      association_confidence: "unverified",
      evidence_id: "U_INTERCONNECTION",
      note:
        "No hosting-capacity source available. A hypothetical value may be entered for screening but is not a sourced figure and not an approval.",
    })
  );

  // Whether any published capacity already nets queued/interconnection-queue
  // generation. Unknown with no source — screening must NOT apply a queue
  // adjustment while this is unknown.
  out.push(
    obs({
      key: "queued_generation_accounted",
      label: "Published capacity already nets queued generation?",
      value: null,
      provenance: "unknown",
      coverage: "n/a",
      association_confidence: "unverified",
      evidence_id: "U_INTERCONNECTION",
      note:
        "Unverified. Verify whether any published capacity figure already accounts for queued generation before applying an adjustment.",
    })
  );

  return out;
}

/**
 * Land / site constraints group. The landfills snapshot has no address, parcel,
 * acreage, slope, or cap-condition fields, so these are unknown — which must
 * NOT be read as "no constraints".
 *
 * @param {object} record
 * @param {object} [manifest]
 * @returns {Observation[]}
 */
export function landConstraintObservations(record, manifest = null) {
  const r = record || {};
  const fid = r.facility_id || null;
  const lf = manifestDates(manifest, "landfills");

  const base = {
    source_url: lf.source_url,
    source_record_id: fid || undefined,
    coverage: "n/a",
    association_confidence: "n/a",
  };

  return [
    obs({
      key: "site_address_coordinates",
      label: "Site address / coordinates",
      value: null,
      provenance: "unknown",
      note:
        "Not in the landfills snapshot (geometry omitted). Verify via live geometry / parcel record.",
      ...base,
    }),
    obs({
      key: "site_acreage",
      label: "Developable acreage",
      value: null,
      provenance: "unknown",
      units: "acres",
      note: "Not reported. Absence does not mean the site is unconstrained.",
      ...base,
    }),
    obs({
      key: "cap_condition",
      label: "Landfill cap condition / post-closure constraints",
      value: null,
      provenance: "unknown",
      note: "Not reported. Requires a geotechnical / post-closure review.",
      ...base,
    }),
    // Reported technology IS available and is relevant to land use / solar fit.
    obs({
      key: "reported_technology",
      label: "Reported project technology",
      value: hasValue(r.type) ? r.type : null,
      provenance: hasValue(r.type) ? "sourced" : "unknown",
      source_timestamp: lf.source_timestamp,
      retrieval_timestamp: lf.retrieval_timestamp,
      coverage: "site",
      evidence_id: "F_TYPE",
      source_url: lf.source_url,
      source_record_id: fid || undefined,
      association_confidence: "n/a",
    }),
  ];
}

/**
 * Unresolved questions group — surfaces the canonical packet unknowns so the
 * four-panel UI and the export share one set of open questions.
 *
 * @param {object} packet  a buildEvidencePacket() result
 * @returns {Observation[]}
 */
export function unresolvedObservations(packet) {
  const unknowns = Array.isArray(packet?.unknowns) ? packet.unknowns : [];
  return unknowns.map((u) =>
    obs({
      key: u.id,
      label: u.question,
      value: null,
      provenance: "unknown",
      coverage: "n/a",
      association_confidence: "unverified",
      evidence_id: u.id,
      note: u.note || undefined,
    })
  );
}

/**
 * Source dates for the datasets backing the displayed sourced values.
 * @param {object} manifest
 * @returns {{ dataset:string, source_timestamp:string|null, retrieval_timestamp:string|null, source_url:string|null }[]}
 */
export function sourceDates(manifest) {
  const inputs = Array.isArray(manifest?.inputs) ? manifest.inputs : [];
  return inputs.map((i) => ({
    dataset: i.dataset,
    source_timestamp: i.snapshot_date || null,
    retrieval_timestamp: manifest?.generated_at || null,
    source_url: i.source_url || SOURCE_URLS[i.dataset] || null,
  }));
}

/** Convenience: all four evidence groups for one facility. */
export function secondLookEvidence({ record, packet, spatial = null, manifest = null }) {
  return {
    grid: gridCapacityObservations(record, spatial, manifest),
    land: landConstraintObservations(record, manifest),
    unresolved: unresolvedObservations(packet),
    sourceDates: sourceDates(manifest),
  };
}
