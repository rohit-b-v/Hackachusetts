# Evidence 02 — Claude Next-Action Planner

> **MIGRATION NOTE (2026-10-24): superseded — provider is now Gemma, not Claude.**
> This document is kept for history. The planner was later migrated from the
> Anthropic Claude API to **Gemma** via Google AI Studio (Gemini API
> `generateContent`). Runtime env vars are `GEMMA_API_KEY` / `GEMMA_MODEL`
> (not `ANTHROPIC_*`), the live source label is "Gemma" (not "Claude"), and all
> `ANTHROPIC_*` / `api.anthropic.com` / `claude-*` references below describe the
> OLD implementation only. For the current planner see `evidence/04-gemma.md`
> and `server/planHandler.js`. Nothing in this file reflects the running code.

Goal: turn the template brief into a municipal next-action planner backed by the
direct Anthropic Claude API, with a smallest-footprint server endpoint, secrets
kept server-side, strict ID-validated structured output, and a deterministic
labeled fallback.

Date observed: 2026-10-24.

> **Live-credential status: NO `ANTHROPIC_API_KEY` was available in this
> environment.** The endpoint, prompt, validation, caching, and fallback are
> complete and exercised end-to-end over real HTTP, but **a live round-trip to
> `api.anthropic.com` could not be performed and therefore remains unverified.**
> See "How to verify live" below; everything is wired so a single key enables it.

---

## Architecture (smallest compatible endpoint)

| Piece | File | Role |
|-------|------|------|
| Evidence packet (isomorphic) | `src/lib/evidencePacket.js` | Canonical facts + unknowns, each with an ID, plus a deterministic `hash`. |
| Isomorphic hash | `src/lib/hash.js` | FNV-1a, identical in browser + Node, no deps. |
| Output schema + validation | `src/lib/planSchema.js` | Validates structure **and** that every referenced ID exists. `PROMPT_VERSION="plan-v1"`. |
| Deterministic fallback | `src/lib/templatePlan.js` | Builds a valid plan from the packet; labeled "Template-generated". |
| Server handler | `server/planHandler.js` | Rebuilds packet server-side, caches, retries, calls Claude, validates, falls back. Secrets read from `process.env` only. |
| HTTP bridge | `server/httpBridge.js` | Size-bounded JSON body (256 KB), `POST /api/plan`, `no-store`. |
| Standalone server | `server/index.mjs` | `npm run serve` — serves `dist/` + the API for prod/preview. |
| Vite dev middleware | `vite.config.js` | Mounts `/api/plan` during `npm run dev`. |
| Client wrapper | `src/lib/planClient.js` | Posts record+spatial; local template if server unreachable. |
| UI | `src/components/NextActionPlanner.jsx` | Renders authoritative numbers from the packet; AI suggestions visibly separated; source badge (Live Claude / Cached / Template). |

The frontend never imports the server handler. Confirmed the client bundle
contains **no** `x-api-key`, `api.anthropic.com`, `anthropic-version`, or
`sk-ant` references.

## Secrets handling

- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are read via `process.env` only.
- No `VITE_`-prefixed secret exists (grep-verified in `src/`, `server/`, config).
- `.gitignore` excludes `.env` and `.env.*` but keeps `.env.example`.
- `.env.example` is sanitized (`sk-ant-REPLACE_ME`) with comments stating the
  vars are server-side only.
- Endpoint responses set `cache-control: no-store`.

## Guardrails (never inferred)

The packet always carries six standing UNKNOWNS that must not be inferred from
status/proximity: `U_GRANT_ELIGIBILITY`, `U_INTERCONNECTION`,
`U_STORAGE_FEASIBILITY`, `U_SUBSCRIBER_BENEFIT`, `U_LEGAL_REQUIREMENTS`,
`U_SITE_SERVICE`. The system prompt forbids inferring them, and the template
actions reference these unknown IDs (e.g. "Confirm grant-program eligibility"
→ `U_GRANT_ELIGIBILITY`) rather than asserting an answer.

---

## Acceptance results

### 1. One actual server-side Claude request — **NOT RUN (no credentials)**

No key present (`ANTHROPIC_API_KEY` unset, no `.env`). The server correctly
logs `ANTHROPIC_API_KEY: MISSING (template fallback)` on boot. The exact request
the server *would* send was dumped from `buildPrompt()` (abridged):

```
SYSTEM: "You are a municipal clean-energy planning analyst … HARD RULES:
- Use ONLY the evidence IDs provided …
- NEVER infer grant eligibility, interconnection/hosting capacity, storage
  feasibility, subscriber benefits, or legal requirements from status or
  proximity alone …"
USER:   FACILITY_ID / MUNICIPALITY / SNAPSHOT_DATES
        FACTS (17, each "F_*: label = value")
        UNKNOWNS (6, each "U_*: question")
        + required JSON output shape
```

