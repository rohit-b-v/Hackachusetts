# Tasks — Solar Second Look

Status legend: [ ] not started · [~] in progress · [x] done

Build order prioritizes an end-to-end working comparison (tasks 1–6) before any
optional visual polish (task 9). Each task lists requirement IDs, dependencies,
expected behavior, verification (commands / browser actions), and the completion
evidence to record when marking it done.

---

## [x] 1. Source adapters — `src/lib/secondlook/sources.js`

- **Requirements:** R2.1–R2.5, R5.1–R5.2, R6.1–R6.3, R7.1, R11.1–R11.4
- **Depends on:** none (pure lib). Reuses `evidencePacket.js`, dataset `manifest`,
  `climate/*/README.md` URLs + save dates.
- **Expected behavior:**
  - Export `gridCapacityObservations`, `landConstraintObservations`,
    `unresolvedObservations`, `sourceDates`, returning `Observation[]` per §4.1.
  - Each Observation carries `provenance` (`sourced`|`assumption`|`unknown`),
    and, when available, `source_url`, `source_record_id`, `units`,
    `source_timestamp`, `retrieval_timestamp`, `coverage`,
    `association_confidence`, `evidence_id`, `note`.
  - Absent grid/land values ⇒ `provenance: "unknown"`, `value: null` (never
    fabricated, never "no constraints").
  - Any site-to-grid / site-to-feeder link ⇒ `association_confidence:
    "unverified"` by default.
  - Observed hosting capacity: emitted as `unknown` (none in `climate/`), linked
    to `U_INTERCONNECTION`; kept separate from any hypothetical override.
- **Verification:** `npm test -- secondlook-sources` (new unit test asserts
  provenance tagging, unknown handling for missing land/grid, unverified feeder
  default, source dates pulled from `meta.snapshot_dates`).
- **Completion evidence (2026-10-24):**
  - New files: `src/lib/secondlook/sources.js`, `tests/secondlook-sources.test.js`.
  - `npx vitest run tests/secondlook-sources.test.js` → 11/11 passing.
  - Full suite `npm test` → 61 passed, 2 skipped (opt-in live MassGIS); no
    regressions. `npm run build` → clean.
  - Sample Observation (grid group, `fac_acton_01`): town utility is
    `provenance:"sourced"`, `value:"NSTAR Electric d/b/a Eversource Energy"`,
    `association_confidence:"unverified"`, `evidence_id:"F_UTILITY"`,
    `source_timestamp:"2026-10-18"` (from manifest), `retrieval_timestamp` =
    manifest `generated_at`. `serving_feeder`, `observed_hosting_capacity`, and
    `queued_generation_accounted` are all `provenance:"unknown"`, `value:null`.
  - One fix during implementation: a JSDoc line containing `F_*/U_*` closed the
    block comment early (Vite import-analysis error); rewritten as `F_ or U_`.

## [x] 2. Deterministic screening — `src/lib/secondlook/screening.js`

- **Requirements:** R3.3–R3.5, R4.1–R4.3, R6.2, R7.2; correctness properties 1–4
- **Depends on:** task 1 (consumes `Observation[]`). Reuses `scenario.js`
  (`isSolarRecord`, `sourceCapacity`).
- **Expected behavior:**
  - `runScreening(observations, assumptions)` → `{ results: ScreeningResult[],
    priorityOrder }` per §4.3/§6.
  - Checks: `grid_capacity_headroom`, `feeder_association`, `queued_generation`,
    `land_constraints`, `technology_match`.
  - Verdicts limited to `potential_constraint | no_flag | unknown`; no "pass"
    from missing data.
  - `reason` reproducible from visible inputs only (no model).
  - Monotonic: ↑`proposedMw` or ↓`gridCapacityMw` never improves
    `grid_capacity_headroom`.
  - Priority from explicit base×weight rules (§6.3); `unknown` never ranks more
    suitable than `no_flag`.
  - Pure ⇒ identical inputs give identical outputs (reset = baseline).
- **Verification:** `npm test -- secondlook-screening` covering correctness
  properties 1–4 (monotonic sweeps; null capacity ⇒ unknown; unverified feeder ⇒
  unknown; reset deep-equals baseline).
