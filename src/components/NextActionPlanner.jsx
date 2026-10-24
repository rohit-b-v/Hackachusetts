import { useState } from "react";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  ClipboardCheck,
  HelpCircle,
  FileText,
  UserCircle2,
  Database,
  Bot,
  FileClock,
} from "lucide-react";
import { requestPlan } from "../lib/planClient.js";

/** Render the authoritative value of a fact from the canonical packet. */
function factValue(packet, id) {
  const f = (packet?.facts || []).find((x) => x.id === id);
  if (!f) return null;
  return f;
}

/** A small source badge distinguishing live Gemma / cache / template. */
function SourceBadge({ source, label }) {
  if (source === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-inset ring-violet-600/20">
        <Bot className="h-3 w-3" /> Live Gemma
      </span>
    );
  }
  if (source === "cache") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-600/20">
        <FileClock className="h-3 w-3" /> Cached (Gemma)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-500/20">
      <FileText className="h-3 w-3" /> {label || "Template-generated"}
    </span>
  );
}

/** Chips that link an AI suggestion back to canonical evidence IDs. */
function EvidenceChips({ ids, packet }) {
  if (!ids || !ids.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {ids.map((id) => {
        const isUnknown = id.startsWith("U_");
        const f = factValue(packet, id);
        const title = f ? `${f.label}: ${JSON.stringify(f.value)}` : id;
        return (
          <span
            key={id}
            title={title}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
              isUnknown
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {id}
          </span>
        );
      })}
    </div>
  );
}

export default function NextActionPlanner({ site, spatial, manifest }) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  const run = async () => {
    setState({ status: "loading", data: null, error: null });
    try {
      const data = await requestPlan({ record: site, spatial, manifest });
      setState({ status: "ready", data, error: null });
    } catch (err) {
      setState({ status: "error", data: null, error: String(err) });
    }
  };

  const data = state.data;
  const packet = data?.packet;

  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h4 className="text-sm font-semibold text-slate-900">
            Municipal Next-Action Planner
          </h4>
        </div>
        {state.status === "ready" && data && (
          <SourceBadge source={data.source} label={data.label} />
        )}
      </div>

      {state.status === "idle" && (
        <div className="rounded-lg bg-violet-50 p-3 text-sm text-slate-600">
          <p className="mb-2">
            Generate three prioritized next investigation steps for this facility
            from the canonical evidence packet. AI suggestions are kept separate
            from the source facts, and eligibility/feasibility are never inferred.
          </p>
          <button
            type="button"
            onClick={run}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            <Sparkles className="h-4 w-4" />
            Generate Next Actions
          </button>
        </div>
      )}

      {state.status === "loading" && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building evidence packet and consulting the planner…
        </div>
      )}

      {state.status === "ready" && data && (
        <div className="space-y-3">
          {/* Provenance line */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Database className="h-3 w-3" /> evidence {data.evidence_hash?.slice(0, 10)}
            </span>
            {data.model && <span>model: {data.model}</span>}
            {data.prompt_version && <span>prompt: {data.prompt_version}</span>}
            {data.reason && data.source === "template" && (
              <span className="text-amber-600">fallback: {data.reason}</span>
            )}
            <button
              type="button"
              onClick={run}
              className="ml-auto inline-flex items-center gap-1 text-violet-700 hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          </div>

          {/* AI-suggestions boundary: everything below the rule is model/template */}
          <div className="rounded-lg border border-violet-200 bg-white">
            <div className="flex items-center gap-1.5 border-b border-violet-100 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
              <Sparkles className="h-3 w-3" />
              Suggestions — {data.source === "template" ? "template logic" : "AI-generated"}, review before acting
            </div>

            {/* Selected supported facts */}
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="mb-1 text-xs font-semibold text-slate-700">
                Most relevant supported facts
              </div>
              <ul className="space-y-1.5">
                {data.plan.selected_facts.map((f) => {
                  const canonical = factValue(packet, f.id);
                  return (
                    <li key={f.id} className="text-sm">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">
                          {f.id}
                        </span>
                        <div>
                          {/* authoritative value rendered from canonical data */}
                          {canonical && (
                            <div className="font-medium text-slate-900">
                              {canonical.label}:{" "}
                              <span className="text-slate-700">
                                {canonical.value === null ? "—" : String(canonical.value)}
                              </span>
                            </div>
                          )}
                          <div className="text-xs italic text-slate-500">
                            {f.relevance}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Three prioritized actions */}
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <ClipboardCheck className="h-3.5 w-3.5 text-violet-600" />
                Three prioritized next actions
              </div>
              <ol className="space-y-2">
                {data.plan.actions.map((a, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {a.title}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {a.why_it_matters}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <UserCircle2 className="h-3 w-3" /> {a.owner_role}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" /> {a.needed_document}
                          </span>
                        </div>
                        <EvidenceChips ids={a.evidence_ids} packet={packet} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Three questions */}
            <div className="px-3 py-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <HelpCircle className="h-3.5 w-3.5 text-violet-600" />
                Questions to ask
              </div>
              <ul className="space-y-1.5">
                {data.plan.questions.map((q, i) => (
                  <li key={i} className="text-sm">
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                      {q.audience}
                    </span>{" "}
                    <span className="text-slate-700">{q.question}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-[11px] leading-snug text-slate-400">
            Authoritative numbers above are rendered from the canonical evidence
            packet, not model text. Suggestions never assert grant eligibility,
            interconnection capacity, storage feasibility, subscriber benefits, or
            legal requirements — those remain open questions to investigate.
          </p>
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Could not generate a plan: {state.error}
        </div>
      )}
    </div>
  );
}
