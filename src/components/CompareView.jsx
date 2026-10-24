import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Copy,
  Check,
  Printer,
  Loader2,
  GitCompare,
  CircleHelp,
  ListChecks,
} from "lucide-react";
import { buildEvidencePacket } from "../lib/evidencePacket.js";
import { requestPlan } from "../lib/planClient.js";
import {
  getChecklist,
  setChecklist,
  seedFromPlan,
  makeBlankItem,
  OWNER_ROLES,
  TASK_STATUSES,
} from "../lib/checklist.js";
import {
  isSolarRecord,
  sourceCapacity,
  computeScenario,
  DEFAULT_ASSUMPTIONS,
} from "../lib/scenario.js";
import { buildFacilityBrief, renderBriefText } from "../lib/compareBrief.js";
import { formatCurrency } from "../lib/format.js";
import { StatusBadge } from "./Badge.jsx";
import SecondLookPanel from "./secondlook/SecondLookPanel.jsx";

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/#(\d)/g, "#$1");
}

function factVal(packet, id) {
  const f = (packet.facts || []).find((x) => x.id === id);
  return f ? f.value : null;
}

/** Comparison rows: label + an extractor from (record, packet). */
const COMPARE_ROWS = [
  { label: "Reported status", get: (r) => r.status || "—" },
  {
    label: "MW permitted / operating",
    get: (r) => `${r.mw_permitted ?? "—"} / ${r.mw_operating ?? "—"}`,
  },
  { label: "Reported town utility", get: (r) => r.elec_label || "—" },
  { label: "Town EJ block groups", get: (r) => String(r.ej_block_group_count ?? "—") },
  {
    label: "Lowest BG income",
    get: (r) => (r.min_bg_mhhi == null ? "unknown" : formatCurrency(r.min_bg_mhhi)),
  },
  {
    label: "Highest limited-English %",
    get: (r) => (r.max_lim_eng_pct == null ? "unknown" : `${r.max_lim_eng_pct.toFixed(1)}%`),
  },
  {
    label: "Spatial proximity",
    get: (r, p) => {
      const id = factVal(p, "F_IDENTITY");
      // Compare view is town-level; live proximity requires the inspector.
      return id === "not_run"
        ? "unknown (open inspector to verify)"
        : factVal(p, "F_PROXIMITY") || "unknown";
    },
    muted: true,
  },
];

export default function CompareView({ records, manifest, onClose, onRemove }) {
  // Close on Escape (parity with the inspector drawer).
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Build a canonical packet per facility (town-level; no live spatial here).
  const packets = useMemo(
    () => records.map((r) => buildEvidencePacket({ record: r, spatial: null, manifest })),
    [records, manifest]
  );

  // Fetch a plan per facility once.
  const [plans, setPlans] = useState({}); // facility_id -> response
  const [loadingPlans, setLoadingPlans] = useState(false);
  const planReqId = useRef(0);

  // Second Look assumptions, keyed by facility_id so they never leak between
  // facilities (R1.4) and so the combined export reflects the same values the
  // panel shows (R12.1). Seeded lazily from reported source capacity per card.
  const [slByFacility, setSlByFacility] = useState({}); // facility_id -> { proposedMw, gridCapacityMw }
  const setSlFor = (fid, next) => setSlByFacility((prev) => ({ ...prev, [fid]: next }));

  useEffect(() => {
    const myId = ++planReqId.current;
    setLoadingPlans(true);
    let alive = true;
    Promise.all(
      records.map((r) =>
        requestPlan({ record: r, spatial: null, manifest }).then((res) => ({
          id: r.facility_id,
          res,
        }))
      )
    )
      .then((results) => {
        if (!alive || myId !== planReqId.current) return;
        const map = {};
        for (const { id, res } of results) {
          map[id] = res;
          // Seed the local checklist from the plan on first view (no overwrite).
          seedFromPlan(id, { actions: res.plan.actions });
        }
        setPlans(map);
      })
      .finally(() => {
        if (alive && myId === planReqId.current) setLoadingPlans(false);
      });
    return () => {
      alive = false;
      planReqId.current++;
    };
  }, [records, manifest]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="no-print absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="print-root relative ml-auto flex h-full w-full max-w-6xl flex-col bg-slate-50 shadow-2xl">
        {/* Header */}
        <div className="no-print flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Compare &amp; Plan</h2>
              <p className="text-xs text-slate-500">
                {records.length} facilities · reported evidence side by side
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close compare"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Honesty note */}
          <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Reported values are dataset snapshots. Missing evidence stays
            <strong> unknown</strong> — it never improves a facility. Illustrative
            figures are assumption-based, not verified. Checklist completion is a
            planning aid, <strong>not</strong> official project verification.
          </div>

          {/* Side-by-side evidence comparison */}
          <ComparisonTable records={records} packets={packets} />

          {/* Per-facility scenario + plan + checklist + 4-question brief */}
          <div className="mt-4 grid grid-cols-1 gap-4">
            {records.map((r, i) => (
              <FacilityCard
                key={r.facility_id}
                record={r}
                packet={packets[i]}
                manifest={manifest}
                planResp={plans[r.facility_id]}
                planLoading={loadingPlans && !plans[r.facility_id]}
                onRemove={onRemove}
                slAssumptions={slByFacility[r.facility_id]}
                onSlChange={(next) => setSlFor(r.facility_id, next)}
              />
            ))}
          </div>

          {/* Combined export of all shortlisted facilities */}
          <ExportBar
            records={records}
            packets={packets}
            plans={plans}
            manifest={manifest}
            slByFacility={slByFacility}
          />
        </div>
      </div>
    </div>
  );
}

