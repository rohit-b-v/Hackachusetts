// Provenance badge — visibly distinguishes the three classes of value so a
// planner can tell them apart without hovering (R5.1):
//   sourced     — reported from a dataset snapshot (neutral/solid)
//   assumption  — a planner-entered HYPOTHETICAL value (amber)
//   unknown     — not in any source (muted italic)

const STYLES = {
  sourced: {
    cls: "bg-slate-200 text-slate-700",
    text: "sourced",
    title: "Reported from a dataset snapshot.",
  },
  assumption: {
    cls: "bg-amber-100 text-amber-800 ring-1 ring-amber-500/30",
    text: "hypothetical",
    title: "Planner-entered hypothetical value — not sourced, not an approval.",
  },
  unknown: {
    cls: "bg-slate-100 text-slate-400 italic",
    text: "unknown",
    title: "Not present in any available source.",
  },
};

export function ProvenanceBadge({ provenance }) {
  const s = STYLES[provenance] || STYLES.unknown;
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${s.cls}`}
      title={s.title}
    >
      {s.text}
    </span>
  );
}

/** One evidence observation row: label + value + provenance badge + metadata. */
export function ObservationRow({ o }) {
  const isUnknown = o.provenance === "unknown";
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-0.5">
      <span className="text-slate-500">{o.label}:</span>
      <span className={isUnknown ? "italic text-slate-400" : "font-medium text-slate-800"}>
        {isUnknown ? "unknown" : String(o.value)}
        {o.units && !isUnknown ? ` ${o.units}` : ""}
      </span>
      <ProvenanceBadge provenance={o.provenance} />
      {o.source_timestamp && (
        <span className="text-[10px] text-slate-400">· source {o.source_timestamp}</span>
      )}
      {o.association_confidence === "unverified" && (
        <span className="text-[10px] font-medium text-amber-700">· site-unverified</span>
      )}
    </li>
  );
}
