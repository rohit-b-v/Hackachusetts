# Design — Compare & Plan workflow

## Architecture

State lives in `App.jsx`:
- `shortlist: string[]` of `facility_id` (bounded to 3). Because it is keyed by
  stable ID and held above the filtered-rows memo, it survives filter/search
  changes (R1) and keeps the two Norfolk IDs independent (R8).
- A sticky action bar surfaces once the shortlist is non-empty and opens
  `CompareView`.

`OpportunityTable.jsx` adds a leading checkbox column. A checkbox is `checked`
when its `facility_id` is in the shortlist and `disabled` when the cap is reached
and it is not already selected.

`CompareView.jsx` (a `print-root` modal):
- Builds one canonical evidence packet per facility via `buildEvidencePacket`
  with `spatial: null` (town-level; live proximity requires the inspector), so
  `U_PROXIMITY` stays an unknown (R2).
- Fetches one plan per facility via `requestPlan` and seeds each facility's
  checklist from the plan once (never overwriting edits).
- Renders: a comparison table, then per-facility cards (illustrative scenario +
  plan + editable checklist + four-question decision brief), then a combined
  export bar.

## Data models
- Checklist item: `{ id, title, owner_role, requested_evidence, status, note,
  source }`. Persisted in `localStorage` under `c2c.checklist.v1` as
  `{ [facility_id]: { items, updated_at } }` — namespacing guarantees no leak
  (R3, R8).
- Scenario: `sourceCapacity(record)` returns reported `{ mw, basis }` (read-only);
  `computeScenario(assumedMw, bess, assumptions)` returns illustrative figures.
  `isSolarRecord` gates applicability (R5).
- Decision brief: `buildFacilityBrief` returns `{ know, assume, unresolved, next }`;
  `renderBriefText` renders the same structure for copy AND print (R4, R7).

## Inspector reliability (R6)
- `src/lib/massgis.js` `fetchJson` wraps `fetch` with an AbortController + hard
  timeout, and composes the caller's `signal` so either cancels the request.
- `InspectorDrawer.jsx` uses a `spatialReqId` ref: each run increments it and the
  resolver ignores results whose id is stale; cleanup bumps the id and aborts.
- The transmission effect depends only on `[showTransmission, anchorKey]` (a
  string), not on the `transmission.status` it mutates, and uses a separate
  `txReqId` ref. This removes the self-cancellation bug where setting status to
  "loading" re-ran the effect and the cleanup aborted the just-started request.

## Print (R7)
In `@media print`, when a `.print-root` exists, everything is `visibility:hidden`
and only the `.print-root` subtree is re-shown and lifted to the top as a static,
full-width, overflow-visible document. Interactive map and chrome are `no-print`.

## Error handling
- `requestPlan` falls back to a local template plan if `/api/plan` is
  unreachable, so Compare works offline.
- The inspector shows a truthful error panel on MassGIS failure while the brief
  continues to render from the local dataset (R6).

## Testing strategy
- Unit: `checklist.test.js` (namespacing, Norfolk independence, reload, seeding),
  `scenario.test.js` (math, solar gating, source/assumed separation, brief
  structure, copy==print source), plus existing geo/planner/build-data suites.
- Browser: `tests/browser-journey.mjs` (Playwright) walks shortlist → compare →
  checklist edit → reload persistence/no-leak → external-failure usability →
  print preview screenshot.
