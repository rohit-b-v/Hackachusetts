import { useMemo, useState } from "react";
import { Microscope, RotateCcw } from "lucide-react";
import { secondLookEvidence } from "../../lib/secondlook/sources.js";
import { runScreening, baselineAssumptions } from "../../lib/secondlook/screening.js";
import { sourceCapacity } from "../../lib/scenario.js";
import { ObservationRow } from "./ProvenanceBadge.jsx";
import { ScreeningResultRow } from "./ScreeningResultRow.jsx";

// A Second Look block for ONE facility. Rendered inside CompareView's per-
// facility card, so its assumption state is naturally scoped to this facility_id
// and cannot leak to another (one component instance per facility).
export default function SecondLookPanel({ record, packet, manifest, assumptions, onAssumptionsChange }) {
  // Evidence (sourced / unknown) for the four groups — memoized per facility.
  const evidence = useMemo(
    () => secondLookEvidence({ record, packet, spatial: null, manifest }),
    [record, packet, manifest]
  );
  const allObs = useMemo(
    () => [...evidence.grid, ...evidence.land, ...evidence.unresolved],
    [evidence]
  );

  // Seed proposed capacity from reported source capacity; grid assumption blank.
  const src = sourceCapacity(record);
  const baseProposed = src ? src.mw : null;

  // Assumptions are controlled by the parent (FacilityCard) when provided, so
  // the exported/printed brief derives from the SAME assumption state as this
  // panel (R12.1). Falls back to internal state if used standalone.
  const controlled = assumptions && typeof onAssumptionsChange === "function";
  const [localProposed, setLocalProposed] = useState(baseProposed ?? "");
  const [localGrid, setLocalGrid] = useState("");
  const proposedMw = controlled ? assumptions.proposedMw ?? "" : localProposed;
  const gridCapacityMw = controlled ? assumptions.gridCapacityMw ?? "" : localGrid;
  const setProposedMw = (v) =>
    controlled ? onAssumptionsChange({ ...assumptions, proposedMw: v }) : setLocalProposed(v);
  const setGridCapacityMw = (v) =>
    controlled ? onAssumptionsChange({ ...assumptions, gridCapacityMw: v }) : setLocalGrid(v);

  const toNum = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Baseline = cleared assumptions (grid blank, proposed = reported source).
  // Current = the planner's live inputs. `changed` marks verdict differences.
  const baseline = useMemo(
    () => runScreening(allObs, baselineAssumptions(baseProposed)),
    [allObs, baseProposed]
  );
  const current = useMemo(
    () =>
      runScreening(
        allObs,
        { proposedMw: toNum(proposedMw), gridCapacityMw: toNum(gridCapacityMw), gridCapacityBasis: "hypothetical" },
        { baselineResults: baseline.results }
      ),
    [allObs, proposedMw, gridCapacityMw, baseline.results]
  );

  const reset = () => {
    if (controlled) {
      onAssumptionsChange({ proposedMw: baseProposed ?? "", gridCapacityMw: "", gridCapacityBasis: "hypothetical" });
    } else {
      setLocalProposed(baseProposed ?? "");
      setLocalGrid("");
    }
  };

  // Results in investigation-priority order.
  const ordered = current.priorityOrder
    .map((id) => current.results.find((r) => r.id === id))
    .filter(Boolean);

  return (
    <section className="border-t border-slate-100 px-4 py-3 print-block" data-second-look>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Microscope className="h-4 w-4 text-brand-600" /> Second Look
        </h4>
        <button
          type="button"
          onClick={reset}
          className="no-print inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw className="h-3 w-3" /> Reset assumptions
        </button>
      </div>

      {/* Evidence groups */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <EvidenceGroup title="Grid-capacity evidence" items={evidence.grid} caption="Context only — not hosting capacity, not interconnection approval." />
        <EvidenceGroup title="Land / site constraints" items={evidence.land} caption="Missing land data stays unknown; absence is not 'no constraints'." />
        <EvidenceGroup title="Unresolved questions" items={evidence.unresolved} />
        <SourceDates dates={evidence.sourceDates} />
      </div>

      {/* Assumption controls */}
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="mb-1 text-[11px] font-semibold text-amber-900">
          Assumptions (hypothetical — not sourced, not an approval)
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-700">
            Proposed solar capacity (MW)
            <input
              type="number"
              min={0}
              step={0.1}
              value={proposedMw}
              onChange={(e) => setProposedMw(e.target.value)}
              aria-label="Proposed solar capacity (MW)"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-slate-700">
            Hypothetical grid-capacity assumption (MW)
            <input
              type="number"
              min={0}
              step={0.1}
              value={gridCapacityMw}
              onChange={(e) => setGridCapacityMw(e.target.value)}
              aria-label="Hypothetical grid-capacity assumption (MW)"
              placeholder="e.g. 5 (demonstration value)"
              className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-sm"
            />
          </label>
        </div>
      </div>

      {/* Screening results (priority order) */}
      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h5 className="text-xs font-semibold text-slate-900">
            Screening results <span className="font-normal text-slate-400">(investigation priority)</span>
          </h5>
        </div>
        <ul className="space-y-1.5">
          {ordered.map((r) => (
            <ScreeningResultRow key={r.id} result={r} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function EvidenceGroup({ title, items, caption }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="mb-1 text-xs font-semibold text-slate-900">{title}</div>
      {caption && <div className="mb-1 text-[10px] leading-snug text-slate-400">{caption}</div>}
      <ul className="text-[11px] text-slate-700">
        {items.map((o) => (
          <ObservationRow key={o.key} o={o} />
        ))}
      </ul>
    </div>
  );
}

function SourceDates({ dates }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="mb-1 text-xs font-semibold text-slate-900">Source dates</div>
      <ul className="text-[11px] text-slate-700">
        {dates.map((d) => (
          <li key={d.dataset} className="flex items-baseline justify-between gap-2 py-0.5">
            <span className="text-slate-500">{d.dataset}</span>
            <span className="font-medium text-slate-800">
              {d.source_timestamp || "unknown"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
