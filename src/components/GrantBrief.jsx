import { useState } from "react";
import {
  Zap,
  Scale,
  Languages,
  ExternalLink,
  Copy,
  Printer,
  Check,
  BatteryCharging,
  Hammer,
  Sun,
  Users,
  Gauge,
} from "lucide-react";
import { formatCurrency, formatPct } from "../lib/format.js";
import { StatusBadge } from "./Badge.jsx";
import NextActionPlanner from "./NextActionPlanner.jsx";
import {
  isSolarRecord,
  sourceCapacity,
  computeScenario,
  DEFAULT_ASSUMPTIONS,
} from "../lib/scenario.js";
import data from "../data/landfill_opportunities.json";

const MANIFEST = data.manifest;

const STATE_LINKS = [
  { label: "ResilientMass", url: "https://resilient.mass.gov/" },
  { label: "Mass Save Data", url: "https://www.masssave.com/en/learn/partners/data" },
  {
    label: "Massachusetts Energy Data (DOER)",
    url: "https://www.mass.gov/orgs/massachusetts-department-of-energy-resources",
  },
  { label: "ISO New England — ISO Express", url: "https://www.iso-ne.com/isoexpress/" },
];

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/#(\d)/g, "#$1");
}

function distanceLabel(proximity, locationVerified) {
  if (!locationVerified) return "Location not verified — distance withheld";
  if (!proximity) return "No EJ block group found within the search radius";
  if (proximity.inside) return "Landfill point falls inside an EJ block group";
  return `${proximity.distanceMiles.toFixed(2)} mi to nearest EJ block-group boundary`;
}

function pathway(site) {
  const s = (site.status || "").toLowerCase();
  if (s === "permitted" || s === "construction") {
    return {
      icon: Hammer,
      title: "Candidate: Low-Income Community Shared Solar (grant-supported)",
      body: `Reported status is ${site.status}. A possible pathway is to coordinate interconnection review with the town's reported electric utility (${
        site.elec_label || "unavailable"
      }) and pair municipal grant funding. Interconnection timelines and site service are not verified here.`,
    };
  }
  return {
    icon: BatteryCharging,
    title: "Candidate: Battery Storage Co-Location (feasibility review needed)",
    body: `Operating solar landfill. Co-locating a battery storage system may let midday solar be shifted toward ISO-NE evening/winter peaks, but this requires a site feasibility and interconnection review — it is not confirmed from this data.`,
  };
}

function formatNumber(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

/** Build a clean Markdown/text brief for clipboard copy. */
function buildBriefText(site, proximity, estimator, locationVerified, ejSearch) {
  const p = pathway(site);
  const scopeNote =
    ejSearch?.scope === "bounded-radius"
      ? `Searched EJ block groups within ~${ejSearch.radiusMiles} mi of the landfill (cross-municipal)${
          ejSearch.complete === false ? "; results partial (pagination cap)" : ""
        }.`
      : `Town-level EJ context only (no verified landfill coordinates).`;
  const lines = [
    `# Municipal Opportunity Brief — ${titleCase(site.municipality)}`,
    ``,
    `Facility (reported): ${site.facility}`,
    `Reported status: ${site.status}`,
    `MW permitted / operating (reported): ${site.mw_permitted ?? "—"} / ${site.mw_operating ?? "—"}`,
    ``,
    `## 1. Grid Context (reported town utility)`,
    `Town electric utility (reported): ${site.elec_label || "—"}`,
    `Note: this is the distribution utility reported for the town. Service to this specific site and interconnection status are not verified here.`,
    `Candidate pathway: ${p.title}`,
    `${p.body}`,
    ``,
    `## 2. Neighborhood Equity & Spatial Evidence`,
    `Proximity: ${distanceLabel(proximity, locationVerified)}`,
    scopeNote,
    `EJ block groups in town (reported): ${site.ej_block_group_count}`,
    `Lowest block-group median income (min_bg_mhhi): ${formatCurrency(site.min_bg_mhhi)}`,
    `EJ criteria present: ${
      site.ej_criteria_summary.length ? site.ej_criteria_summary.join("; ") : "None"
    }`,
    ``,
  ];
  if (site.max_lim_eng_pct !== null && site.max_lim_eng_pct > 0) {
    lines.push(
      `## 3. Language-Access Planning Recommendation`,
      `Reported limited-English households in this town reach ${site.max_lim_eng_pct.toFixed(
        1
      )}%. Recommendation: plan translated outreach and enrollment materials so community-solar bill credits reach limited-English and renter households. (Planning recommendation, not a legal mandate.)`,
      ``
    );
  }
  if (estimator && estimator.applied) {
    const { assumedMw, bess, source, sc } = estimator;
    lines.push(
      `## Illustrative Scenario (assumption-based, NOT verified outcomes)`,
      `Source capacity (reported, read-only): ${
        source ? `${source.mw} MW — ${source.basis}` : "no reported capacity"
      }`,
      `Assumed capacity (editable): ${assumedMw.toFixed(1)} MW${
        bess ? " + illustrative 4-hr storage" : ""
      }`,
      `Illustrative annual generation: ${formatNumber(sc.annualGenMwh)} MWh/yr`,
      `Illustrative subscriber scale: ~${formatNumber(
        sc.illustrativeHouseholds
      )} households at ~${formatCurrency(sc.savingsPerHouseholdYr)}/yr each (illustrative, not guaranteed savings)`,
      bess
        ? `Illustrative dispatchable capacity: ${sc.illustrativeDispatchMw.toFixed(
            2
          )} MW (illustrative, not an actual grid-peak commitment)`
        : `Storage not included in this scenario`,
      `These figures are NOT verified EJ households served, guaranteed savings, or actual grid-peak contribution.`,
      ``
    );
  } else if (estimator && estimator.notSolar) {
    lines.push(
      `## Illustrative Scenario`,
      `Not applicable — reported technology is "${estimator.type || "unknown"}", not solar.`,
      ``
    );
  }

  lines.push(
    `## Official State Guidance`,
    ...STATE_LINKS.map((l) => `- ${l.label}: ${l.url}`)
  );
  return lines.join("\n");
}

function Section({ icon: Icon, accent, title, children }) {
  return (
    <section className="border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent}`} />
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      </div>
      <div className="text-sm text-slate-600">{children}</div>
    </section>
  );
}

function MetricTile({ icon: Icon, accent, value, unit, label, muted }) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        muted ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <Icon className={`mb-1 h-4 w-4 ${muted ? "text-slate-400" : accent}`} />
      <div className="text-base font-bold leading-tight text-slate-900">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[11px] leading-tight text-slate-500">{label}</div>
    </div>
  );
}

