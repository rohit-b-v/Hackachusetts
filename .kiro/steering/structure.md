---
inclusion: always
---

# Cap-to-Community — structure

```
climate/              Read-only source snapshots (data.csv per dataset) — never edit
scripts/build-data.mjs  Joins snapshots -> src/data/landfill_opportunities.json (+ manifest)
server/               Server-only Gemma endpoint (never imported by the client)
  planHandler.js        Core handler: packet rebuild, cache, retries, validate, fallback
  httpBridge.js         Node req/res bridge (bounded body, no-store)
  index.mjs             Standalone prod server (static dist + /api/plan)
src/
  data/landfill_opportunities.json   Built dataset (116 records + manifest)
  lib/                Pure, isomorphic logic (unit-tested)
    massgis.js          Live ArcGIS queries, identity resolution, timeouts
    geo.js              Turf-based proximity (edges, holes, MultiPolygon)
    evidencePacket.js   Canonical facts (F_*) + unknowns (U_*) + hash
    planSchema.js       Structured-plan validation (rejects dangling IDs)
    planClient.js       Browser wrapper for /api/plan (+ local fallback)
    templatePlan.js     Deterministic offline plan
    scenario.js         Illustrative scenario math + solar gating
    checklist.js        localStorage checklist, namespaced by facility_id
    compareBrief.js     Builds the know/assume/unresolved/next export (+ Second Look)
    secondlook/
      sources.js          Provenance-tagged Observations (sourced/assumption/unknown)
      screening.js        Deterministic 3-state screening + explicit-rule priority
  components/
    OpportunityTable.jsx  Table + shortlist checkboxes (keyed by facility_id)
    CompareView.jsx       Compare & plan modal (print-root); hosts Second Look
    InspectorDrawer.jsx   Live spatial inspector (print-root)
    GrantBrief.jsx        Per-facility brief + illustrative scenario
    NextActionPlanner.jsx AI/template plan panel (labels: Gemma/Cached/Template)
    secondlook/
      SecondLookPanel.jsx   Evidence groups + assumption controls + results
      ProvenanceBadge.jsx   sourced / hypothetical / unknown badges
      ScreeningResultRow.jsx 3-state verdict chip + reason + changed marker
tests/                Vitest unit tests + tests/live (opt-in) + browser-journey.mjs
.kiro/                Steering + specs
evidence/             Verification write-ups + screenshots
```

## Conventions
- Facilities are identified by stable `facility_id` (the two Norfolk rows have
  distinct IDs). Shortlist and checklist state are keyed by `facility_id`, never
  by row position, so they survive filtering and don't leak between facilities.
- Printable surfaces get the `print-root` class; sub-sections that must not be
  clipped get `print-block`; anything screen-only gets `no-print`.
- Authoritative numbers are rendered from the canonical dataset/packet, not from
  model text.