- **Completion evidence (2026-10-24):**
  - New files: `src/lib/secondlook/screening.js`, `tests/secondlook-screening.test.js`.
  - `npx vitest run tests/secondlook-screening.test.js` → 12/12 passing.
  - Property mapping:
    - Property 1 → "rank is monotonically non-decreasing as proposedMw rises".
    - Property 2 → "rank is monotonically non-decreasing as gridCapacityMw falls".
    - Property 3 → "null capacity yields unknown", "unverified feeder yields
      unknown, linked to U_SITE_SERVICE", "unknown never ranked more suitable
      than no_flag".
    - Property 4 → "identical inputs produce deeply-equal results" + "changing
      then resetting assumptions returns the baseline verdicts".
    - Also: three-state verdicts (no pass), explicit-rule priority, reason
      strings reproducible from inputs, non-solar technology gating.
  - Full suite `npm test` → 73 passed, 2 skipped (opt-in live MassGIS); no
    regressions. `npm run build` → clean.
  - Deviation from design wording: the `technology_match` check reads the
    `reported_technology` Observation rather than importing `scenario.js`
    `isSolarRecord`, keeping `runScreening(observations, assumptions)` purely
    observation-driven (matches the design signature). Behavior (solar gating)
    is identical; noted here rather than editing the spec.

## [x] 3. Wire `SecondLookPanel` into `CompareView` (end-to-end core)

- **Requirements:** R1.1–R1.4, R2.1–R2.5, R3.1–R3.5, R5.1–R5.4, R7
- **Depends on:** tasks 1, 2. Reuses `CompareView.jsx`, `scenario.js` controls,
  per-`facility_id` state pattern.
- **Expected behavior:**
  - New `src/components/secondlook/SecondLookPanel.jsx` rendered inside the
    existing Compare modal (no new route), one block per shortlisted facility.
  - Per-facility assumptions `{ proposedMw, gridCapacityMw }` keyed by
    `facility_id` (no leak across facilities / Norfolk pair).
  - Renders four evidence groups, provenance badges, source dates; proposed-
    capacity control (reuse scenario) + labeled hypothetical grid-capacity input
    + Reset; per-result verdict + reason + "changed" marker (baseline vs current).
- **Verification:** `npm run build`; `node tests/browser-journey.mjs` extended to
  open Compare, assert Second Look section present, change both inputs, observe
  verdict/reason change, Reset restores baseline. Record a screenshot to
  `evidence/shots/`.
- **Completion evidence (2026-10-24):**
  - New files: `src/components/secondlook/SecondLookPanel.jsx`,
    `ProvenanceBadge.jsx`, `ScreeningResultRow.jsx`. Edited `CompareView.jsx`
    (import + `manifest` prop threaded to `FacilityCard` + panel mounted between
    the scenario block and the plan block).
  - `npm run build` → clean (1962 modules).
  - `BASE_URL=http://localhost:5174 node tests/browser-journey.mjs` →
    `ALL BROWSER CHECKS PASSED` (all prior checks + 8 new Second Look checks).
    New passing checks: section renders; grid-capacity group present; feeder
    shown "site-unverified"; controls labeled hypothetical; over-sized proposal
    flags "potential constraint"; reason says "not interconnection approval";
    "changed" marker appears; Reset clears the hypothetical input.
  - Expected-vs-observed (one verdict change): with proposed=9 MW and
    hypothetical grid capacity=5 MW, expected `grid_capacity_headroom` →
    `potential_constraint` with a reason naming both values; observed exactly
    that, plus a "changed" marker; Reset returned the grid input to blank
    (baseline → `unknown`).
  - Screenshots refreshed: `evidence/shots/compare-screen.png`,
    `compare-print.png` (now include the Second Look section).
  - Full unit suite `npm test` → 73 passed, 2 skipped; no regressions.
  - Env note: dev server port 5173 was already in use by another process, so
    Vite served on 5174; the journey was run against 5174.
  - Per-facility isolation relies on one `SecondLookPanel` instance per
    `facility_id` (local state per card); the journey's existing "note did not
    leak" check across the two Norfolk records exercises the same scoping.

## [x] 4. Export + print integration — extend `compareBrief.js`

- **Requirements:** R5.4, R12.1–R12.2
- **Depends on:** task 3.
- **Expected behavior:** Second Look contributes to know (sourced + dates) /
  assume (proposed + labeled hypothetical) / unresolved (unknown verdicts + U_*)
  / next (checklist + top-priority items); copy == print; hypothetical values
  labeled in both; section on `print-root`/`print-block`.
- **Verification:** unit test that copied text and the print structure derive
  from one source and both label hypothetical values; browser print-preview
  screenshot.
