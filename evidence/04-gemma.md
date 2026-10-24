# Evidence 04 — Runtime AI provider swapped to Gemma (Google AI Studio)

Goal: the backend calls Gemma via the user's provider (Google AI Studio / Gemini
API) when a user generates an action brief, with credentials server-side and the
existing evidence validation, caching, and labeled template fallback preserved.

Date observed: 2026-10-24.

## Provider details used
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
  (Google AI Studio / Gemini API). Docs:
  https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
- **Auth:** `x-goog-api-key: <GEMMA_API_KEY>` header (server-side only).
- **Request:** `contents:[{role:"user",parts:[{text}]}]` with
  `generationConfig.responseMimeType:"application/json"`. Gemma has no system
  role on this API, so system instructions are folded into the single user turn.
- **Response parsing:** `candidates[0].content.parts[].text`.
- **Model:** `GEMMA_MODEL`, default `gemma-3-27b-it`.

## Important correction (model ID)
The requested model ID **`gemma-4-31b-it` is not a real Google AI Studio model**.
There is no "Gemma 4" and no "-31b-" size. Documented Gemma models on Google AI
Studio are Gemma 3 / 3n: `gemma-3-27b-it`, `gemma-3-12b-it`, `gemma-3-4b-it`,
`gemma-3-1b-it`, `gemma-3n-e4b-it`, `gemma-3n-e2b-it` (verified via Google
DeepMind's Gemma 3 page and the `google/gemma-3-27b-it` model card). Hardcoding a
nonexistent ID would 404 on every real call and silently fall back forever, so
the default is the real `gemma-3-27b-it`, overridable via `GEMMA_MODEL`.

## Security note
A live Google AI Studio key was pasted into chat. It must be treated as
compromised and revoked at https://aistudio.google.com/apikey. It was NOT written
into any repository file; the server reads it only from `process.env.GEMMA_API_KEY`
(via git-ignored `.env`).

## What changed
- `server/planHandler.js`: `callClaude` → `callGemma` (Gemini generateContent
  request/response); `ANTHROPIC_*` → `GEMMA_*`; default model `gemma-3-27b-it`;
  live label "Claude" → "Gemma".
- `vite.config.js`: dev middleware wires `GEMMA_API_KEY` / `GEMMA_MODEL`.
- `server/index.mjs`: boot log reports `GEMMA_*`.
- `.env.example`: `GEMMA_API_KEY` / `GEMMA_MODEL` with the AI Studio key URL.
- UI labels: "Live Gemma" / "Cached (Gemma)" in NextActionPlanner + CompareView.
- Docs: README, steering, spec updated.
- `tests/planner.test.js`: fakes now return the Gemini response shape; assert
  `label:"Gemma"` and `model:"gemma-3-27b-it"`; key-leak test uses an AIza-style
  secret.

## Preserved (unchanged behavior)
- Canonical evidence packet rebuilt server-side (client facts not trusted).
- Structured-output + referenced-ID validation; dangling IDs → reject → template.
- Cache keyed by `(evidenceHash, model, promptVersion)`, bounded LRU.
- Bounded retries (1+2, only 429/5xx/network) + per-attempt 20s timeout.
- Clearly labeled **Template-generated** fallback for no-credentials,
  validation failure, and API error.

## Verification

### Unit tests + build
- `npm test` → **50 passed, 2 skipped** (live MassGIS opt-in). Planner suite
  (14) rewritten for the Gemini response shape; covers no-credentials, live,
  cache, bad-id, api-error, missing-geometry-stays-unknown, 400, and no-key-leak.
- `npm run build` → success, 1957 modules, no errors.
- Bundle scan: no `GEMMA_API_KEY` / `x-goog-api-key` / `AIza` /
  `generativelanguage` strings in `dist/` (provider call is server-only).

### Real-wire HTTP checks (standalone server)
- **No key:** boot logs `GEMMA_API_KEY: MISSING (template fallback)`; `POST
  /api/plan` → `source:"template"`, `reason:"no_credentials"`,
  `model:"gemma-3-27b-it"`, no key leak.
- **Invalid key (exercises the real endpoint):** with a dummy key, `POST
  /api/plan` actually reached
  `generativelanguage.googleapis.com` and received Google's genuine auth error
  — HTTP 400 "API key not valid. Please pass a valid API key." The handler then
  returned the labeled fallback: `source:"template"`, `reason:"api_error"`,
  `model:"gemma-3-27b-it"`, and the invalid key did **not** appear in the
  response body. This confirms the correct endpoint, the `x-goog-api-key` auth
  scheme, and the API-error → labeled-fallback path against the live provider.

### Not verified
- A **successful live Gemma generation** (`source:"live"`) could not be verified:
  no valid `GEMMA_API_KEY` was available in this environment (the pasted key is
  to be revoked). The request/response handling, validation, caching, and
  fallback are all implemented and tested (unit tests with a Gemini-shaped
  transport; real-wire auth-rejection + fallback). To close this: set a valid
  `GEMMA_API_KEY` in `.env`, run `npm run dev`, open a facility → Generate Next
  Actions; the badge should read **Live Gemma**, and a second run **Cached
  (Gemma)**.
