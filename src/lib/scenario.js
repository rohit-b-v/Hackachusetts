// Illustrative scenario math (NOT verified outcomes).
//
// This is a planning sandbox: it multiplies an editable assumed capacity by
// transparent, user-editable rate assumptions. It makes NO claim about verified
// EJ households served, guaranteed bill savings, or actual grid-peak
// contribution. Those remain open questions (see evidence packet U_* items).
//
// Source capacity (from the reported dataset) is kept separate from the
// editable scenario inputs so the two are never conflated.

// Default illustrative rate assumptions (editable in the UI).
export const DEFAULT_ASSUMPTIONS = {
  capacityFactorMwhPerMwYr: 1350, // MA utility-scale solar, order-of-magnitude
  householdsPerMw: 220, // illustrative subscriber count per MW
  savingsPerHouseholdYr: 350, // illustrative $/yr per subscriber
  bessDispatchMwPerMw: 0.75, // illustrative 4-hr dispatchable fraction
};

/** True when a record's reported technology is solar (assumptions apply). */
export function isSolarRecord(record) {
  return String(record?.type || "").toLowerCase().includes("solar");
}

/**
 * Pick the source (reported) capacity to seed the scenario from. Returns
 * { mw, basis } where basis explains which reported field was used, or null.
 */
export function sourceCapacity(record) {
  if (record?.mw_operating != null) {
    return { mw: Number(record.mw_operating), basis: "reported MW operating" };
  }
  if (record?.mw_permitted != null) {
    return { mw: Number(record.mw_permitted), basis: "reported MW permitted" };
  }
  return null; // no reported capacity
}

/**
 * Compute illustrative figures. All outputs are scenario estimates.
 * @param {number} assumedMw   editable assumed capacity (MW)
 * @param {boolean} bess       include illustrative 4-hr storage
 * @param {object} a           assumption rates (DEFAULT_ASSUMPTIONS shape)
 */
export function computeScenario(assumedMw, bess, a = DEFAULT_ASSUMPTIONS) {
  const mw = Number(assumedMw) || 0;
  return {
    annualGenMwh: mw * a.capacityFactorMwhPerMwYr,
    illustrativeHouseholds: Math.round(mw * a.householdsPerMw),
    savingsPerHouseholdYr: a.savingsPerHouseholdYr,
    illustrativeAnnualSavings: Math.round(mw * a.householdsPerMw) * a.savingsPerHouseholdYr,
    illustrativeDispatchMw: bess ? mw * a.bessDispatchMwPerMw : 0,
  };
}
