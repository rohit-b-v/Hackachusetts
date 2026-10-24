import { statusBadgeClasses } from "../lib/format.js";

export function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClasses(
        status
      )}`}
    >
      {status || "Unknown"}
    </span>
  );
}

export function Pill({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
    amber: "bg-amber-100 text-amber-800 ring-amber-600/20",
    green: "bg-green-100 text-green-800 ring-green-600/20",
    red: "bg-red-100 text-red-800 ring-red-600/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        tones[tone] || tones.slate
      }`}
    >
      {children}
    </span>
  );
}
