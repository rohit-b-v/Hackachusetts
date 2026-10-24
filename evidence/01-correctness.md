# Evidence 01 — Correctness Pass

Scope: fix the correctness issues that undermine the product promise, without
redesigning the app. Stack preserved (React + Vite + Tailwind + react-leaflet +
lucide-react). Downloaded climate files preserved and untouched.

Date observed: 2026-10-24.

---

## Summary of changes

| # | Issue | Fix |
|---|-------|-----|
| 1 | Proximity measured to polygon **vertices**, ignored **holes** | New `src/lib/geo.js` uses **Turf.js** for edge distance (`pointToLineDistance`), containment honoring holes (`booleanPointInPolygon`), and nearest boundary point (`nearestPointOnLine`). Esri rings → valid GeoJSON Polygon/MultiPolygon with hole association by ring winding. |
| 2 | EJ searched only one `MUNICIPALITY='TOWN'` clause; no pagination | `massgis.js` now runs a **bounded-radius envelope** EJ search (cross-municipal) with ArcGIS **pagination** (`exceededTransferLimit` + `resultOffset`). Scope is labeled in UI + brief. |
| 3 | Silent fallback to `landfills[0]` | `resolveFacility()` returns `verified` / `ambiguous` / `not_found`. Ambiguous → user chooses a point; never guessed. Proximity withheld until a trustworthy point exists. |
| 4 | Unsupported claims | "Shovel-ready stalled"→reported Permitted/Construction; "Ready for storage"→operating project requiring feasibility review; "Utility gatekeeper"→reported town utility (site service unverified); "Multilingual outreach required"→language-access planning recommendation. |
| 5 | Equity & Readiness Score (EJ term was a percentile of **record counts**) | Score removed from build output and primary UI. Table shows explicit evidence dimensions + explicit filters instead. |
| 6 | No provenance / stable IDs | Added `facility_id` (stable, snapshot-local, per-town sequence) and a `manifest` with input SHA-256, snapshot dates, counts, missing-value tallies, and source URLs. |

---

## Verification — preserved counts (automated)

`npm run test` → `tests/build-data.test.js` (rebuilds from untouched sources):

- 116 facility rows ✓
- 116 utility matches ✓
- 89 rows with town EJ context ✓
- every `facility_id` unique ✓
- both Norfolk rows distinct despite identical facility name "Norfolk LF"
  (`fac_norfolk_01`, `fac_norfolk_02`) ✓
- no `opportunity_score` field emitted ✓
- manifest input hashes equal real source file hashes ✓

Note: EJ **town** count is 78 by `town_key` (was reported as 79 when counting
`municipality`, which double-counted `NORFOLK #1` / `NORFOLK #2`). Rows with EJ
context remain 89.

## Verification — source files unchanged

Baseline and post-change SHA-256 are identical:

```
61328309c8fb0ab78243eb3a807e6bcb41bfe1115a0006cd503e87cb5559da73  climate/landfills/data.csv
7662e09dc7cd08cbb49a19dcd0d0a7dc9003fa2fb798c3abcebfea85998ff234  climate/utilities/data.csv
3616a34c7336da3bd7b4e7960e0dd8f9722f42305108bb7493ae113770daa557  climate/ej/data.csv
```

The build only reads the sources (hashes them for the manifest) and writes
`src/data/landfill_opportunities.json`.

---

## Verification — synthetic geometry tests (no network)

`tests/geo.test.js` — 15 tests, all passing. Fixtures are small lng/lat squares
(Esri winding: outer CW, hole CCW), NOT real MassGIS data.

