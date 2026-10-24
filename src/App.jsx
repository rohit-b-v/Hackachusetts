import { useMemo, useState } from "react";
import { Leaf, ShieldCheck, GitCompare, X } from "lucide-react";
import data from "./data/landfill_opportunities.json";
import { utilityFamily } from "./lib/format.js";
import KpiCards from "./components/KpiCards.jsx";
import UtilityBar from "./components/UtilityBar.jsx";
import FilterBar from "./components/FilterBar.jsx";
import OpportunityTable from "./components/OpportunityTable.jsx";
import InspectorDrawer from "./components/InspectorDrawer.jsx";
import CompareView from "./components/CompareView.jsx";

const RECORDS = data.records;
const MANIFEST = data.manifest;
const MAX_COMPARE = 3;

/** Derive the headline KPI stats from the dataset. */
function deriveStats(records) {
  const total = records.length;
  const permitted = records.filter((r) => r.status === "Permitted").length;
  const construction = records.filter((r) => r.status === "Construction").length;
  const operating = records.filter((r) => r.status === "Operating").length;
  const utilityMatched = records.filter((r) => r.elec_label).length;
  const ejSites = records.filter((r) => r.ej_block_group_count > 0).length;
  const ejTowns = new Set(
    records.filter((r) => r.ej_block_group_count > 0).map((r) => r.town_key)
  ).size;
  return {
    total,
    permitted,
    construction,
    stalled: permitted + construction,
    operating,
    utilityMatchedPct: Math.round((utilityMatched / total) * 100),
    ejSites,
    ejTowns,
  };
}

const INITIAL_FILTERS = {
  query: "",
  status: "All",
  utility: "All",
  multilingualOnly: false,
  quick: null, // "stalled" | "operating" | "ej"
  utilityFamily: null, // one of the four families
};

export default function App() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selected, setSelected] = useState(null);

  // Shortlist: up to MAX_COMPARE facility_ids. Preserved across filter changes
  // because it lives here, keyed by stable facility_id (not row position).
  const [shortlist, setShortlist] = useState([]); // array of facility_id
  const [compareOpen, setCompareOpen] = useState(false);

  const stats = useMemo(() => deriveStats(RECORDS), []);

  const byId = useMemo(() => {
    const m = new Map();
    for (const r of RECORDS) m.set(r.facility_id, r);
    return m;
  }, []);

  const shortlistRecords = useMemo(
    () => shortlist.map((id) => byId.get(id)).filter(Boolean),
    [shortlist, byId]
  );

  // Toggle a facility in/out of the shortlist (bounded to MAX_COMPARE).
  const toggleShortlist = (facilityId) => {
    setShortlist((prev) => {
      if (prev.includes(facilityId)) return prev.filter((x) => x !== facilityId);
      if (prev.length >= MAX_COMPARE) return prev; // ignore beyond the cap
      return [...prev, facilityId];
    });
  };
  const clearShortlist = () => setShortlist([]);

  const utilityOptions = useMemo(() => {
    const set = new Set(RECORDS.map((r) => r.elec_label).filter(Boolean));
    return Array.from(set).sort();
  }, []);

  const rows = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return RECORDS.filter((r) => {
      // Quick KPI filters
      if (filters.quick === "stalled" && !(r.status === "Permitted" || r.status === "Construction"))
        return false;
      if (filters.quick === "operating" && r.status !== "Operating") return false;
      if (filters.quick === "ej" && !(r.ej_block_group_count > 0)) return false;

      // Utility family (from the breakdown bar)
      if (filters.utilityFamily && utilityFamily(r.elec_label) !== filters.utilityFamily)
        return false;

      if (filters.status !== "All" && r.status !== filters.status) return false;
      if (filters.utility !== "All" && r.elec_label !== filters.utility) return false;
      if (
        filters.multilingualOnly &&
        !(r.max_lim_eng_pct !== null && r.max_lim_eng_pct >= 5)
      )
        return false;
      if (q) {
        const hay = `${r.municipality} ${r.facility}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // RECORDS is already sorted by score descending in the data file.
  }, [filters]);

  const handlePreset = (preset) => {
    if (preset === "springfield") {
      setFilters({ ...INITIAL_FILTERS, query: "springfield" });
    } else if (preset === "norfolk") {
      setFilters({ ...INITIAL_FILTERS, query: "norfolk" });
    } else if (preset === "storage") {
      setFilters({ ...INITIAL_FILTERS, status: "Operating", query: "barnstable" });
    }
  };

  // Toggle a quick KPI filter on/off.
  const handleQuick = (key) => {
    setFilters((f) => ({ ...f, quick: f.quick === key ? null : key }));
  };

  // Toggle a utility-family filter on/off from the breakdown bar.
  const handleFamily = (fam) => {
    setFilters((f) => ({
      ...f,
      utilityFamily: f.utilityFamily === fam ? null : fam,
      // Clear the exact-utility dropdown so the two don't conflict.
      utility: "All",
    }));
  };

  return (
    <div className="app-root mx-auto min-h-full max-w-[1400px] px-4 pb-24 pt-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-brand-600 p-2 text-white">
              <Leaf className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                Cap-to-Community
              </h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Turning Massachusetts Capped Landfills into Neighborhood Bill Relief &amp;
                Peak Grid Storage
              </p>
            </div>
          </div>

          <div
            className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800"
            title="Data hygiene applied during the Phase 1 join"
          >
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span>
              Data Hygiene Verified ·{" "}
              <span className="font-normal text-green-700">
                BG_MHHI = 0 placeholders &amp; #1/#2 town suffixes cleaned across all 116 sites
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* KPI cards */}
      <section className="mb-6">
        <KpiCards stats={stats} quick={filters.quick} onQuick={handleQuick} />
      </section>

      {/* Utility territory breakdown */}
      <section className="mb-4">
        <UtilityBar
          records={RECORDS}
          activeFamily={filters.utilityFamily}
          onSelectFamily={handleFamily}
        />
      </section>

      {/* Filters */}
      <section className="mb-4">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          utilityOptions={utilityOptions}
          onPreset={handlePreset}
        />
      </section>

      {/* Table */}
      <section>
        <OpportunityTable
          rows={rows}
          onInspect={setSelected}
          shortlist={shortlist}
          onToggleShortlist={toggleShortlist}
          maxCompare={MAX_COMPARE}
        />
      </section>

      {/* Sticky compare action bar (appears once anything is shortlisted) */}
      {shortlist.length > 0 && !compareOpen && !selected && (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3">
            <GitCompare className="h-5 w-5 text-brand-600" />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-slate-900">
                Compare shortlist ({shortlist.length}/{MAX_COMPARE})
              </span>
              <span className="ml-2 truncate text-xs text-slate-500">
                {shortlistRecords
                  .map((r) => titleCaseTown(r.municipality))
                  .join(" · ")}
              </span>
            </div>
            <button
              type="button"
              onClick={clearShortlist}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <GitCompare className="h-4 w-4" />
              Compare &amp; Plan
            </button>
          </div>
        </div>
      )}

      {/* Compare & plan workflow */}
      {compareOpen && shortlistRecords.length > 0 && (
        <CompareView
          records={shortlistRecords}
          manifest={MANIFEST}
          onClose={() => setCompareOpen(false)}
          onRemove={toggleShortlist}
        />
      )}

      {/* Inspector drawer */}
      {selected && (
        <InspectorDrawer site={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/** Title-case an ALL CAPS town for display (preserves "#1"). */
function titleCaseTown(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/#(\d)/g, "#$1");
}
