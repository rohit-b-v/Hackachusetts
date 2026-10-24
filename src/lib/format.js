// Display + math helpers shared across the Cap-to-Community UI.

/** Format a number as whole-dollar USD, or an em-dash when missing. */
export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a percentage value (already 0-100) to one decimal + %, or em-dash. */
export function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(1)}%`;
}

/** Format megawatts, tolerating null. */
export function formatMW(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value)} MW`;
}

/** Return Tailwind classes for a status badge. */
export function statusBadgeClasses(status) {
  const s = (status || "").toLowerCase();
  if (s === "permitted") return "bg-amber-100 text-amber-800 ring-amber-600/20";
  if (s === "construction") return "bg-blue-100 text-blue-800 ring-blue-600/20";
  if (s === "operating") return "bg-green-100 text-green-800 ring-green-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
}

/**
 * Classify a raw ELEC_LABEL / utility string into one of the four headline
 * utility families used by the Territory Breakdown bar.
 * Returns one of: "National Grid", "Eversource", "Unitil", "Municipal Light Plants".
 */
export function utilityFamily(elecLabel) {
  const s = (elecLabel || "").toLowerCase();
  if (s.includes("national grid") || s.includes("massachusetts electric") || s.includes("nantucket electric"))
    return "National Grid";
  if (s.includes("eversource") || s.includes("nstar") || s.includes("western massachusetts electric"))
    return "Eversource";
  if (s.includes("unitil") || s.includes("fitchburg gas"))
    return "Unitil";
  // Municipal Light Plants and anything else (e.g. "Municipal").
  return "Municipal Light Plants";
}

/** Tailwind-friendly hex color per utility family (for the breakdown bar). */
export const UTILITY_FAMILY_COLORS = {
  "National Grid": "#2563eb", // blue
  Eversource: "#dc2626", // red
  Unitil: "#d97706", // amber
  "Municipal Light Plants": "#059669", // emerald
};

export const UTILITY_FAMILY_ORDER = [
  "National Grid",
  "Eversource",
  "Unitil",
  "Municipal Light Plants",
];

/**
 * Great-circle (Haversine) distance in miles between two [lat, lng] points.
 */
export function haversineMiles([lat1, lng1], [lat2, lng2]) {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
