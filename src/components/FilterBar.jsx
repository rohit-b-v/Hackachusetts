import { Search, Languages, Zap } from "lucide-react";

const STATUSES = ["All", "Permitted", "Construction", "Operating"];

export default function FilterBar({
  filters,
  setFilters,
  utilityOptions,
  onPreset,
}) {
  const update = (patch) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Search */}
        <label className="relative block">
          <span className="sr-only">Search municipality or facility</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Search municipality or facility…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>

        {/* Status */}
        <label className="block">
          <span className="sr-only">Status</span>
          <select
            value={filters.status}
            onChange={(e) => update({ status: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All Statuses" : s}
              </option>
            ))}
          </select>
        </label>

        {/* Utility */}
        <label className="relative block">
          <span className="sr-only">Reported town utility</span>
          <Zap className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            value={filters.utility}
            onChange={(e) =>
              update({ utility: e.target.value, utilityFamily: null })
            }
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="All">All Reported Town Utilities</option>
            {utilityOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Multilingual toggle pill */}
        <button
          type="button"
          onClick={() => update({ multilingualOnly: !filters.multilingualOnly })}
          aria-pressed={filters.multilingualOnly}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition ${
            filters.multilingualOnly
              ? "bg-rose-600 text-white ring-rose-600"
              : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          <Languages className="h-3.5 w-3.5" />
          Language-access planning flag (limited-English ≥ 5%)
        </button>

        <span className="mx-1 hidden text-slate-300 sm:inline">|</span>

        <span className="text-xs font-medium text-slate-500">Demo presets:</span>
        <PresetButton onClick={() => onPreset("springfield")}>
          High EJ context + Permitted (Springfield)
        </PresetButton>
        <PresetButton onClick={() => onPreset("norfolk")}>
          Ambiguous identity edge case (Norfolk)
        </PresetButton>
        <PresetButton onClick={() => onPreset("storage")}>
          Operating site (Barnstable / Carver)
        </PresetButton>
      </div>
    </div>
  );
}

function PresetButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
    >
      {children}
    </button>
  );
}
