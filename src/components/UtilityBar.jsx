import { Zap } from "lucide-react";
import {
  utilityFamily,
  UTILITY_FAMILY_COLORS,
  UTILITY_FAMILY_ORDER,
} from "../lib/format.js";

/**
 * "Who Delivers the Electrons?" — a compact stacked bar showing the share of
 * the 116 landfill sites across the four utility families. Clicking a segment
 * (or legend chip) filters the table by that family.
 */
export default function UtilityBar({ records, activeFamily, onSelectFamily }) {
  const total = records.length;
  const counts = UTILITY_FAMILY_ORDER.reduce((acc, fam) => {
    acc[fam] = 0;
    return acc;
  }, {});
  for (const r of records) {
    counts[utilityFamily(r.elec_label)] += 1;
  }

  const segments = UTILITY_FAMILY_ORDER.filter((fam) => counts[fam] > 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-900">
          Who Delivers the Electrons? — Utility Territory Breakdown
        </h2>
        <span className="text-xs text-slate-400">({total} sites)</span>
      </div>

      {/* Stacked bar */}
      <div
        className="flex h-7 w-full overflow-hidden rounded-lg ring-1 ring-slate-200"
        role="group"
        aria-label="Utility territory breakdown"
      >
        {segments.map((fam) => {
          const pct = (counts[fam] / total) * 100;
          const isActive = activeFamily === fam;
          const dimmed = activeFamily && !isActive;
          return (
            <button
              key={fam}
              type="button"
              onClick={() => onSelectFamily(fam)}
              title={`${fam}: ${counts[fam]} sites (${pct.toFixed(0)}%)`}
              aria-pressed={isActive}
              className="flex items-center justify-center text-[11px] font-semibold text-white transition"
              style={{
                width: `${pct}%`,
                backgroundColor: UTILITY_FAMILY_COLORS[fam],
                opacity: dimmed ? 0.35 : 1,
                outline: isActive ? "2px solid #0f172a" : "none",
                outlineOffset: "-2px",
              }}
            >
              {pct >= 8 ? counts[fam] : ""}
            </button>
          );
        })}
      </div>

      {/* Legend / clickable chips */}
      <div className="mt-2 flex flex-wrap gap-2">
        {UTILITY_FAMILY_ORDER.map((fam) => {
          const isActive = activeFamily === fam;
          return (
            <button
              key={fam}
              type="button"
              onClick={() => onSelectFamily(fam)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: UTILITY_FAMILY_COLORS[fam] }}
              />
              {fam}
              <span className={isActive ? "text-slate-300" : "text-slate-400"}>
                {counts[fam]}
              </span>
            </button>
          );
        })}
        {activeFamily && (
          <button
            type="button"
            onClick={() => onSelectFamily(activeFamily)}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