- **Completion evidence (2026-10-24):**
  - New: `buildSecondLookContribution` in `src/lib/compareBrief.js`;
    `buildFacilityBrief` extended with optional `manifest` + `secondLook`;
    `renderBriefText` NEXT renderer handles the `screening` kind.
  - CompareView: Second Look assumptions lifted to `CompareView` keyed by
    `facility_id` (`slByFacility`), passed to `SecondLookPanel` (now controlled),
    the on-screen `FourQuestions`, and the combined `ExportBar` — so the panel,
    the printed DOM, and the copied text all derive from one assumption source.
  - New test `tests/secondlook-brief.test.js` → 6/6 passing (hypothetical
    labeling; over-sized proposal → NEXT; unknown screens → UNRESOLVED; sourced
    KNOW rows carry source date; copy==print both show "HYPOTHETICAL").
  - Browser journey → ALL CHECKS PASSED, incl. 3 new export checks: copied brief
    contains "HYPOTHETICAL", a "second-look" NEXT item, and the "potential
    constraint" flag (read from the real clipboard after Copy). Print + screen
    screenshots refreshed in `evidence/shots/`.
  - Copied-brief excerpt (proposed 9 MW, hypothetical grid 5 MW):
    "Second Look · grid-capacity assumption: 5 MW — HYPOTHETICAL demonstration
    value, not sourced and not an interconnection approval" and
    "(second-look) Investigate: Grid-capacity headroom (hypothetical screen)
    (potential constraint) — Assumed 9 MW proposed exceeds the hypothetical 5 MW
    …".
  - Spec-touch: one pre-existing test (`scenario.test.js` 4-question structure)
    asserted `next.length === 1`; since Second Look now also contributes NEXT
    items by design, the assertion was narrowed to
    `next.filter(kind==="plan").length === 1`, preserving its original intent.
    No requirement/design change needed — this is the intended Task-4 behavior.
  - Full unit suite → 79 passed, 2 skipped; `npm run build` clean.

## [x] 5. Gemma checklist wiring — verify reuse + fallback

- **Requirements:** R8.1–R8.5, R9.1–R9.4; correctness property 5
- **Depends on:** task 3. Reuses `planClient.js`, `planHandler.js`,
  `planSchema.js`, `templatePlan.js`, `checklist.js` (verify, do not rebuild).
- **Expected behavior:** checklist generated through `/api/plan`; items
  reference existing `F_*`/`U_*` IDs (validated); labels `Live Gemma` /
  `Cached (Gemma)` / `Template-generated`; authoritative numbers from packet;
  fallback on no-key / api_error / validation_failed keeps Second Look usable.
- **Verification:** `npm test` (existing handler tests + a new test that
  screening + checklist still render when the model throws); confirm labels in
  browser journey (template mode, since no live key).
