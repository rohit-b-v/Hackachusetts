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
and `server/index.mjs`). The model defaults to `gemma-3-27b-it`; set `GEMMA_MODEL`
to another documented Gemma ID to override. These vars are never prefixed `VITE_`
and never reach the browser bundle. `.env` is git-ignored. Create/revoke keys at
https://aistudio.google.com/apikey.

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

## Demo (90–150s)
See `evidence/03-workflow.md` → "Demo script". Flow: shortlist three sites →
open Compare → read the side-by-side evidence (note "unknown" rows) → attach the
plan and tick a checklist task → export the four-question brief → open the
Inspector to verify proximity on live geometry.

## Data honesty & provenance
Each build records input SHA-256 hashes, snapshot dates, counts, and missing-value
tallies in the dataset `manifest`. See `evidence/01-correctness.md` and
`evidence/02-claude.md` for prior verification, and `evidence/03-workflow.md` for
this workflow.
