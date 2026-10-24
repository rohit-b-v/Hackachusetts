# Requirements — Solar Second Look

## Overview

Help a Massachusetts municipal planner take a disciplined "second look" at an
existing shortlist of candidate capped-landfill solar sites. For up to three
already-shortlisted facilities, the feature surfaces grid-capacity evidence,
land/site constraints, unresolved questions, and source dates; lets the planner
test a changed solar capacity and a clearly labeled *hypothetical* grid-capacity
assumption and see which screening results change and why; and generates an
evidence-linked due-diligence checklist via Gemma with a deterministic fallback.

The guiding principle is honesty-first, inherited verbatim from
`.kiro/steering/product.md`: reported ≠ verified, missing evidence stays unknown
and never improves a site, hosting capacity is never interconnection approval,
and AI output is labeled and separate from source facts. This feature extends
the completed Compare & Plan workflow (`.kiro/specs/compare-and-plan`); it does
not replace it.

## Stack and reuse (non-negotiable)

- Reuse the existing React 18 + Vite 5 + Tailwind v4 stack. No new frontend
  framework.
- Extend the existing comparison flow (`src/components/CompareView.jsx`,
  shortlist state in `src/App.jsx`), the evidence packet
  (`src/lib/evidencePacket.js`), the scenario math (`src/lib/scenario.js`), the
  decision brief (`src/lib/compareBrief.js`), and the planning endpoint
  (`POST /api/plan` via `server/planHandler.js`). Do not fork parallel copies.
- All authoritative numbers and all screening decisions remain deterministic in
  `src/lib/*`. The model may only generate prose/checklist suggestions that
  reference existing evidence IDs; it never computes or overrides a screening
  result.

## Glossary

- **Candidate / site / facility** — a row of `landfill_opportunities.json`,
  identified by stable `facility_id`.
- **Grid-capacity evidence** — any reported fact bearing on whether the grid can
  accept the project (e.g. transmission owner/voltage context). It is *context*,
  never a hosting-capacity value or an interconnection decision.
- **Hypothetical grid-capacity assumption** — a planner-entered, clearly labeled
  demonstration number representing assumed available capacity. It is never a
  utility-published hosting-capacity figure and never an approval.
- **Screening result** — a deterministic, explainable pass/flag/unknown outcome
  computed in `src/lib/*` from reported facts plus the planner's assumptions.
- **Sourced observation** — a value drawn from a dataset snapshot (reported).
- **User assumption** — a value the planner typed/toggled (hypothetical).
- **Unknown** — information not present in any available source; it is displayed
  as unknown and never inferred.

## Requirements (EARS)

### R1 — Second Look section inside the existing comparison flow
1.1 WHEN the planner opens Compare for a shortlist of one to three facilities
    THE SYSTEM SHALL render a "Second Look" section within the existing
    `CompareView`, not as a separate screen or route.
1.2 THE SYSTEM SHALL operate only on the facilities already in the shortlist and
    SHALL NOT add, discover, or fetch any facility outside the existing
    shortlist (see R-EX exclusions).
1.3 WHEN the shortlist contains more than three facilities THE SYSTEM SHALL
    continue to honor the existing cap of three and SHALL NOT render Second Look
    for a fourth.
1.4 WHEN the shortlist changes (add/remove within the cap) THE SYSTEM SHALL keep
    Second Look state keyed by `facility_id`, so per-site assumptions do not leak
    between facilities (including the two Norfolk records).

### R2 — Evidence display per candidate
2.1 FOR EACH shortlisted candidate THE SYSTEM SHALL display four evidence
    groups: (a) grid-capacity evidence, (b) land/site constraints, (c)
    unresolved questions, and (d) source dates.
2.2 THE SYSTEM SHALL render every displayed value with its provenance class —
    sourced observation, user assumption, or unknown — per R5.