The live path (`source:"live"`, `label:"Claude"`) is covered by a unit test
using an injected fetch that returns a real-wire-format Anthropic response
(`content:[{type:"text",text:"{…}"}]`). That proves request build → JSON
extraction → validation → labeling. **Only the actual network call to Anthropic
is unverified.**

### 2. Two facilities → meaningfully different actions — **PASS** (live HTTP)

`POST /api/plan` against the running server:

| Facility | Status | Action #1 | Owner | evidence hash |
|----------|--------|-----------|-------|---------------|
| Springfield (Crane Foundry) | Permitted | "Confirm grant-program eligibility and application window" | Town Sustainability Manager | `a3d9671890ec62a0` |
| Barnstable Municipal LF | Operating | "Scope a storage/retrofit feasibility review" | Community Solar Developer | `a12f0558e1a5ad50` |

Different titles, owners, and evidence hashes.

### 3. Unsupported evidence IDs rejected — **PASS**

- `validatePlan` unit test: a plan with `evidence_ids:["F_DOES_NOT_EXIST"]` →
  `ok:false`, `badIds` includes `F_DOES_NOT_EXIST`.
- Handler test: injected Claude output with a bad ID →
  `source:"template"`, `reason:"validation_failed"`, and
  `validation_errors` naming `F_DOES_NOT_EXIST`. The invalid plan is never shown.

### 4. Missing geometry remains unknown — **PASS**

With ambiguous identity / no verified point, the packet has **no** `F_PROXIMITY`
fact and **does** carry `U_PROXIMITY`. Verified both at the packet level and
through the full `handlePlanRequest` pipeline.

### 5. API failure → working labeled fallback — **PASS**

Injected fetch returning HTTP 500 (after bounded retries) →
`source:"template"`, `label:"Template-generated"`, `reason:"api_error"`,
`error_detail` populated. The plan is still valid and renders.

Also verified the client-side last resort: if the *server* is unreachable,
`planClient` builds the template locally with `reason:"client_offline"`.

### 6. No key in browser responses / bundle / repo — **PASS**

- Response body JSON scanned: no `sk-ant` / `x-api-key` (incl. a test that sets
  a fake key and asserts it is absent from the response).
- `dist/` grep: no secret or Anthropic-client references.
- `.env` git-ignored; only `.env.example` (sanitized) is tracked.

### Caching, bounds, retries

- Cache key = `evidenceHash :: model :: promptVersion`. Second identical request
  returned `source:"cache", cached:true` over HTTP.
- Bounded cache (`CACHE_MAX=200`, LRU-ish eviction).
- Bounded body (256 KB → HTTP 413). Bounded Claude retries (1 + 2) with backoff,
  retrying only on 429/5xx/network, 20 s abort timeout per attempt.
- HTTP guards verified: missing record → 400, `GET` → 405, bad JSON → 400,
  `cache-control: no-store` present.

---

## Tests & build

- `npm run test` → **38 passed, 2 skipped** (live MassGIS opt-in).
  - `tests/planner.test.js` (14) covers packet IDs/hash, guardrail unknowns,
    validation of dangling IDs, template-plan validity, facility-dependent
    actions, no-credentials/live/cache/bad-id/api-error paths, missing-record
    400, and no-key-leak.
- `npm run build` → success, 1953 modules, no errors.

---

## How to verify live (when a key is available)

```bash
cp .env.example .env            # add real ANTHROPIC_API_KEY
# optional: set ANTHROPIC_MODEL
npm run dev                     # /api/plan served by Vite middleware
#   open a facility → Municipal Opportunity Brief → "Generate Next Actions"
#   badge should read "Live Claude"; a second click → "Cached (Claude)"
# or production:
npm run build && npm run serve  # http://localhost:8787
```

A live run will set `source:"live"`. Record one such response here to close
acceptance item #1.

---

## Remaining limitations

1. **Live Anthropic round-trip unverified** (no credentials in this
   environment). All surrounding logic is tested with an injected real-format
   transport; only the external call is pending a key.
2. **Cache is in-memory per process**, not shared across restarts or multiple
   server instances. Fine for the hackathon single-process model.
3. **Prompt version is manual.** Changing the prompt requires bumping
   `PROMPT_VERSION` to avoid serving stale cached plans.
4. **Template fallback is intentionally conservative** — it proposes
   investigation steps and never asserts eligibility/feasibility, so its actions
   are less tailored than a good live Claude response would be.
5. **Model default** is `claude-sonnet-4-5`; override via `ANTHROPIC_MODEL`. The
   handler does not validate that the model name is currently available until a
   live call is attempted (failure then yields the labeled fallback).
