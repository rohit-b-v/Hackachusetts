# Design — Solar Second Look

## 1. Goal and approach

Add a "Second Look" capability to the existing Compare & Plan flow that lets a
planner re-examine up to three already-shortlisted capped-landfill solar sites:
read grid-capacity evidence, land/site constraints, unresolved questions, and
source dates; adjust proposed solar capacity and a clearly labeled hypothetical
grid-capacity assumption; see which deterministic screening results change and
why; and generate an evidence-linked due-diligence checklist via Gemma with a
labeled deterministic fallback.

The design keeps four concerns strictly separated, per the review constraints:

1. **Source adapters** — normalize reported data into provenance-tagged
   observations (pure, `src/lib/`).
2. **Deterministic screening** — compute screening results and the investigation
   priority from observations + assumptions (pure, `src/lib/`, no model, no
   network).
3. **UI** — render evidence, assumption controls, and results inside the
   existing `CompareView` (React).
4. **Gemma explanations** — validated, evidence-linked checklist prose through
   the existing `/api/plan` server path, never on the calculation path.

Nothing authoritative depends on the model. The model only produces
suggestion/checklist prose that references existing evidence IDs.

## 2. Reuse map (what we extend, not fork)

| Existing | Reused for Second Look |
| --- | --- |
| `src/App.jsx` shortlist (`facility_id[]`, cap 3) | Candidate set; no new discovery |
| `src/components/CompareView.jsx` (`print-root` modal) | Host of the Second Look section |
| `src/lib/evidencePacket.js` (`F_*`/`U_*` + hash) | Source of sourced-fact and unknown IDs |
| `src/lib/scenario.js` (source vs assumed capacity) | Proposed-capacity editing |
| `src/lib/compareBrief.js` (know/assume/unresolved/next) | Export + print fidelity |
| `src/lib/checklist.js` (per-facility localStorage) | Due-diligence checklist persistence |
| `src/lib/planClient.js` → `POST /api/plan` | Gemma request path |
| `server/planHandler.js` (Gemma + cache + fallback) | Checklist generation + validation |
| `src/lib/planSchema.js` (ID validation) | Evidence-linking enforcement |
| `src/lib/templatePlan.js` | Deterministic fallback checklist |
| dataset `manifest` (`meta.snapshot_dates`) | Source timestamps |

New files are additive and pure where possible; existing files get small,
backward-compatible extensions.

## 3. Architecture overview

```
reported data (climate/ snapshots, manifest, optional live spatial)
        │
        ▼
[source adapters]  src/lib/secondlook/sources.js
   → Observation[]  (provenance-tagged, see §4)
        │
        ├────────────► [evidencePacket.js]  (existing F_*/U_* for Gemma + export)
        ▼
[deterministic screening]  src/lib/secondlook/screening.js
   inputs: Observation[] + Assumptions
   → ScreeningResult[]  (potential_constraint | no_flag | unknown) + priority
        │
        ▼
[UI]  SecondLookPanel inside CompareView.jsx
   - evidence groups, provenance badges, source dates
   - proposed-capacity + hypothetical grid-capacity controls
   - per-result "what changed and why"
        │
        ▼
[Gemma explanations]  requestPlan → /api/plan → planHandler (Gemma|template)
   - checklist items must reference existing F_*/U_* IDs (validated)
        │
        ▼
[export]  compareBrief.js (know/assume/unresolved/next), copy == print
```

## 4. Data model

### 4.1 Observation (source adapter output)

Every value shown in Second Look is an `Observation` carrying full provenance so
the UI can classify it and the export can preserve it. Fields (all optional
except `key`, `provenance`):