2.3 WHEN a grid-capacity, land, or constraint value is absent from all available
    sources THE SYSTEM SHALL display it as "unknown" and SHALL NOT let that
    absence improve the candidate's standing or screening result.
2.4 FOR EACH displayed sourced observation THE SYSTEM SHALL show the snapshot /
    source date it came from, drawn from the dataset `manifest`
    (`meta.snapshot_dates`), not a hardcoded date.
2.5 THE SYSTEM SHALL present grid-capacity evidence as context only and SHALL
    label it so it is never read as hosting capacity or interconnection approval
    (see R6, R7).

### R3 — Adjustable capacity and hypothetical grid-capacity assumption
3.1 THE SYSTEM SHALL let the planner change a proposed solar capacity (MW) per
    candidate, reusing `scenario.js` (editable assumed capacity kept separate
    from reported source capacity).
3.2 THE SYSTEM SHALL let the planner change a hypothetical grid-capacity
    assumption (MW) per candidate, with a visible label marking it as a
    hypothetical demonstration value, not a sourced or approved figure.
3.3 WHEN the planner changes proposed capacity or the grid-capacity assumption
    THE SYSTEM SHALL recompute affected screening results deterministically and
    SHALL state, per changed result, which result changed and the specific
    reason (e.g. "assumed 6 MW exceeds the 4 MW hypothetical grid-capacity
    assumption").
3.4 THE SYSTEM SHALL present the explanation in terms of inputs and thresholds
    the planner can see, not model-generated prose, so the reason is
    reproducible from the visible values alone.
3.5 WHEN inputs are reset or cleared THE SYSTEM SHALL return screening results to
    their pre-assumption state and SHALL NOT retain a stale assumption in any
    displayed result or export.

### R4 — Deterministic screening and calculations
4.1 THE SYSTEM SHALL compute all screening results and all capacity/scenario
    numbers in pure functions under `src/lib/*` (unit-testable, no DOM, no
    network, no model call).
4.2 GIVEN identical inputs (record + assumptions) THE SYSTEM SHALL always produce
    identical screening results and numbers.
4.3 THE SYSTEM SHALL NOT use the model to produce, alter, round, or re-rank any
    authoritative number or screening decision; the model's role is limited to
    the checklist/suggestion prose in R8.

### R5 — Distinguish sourced, assumed, and unknown
5.1 THE SYSTEM SHALL visibly distinguish the three provenance classes — sourced
    observation (reported), user assumption (hypothetical), and unknown — using
    distinct labeling such that a planner can tell them apart without hovering.
5.2 THE SYSTEM SHALL map each Second Look value to an evidence-packet ID where
    one exists (`F_*` for sourced facts, `U_*` for unknowns) and SHALL mark
    planner inputs explicitly as assumptions distinct from both.
5.3 THE SYSTEM SHALL NOT render a user assumption with the styling or wording of
    a sourced observation, and vice versa.
5.4 THE SYSTEM SHALL carry the provenance class through to the exported brief so
    the distinction survives copy and print (reuse `compareBrief.js`:
    know / assume / unresolved / next).

### R6 — Feeder and site-to-grid association honesty
6.1 THE SYSTEM SHALL NOT infer the serving feeder (or that a site connects to a
    particular transmission line) solely from the nearest mapped line or from the
    town's distribution utility.
6.2 WHEN a site-to-feeder (or site-to-line) association is not verified THE
    SYSTEM SHALL present that association as unknown and SHALL keep it as an
    unresolved question, reusing/extending `U_SITE_SERVICE` /
    `U_INTERCONNECTION`.
6.3 WHEN transmission context is shown THE SYSTEM SHALL label it as town/area
    context whose relationship to this specific site is unverified, and SHALL NOT
    assert it serves the site.

### R7 — Hosting capacity is not interconnection approval
7.1 THE SYSTEM SHALL NOT present any grid-capacity evidence, hosting-capacity
    figure, or the hypothetical grid-capacity assumption as interconnection
    approval, available capacity granted, or feasibility confirmed.
7.2 WHEN a screening result involves the grid-capacity assumption THE SYSTEM
    SHALL state that the result is a planning screen against a hypothetical
    value and that only a utility interconnection study can confirm capacity
    (reuse `U_INTERCONNECTION`).

### R8 — Evidence-linked due-diligence checklist via Gemma with fallback
8.1 WHEN the planner requests a due-diligence checklist for a candidate THE
    SYSTEM SHALL request it through the existing server endpoint
    (`POST /api/plan`, `server/planHandler.js`), which rebuilds the canonical
    evidence packet server-side and calls Gemma.
8.2 THE SYSTEM SHALL require every generated checklist item to reference one or
    more existing evidence IDs from the packet, and SHALL reject any item that
    references a non-existent ID (reuse `planSchema.js` ID validation).
8.3 WHEN the Gemma call succeeds and validates THE SYSTEM SHALL label the output
    source "Live Gemma" (or "Cached (Gemma)" on a cache hit) and SHALL keep it
    visually separate from sourced observations.
8.4 THE SYSTEM SHALL render authoritative numbers from the packet, never from the
    model's free text.
8.5 THE SYSTEM SHALL target the Gemma provider already configured in the backend:
    Google AI Studio (Gemini API) `generateContent`, env vars `GEMMA_API_KEY` /
    `GEMMA_MODEL`, default model `gemma-3-27b-it`. (These are specified in the
    existing code, so no additional provider detail is required; see "Open items
    / decisions".)

### R9 — Deterministic fallback preserved
9.1 WHEN no `GEMMA_API_KEY` is configured THE SYSTEM SHALL return the
    deterministic template checklist labeled "Template-generated"
    (`reason: no_credentials`) and SHALL keep Second Look fully usable.
9.2 WHEN the Gemma call fails (network/timeout/HTTP error) THE SYSTEM SHALL fall
    back to the labeled template checklist (`reason: api_error`) without breaking
    the local workflow.
9.3 WHEN Gemma returns output that fails schema or ID validation THE SYSTEM SHALL
    discard it and fall back to the labeled template
    (`reason: validation_failed`); the invalid output SHALL NOT be shown.
9.4 THE SYSTEM SHALL keep all evidence display, assumption editing, deterministic
    screening, and brief export functional with the model unavailable.

### R10 — Provider correction (Gemma, not Claude)
10.1 THE SYSTEM SHALL use Gemma as the AI provider. THE SYSTEM SHALL NOT retain
     Claude/Anthropic as the described or configured provider anywhere in
     steering, backend, UI, or tests.
10.2 THE SYSTEM SHALL correct the remaining outdated Claude/Anthropic references
     identified in the audit below so documentation matches the Gemma backend.
10.3 THE SYSTEM SHALL read provider configuration (keys/model) from server-side
     environment only and SHALL NOT expose secret values in docs, UI, logs, or
     the client bundle (no `VITE_`-prefixed secret; no key echoed anywhere).
10.4 THE SYSTEM SHALL NOT commit a real credential to the repository; the
     `.env.example` template SHALL contain only a sanitized placeholder (see the
     security note below).

### R11 — Data provenance and new-source discipline
11.1 Before adding any external dependency or data source THE SYSTEM (author)
     SHALL first inspect the downloaded `climate/` folders and prefer existing
     snapshots.
11.2 FOR ANY additional source considered THE SYSTEM (author) SHALL verify and
     record access method, schema, units, coverage, timestamps, and usage/
     license terms before use; an unverifiable source SHALL NOT be added.
11.3 THE SYSTEM SHALL record snapshot dates and provenance for any displayed
     sourced value via the existing dataset `manifest` mechanism.
11.4 WHEN land/site information is missing THE SYSTEM SHALL treat it as unknown
     and SHALL NOT imply the site has no constraints.

### R12 — Export and print fidelity (reuse)
12.1 WHEN the planner exports or prints the Second Look THE SYSTEM SHALL derive
     copied text and printed output from one source so they agree on selected
     facilities, snapshot dates, assumptions (clearly labeled hypothetical), and
     screening results (reuse `compareBrief.js` + `print-root`).
12.2 THE SYSTEM SHALL render hypothetical demonstration values as visibly labeled
     in both copy and print.

## Testable acceptance criteria

Each criterion is verifiable via unit tests (`src/lib/*`), the server handler
tests, or the Playwright browser journey.

- AC1 (R1): Opening Compare on a 2–3 facility shortlist shows a Second Look
  section inside the Compare modal; no new route is added; a fourth facility
  cannot enter. Changing one facility's assumptions does not change another's
  (verified for the two Norfolk IDs).
- AC2 (R2): For each candidate, the four evidence groups render; every value
  carries a provenance class; absent grid/land/constraint values render as
  "unknown"; each sourced value shows a snapshot date taken from
  `meta.snapshot_dates`.
- AC3 (R3): Changing proposed capacity and/or the hypothetical grid-capacity
  assumption updates the listed screening results, and each changed result names
  which result changed and the numeric reason reproducible from visible inputs.
- AC4 (R4): Given fixed inputs, screening outputs and numbers are byte-identical
  across repeated runs; a unit test asserts determinism and that no model call is
  on the calculation path.
- AC5 (R5): A rendered sourced observation, a user assumption, and an unknown are
  each distinguishable by label/class in the DOM and in the exported text; a
  value with an `F_*`/`U_*` ID is tagged with it, and assumptions are tagged as
  assumptions.
- AC6 (R6): With only transmission/utility context available, the site-to-feeder
  association is shown as unknown/unresolved; no screening result asserts a
  serving feeder from nearest line or town utility.
- AC7 (R7): No label or exported line presents the grid-capacity assumption or
  hosting context as approval/available/feasible; a result using the assumption
  is explicitly a screen against a hypothetical value.
- AC8 (R8): A valid Gemma response (injected real-wire format in test) yields a
  checklist whose every item references an existing evidence ID; output labeled
  "Live Gemma"/"Cached (Gemma)"; authoritative numbers come from the packet.
- AC9 (R9): With no key → template checklist labeled "Template-generated"
  (`no_credentials`); injected API error → template (`api_error`); injected
  dangling-ID output → template (`validation_failed`) and the invalid plan is
  never rendered; Second Look remains usable in all three.
- AC10 (R10): A repo-wide search finds no `claude`/`anthropic`/`ANTHROPIC_`/
  `api.anthropic.com`/`sk-ant` reference presenting Claude as the provider in
  steering, server, `src/`, config, or tests; the built `dist/` contains no such
  reference and no secret.
- AC11 (R11): The dataset `manifest` records snapshot dates/hashes for displayed
  sourced values; a missing-land test shows "unknown" and the screening result
  is not improved by the absence.
- AC12 (R12): Copy and print produce the same facilities, snapshot dates,
  labeled hypothetical assumptions, and screening results; hypothetical values
  are visibly labeled in both.

## Current-state audit (for implementation reference)

Confirmed by inspection on 2026-10-24:

- Backend already uses Gemma: `server/planHandler.js` (`callGemma`, `GEMMA_API_BASE`
  = Google AI Studio `generateContent`, `x-goog-api-key`, default
  `gemma-3-27b-it`), `server/index.mjs` (boot log reports `GEMMA_*`), and
  `.env.example` (`GEMMA_API_KEY` / `GEMMA_MODEL`). No `claude`/`anthropic` in
  `src/`, `server/`, config, or tests.
- Outdated Claude references remain in documentation only:
  - `README.md` line ~92 links `evidence/02-claude.md`.
  - `evidence/02-claude.md` (whole file: `ANTHROPIC_API_KEY`, `api.anthropic.com`,
    `claude-sonnet-4-5`, "Live Claude").
  - `evidence/03-workflow.md` (`ANTHROPIC_API_KEY`, "labeled Template/Claude",
    "Live Claude still unverified").
  These are historical evidence write-ups; the correction (R10.2) should bring
  live-facing docs in line with Gemma without rewriting the historical record
  dishonestly (prefer a dated note that the provider was migrated to Gemma over
  silently editing past evidence).
- Data in `climate/`: `transmission/` (HIFLD lines: owner, voltage_kv,
  volt_class, type, status — **no geometry, no hosting capacity**),
  `utilities/` (town → distribution utility), `landfills/` (project rows, **no
  address/coords**), `ej/` (block groups). There is **no** hosting-capacity or
  feeder-assignment dataset present, which is exactly why R6/R7 forbid inferring
  feeder or presenting capacity as approval.

### Defect found during Task 5 verification (fixed)

Verifying R8.3 in the browser surfaced a pre-existing honesty-label bug: the
server caches template plans under the same key as live plans, and on a cache
hit the UI mapped `source === "cache"` to "Cached (Gemma)" **regardless of
whether the cached plan was a live Gemma result or a deterministic template.**
In this environment (no `GEMMA_API_KEY`) a cached template was therefore shown
as "Cached (Gemma)", implying the model ran when it did not — a violation of the
steering rule that AI output is labeled by source (live / cached / template) and
of R8.3. Fixed in `CompareView.jsx` and `NextActionPlanner.jsx` to label a cache
hit by the cached plan's own label: "Cached (Gemma)" only when the cached label
is "Gemma", otherwise "Cached (template)". Locked with a handler unit test and a
browser-journey assertion. No requirement text change needed — the existing R8.3
already required honest source labeling; the code now meets it.

### Security note (must address during implementation, flagged now)

`.env.example` currently contains a value in the shape of a live Google AI
Studio API key (`GEMMA_API_KEY=AIza...`) rather than a placeholder. A tracked
example file must never carry a real secret. This should be replaced with a
sanitized placeholder (e.g. `GEMMA_API_KEY=your-google-ai-studio-key`) and, if
the key is real, it should be revoked at https://aistudio.google.com/apikey.
This requirement (R10.4) is called out here but the remediation is an
implementation task, not part of this requirements document's code changes.

## Open items / decisions

- Gemma provider/endpoint/model are fully specified in the existing backend, so
  no clarification is required to implement the checklist adapter. If a different
  Gemma endpoint or model is desired for Second Look specifically, that detail
  must be provided before building a new adapter; until then, reuse the existing
  `/api/plan` path.
- The concrete shape of a "screening result" (which checks, which thresholds)
  will be defined in design.md; requirements fix only that each result is
  deterministic, explainable from visible inputs, and honest about unknowns.

## Explicit exclusions (out of scope)

- **R-EX1 Statewide parcel discovery.** No discovery, search, or import of
  parcels/sites beyond the existing shortlist. Second Look only re-examines
  already-shortlisted candidates.
- **R-EX2 Financial underwriting.** No project finance, cost, ROI, LCOE, or
  underwriting outputs. Illustrative scenario figures remain clearly
  assumption-based and are not financial advice.
- **R-EX3 Grant eligibility determinations.** No determination of grant or
  incentive eligibility; eligibility stays an unresolved question
  (`U_GRANT_ELIGIBILITY`).
- **R-EX4 Interconnection/feasibility determinations.** No assertion of
  interconnection approval, available hosting capacity granted, or storage/site
  feasibility; these stay unknown (R6, R7).
- **R-EX5 Verified real-world claims.** No claim that reported values are
  verified facts, nor that illustrative outputs are actual households served,
  savings, or grid-peak contribution.

## Note on process

This document is requirements only. No application code is implemented here.
Design (`design.md`) and tasks (`tasks.md`) follow after these requirements are
reviewed.