| Case | Result |
|------|--------|
| Inside a solid polygon | `inside=true`, distance 0 ✓ |
| Point inside a **hole** | `inside=false`, small positive distance to hole edge ✓ |
| Nearest **edge midpoint** (not vertex) | edge distance `< nearest-vertex distance`; nearest point lands on the edge, not a corner ✓ |
| Point on boundary | distance 0 (Turf treats boundary as inside) ✓ |
| **MultiPolygon** nearest | nearest point on the correct sub-polygon ✓ |
| **Neighboring-town** nearest polygon | `nearestFeatureIndex` resolves to the closer NEIGHBOR feature, not the shared-name HOME feature ✓ |
| **Missing geometry** (empty / null features) | returns `null` ✓ |
| Missing point | returns `null` ✓ |
| Esri rings → Polygon-with-hole / MultiPolygon / degenerate→null | ✓ |
| **Ambiguous identity** (`resolveFacility`) | two "Norfolk LF" points → `ambiguous`, `primary=null` (no guess) ✓ |
| not_found (no name match / empty live set) | `not_found`, `primary=null` ✓ |

Full run: **24 synthetic tests passed**, 2 live tests skipped (opt-in).

---

## Verification — real-source checks (live, separate, opt-in)

`npm run test:live` (`RUN_LIVE=1`) hits the live MassGIS/ArcGIS endpoints.
Kept separate from fixture tests. Both passed. Observed live values:

```
BARNSTABLE   id=verified  livePts=2 ejPolys=11  pages=1 complete=true dist=2.861mi
NORFOLK      id=ambiguous livePts=2 ejPolys=7   pages=1 complete=true dist=withheld
HINGHAM      id=verified  livePts=1 ejPolys=66  pages=1 complete=true dist=0.872mi
DALTON       id=verified  livePts=2 ejPolys=27  pages=1 complete=true dist=0.172mi
SPRINGFIELD  id=verified  livePts=3 ejPolys=149 pages=1 complete=true dist=INSIDE
```

Observations:
- **Norfolk** returns two live points named "Norfolk LF" → identity `ambiguous`,
  distance **withheld** (no silent pick). Matches the design requirement.
- **Springfield** landfill point falls **inside** an EJ block group (distance 0),
  demonstrating hole/containment path on real data.
- **Barnstable** has 2 live points but their names disambiguate → verified; the
  cross-municipal radius search found 11 EJ polygons and the nearest boundary is
  2.86 mi away.

### Pagination proven on real data

- EJ layer `maxRecordCount = 2000`; statewide `EJ='Yes'` count = **2604**.
- A 120-mile radius envelope returned **2592 polygons across 2 pages**,
  `complete=true` — the `exceededTransferLimit` + `resultOffset` loop correctly
  fetched past the 2000-record page cap. Normal (≤5 mi) inspector queries return
  a single page. The loop has a safety cap of 10 pages; if hit, `complete=false`
  and the UI/brief label results as **partial**.

---

## Verification — build

`npm run build` → success, 1948 modules transformed, no errors/warnings.
Dev server serves all refactored modules with HTTP 200 (transform OK).

---

## Remaining limitations

1. **EJ search scope is a bounded radius (default 5 mi), not unbounded.** This is
   labeled explicitly in the map header and the copied brief. A landfill whose
   nearest EJ block group is farther than the radius will show "No EJ block group
   found within the search radius." Increase `ejRadiusMiles` to widen.
2. **Esri ring winding assumption.** Hole association assumes ArcGIS's standard
   convention (outer clockwise, holes counter-clockwise, each outer followed by
   its holes). If a layer emits nonstandard ordering, `geo.js` falls back to
   treating each ring as its own outer polygon (distance/containment still
   computed, but a hole could be mis-treated). Not observed on these layers.
3. **Facility identity relies on the FACILITY name string.** The source has no
   stable site key with geometry, so Norfolk's two identically named points are
   genuinely ambiguous from data alone — resolved by user choice, not a guess.
   A future fix could match on `OBJECTID` if the live layer exposes it.
4. **`facility_id` is snapshot-local.** It is stable across rebuilds of the same
   snapshot (deterministic town+sequence), but a new upstream snapshot that
   reorders rows could shift sequence numbers. The manifest records the input
   hash so a snapshot change is detectable.
5. **Live tests depend on external availability.** They are opt-in and will fail
   if the MassGIS/ArcGIS endpoints are unreachable or change their schema.
6. **Impact estimator figures are planning heuristics**, not engineering results
   (documented inline in the brief); unchanged by this pass.
