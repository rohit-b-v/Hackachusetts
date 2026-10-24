# Cap-to-Community

A planning tool for Massachusetts town staff weighing renewable projects on
capped landfills. It joins three **reported** datasets — landfill projects, each
town's electric utility, and Environmental Justice (EJ) block groups — and lets
staff triage sites, verify spatial proximity against live MassGIS geometry,
shortlist and compare up to three facilities, attach an AI/template next-action
plan, keep a local checklist, and export a decision brief.

> Honesty first: values are **reported** from dataset snapshots, missing
> evidence stays **unknown** (it never improves a facility), the capacity
> calculator is an **illustrative scenario** (not verified outcomes), AI
> suggestions are **labeled and separate** from source facts, and checklist
> completion is a **planning aid, not official verification**.

## Prerequisites
- Node.js 18+ (developed on Node 24) and npm.

## Install
```bash
npm install
```

## Run (development)
```bash
npm run dev
```
Opens the app and the `POST /api/plan` endpoint on http://localhost:5173.

### Enable live Gemma plans (optional)
The next-action planner works offline with a deterministic **Template-generated**
plan. To use live Gemma (Google AI Studio / Gemini API):
```bash
cp .env.example .env     # add a real GEMMA_API_KEY (server-side only)
```
`GEMMA_API_KEY` / `GEMMA_MODEL` are read only by the server (Vite dev middleware
and `server/index.mjs`). The model defaults to `gemma-4-26b-a4b-it`; set
`GEMMA_MODEL` to another documented Gemma ID to override. These vars are never
prefixed `VITE_` and never reach the browser bundle. `.env` is git-ignored.
Create/revoke keys at https://aistudio.google.com/apikey.

> Model-ID note (verified 2026-10-24 via a live ListModels call and the official
> [Run Gemma with the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
> docs): the generateContent-capable Gemma models were `gemma-4-26b-a4b-it` and
> `gemma-4-31b-it`. The older `gemma-3-27b-it` returns HTTP 404 ("not supported
> for generateContent"), so the default was updated to `gemma-4-26b-a4b-it`.
> Model availability can differ per key — confirm yours if a live call 404s.

## Build & serve (production)
```bash
npm run build      # outputs dist/
npm run serve      # standalone Node server: static dist/ + /api/plan (port 8787)
# or
npm run preview    # Vite static preview (no API)
```

## Rebuild the joined dataset
`src/data/landfill_opportunities.json` is generated from the read-only snapshots
in `climate/`:
```bash
npm run build:data
```
The generated `src/data/landfill_opportunities.json` is **committed**, so a clean
deploy build does not need to run `build:data`.

## Deploy to Vercel
The app deploys as a static Vite SPA plus one serverless function.

Settings (from `vercel.json`, no dashboard changes needed):
- **Framework:** Vite · **Build:** `npm run build` · **Output:** `dist`
- **Function:** `api/plan.js` exposes `POST /api/plan`, calling the shared
  `server/planHandler.js` (`handlePlanRequest`). Max duration **150s** (the
  planner's model budget is 1 + 1 retry × 60s = ~120s, inside that limit).
- **Rewrites:** everything except `/api/*` falls through to `index.html`
  (SPA routing); `/api/plan` is preserved and served by the function.

Required environment variables (set in the Vercel project, **server-side**;
never prefixed `VITE_`, never exposed to the browser):
- `GEMMA_API_KEY` — Google AI Studio (Gemini API) key. **Required for live
  plans.** Without it, `/api/plan` returns the labeled deterministic template.
- `GEMMA_MODEL` — optional; defaults to `gemma-4-26b-a4b-it`. Must be a model
  your key can call with `generateContent` (verify via ListModels).

Notes:
- `.env` and `.vercel` are git-ignored; set secrets in the Vercel dashboard, not
  in the repo.
- `climate/` snapshots and `climate.zip` are source-only (not under `public/`,
  not imported), so they are **not** published as static assets; the built
  `dist/` contains only `index.html` + `assets/`.
- Request-size cap (256 KB → 413), POST-only (→ 405), `no-store` responses,
  evidence-ID validation, and the labeled fallback are all preserved by the
  function adapter.

## Tests
```bash
npm test                      # unit tests (vitest)
npm run test:live             # opt-in: live MassGIS network tests (RUN_LIVE=1)
node tests/browser-journey.mjs  # Playwright walk-through of Compare & Plan
```
The browser journey needs the dev server running and Chromium installed
(`npx playwright install chromium`). It writes screenshots to `evidence/shots/`.

## Project layout
See `.kiro/steering/structure.md`. In short: `src/lib/*` holds pure, unit-tested
logic; `src/components/*` the UI; `server/*` the Gemma endpoint (never imported
by the client); `climate/*` the read-only source snapshots.

## Features
- **Triage table** of 116 reported landfill sites with filters and a utility
  breakdown.
- **Live Spatial Inspector** — queries MassGIS with real geometry, measures
  distance to the nearest EJ block-group boundary (Turf), resolves ambiguous
  facility identity without guessing, and overlays HIFLD transmission lines.
- **Next-action planner** — Gemma (or template) plan validated against a
  canonical evidence packet; dangling IDs are rejected.
- **Compare & Plan** — shortlist up to three facilities, compare reported
  evidence side by side, edit a per-facility checklist (saved locally), and
  export a "know / assume / unresolved / next" brief (copy or print).
- **Second Look** — inside Compare, re-examine each shortlisted site: grid-capacity
  evidence, land/site constraints, unresolved questions, and source dates; adjust
  a proposed solar capacity and a clearly labeled **hypothetical** grid-capacity
  assumption and see which deterministic screening results change and why. Every
  value is tagged sourced / hypothetical / unknown; the feeder is never inferred
  from the nearest line or the town utility; hosting capacity is never shown as
  interconnection approval. Results feed the same copy/print brief.

## Demo (90–150s)
See `evidence/03-workflow.md` → "Demo script". Flow: shortlist three sites →
open Compare → read the side-by-side evidence (note "unknown" rows) → attach the
plan and tick a checklist task → export the four-question brief → open the
Inspector to verify proximity on live geometry.

## Data honesty & provenance
Each build records input SHA-256 hashes, snapshot dates, counts, and missing-value
tallies in the dataset `manifest`. See `evidence/01-correctness.md` and
`evidence/04-gemma.md` for planner verification (the planner now uses **Gemma**
via Google AI Studio; `evidence/02-claude.md` is the superseded Claude-era
write-up, kept for history), `evidence/03-workflow.md` for the Compare & Plan
workflow, and `evidence/05-second-look.md` for the Second Look workflow.

Second Look distinguishes three kinds of value and never blurs them: **reported
source data** (dataset snapshots, shown with a source date), **hypothetical
grid-capacity inputs** (planner-entered demonstration values, always labeled
hypothetical and never an interconnection approval), and **unknown** site
constraints (absent data, which never improves a site). The grid-capacity screen
is a deterministic planning screen against a hypothetical value — it is **not** a
live hosting-capacity or interconnection integration.