- **Completion evidence (2026-10-24):**
  - Reuse verified (not rebuilt): existing `tests/planner.test.js` already covers
    R8/R9 — live Gemma → `label:"Gemma"`; cache hit → `source:"cache"`; no creds
    → `template`/`no_credentials`; API error → `template`/`api_error`; bad ID →
    `template`/`validation_failed` (invalid plan never shown); key never leaked.
  - New `tests/secondlook-fallback.test.js` → 3/3: `requestPlan` returns a
    usable labeled template on network failure (`client_offline`); Second Look
    screening is byte-identical with the planner failing (property 5); the brief
    Second Look slices are unchanged whether the plan is a fallback or absent.
  - New handler test "preserves the cached plan's label on a cache hit" → a
    cached TEMPLATE stays labeled template, never Gemma.
  - Full suite `npm test` → 83 passed, 2 skipped. `npm run build` clean.
  - Observed source label in this environment: **"Cached (template)"** (after
    fix). Verified no live key: fresh `POST /api/plan` probe returned
    `source=template, reason=no_credentials`; no `.env` present; `loadEnv`
    reads no key. So **live Gemma round-trip is UNVERIFIED here** (no key);
    only the template/cache/fallback paths are exercised end-to-end.
  - **Defect found + fixed (honesty / R8.3):** the UI mapped any `source ===
    "cache"` to "Cached (Gemma)", so a cached *template* plan was mislabeled as
    Gemma (implying the model ran when it did not). Fixed in `CompareView.jsx`
    and `NextActionPlanner.jsx` to label a cache hit by the cached plan's own
    label ("Cached (Gemma)" iff label==="Gemma", else "Cached (template)").
    Added a handler unit test and a browser-journey assertion ("no-key
    environment shows a template label, not Gemma"). Recorded in
    requirements.md audit; no requirement text change needed.

## [x] 6. Provider-doc correction + `.env.example` security fix

- **Requirements:** R10.1–R10.4
- **Depends on:** none (independent; can run in parallel).
- **Expected behavior:** live-facing docs (`README.md` link,
  `evidence/03-workflow.md`) corrected to Gemma; `evidence/02-claude.md` gets a
  dated migration note (no dishonest rewrite); `.env.example` holds a sanitized
  placeholder only; bundle scan confirms no Claude/Anthropic/secret in `dist/`.
- **Verification:** repo grep for `claude|anthropic|sk-ant|api.anthropic.com`
  shows no provider-claiming references in steering/server/src/config/tests;
  `npm run build` then grep `dist/` for the same + the key prefix (none).
- **Completion evidence (2026-10-24):**
  - **Suspected credential found and replaced.** `.env.example` contained a
    `GEMMA_API_KEY` value matching the Google key prefix (`AIza…`). Replaced with
    the unmistakable placeholder `REPLACE_WITH_YOUR_GOOGLE_AI_STUDIO_KEY`. The
    value itself is NOT reproduced here or anywhere in output/evidence. If that
    value was ever a real key, the user should revoke it at
    https://aistudio.google.com/apikey. Affected file: `.env.example`.
  - Docs corrected to Gemma: `README.md` (provenance + Features + live-Gemma
    section with a model-ID caveat), `evidence/03-workflow.md` (dated correction
    + "Template/Claude"→"Gemma/Cached/Template", "Live Claude"→"Live Gemma").
  - Historical evidence preserved: `evidence/02-claude.md` gets a dated
    MIGRATION NOTE banner; its body is unchanged (describes the old Claude impl).
  - Runtime grep (`src`, `server`, `.kiro/steering`, config, `tests`) for
    `claude|anthropic|sk-ant|api.anthropic.com` → **No matches**. Remaining
    matches are only in historical/spec docs.
  - `npm run build` clean; `dist/` grep for the same terms + `AIza` →
    **CLEAN** (none).
  - Provider/model verified against the current official doc
    (https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api, fetched
    2026-10-24): endpoint/auth/request/response match the code. **Model-ID
    discrepancy (unresolved):** the doc lists `gemma-4-31b-it` /
    `gemma-4-26b-a4b-it` and does NOT list the default `gemma-3-27b-it`; left the
    default unchanged (no live call to confirm a replacement), documented the
    caveat in `.env.example` and README, flagged as unverified.

## [x] 7. Full verification pass

## [ ] 7. Full verification pass

- **Requirements:** all; ACs 1–12
- **Depends on:** tasks 1–6.
- **Expected behavior:** `npm test` green; `npm run build` clean; browser journey
  passes; evidence written.
- **Verification:** run all above; write `evidence/05-second-look.md` with
  expected-vs-observed per AC and explicit live/cached/hypothetical/unavailable
  data labeling.
- **Completion evidence (2026-10-24):**
  - `npm test` → **83 passed, 2 skipped** (2 skipped = opt-in live MassGIS).
  - `npm run build` → clean; `dist/` scan clean (no provider/secret leakage).
  - Browser journey vs an **isolated no-credentials server**
    (`env -u GEMMA_API_KEY -u GEMMA_MODEL PORT=8790 node server/index.mjs`,
    boot log "GEMMA_API_KEY: MISSING (template fallback)") →
    **ALL BROWSER CHECKS PASSED**. This no longer assumes the dev environment
    lacks a key — it forces a no-creds config.
  - Confirmed in-browser: Second Look controls, Reset (baseline restore),
    per-site isolation (note did not leak across the Norfolk pair), copy/print
    reflect the same assumptions, and the cached template reads
    "Cached (template)".
  - Live Gemma left **explicitly unverified** (no key available); documented.
  - Evidence written: `evidence/05-second-look.md`.

## [x] 8. Spec/docs sync

- **Requirements:** R-process
- **Depends on:** task 7.
- **Expected behavior:** README "Features" mentions Second Look; steering
  structure note updated if files were added; any spec deviations recorded.
- **Completion evidence (2026-10-24):** changed docs —
  - `README.md`: Second Look added to Features; provenance section distinguishes
    reported / hypothetical / unknown and states the grid screen is not a live
    hosting-capacity integration; live-Gemma model-ID caveat.
  - `.kiro/steering/structure.md`: added `src/lib/secondlook/*` and
    `src/components/secondlook/*` to the tree.
  - `.kiro/steering/product.md`: added a Second Look honesty rule (three value
    classes; feeder never inferred; three-state verdicts; hypothetical ≠ live
    integration).
  - `.kiro/specs/solar-second-look/requirements.md`: cache-label defect note.
  - Deviations recorded in tasks 2 and 4 completion evidence.

## [ ] 9. Optional visual polish (last)

- **Requirements:** R5.1 (clarity) — non-blocking
- **Depends on:** tasks 1–7 passing.
- **Expected behavior:** badge/layout refinement only; no logic change.
- **Verification:** build + browser screenshot; no test regressions.
- **Completion evidence:** before/after screenshot paths.