```
Observation {
  key:                 string   // stable field name, e.g. "transmission_owner"
  label:               string   // human label
  value:               any|null // null when unknown
  provenance:          "sourced" | "assumption" | "unknown"
  // Provenance metadata (recorded when available; absent → omitted, not faked):
  source_url:          string   // dataset request URL (from climate README)
  source_record_id:    string   // upstream record id / facility_id / town_key
  units:               string   // e.g. "MW", "kV", "%"
  source_timestamp:    string   // snapshot/published date from manifest
  retrieval_timestamp: string   // when WE fetched/snapshotted it
  coverage:            string   // e.g. "statewide", "town-level", "bbox MA"
  association_confidence: "verified" | "unverified" | "n/a"
  evidence_id:         string   // linked F_*/U_* when one exists
  note:                string   // honesty caveats
}
```

Rules:
- `provenance: "unknown"` ⇒ `value: null`. Missing metadata fields are omitted,
  never invented.
- `association_confidence: "unverified"` is the default for any site-to-grid or
  site-to-feeder link derived from town/area data (satisfies R6).
- Observations never upgrade a candidate when data is absent (R2.3, R11.4).

### 4.2 Assumptions (planner inputs, per facility)

```
Assumptions {
  proposedMw:        number   // editable proposed solar capacity (reuses scenario.js)
  gridCapacityMw:    number|null // HYPOTHETICAL grid-capacity assumption (labeled)
  gridCapacityBasis: "hypothetical"  // constant; never "sourced"
}
```

`gridCapacityMw` is always a hypothetical demonstration value. It is stored and
rendered as an assumption, never as an Observation with `provenance: "sourced"`
(R3.2, R5.3, R7). **Observed** hosting-capacity context (if any reported value
exists) is a separate `Observation` and is never silently merged into
`gridCapacityMw` (review constraint: keep observed capacity separate from
hypothetical overrides).

Per-facility assumptions live in `CompareView` state keyed by `facility_id` so
they never leak between candidates, including the two Norfolk records (R1.4).

### 4.3 ScreeningResult (deterministic screening output)

```
ScreeningResult {
  id:        string                // e.g. "grid_capacity_headroom"
  label:     string
  verdict:   "potential_constraint" | "no_flag" | "unknown"
  reason:    string                // reproducible from visible inputs only
  inputs:    { [name]: {value, provenance, units} }  // what drove the verdict
  changed:   boolean               // changed vs the no-assumption baseline
  priority:  number                // 0..N investigation priority (see §6)
  evidence_ids: string[]           // F_*/U_* this check touches
}
```

Three-state verdict exactly matches the review constraint: **potential
constraint / no flag from available evidence / unknown**. There is no "pass"
that can be produced by missing data (R2.3, correctness property 3).

## 5. Source adapters — `src/lib/secondlook/sources.js`

Pure functions that turn a `record` (+ optional spatial + `manifest`) into
`Observation[]`, grouped for the four evidence panels.

- `gridCapacityObservations(record, spatial, manifest)` →
  - transmission context (owner, voltage_kv, volt_class) from the
    `transmission` dataset where town/area context exists — tagged
    `coverage: "bbox MA / area"`, `association_confidence: "unverified"`,
    `note: "area context; relationship to THIS site is not verified"` (R6.3).
  - town distribution utility (`F_UTILITY`) — `association_confidence:
    "unverified"` for site service (R6.1).
  - observed hosting-capacity value: **none present in `climate/`**, so emitted
    as `provenance: "unknown"` linked to `U_INTERCONNECTION` (never fabricated).
  - a `queued_generation_accounted` observation: whether any published capacity
    figure already nets out queued/interconnection-queue generation. Since no
    such dataset is available, this is `provenance: "unknown"` and screening MUST
    treat capacity as not-queue-adjusted until verified (review constraint:
    verify whether published capacity already accounts for queued generation
    before applying any adjustment).
