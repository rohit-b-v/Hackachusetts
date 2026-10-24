# Evidence 05 — Solar Second Look

Goal: inside the existing Compare flow, let a municipal planner re-examine up to
three already-shortlisted capped-landfill solar sites — read grid-capacity
evidence, land/site constraints, unresolved questions, and source dates; adjust
a proposed solar capacity and a clearly labeled **hypothetical** grid-capacity
assumption; see which deterministic screening results change and why; and
generate an evidence-linked checklist via Gemma with a labeled deterministic
fallback. Spec: `.kiro/specs/solar-second-look/`.

Date observed: 2026-10-24.

## What was built (additive; reuses existing infra)

| Piece | File | Notes |
| --- | --- | --- |
| Source adapters | `src/lib/secondlook/sources.js` | Pure. Provenance-tagged Observations (sourced / assumption / unknown) for grid, land, unresolved + source dates from the dataset `manifest`. |
| Deterministic screening | `src/lib/secondlook/screening.js` | Pure. 3-state verdicts, monotonic grid screen, explicit-rule priority. No model, no network. |
| Panel UI | `src/components/secondlook/SecondLookPanel.jsx` | Mounted inside `CompareView` per facility; evidence groups, assumption controls, Reset, results. |
| Badges / rows | `src/components/secondlook/{ProvenanceBadge,ScreeningResultRow}.jsx` | sourced/hypothetical/unknown; potential-constraint/no-flag/unknown. |
| Export | `src/lib/compareBrief.js` (`buildSecondLookContribution`) | Feeds know/assume/unresolved/next; copy == print from one source. |
| Checklist (reused) | `/api/plan` → `server/planHandler.js` | Gemma + validation + labeled template fallback, unchanged. |

## Acceptance results (expected vs. observed)

Unit tests (`npm test` → **83 passed, 2 skipped**; the 2 skipped are opt-in live
MassGIS network tests):

- **AC2 / AC5 / AC6 / AC11 — evidence + provenance** (`secondlook-sources` 11/11):
  town utility is `sourced` with a manifest source date and `association_confidence:
  "unverified"`; serving feeder, observed hosting capacity, queued-generation,
  and all land fields are `unknown` with `value:null`; absent land data is
  unknown, never "no constraints".
- **Correctness properties 1–4** (`secondlook-screening` 12/12):
  - P1: raising proposed MW (grid fixed) never improves the grid verdict.
  - P2: lowering the hypothetical grid MW (proposed fixed) never improves it.
  - P3: null capacity → `unknown`; unverified feeder → `unknown` (linked
    `U_SITE_SERVICE`); `unknown` never ranked more suitable than `no_flag`.
  - P4: identical inputs give deeply-equal results; change-then-reset returns
    the baseline verdicts.
  - Also: 3-state verdicts (no "pass"), explicit-rule priority, reason strings
    reproducible from visible inputs, non-solar technology gating.
- **AC12 — export** (`secondlook-brief` 6/6): grid-capacity assumption labeled
  "HYPOTHETICAL … not an interconnection approval"; over-sized proposal → NEXT;
  unknown screens → UNRESOLVED; sourced KNOW rows carry source date; copied text
  (`renderBriefText`) and the structure that drives the print DOM both show the
  hypothetical label (copy == print from one source).
- **Property 5 — model failure** (`secondlook-fallback` 3/3): `requestPlan`
  returns a usable labeled template on network failure (`client_offline`); Second
  Look screening is byte-identical with the planner failing; the brief Second
  Look slices are unchanged whether the plan is a fallback or absent.
- **R8/R9 handler** (`planner` suite): live Gemma → `label:"Gemma"`; cache hit →
  `source:"cache"` and the **cached label is preserved** (template stays
  template); no-creds → `no_credentials`; API error → `api_error`; bad ID →
  `validation_failed` (invalid plan never shown); key never leaked in the body.

Production build: `npm run build` → clean. `dist/` scanned → **no**
`claude`/`anthropic`/`sk-ant`/`api.anthropic.com` and **no** `AIza` key prefix.

## Browser journey (`tests/browser-journey.mjs`)

Run against an **isolated no-credentials server** so the result does not depend
on the developer's ambient environment:

```
env -u GEMMA_API_KEY -u GEMMA_MODEL PORT=8790 node server/index.mjs
#   boot log: "GEMMA_API_KEY: MISSING (template fallback)"
BASE_URL=http://localhost:8790 node tests/browser-journey.mjs
```

Result: **ALL BROWSER CHECKS PASSED**, including:
- Second Look section renders inside Compare; grid-capacity group present.
- Serving feeder shown "site-unverified" (never inferred).
- Assumption controls labeled hypothetical.
- Proposed 9 MW vs hypothetical grid 5 MW → "potential constraint"; reason says
  "not interconnection approval"; a "changed" marker appears; Reset clears the
  hypothetical input (back to baseline → unknown).
- Copied brief (real clipboard) contains "HYPOTHETICAL", a "second-look" NEXT
  item, and the "potential constraint" flag.
- Observed plan source label in this no-key run: **"Template-generated"**.
- Per-site isolation: a checklist note edited on one card did not leak to the
  other two (exercises the same `facility_id` scoping Second Look relies on).
- Copy/print surfaces captured: `evidence/shots/compare-{screen,print}.png`.

Cache-label check against the isolated server (two identical POSTs to
`/api/plan`): call 1 `source=template,label=Template-generated`; call 2
`source=cache,label=Template-generated` → UI renders **"Cached (template)"**,
not "Cached (Gemma)".

## Honesty-label defect found and fixed (R8.3)

