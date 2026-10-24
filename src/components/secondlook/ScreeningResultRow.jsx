// One screening result: a three-state verdict chip + the reproducible reason,
// with a "changed" marker when the verdict differs from the cleared baseline.

const VERDICT = {
  potential_constraint: {
    cls: "bg-rose-100 text-rose-800 ring-1 ring-rose-500/30",
    text: "potential constraint",
  },
  no_flag: {
    cls: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500/30",
    text: "no flag from available evidence",
  },
  unknown: {
    cls: "bg-slate-100 text-slate-500 ring-1 ring-slate-400/30",
    text: "unknown",
  },
};

export function VerdictChip({ verdict }) {
  const v = VERDICT[verdict] || VERDICT.unknown;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold leading-none ${v.cls}`}>
      {v.text}
    </span>
  );
}

export function ScreeningResultRow({ result }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800">{result.label}</span>
        <div className="flex items-center gap-1.5">
          {result.changed && (
            <span
              className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700"
              title="This verdict changed from the baseline (no assumptions entered)."
            >
              changed
            </span>
          )}
          <VerdictChip verdict={result.verdict} />
        </div>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">{result.reason}</p>
    </li>
  );
}