- `landConstraintObservations(record, manifest)` → site/land constraints. The
  `landfills` dataset has no address/parcel/acreage, so most land facts are
  `provenance: "unknown"` (R11.4: missing land info ⇒ unknown, not "no
  constraints").
- `unresolvedObservations(packet)` → surfaces packet `U_*` unknowns
  (interconnection, site service, feasibility, eligibility, proximity).
- `sourceDates(manifest)` → `meta.snapshot_dates` per dataset for R2.4.

Provenance metadata is sourced from the `climate/*/README.md` request URLs and
save dates and the dataset `manifest` (hashes, snapshot dates, counts). The
adapter records `source_url`, `source_record_id` (`facility_id`/`town_key`),
`units`, `source_timestamp`, `retrieval_timestamp`, `coverage`, and
`association_confidence` when available; unavailable fields are omitted.

**New-source discipline (R11):** no new external source is added in this design.
If one is later proposed, it must pass the §11 checklist (access, schema, units,
coverage, timestamps, license) before an adapter is written for it.

## 6. Deterministic screening — `src/lib/secondlook/screening.js`

Pure, DOM-free, network-free, model-free. `runScreening(observations,
assumptions)` returns `{ results: ScreeningResult[], priorityOrder: string[] }`.

### 6.1 Checks (MVP set)

1. **`grid_capacity_headroom`** — compares `assumptions.proposedMw` against
   `assumptions.gridCapacityMw` (hypothetical).
   - If either `proposedMw` or `gridCapacityMw` is missing/null →
     `verdict: "unknown"` with reason "no capacity assumption entered"
     (property 3).
   - Else if `proposedMw > gridCapacityMw` → `potential_constraint`,
     reason: `assumed ${proposedMw} MW exceeds the hypothetical ${gridCapacityMw}
     MW grid-capacity assumption` (R3.3).
   - Else → `no_flag`, reason names both numbers and states it is a screen
     against a hypothetical value, not interconnection approval (R7.2).
   - Always carries `evidence_ids: ["U_INTERCONNECTION"]` and a note that only a
     utility study confirms capacity (R7).
2. **`feeder_association`** — if the serving feeder / site-to-line association is
   `unverified` or absent → `verdict: "unknown"` (never a flag, never a pass)
   with reason "serving feeder not verified; not inferred from nearest line or
   town utility" (R6, property 3). Linked to `U_SITE_SERVICE`.
3. **`queued_generation`** — if `queued_generation_accounted` is unknown →
   `verdict: "unknown"`, reason "published capacity may not net queued
   generation; verify before adjusting" (review constraint). Screening never
   applies a queue adjustment while this is unknown.
4. **`land_constraints`** — if land/site data absent → `verdict: "unknown"`
   (R11.4), never `no_flag`.
5. **`technology_match`** — reuse `isSolarRecord`: non-solar record →
   `no_flag`/`unknown` and solar scenario not applied (R-EX / scenario gating).

### 6.2 Monotonicity (enforced by construction + tests)

`grid_capacity_headroom` is defined so the only way to move from
`potential_constraint` toward `no_flag` is to **decrease** `proposedMw` or
**increase** `gridCapacityMw`. Therefore:
- Increasing `proposedMw` (others fixed) can only hold or worsen the verdict
  (never improve it) — **property 1**.
- Decreasing `gridCapacityMw` (others fixed) can only hold or worsen the verdict
  — **property 2**.

We encode a verdict ordering `no_flag (0) < unknown (1) < potential_constraint
(2)` for a "suitability" axis where lower = more suitable, and assert the
screening function is monotonic in the two inputs. Unknowns never rank as more
suitable than `no_flag` so missing evidence cannot improve standing (R3-note,
property 3). Note: for honesty, `unknown` is treated as *not better than*
`no_flag` in priority (§6.3), so absent data never improves the candidate.

### 6.3 Investigation priority — explicit rules

`priority` is computed by explicit, inspectable rules (no model, R3.4):

```
base = { potential_constraint: 100, unknown: 60, no_flag: 0 }[verdict]
weight by check importance: grid_capacity 1.0, feeder 0.9, queued 0.8,
                            land 0.7, technology 0.3
priority = base * weight
```

- A `potential_constraint` on grid capacity outranks any `unknown`.
- Among equal verdicts, higher-weight checks sort first.
- Ties broken by stable check id.

This makes "what to investigate next" explainable from the visible verdicts and
weights alone, and guarantees a candidate with more unknowns is never ranked as
more suitable than one with resolved `no_flag`s (property 3, R3-note).

### 6.4 Baseline + reset

`runScreening` is always called twice by the UI: once with a **baseline**
(assumptions cleared: `proposedMw` from reported source capacity, `gridCapacityMw
= null`) and once with the planner's current assumptions. `changed` per result =
verdict differs from baseline. "Reset" restores assumptions to the baseline, so
results return to baseline exactly — **property 4** (pure function of inputs ⇒
identical output for identical inputs).

## 7. UI — `SecondLookPanel` inside `CompareView.jsx`

A new section rendered within the existing Compare modal (no new route, R1.1),
one block per shortlisted facility. Component files under
`src/components/secondlook/`:

- `SecondLookPanel.jsx` — orchestrates per-facility state `{ proposedMw,
  gridCapacityMw }` keyed by `facility_id` (R1.4), builds observations + runs
  screening (baseline + current), renders the four evidence groups, the
  assumption controls, and the results list.
- `ProvenanceBadge.jsx` — renders the three provenance classes with distinct
  styling (R5.1): sourced (solid/neutral), assumption (amber "hypothetical"),
  unknown (italic/muted "unknown"). Shows source date + `association_confidence`
  on sourced items (R2.4).
- `ScreeningResultRow.jsx` — shows verdict chip (potential constraint / no flag /
  unknown), the reason string, and a "changed" marker when `changed` is true.

Assumption controls:
- Proposed capacity: reuse the existing `scenario.js` slider/number control.
- Hypothetical grid capacity: a separate numeric input with a persistent
  "Hypothetical demonstration value — not sourced, not an approval" label
  (R3.2, R7, R12.2) and a Reset button (property 4).

Honesty banners reuse the existing Compare honesty note; grid-capacity evidence
carries the "not hosting capacity / not interconnection approval" caveat (R2.5,
R7).

## 8. Gemma explanations — checklist via `/api/plan`

Reuse the existing path end-to-end; the model produces only the due-diligence
checklist prose:

- The UI calls `requestPlan({ record, spatial, manifest })` (existing
  `planClient.js`). The server rebuilds the canonical packet and calls Gemma
  (`planHandler.js`), returning validated structured output.
- Evidence linking is enforced by the existing `validatePlan` (R8.2): any item
  referencing a non-existent `F_*`/`U_*` ID fails validation and the handler
  falls back to the template (`reason: "validation_failed"`).
- Source labels reused verbatim: `"Live Gemma"` / `"Cached (Gemma)"` /
  `"Template-generated"` (R8.3, R9).
- Checklist items seed the existing per-facility `checklist.js` store
  (`seedFromPlan`, no overwrite of user edits).
- **Second Look adds no new model call on the screening path.** If we want the
  checklist prompt to mention the grid-capacity screen, we pass the *existing*
  packet unchanged and let the deterministic screening remain authoritative;
  the model text can reference `U_INTERCONNECTION`/`U_SITE_SERVICE` but cannot
  change any verdict (R4.3). No new provider/endpoint is introduced — the Gemma
  config (`generateContent`, `GEMMA_API_KEY`/`GEMMA_MODEL`, default
  `gemma-3-27b-it`) is already specified, so no clarification is needed.

### Fallback (R9, property 5)

Model failure modes and responses are unchanged and already implemented:
- no key → template (`no_credentials`)
- network/HTTP error → template (`api_error`)
- invalid/dangling-ID output → template (`validation_failed`)
- client offline → local template (`client_offline`, `planClient.js`)

In every case the evidence display, assumption editing, deterministic screening,
and export keep working — **property 5**.

## 9. Export + print (reuse)

Extend `compareBrief.js` so Second Look contributes to the four-question brief:
- **know** — sourced observations (with source dates).
- **assume** — proposed capacity + the labeled hypothetical grid-capacity
  assumption (always marked hypothetical, R12.2).
- **unresolved** — `unknown` verdicts + packet unknowns.
- **next** — checklist (Gemma/template) + highest-priority investigation items.

Copy and print derive from the same structure (`renderBriefText`), so they agree
(R12.1), and the Second Look section lives on a `print-root`/`print-block`
surface so it is not clipped.

## 10. Correctness properties → mechanisms → tests

| Property | Mechanism | Test |
| --- | --- | --- |
| 1. ↑ proposed generation cannot improve grid screening | `grid_capacity_headroom` monotonic in `proposedMw` (§6.2) | unit: sweep `proposedMw` up, assert verdict ordering never improves |
| 2. ↓ assumed available capacity cannot improve it | monotonic in `gridCapacityMw` (§6.2) | unit: sweep `gridCapacityMw` down, assert never improves |
| 3. missing capacity / unverified feeder ⇒ unknown, not pass | null inputs & `unverified` association ⇒ `unknown`; `unknown` not ranked above `no_flag` (§6.1–6.3) | unit: null capacity ⇒ `unknown`; unverified feeder ⇒ `unknown`; never `no_flag` |
| 4. resetting assumptions restores results | pure `runScreening`; reset = baseline inputs (§6.4) | unit: result(reset) deep-equals baseline |
| 5. model failure doesn't block compare/checklist | deterministic screening + template fallback (§8) | unit: injected api_error ⇒ template; screening runs with model stubbed to throw |

## 11. New-source verification checklist (gate for R11)

Any additional source must document, before an adapter is written:
access method, schema (fields), units, coverage, source timestamp + retrieval
timestamp, and usage/license terms. Unverifiable → not added. For this design,
no new source is introduced; `transmission`/`utilities`/`landfills`/`ej`
snapshots are used as-is, and absent facts stay `unknown`.

## 12. Provider correction (Gemma, not Claude) — R10

Code is already on Gemma. Design-level actions:
- Live-facing docs (`README.md` link, `evidence/03-workflow.md`) corrected to
  Gemma; historical evidence (`evidence/02-claude.md`) gets a dated migration
  note rather than a dishonest rewrite (keeps the honesty principle).
- No secret in docs/UI/logs/bundle; confirm `dist/` has no `claude`/`anthropic`/
  `sk-ant`/`api.anthropic.com` and no key (existing bundle-scan test extended).
- **Security:** `.env.example` must hold only a sanitized placeholder. The
  current file contains a real-looking `GEMMA_API_KEY=AIza...`; a task will
  replace it with a placeholder and the real key (if genuine) should be revoked.
  This is called out as a task, not performed in this design doc.

## 13. File plan

New (additive, pure where noted):
- `src/lib/secondlook/sources.js` — source adapters (pure).
- `src/lib/secondlook/screening.js` — deterministic screening + priority (pure).
- `src/components/secondlook/SecondLookPanel.jsx`
- `src/components/secondlook/ProvenanceBadge.jsx`
- `src/components/secondlook/ScreeningResultRow.jsx`
- `tests/secondlook-screening.test.js` — correctness properties 1–5.
- `tests/secondlook-sources.test.js` — provenance/unknown handling.

Extended (small, backward-compatible):
- `src/components/CompareView.jsx` — mount `SecondLookPanel` per facility.
- `src/lib/compareBrief.js` — include Second Look in know/assume/unresolved/next.
- docs: `README.md`, `evidence/03-workflow.md`, `.env.example` (security).

Unchanged (reused as-is):
- `server/planHandler.js`, `src/lib/planClient.js`, `src/lib/planSchema.js`,
  `src/lib/templatePlan.js`, `src/lib/evidencePacket.js`, `src/lib/checklist.js`,
  `src/lib/scenario.js`.

## 14. Build order (end-to-end first, polish last)

1. Source adapters + screening (pure libs) with correctness tests.
2. Minimal `SecondLookPanel` wired into `CompareView` (evidence + controls +
   results), end-to-end comparison working.
3. Export/print integration.
4. Gemma checklist wiring (already exists — verify, don't rebuild) + fallback
   tests.
5. Provider-doc correction + `.env.example` security fix.
6. Optional visual polish (badges, layout) — only after 1–5 pass.