Verifying R8.3 surfaced a pre-existing bug: the UI mapped any `source==="cache"`
to "Cached (Gemma)", so a cached **template** plan was shown as if the model ran.
Fixed in `CompareView.jsx` and `NextActionPlanner.jsx` to label a cache hit by
the cached plan's own label ("Cached (Gemma)" iff label==="Gemma", else
"Cached (template)"). Locked with a handler unit test and a browser assertion.

## Provider / model verification (checked against current official docs)

- Endpoint, auth (`x-goog-api-key`), request (`contents[].parts[].text` +
  `generationConfig`), and response parsing (`candidates[0].content.parts[].text`)
  in `server/planHandler.js` **match** the current
  [Run Gemma with the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
  documentation.
- **Model-ID discrepancy (unresolved):** that page (last updated 2026-07-02 as
  fetched) lists `gemma-4-31b-it` and `gemma-4-26b-a4b-it` as the supported
  Gemma models and does **not** list the project default `gemma-3-27b-it`. The
  default was left unchanged because no live call could confirm a working
  replacement here, and model availability per key can differ from the doc. Set
  `GEMMA_MODEL` to a model your key actually serves. This is documented in
  `.env.example` and the README.

## Data honesty summary (what each value is)

- **Reported source data:** e.g. town distribution utility, reported technology —
  shown with a dataset source date (2026-10-18 snapshots) and, for grid/utility,
  an explicit "site-unverified" marker.
- **Hypothetical grid-capacity input:** planner-entered demonstration value,
  always labeled hypothetical; the grid screen compares proposed vs. this value
  and states it is not interconnection approval. **This is not a live
  hosting-capacity integration.**
- **Unknown:** serving feeder, observed hosting capacity, queued-generation
  accounting, land/site constraints — absent from the `climate/` snapshots, shown
  as unknown, and never improving a site's standing.

## What works vs. what remains unverified

Works (verified here): deterministic evidence/screening/priority; three-state
verdicts; monotonicity and reset (properties 1–4); copy==print with labeled
hypotheticals; per-site isolation; template + cache + fallback paths and honest
labels (property 5); no secret/provider leakage in `dist/`.

Live Gemma — VERIFIED working (2026-10-24, with a real key; no key value ever
printed):
- `ListModels` for this key returned exactly two generateContent-capable Gemma
  models: `gemma-4-26b-a4b-it` and `gemma-4-31b-it`. The old default
  `gemma-3-27b-it` returns HTTP 404 ("not supported for generateContent"), so the
  default was updated to `gemma-4-26b-a4b-it` (handler, `.env.example`, README,
  and the handler unit test).
- First diagnosis: the real planner prompt took ~26s and Gemma-4 emitted verbose
  "thinking" markdown instead of JSON, so every attempt hit the 20s abort and
  fell back to template. **Fix applied in `server/planHandler.js`:**
  - `thinkingConfig: { thinkingLevel: "minimal" }` in `generationConfig` — cut
    latency to ~9s and made the model return clean JSON directly.
  - Per-attempt timeout raised 20s → 60s (`GEMMA_TIMEOUT_MS`); `MAX_RETRIES`
    lowered 2 → 1 to bound the worst case (~120s).
  - `extractJson` hardened: balanced-brace scan (tolerates a prose preamble) plus
    `unwrapPlan` (Gemma-4 sometimes wraps the object as `[{...}]`).
- End-to-end through the dev `/api/plan`: call 1 → `source=live, label=Gemma,
  model=gemma-4-26b-a4b-it` with a schema-valid plan (3 actions, 3 questions, all
  evidence IDs validated by `validatePlan`); call 2 (same evidence hash) →
  `source=cache, label=Gemma`.
- In the actual browser (journey): the plan panel showed **"Live Gemma"** on a
  fresh generation and **"Cached (Gemma)"** on a subsequent cache hit.
- Fallbacks still intact after the change: an isolated no-key server
  (`env -u GEMMA_API_KEY -u GEMMA_MODEL node server/index.mjs`) returns
  `source=template, reason=no_credentials`; unit tests still cover api_error and
  validation_failed fallbacks. Full suite 83 passed / 2 skipped; build clean.

Remaining limitations:
- Live Gemma verification used `gemma-4-26b-a4b-it`. `gemma-4-31b-it` is
  available to the key but was not separately exercised end-to-end.
- A live generation takes ~9s; the UI shows a "generating…" state until it
  returns, then caches so repeat views are instant.
- Second Look re-examines only the existing shortlist; statewide parcel
  discovery, financial underwriting, and grant-eligibility determinations remain
  out of scope by design.
- Second Look re-examines only the existing shortlist; statewide parcel
  discovery, financial underwriting, and grant-eligibility determinations are out
  of scope by design.

## Demo workflow (Second Look)

1. Shortlist up to three facilities in the triage table (e.g. Barnstable + the
   two Norfolk rows), then open **Compare & Plan**.
2. In each card's **Second Look** section, read the four evidence groups — note
   the `unknown` feeder/hosting-capacity rows and the "site-unverified" marker.
3. Enter a **proposed solar capacity** and a **hypothetical grid-capacity
   assumption** (e.g. 9 MW vs 5 MW). Watch the grid screen flip to "potential
   constraint" with a reason naming both numbers and a "changed" marker.
4. Click **Reset assumptions** → the hypothetical clears and the grid screen
   returns to "unknown" (baseline).
5. **Copy combined brief** (or Print) → the exported four-question brief carries
   the labeled hypothetical value and the second-look investigation items; copy
   and print agree.
6. The attached checklist/plan is labeled by true source — "Template-generated"
   or "Cached (template)" without a key; "Live Gemma"/"Cached (Gemma)" once a
   valid `GEMMA_MODEL` + `GEMMA_API_KEY` are configured.
