// Second Look — deterministic screening.
//
// Pure. No DOM, no network, no model. Given the provenance-tagged Observations
// from sources.js plus the planner's assumptions, it produces a fixed set of
// screening results, each with one of three verdicts:
//
//     "potential_constraint" | "no_flag" | "unknown"
//
// There is deliberately NO "pass": a clean result is "no flag from the
// available evidence", and absent evidence is "unknown" — never a pass. Every
// reason string is reproducible from the visible inputs alone (no model text),
// so a planner can re-derive it from the numbers on screen.
//
// Honesty invariants (see spec correctness properties 1–4):
//   1. Increasing proposed generation can never IMPROVE the grid-capacity
//      verdict (monotonic worsening in proposedMw).
//   2. Decreasing the assumed available capacity can never improve it
//      (monotonic worsening as gridCapacityMw falls).
//   3. Missing capacity or an unverified feeder association yields "unknown",
//      never a flag and never a pass. "unknown" is NOT ranked as more suitable
//      than "no_flag", so absent evidence can't make a candidate look better.
//   4. runScreening is a pure function of (observations, assumptions), so
//      resetting assumptions to the baseline reproduces the baseline results.

/**
 * @typedef {"potential_constraint"|"no_flag"|"unknown"} Verdict
 * @typedef {Object} ScreeningResult
 * @property {string} id
 * @property {string} label
 * @property {Verdict} verdict
 * @property {string} reason
 * @property {Object} inputs
 * @property {boolean} changed
 * @property {number} priority
 * @property {string[]} evidence_ids
 */

// Suitability axis: lower == more suitable. Used for monotonicity reasoning and
// to guarantee "unknown" never outranks a clean "no_flag".
export const SUITABILITY_RANK = {
  no_flag: 0,
  unknown: 1,
  potential_constraint: 2,
};

// Investigation-priority base by verdict (higher == investigate sooner).
const PRIORITY_BASE = {
  potential_constraint: 100,
  unknown: 60,
  no_flag: 0,
};

// Per-check importance weights (explicit, inspectable — see design §6.3).
const CHECK_WEIGHT = {
  grid_capacity_headroom: 1.0,
  feeder_association: 0.9,
  queued_generation: 0.8,
  land_constraints: 0.7,
  technology_match: 0.3,
};

