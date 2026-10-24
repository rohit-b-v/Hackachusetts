import { Search as SearchIcon, Languages, GitCompare } from "lucide-react";
import { StatusBadge, Pill } from "./Badge.jsx";
import { formatCurrency } from "../lib/format.js";

export default function OpportunityTable({
  rows,
  onInspect,
  shortlist = [],
  onToggleShortlist,
  maxCompare = 3,
}) {
  const capReached = shortlist.length >= maxCompare;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Landfill Sites — Reported Evidence
        </h2>
        <span className="text-xs text-slate-500">
          {rows.length} sites · {shortlist.length}/{maxCompare} shortlisted
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">
                <span className="sr-only">Shortlist</span>
                <GitCompare className="h-3.5 w-3.5 text-slate-400" />
              </th>
              <th className="px-3 py-2">Municipality &amp; Facility</th>
              <th className="px-3 py-2">Reported Status</th>
              <th className="px-3 py-2">MW (Perm / Oper)</th>
              <th className="px-3 py-2">Reported Town Utility</th>
              <th className="px-3 py-2 text-right">Town EJ BGs</th>
              <th className="px-3 py-2 text-right">Lowest BG Income</th>
              <th className="px-3 py-2">Limited-English</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                  No sites match the current filters.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const highLimEng =
                r.max_lim_eng_pct !== null && r.max_lim_eng_pct >= 5;
              const checked = shortlist.includes(r.facility_id);
              const disabled = !checked && capReached;
              return (
                <tr
                  key={r.facility_id || `${r.municipality}-${r.facility}-${i}`}
                  className={`hover:bg-slate-50 ${checked ? "bg-brand-50/50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onToggleShortlist && onToggleShortlist(r.facility_id)}
                      title={
                        disabled
                          ? `Shortlist is full (${maxCompare} max)`
                          : checked
                          ? "Remove from shortlist"
                          : "Add to shortlist"
                      }
                      aria-label={`Shortlist ${r.facility} in ${r.municipality}`}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">
                      {titleCase(r.municipality)}
                    </div>
                    <div className="text-xs text-slate-500">{r.facility}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {fmt(r.mw_permitted)} / {fmt(r.mw_operating)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-slate-700">{r.elec_label || "—"}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {r.ej_block_group_count}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatCurrency(r.min_bg_mhhi)}
                  </td>
                  <td className="px-3 py-2">
                    {r.max_lim_eng_pct === null ? (
                      <span className="text-slate-400">—</span>
                    ) : highLimEng ? (
                      <Pill tone="red">
                        <Languages className="h-3 w-3" />
                        {r.max_lim_eng_pct.toFixed(1)}%
                      </Pill>
                    ) : (
                      <Pill tone="slate">{r.max_lim_eng_pct.toFixed(1)}%</Pill>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onInspect(r)}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
                    >
                      <SearchIcon className="h-3.5 w-3.5" />
                      Inspect Proximity &amp; Brief
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmt(v) {
  return v === null || v === undefined ? "—" : v;
}

/** Convert an ALL CAPS town to Title Case for display, preserving "#1". */
function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/#(\d)/g, "#$1");
}
