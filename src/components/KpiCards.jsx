import { MapPin, Hammer, BatteryCharging, Scale } from "lucide-react";

function KpiCard({ icon: Icon, accent, value, label, sub, active, onClick, clickable }) {
  const Comp = clickable ? "button" : "div";
  return (
    <Comp
      type={clickable ? "button" : undefined}
      onClick={onClick}
      aria-pressed={clickable ? active : undefined}
      className={`flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition ${
        clickable ? "cursor-pointer hover:border-brand-400 hover:shadow" : ""
      } ${
        active
          ? "border-brand-500 ring-2 ring-brand-500/30"
          : "border-slate-200"
      }`}
    >
      <div className={`rounded-lg p-2 ${accent}`}>
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight text-slate-900">{value}</div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
        {clickable && (
          <div className="mt-1 text-[11px] font-medium text-brand-600">
            {active ? "Filtering ✓ — click to clear" : "Click to filter"}
          </div>
        )}
      </div>
    </Comp>
  );
}

/**
 * Four headline KPIs. The stalled, operating, and EJ cards are clickable and
 * toggle the matching table filter via `quick` / `onQuick`.
 */
export default function KpiCards({ stats, quick, onQuick }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={MapPin}
        accent="bg-slate-100 text-slate-700"
        value={stats.total}
        label="Total MA Landfill Sites"
        sub={`${stats.utilityMatchedPct}% matched to utility territories`}
      />
      <KpiCard
        clickable
        active={quick === "stalled"}
        onClick={() => onQuick("stalled")}
        icon={Hammer}
        accent="bg-amber-100 text-amber-700"
        value={stats.stalled}
        label="Permitted or Construction (reported)"
        sub={`${stats.permitted} Permitted + ${stats.construction} Construction, per reported status`}
      />
      <KpiCard
        clickable
        active={quick === "operating"}
        onClick={() => onQuick("operating")}
        icon={BatteryCharging}
        accent="bg-green-100 text-green-700"
        value={stats.operating}
        label="Operating (reported)"
        sub="Operating projects — storage co-location would require feasibility review"
      />
      <KpiCard
        clickable
        active={quick === "ej"}
        onClick={() => onQuick("ej")}
        icon={Scale}
        accent="bg-indigo-100 text-indigo-700"
        value={stats.ejSites}
        label="Sites in Towns with EJ Block Groups"
        sub={`${stats.ejSites} sites across ${stats.ejTowns} towns reporting Environmental Justice block groups`}
      />
    </div>
  );
}