function obsByKey(observations, key) {
  return (Array.isArray(observations) ? observations : []).find((o) => o && o.key === key) || null;
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** The canonical, cleared baseline the UI compares against for `changed`. */
export function baselineAssumptions(sourceMw = null) {
  return {
    proposedMw: isFiniteNumber(sourceMw) ? sourceMw : null,
    gridCapacityMw: null, // no hypothetical entered at baseline
    gridCapacityBasis: "hypothetical",
  };
}

// --- Individual checks -------------------------------------------------------
// Each returns { verdict, reason, evidence_ids, inputs } (priority/changed are
// added by runScreening so the checks stay simple and independently testable).

/**
 * Grid-capacity headroom: proposed solar capacity vs. the HYPOTHETICAL assumed
 * available grid capacity. This is a planning screen, never interconnection
 * approval.
 */
export function checkGridCapacityHeadroom(assumptions) {
  const proposed = assumptions?.proposedMw;
  const grid = assumptions?.gridCapacityMw;
  const evidence_ids = ["U_INTERCONNECTION"];
  const inputs = {
    proposedMw: { value: proposed ?? null, provenance: "assumption", units: "MW" },
    gridCapacityMw: { value: grid ?? null, provenance: "assumption", units: "MW" },
  };

  if (!isFiniteNumber(proposed) || !isFiniteNumber(grid)) {
    return {
      verdict: "unknown",
      reason:
        "No capacity assumption entered. Enter a proposed capacity and a hypothetical grid-capacity assumption to screen; only a utility interconnection study confirms real capacity.",
      evidence_ids,
      inputs,
    };
  }

  if (proposed > grid) {
    return {
      verdict: "potential_constraint",
      reason: `Assumed ${proposed} MW proposed exceeds the hypothetical ${grid} MW grid-capacity assumption. This is a planning screen against a hypothetical value, not interconnection approval.`,
      evidence_ids,
      inputs,
    };
  }

  return {
    verdict: "no_flag",
    reason: `Assumed ${proposed} MW proposed is within the hypothetical ${grid} MW grid-capacity assumption. This is a planning screen against a hypothetical value, not interconnection approval; only a utility study confirms capacity.`,
    evidence_ids,
    inputs,
  };
}

/** Serving feeder association — never inferred, so unknown unless verified. */
export function checkFeederAssociation(observations) {
  const feeder = obsByKey(observations, "serving_feeder");
  const verified =
    feeder && feeder.provenance === "sourced" && feeder.association_confidence === "verified";
  if (verified) {
    return {
      verdict: "no_flag",
      reason: `Serving feeder is a verified association (${feeder.value}).`,
      evidence_ids: ["F_UTILITY"],
      inputs: { serving_feeder: { value: feeder.value, provenance: "sourced" } },
    };
  }
  return {
    verdict: "unknown",
    reason:
      "Serving feeder not verified; not inferred from the nearest mapped line or the town distribution utility. Requires a verified utility record.",
    evidence_ids: ["U_SITE_SERVICE"],
    inputs: {
      serving_feeder: {
        value: null,
        provenance: "unknown",
        association_confidence: feeder?.association_confidence || "unverified",
      },
    },
  };
}

/**
 * Queued-generation accounting. Until it is verified whether published capacity
 * already nets queued generation, screening treats this as unknown and applies
 * NO queue adjustment.
 */
export function checkQueuedGeneration(observations) {
  const q = obsByKey(observations, "queued_generation_accounted");
  const verified = q && q.provenance === "sourced" && q.value != null;
  if (verified) {
    return {
      verdict: "no_flag",
      reason: `Published capacity accounting for queued generation is documented (${q.value}).`,
      evidence_ids: ["U_INTERCONNECTION"],
      inputs: { queued_generation_accounted: { value: q.value, provenance: "sourced" } },
    };
  }
  return {
    verdict: "unknown",
    reason:
      "Unknown whether any published capacity already nets queued generation. No queue adjustment is applied; verify before adjusting.",
    evidence_ids: ["U_INTERCONNECTION"],
    inputs: { queued_generation_accounted: { value: null, provenance: "unknown" } },
  };
}

/** Land/site constraints. Missing data is unknown, never "no constraints". */
export function checkLandConstraints(observations) {
  const keys = ["site_address_coordinates", "site_acreage", "cap_condition"];
  const anySourced = keys.some((k) => {
    const o = obsByKey(observations, k);
    return o && o.provenance === "sourced" && o.value != null;
  });
  if (!anySourced) {
    return {
      verdict: "unknown",
      reason:
        "No land/site constraint data available (address, acreage, cap condition). Absence of data does not mean the site is unconstrained.",
      evidence_ids: [],
      inputs: Object.fromEntries(keys.map((k) => [k, { value: null, provenance: "unknown" }])),
    };
  }
  // If any land datum is present we still only report what is observed; we do
  // not synthesize a pass. A present value is treated as no_flag for that axis.
  return {
    verdict: "no_flag",
    reason: "Some land/site data is available; review it against siting requirements.",
    evidence_ids: [],
    inputs: Object.fromEntries(
      keys.map((k) => {
        const o = obsByKey(observations, k);
        return [k, { value: o?.value ?? null, provenance: o?.provenance || "unknown" }];
      })
    ),
  };
}

/** Technology match: solar assumptions only apply to reported solar records. */
export function checkTechnologyMatch(observations) {
  const t = obsByKey(observations, "reported_technology");
  if (!t || t.provenance !== "sourced" || t.value == null) {
    return {
      verdict: "unknown",
      reason: "Reported project technology is unavailable; solar assumptions are not applied.",
      evidence_ids: ["F_TYPE"],
      inputs: { reported_technology: { value: null, provenance: "unknown" } },
    };
  }
  const isSolar = String(t.value).toLowerCase().includes("solar");
  if (isSolar) {
    return {
      verdict: "no_flag",
      reason: `Reported technology is "${t.value}"; solar scenario assumptions apply.`,
      evidence_ids: ["F_TYPE"],
      inputs: { reported_technology: { value: t.value, provenance: "sourced" } },
    };
  }
  return {
    verdict: "potential_constraint",
    reason: `Reported technology is "${t.value}", not solar; solar generation/subscriber assumptions do not apply to this record.`,
    evidence_ids: ["F_TYPE"],
    inputs: { reported_technology: { value: t.value, provenance: "sourced" } },
  };
}

const CHECKS = [
  { id: "grid_capacity_headroom", label: "Grid-capacity headroom (hypothetical screen)", run: (obsv, a) => checkGridCapacityHeadroom(a) },
  { id: "feeder_association", label: "Serving-feeder association", run: (obsv) => checkFeederAssociation(obsv) },
  { id: "queued_generation", label: "Queued-generation accounting", run: (obsv) => checkQueuedGeneration(obsv) },
  { id: "land_constraints", label: "Land / site constraints", run: (obsv) => checkLandConstraints(obsv) },
  { id: "technology_match", label: "Technology match", run: (obsv) => checkTechnologyMatch(obsv) },
];

/** Priority from explicit rules: base(verdict) × weight(check). */
export function computePriority(id, verdict) {
  const base = PRIORITY_BASE[verdict] ?? 0;
  const weight = CHECK_WEIGHT[id] ?? 0.5;
  return base * weight;
}

/**
 * Run all checks deterministically.
 *
 * @param {Observation[]} observations  flat list of all evidence observations
 * @param {object} assumptions          { proposedMw, gridCapacityMw, ... }
 * @param {object} [opts]
 * @param {ScreeningResult[]} [opts.baselineResults]  to compute `changed`
 * @returns {{ results: ScreeningResult[], priorityOrder: string[] }}
 */
export function runScreening(observations, assumptions, opts = {}) {
  const baselineById = {};
  if (Array.isArray(opts.baselineResults)) {
    for (const r of opts.baselineResults) baselineById[r.id] = r.verdict;
  }

  const results = CHECKS.map(({ id, label, run }) => {
    const { verdict, reason, evidence_ids, inputs } = run(observations, assumptions);
    const baselineVerdict = baselineById[id];
    return {
      id,
      label,
      verdict,
      reason,
      inputs,
      evidence_ids,
      changed: baselineVerdict !== undefined ? baselineVerdict !== verdict : false,
      priority: computePriority(id, verdict),
    };
  });

  // Investigation order: higher priority first; ties broken by stable check id
  // so the ordering is deterministic and reproducible.
  const priorityOrder = [...results]
    .sort((a, b) => (b.priority - a.priority) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => r.id);

  return { results, priorityOrder };
}
