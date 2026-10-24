---
inclusion: always
---

# Cap-to-Community — tech

## Stack
- React 18 + Vite 5 (`type: module`), Tailwind CSS v4 via `@tailwindcss/vite`.
- `react-leaflet` 4 + Leaflet for maps; `lucide-react` for icons.
- `@turf/turf` 7 for geometry (edge distance, containment with holes).
- Vitest 2 for unit tests; Playwright for the browser journey (dev-only check).
- A tiny server-side endpoint `POST /api/plan` calling Gemma via Google AI
  Studio (Gemini API, `generateContent`), mounted two ways from one handler:
  Vite dev middleware (`vite.config.js`) and a standalone `server/index.mjs`
  (`npm run serve`). Secrets are server-side only.

## Commands
- `npm run dev` — app + `/api/plan` on http://localhost:5173
- `npm run build` / `npm run preview`
- `npm run serve` — standalone prod server (serves `dist/` + API)
- `npm run build:data` — regenerate `src/data/landfill_opportunities.json`
- `npm test` — unit tests; `npm run test:live` — opt-in live MassGIS tests
- `node tests/browser-journey.mjs` — headless Compare & Plan walk-through

## Secrets
- `GEMMA_API_KEY`, `GEMMA_MODEL` are read from `process.env` ONLY.
  (`GEMMA_MODEL` defaults to `gemma-3-27b-it`.)
- Never prefix a secret with `VITE_` (that would inline it into the client).
- `.env` is git-ignored; `.env.example` is the sanitized template.

## Reliability conventions (network)
- Every live fetch carries an AbortController + hard timeout (`fetchJson` in
  `src/lib/massgis.js`).
- React effects that fetch use a monotonic request-id ref for stale-response
  protection; the fetch effect must NOT depend on the status it mutates.
- External-service failure must leave the local workflow usable; show truthful
  cached/error states, never fake success.

## Testing conventions
- Keep real-source (network) tests separate and opt-in from synthetic tests.
- Prefer pure, isomorphic lib functions (`src/lib/*`) so logic is unit-testable
  without the DOM.