function ComparisonTable({ records, packets }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm print-block">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Evidence</th>
            {records.map((r) => (
              <th key={r.facility_id} className="px-3 py-2">
                <div className="font-semibold text-slate-900">{titleCase(r.municipality)}</div>
                <div className="text-[11px] font-normal normal-case text-slate-500">
                  {r.facility}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {COMPARE_ROWS.map((row) => (
            <tr key={row.label}>
              <td className="px-3 py-2 font-medium text-slate-600">{row.label}</td>
              {records.map((r, i) => {
                const v = row.get(r, packets[i]);
                const isUnknown = /unknown/i.test(String(v));
                return (
                  <td
                    key={r.facility_id}
                    className={`px-3 py-2 ${
                      isUnknown ? "italic text-slate-400" : "text-slate-800"
                    }`}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FacilityCard({ record, packet, manifest, planResp, planLoading, onRemove, slAssumptions, onSlChange }) {
  const solar = isSolarRecord(record);
  const src = sourceCapacity(record);

  // Scenario inputs: separate source capacity (read-only) from assumed (edit).
  const [scenarioOn, setScenarioOn] = useState(false);
  const [assumedMw, setAssumedMw] = useState(
    src ? Math.min(10, Math.max(0.5, src.mw)) : 2.0
  );
  const [bess, setBess] = useState(false);
  const sc = computeScenario(assumedMw, bess, DEFAULT_ASSUMPTIONS);

  // Second Look assumptions are owned by CompareView (keyed by facility_id) and
  // passed in, so the panel AND the exported/printed brief derive from one
  // source (R12.1). Seed the default from reported source capacity on first use.
  const slDefault = { proposedMw: src ? src.mw : "", gridCapacityMw: "", gridCapacityBasis: "hypothetical" };
  const slAssume = slAssumptions || slDefault;
  const toNum = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const slForBrief = {
    proposedMw: toNum(slAssume.proposedMw),
    gridCapacityMw: toNum(slAssume.gridCapacityMw),
    gridCapacityBasis: "hypothetical",
  };

  // Checklist state (persisted per facility_id).
  const [items, setItems] = useState(() => getChecklist(record.facility_id));
  useEffect(() => {
    // Re-read after plan seeding may have populated storage.
    setItems(getChecklist(record.facility_id));
  }, [record.facility_id, planResp]);

  const persist = (nextItems) => {
    setItems(nextItems);
    setChecklist(record.facility_id, nextItems);
  };
  const updateItem = (id, patch) =>
    persist(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const addItem = () => persist([...items, makeBlankItem()]);
  const removeItem = (id) => persist(items.filter((it) => it.id !== id));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm print-block">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div>
          <div className="text-sm font-bold text-slate-900">
            {titleCase(record.municipality)} · {record.facility}
          </div>
          <div className="text-[11px] text-slate-500">
            evidence {packet.hash?.slice(0, 10)} · facility_id {record.facility_id}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={record.status} />
          <button
            type="button"
            onClick={() => onRemove && onRemove(record.facility_id)}
            className="no-print rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Remove from shortlist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Illustrative scenario */}
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">
            Illustrative scenario{" "}
            <span className="font-normal text-slate-400">(not verified outcomes)</span>
          </h4>
          {solar && (
            <label className="no-print flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={scenarioOn}
                onChange={(e) => setScenarioOn(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
              />
              Enable scenario
            </label>
          )}
        </div>

        {!solar ? (
          <p className="text-xs italic text-slate-500">
            Scenario not applicable — reported technology is “{record.type || "unknown"}”,
            so solar generation/subscriber assumptions are not applied.
          </p>
        ) : (
          <>
            <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Source capacity (reported):</span>{" "}
              {src ? `${src.mw} MW — ${src.basis}` : "no reported capacity"}
              <span className="mx-1 text-slate-300">|</span>
              read-only input from the dataset
            </div>

            {scenarioOn && (
              <>
                <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Assumed capacity (editable): <strong>{assumedMw.toFixed(1)} MW</strong>
                    <input
                      type="range"
                      min={0.5}
                      max={10}
                      step={0.1}
                      value={assumedMw}
                      onChange={(e) => setAssumedMw(Number(e.target.value))}
                      className="mt-1 w-full accent-amber-500"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={bess}
                      onChange={(e) => setBess(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    + illustrative 4-hr storage
                  </label>
                </div>
                <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                  <ScenarioTile
                    label="Illustrative generation"
                    value={`${Math.round(sc.annualGenMwh).toLocaleString()} MWh/yr`}
                  />
                  <ScenarioTile
                    label="Illustrative subscriber scale"
                    value={`~${sc.illustrativeHouseholds.toLocaleString()} hh`}
                  />
                  <ScenarioTile
                    label="Illustrative dispatch"
                    value={bess ? `${sc.illustrativeDispatchMw.toFixed(2)} MW` : "—"}
                  />
                </dl>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
                  Assumption-based only. These are NOT verified EJ households served,
                  guaranteed savings, or an actual grid-peak contribution.
                </p>
              </>
            )}
          </>
        )}
      </div>

      {/* Second Look: evidence + assumptions + deterministic screening */}
      <SecondLookPanel
        record={record}
        packet={packet}
        manifest={manifest}
        assumptions={slAssume}
        onAssumptionsChange={onSlChange}
      />

      {/* Plan (Gemma / template), kept labeled + separate */}
      <div className="border-b border-slate-100 px-4 py-3">
        <h4 className="mb-1 text-sm font-semibold text-slate-900">Next-action plan</h4>
        {planLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> generating…
          </div>
        ) : planResp ? (
          <div>
            <div className="mb-1 text-[11px] text-slate-500">
              source:{" "}
              <span className="font-semibold">
                {planResp.source === "live"
                  ? "Live Gemma"
                  : planResp.source === "cache"
                  ? planResp.label === "Gemma"
                    ? "Cached (Gemma)"
                    : "Cached (template)"
                  : planResp.label || "Template-generated"}
              </span>
            </div>
            <ol className="space-y-1 text-xs text-slate-700">
              {planResp.plan.actions.map((a, i) => (
                <li key={i}>
                  <span className="font-semibold">{i + 1}. {a.title}</span>{" "}
                  <span className="text-slate-500">— {a.owner_role}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-xs text-slate-400">No plan available.</p>
        )}
      </div>

      {/* Editable checklist */}
      <div className="px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <ListChecks className="h-4 w-4 text-brand-600" /> Investigation checklist
          </h4>
          <button
            type="button"
            onClick={addItem}
            className="no-print rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            + Add task
          </button>
        </div>
        <p className="mb-2 text-[11px] text-slate-400">
          Saved locally by facility ID. Marking done is a planning aid, not official
          verification.
        </p>
        {items.length === 0 ? (
          <p className="text-xs text-slate-400">No tasks yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="rounded-lg border border-slate-200 p-2">
                <div className="flex items-start gap-2">
                  <input
                    value={it.title}
                    onChange={(e) => updateItem(it.id, { title: e.target.value })}
                    placeholder="Task title"
                    className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="no-print rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    aria-label="Remove task"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  <select
                    value={it.owner_role}
                    onChange={(e) => updateItem(it.id, { owner_role: e.target.value })}
                    className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                  >
                    {OWNER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <select
                    value={it.status}
                    onChange={(e) => updateItem(it.id, { status: e.target.value })}
                    className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    value={it.requested_evidence}
                    onChange={(e) => updateItem(it.id, { requested_evidence: e.target.value })}
                    placeholder="Requested evidence / document"
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
                <input
                  value={it.note}
                  onChange={(e) => updateItem(it.id, { note: e.target.value })}
                  placeholder="Note"
                  className="mt-1.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-facility 4-question brief preview */}
      <FourQuestions
        record={record}
        packet={packet}
        manifest={manifest}
        planResp={planResp}
        scenario={
          solar && scenarioOn
            ? { applied: true, assumedMw, bess, ...sc }
            : { applied: false }
        }
        checklist={items}
        secondLook={slForBrief}
      />
    </div>
  );
}

function ScenarioTile({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <div className="text-sm font-bold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function FourQuestions({ record, packet, manifest, planResp, scenario, checklist, secondLook }) {
  const brief = useMemo(
    () =>
      buildFacilityBrief({
        record,
        packet,
        manifest,
        plan: planResp ? { ...planResp.plan, __source: planResp.source } : null,
        scenario,
        checklist,
        secondLook,
      }),
    [record, packet, manifest, planResp, scenario, checklist, secondLook]
  );
  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 print-block">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <CircleHelp className="h-4 w-4 text-brand-600" /> Decision brief
      </h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <QaBlock title="1. What do we know?" tone="emerald">
          <ul className="space-y-0.5">
            {brief.know.slice(0, 8).map((k) => (
              <li key={k.id}>
                <span className="text-slate-500">{k.label}:</span>{" "}
                <span className="font-medium">{k.value}</span>
              </li>
            ))}
          </ul>
        </QaBlock>
        <QaBlock title="2. What are we assuming?" tone="amber">
          <ul className="space-y-0.5">
            {brief.assume.map((a, i) => (
              <li key={i}>
                <span className="text-slate-500">{a.label}:</span>{" "}
                <span>{a.value}</span>
              </li>
            ))}
          </ul>
        </QaBlock>
        <QaBlock title="3. What remains unresolved?" tone="slate">
          <ul className="space-y-0.5">
            {brief.unresolved.map((u) => (
              <li key={u.id}>
                <span className="font-mono text-[10px] text-slate-400">{u.id}</span>{" "}
                {u.question}
              </li>
            ))}
          </ul>
        </QaBlock>
        <QaBlock title="4. What should we do next?" tone="violet">
          <ul className="space-y-0.5">
            {brief.next.map((n, i) => (
              <li key={i}>
                {n.kind === "checklist" ? (
                  <span className="mr-1 rounded bg-slate-200 px-1 text-[10px]">
                    {n.status}
                  </span>
                ) : n.kind === "screening" ? (
                  <span className="mr-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">
                    second look
                  </span>
                ) : (
                  <span className="mr-1 rounded bg-violet-100 px-1 text-[10px] text-violet-700">
                    plan {n.n}
                  </span>
                )}
                <span className="font-medium">{n.title}</span>{" "}
                {n.kind !== "screening" && <span className="text-slate-500">— {n.owner}</span>}
              </li>
            ))}
          </ul>
        </QaBlock>
      </div>
    </div>
  );
}

function QaBlock({ title, tone, children }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    slate: "border-slate-200 bg-white",
    violet: "border-violet-200 bg-violet-50",
  };
  return (
    <div className={`rounded-lg border p-2.5 text-xs text-slate-700 ${tones[tone]}`}>
      <div className="mb-1 font-semibold text-slate-900">{title}</div>
      {children}
    </div>
  );
}

function ExportBar({ records, packets, plans, manifest, slByFacility = {} }) {
  const [copied, setCopied] = useState(false);

  const toNum = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const buildAll = () =>
    records.map((r, i) => {
      const resp = plans[r.facility_id];
      const checklist = getChecklist(r.facility_id);
      const sl = slByFacility[r.facility_id] || null;
      return buildFacilityBrief({
        record: r,
        packet: packets[i],
        manifest,
        plan: resp ? { ...resp.plan, __source: resp.source } : null,
        // Export reflects saved checklist; scenario is per-card interactive, so
        // the combined export marks it as not-run to avoid stale assumptions.
        scenario: { applied: false },
        checklist,
        // Second Look export reflects the saved per-facility assumptions.
        secondLook: sl
          ? { proposedMw: toNum(sl.proposedMw), gridCapacityMw: toNum(sl.gridCapacityMw), gridCapacityBasis: "hypothetical" }
          : null,
      });
    });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(renderBriefText(buildAll()));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="no-print mt-4 flex gap-2 border-t border-slate-200 pt-4">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied!" : "Copy combined brief"}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Printer className="h-4 w-4" /> Print / Save PDF
      </button>
    </div>
  );
}