export default function GrantBrief({
  site,
  proximity,
  locationVerified = false,
  ejSearch = null,
  spatialForPlanner = null,
}) {
  const [copied, setCopied] = useState(false);
  const p = pathway(site);

  // Illustrative scenario: source capacity (read-only) vs. assumed (editable).
  const solar = isSolarRecord(site);
  const source = sourceCapacity(site);
  const [scenarioOn, setScenarioOn] = useState(false);
  const [assumedMw, setAssumedMw] = useState(
    source ? Math.min(10, Math.max(0.5, Number(source.mw) || 2.0)) : 2.0
  );
  const [bess, setBess] = useState(false);
  const sc = computeScenario(assumedMw, bess, DEFAULT_ASSUMPTIONS);
  const estimator = solar
    ? { applied: scenarioOn, assumedMw, bess, source, sc }
    : { applied: false, notSolar: true, type: site.type };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        buildBriefText(site, proximity, estimator, locationVerified, ejSearch)
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const showBilingual = site.max_lim_eng_pct !== null && site.max_lim_eng_pct > 0;

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm print-full">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Municipal Opportunity Brief
          </h3>
          <p className="text-xs text-slate-500">
            {titleCase(site.municipality)} · {site.facility}
          </p>
        </div>
        <StatusBadge status={site.status} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* AI Next-Action Planner (suggestions kept visibly separate below) */}
        <NextActionPlanner
          site={site}
          spatial={spatialForPlanner}
          manifest={MANIFEST}
        />

        {/* 1. Grid context (reported town utility) */}
        <Section icon={Zap} accent="text-amber-600" title="Grid Context (Reported Town Utility)">
          <div className="mb-1">
            <span className="font-medium text-slate-900">{site.elec_label || "—"}</span>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Distribution utility reported for the town. Service to this specific
            site and interconnection status are not verified here.
          </p>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <p.icon className="h-4 w-4 text-brand-600" />
              {p.title}
            </div>
            <p className="mt-1 text-slate-600">{p.body}</p>
          </div>
        </Section>

        {/* 2. Equity + spatial evidence */}
        <Section icon={Scale} accent="text-indigo-600" title="Neighborhood Equity & Spatial Evidence">
          <div
            className={`mb-1 rounded-lg px-3 py-2 text-sm font-semibold ${
              locationVerified
                ? "bg-indigo-50 text-indigo-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {distanceLabel(proximity, locationVerified)}
          </div>
          {ejSearch?.scope === "bounded-radius" && (
            <p className="mb-2 text-xs text-slate-500">
              Searched EJ block groups within ~{ejSearch.radiusMiles} mi
              (cross-municipal){ejSearch.complete === false ? "; partial results" : ""}.
              Town counts below are from the reported dataset.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-slate-500">EJ block groups</dt>
            <dd className="text-right font-medium text-slate-900">
              {site.ej_block_group_count}
            </dd>
            <dt className="text-slate-500">Lowest BG income</dt>
            <dd className="text-right font-medium text-slate-900">
              {formatCurrency(site.min_bg_mhhi)}
            </dd>
            <dt className="text-slate-500">Max minority</dt>
            <dd className="text-right font-medium text-slate-900">
              {formatPct(site.max_minority_pct)}
            </dd>
          </dl>
          {site.ej_criteria_summary.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {site.ej_criteria_summary.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Illustrative scenario (NOT verified outcomes) */}
        <Section
          icon={Sun}
          accent="text-amber-500"
          title="Illustrative Scenario (not verified)"
        >
          {!solar ? (
            <p className="text-xs italic text-slate-500">
              Scenario not applicable — reported technology is “{site.type || "unknown"}”,
              so solar generation and subscriber assumptions are not applied.
            </p>
          ) : (
            <>
              <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-medium text-slate-700">
                  Source capacity (reported, read-only):
                </span>{" "}
                {source ? `${source.mw} MW — ${source.basis}` : "no reported capacity"}
              </div>

              <label className="mb-3 flex cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={scenarioOn}
                  onChange={(e) => setScenarioOn(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-amber-500"
                />
                <span className="font-medium text-slate-700">
                  Explore an illustrative scenario
                </span>
              </label>

              {scenarioOn && (
                <>
                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between">
                      <label htmlFor="mw-slider" className="text-xs font-medium text-slate-600">
                        Assumed capacity (editable, separate from reported)
                      </label>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-800">
                        {assumedMw.toFixed(1)} MW
                      </span>
                    </div>
                    <input
                      id="mw-slider"
                      type="range"
                      min={0.5}
                      max={10}
                      step={0.1}
                      value={assumedMw}
                      onChange={(e) => setAssumedMw(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>0.5 MW</span>
                      <span>10 MW</span>
                    </div>
                  </div>

                  <label className="mb-3 flex cursor-pointer select-none items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={bess}
                      onChange={(e) => setBess(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <BatteryCharging className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-medium text-slate-700">
                      + illustrative 4-hr battery storage
                    </span>
                  </label>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <MetricTile
                      icon={Sun}
                      accent="text-amber-600"
                      value={`${formatNumber(sc.annualGenMwh)}`}
                      unit="MWh/yr"
                      label="Illustrative annual generation"
                    />
                    <MetricTile
                      icon={Users}
                      accent="text-indigo-600"
                      value={`~${formatNumber(sc.illustrativeHouseholds)}`}
                      unit="households"
                      label="Illustrative subscriber scale (not verified)"
                    />
                    <MetricTile
                      icon={Gauge}
                      accent="text-rose-600"
                      value={bess ? sc.illustrativeDispatchMw.toFixed(2) : "—"}
                      unit={bess ? "MW" : ""}
                      label="Illustrative dispatch (not a grid commitment)"
                      muted={!bess}
                    />
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-slate-400">
                    Assumption-based illustration only. These are NOT verified EJ
                    households served, guaranteed bill savings, or an actual
                    grid-peak contribution. Rates:{" "}
                    {DEFAULT_ASSUMPTIONS.capacityFactorMwhPerMwYr} MWh/MW·yr,
                    ~{DEFAULT_ASSUMPTIONS.householdsPerMw} hh/MW, ~$
                    {DEFAULT_ASSUMPTIONS.savingsPerHouseholdYr}/hh·yr,{" "}
                    {DEFAULT_ASSUMPTIONS.bessDispatchMwPerMw} dispatch MW/MW.
                  </p>
                </>
              )}
            </>
          )}
        </Section>

        {/* 3. Language-access planning recommendation */}
        {showBilingual && (
          <Section icon={Languages} accent="text-rose-600" title="Language-Access Planning Recommendation">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">
              <span className="font-semibold">
                {site.max_lim_eng_pct.toFixed(1)}% limited-English households (reported).
              </span>{" "}
              Recommendation: plan translated outreach and enrollment materials so
              community-solar bill credits reach limited-English and renter
              households. Planning guidance, not a legal mandate.
            </div>
          </Section>
        )}

        {/* 4. State links */}
        <Section icon={ExternalLink} accent="text-slate-600" title="Official State Guidance & Citations">
          <ul className="space-y-1">
            {STATE_LINKS.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-600"
                >
                  {l.label}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* Actions */}
      <div className="no-print flex gap-2 border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy Grant Brief"}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
