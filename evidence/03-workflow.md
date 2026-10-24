# Evidence 03 — Compare & Plan workflow

Goal: a compact "Compare and plan" workflow on top of the existing app —
shortlist up to three facilities, compare reported evidence, attach a plan, keep
a local checklist, export a four-question brief — plus inspector reliability
fixes, an illustrative-scenario relabel, genuine Kiro specs/steering, a real
README, and a demo.

Date observed: 2026-10-24. Environment: no `ANTHROPIC_API_KEY` present (planner
runs in labeled template mode; see evidence/02-claude.md).

---

## What was built / changed

| Item | Where |
|------|-------|
| 1. Shortlist ≤3, preserved across filters | `App.jsx` (shortlist by `facility_id`), `OpportunityTable.jsx` (checkbox column) |
| 2. Side-by-side comparison; missing = unknown | `CompareView.jsx` `ComparisonTable` |
| 3. Attach plan + local checklist (owner/evidence/status/note) | `CompareView.jsx`, `src/lib/checklist.js` |
| 4. Export answers know/assume/unresolved/next | `src/lib/compareBrief.js`, `FourQuestions`, `ExportBar` |
| 5. Illustrative scenario; source vs assumption; solar-only | `src/lib/scenario.js`, `GrantBrief.jsx`, `CompareView.jsx` |
| 6. Inspector reliability fixes | `src/lib/massgis.js` (`fetchJson` timeout + signal), `InspectorDrawer.jsx` (request-id guards, transmission effect fix) |
| 7. Copy/print fidelity | `src/lib/compareBrief.js` (one source), `src/index.css` (`print-root`/`print-block`) |
| 8. Kiro specs + steering + README | `.kiro/specs/compare-and-plan/*`, `.kiro/steering/*`, `README.md` |

### Bug #6 details (the transmission self-cancellation)
The old effect listed `transmission.status` in its dependency array **and** set
that status to `"loading"` inside itself, and used a closure `cancelled` flag in
cleanup. Toggling the overlay started a fetch, the `setTransmission("loading")`
re-ran the effect, and the previous run's cleanup set `cancelled = true` —
cancelling the in-flight result it had just started. It also referenced
`effectivePrimary` before that `const` was declared (hoisting hazard).

Fix: the effect now depends only on `[showTransmission, anchorKey]` (a string),
never on the status it mutates; a dedicated `txReqId` ref (not a status-coupled
closure) decides whether a late result is current; and all derivations are
declared before the effects that read them. The main spatial fetch got the same
`spatialReqId` stale-response guard, and `fetchJson` now has an AbortController +
hard timeout composed with the caller's signal.

---

## Verification — unit tests

`npm test` → **50 passed, 2 skipped** (live MassGIS opt-in). New suites:

- `tests/checklist.test.js` (6): per-facility store/read; **no leak between
  facilities**; **Norfolk #1 vs #2 independent**; persists across reload;
  seed-from-plan seeds empty and never overwrites edits.
- `tests/scenario.test.js` (6): solar vs non-solar gating; source capacity from
  reported fields; illustrative figures computed from **assumed** (not source)
  capacity; four-question brief keeps `U_PROXIMITY` **unresolved** and never a
  known fact; non-solar marked "Not applied"; rendered brief contains all four
  questions and no "guaranteed savings" language.

Existing geo/planner/build-data suites still pass unchanged.

## Verification — production build
`npm run build` → success, 1957 modules, no errors.

## Verification — browser journey (Playwright, headless Chromium)

`node tests/browser-journey.mjs` against the dev server — **all 10 checks
PASS**, no page errors:

```
PASS selection persists across filter changes            (shortlist 3/3 after search+clear)
PASS comparison table renders
PASS missing spatial shown as unknown (not a rating)
PASS both Norfolk records present in compare
PASS decision brief shows the four questions
PASS checklist note persists across reload
PASS note did not leak to the other two facilities
PASS inspector shows truthful error on service failure   (MassGIS routes aborted)
PASS local brief still usable during service failure
```

Captured screenshots in `evidence/shots/`:
- `compare-print.png` — print-media render, **1400×6988**, ~0.8 MB: the
  comparison table + all three facility cards (Barnstable + both Norfolk) with
  scenario, plan, checklist (showing the persisted `JOURNEY_NOTE_123`), and the
  four-question decision brief — **not clipped** by the modal, no chrome.
- `compare-screen.png` — on-screen render.
- `inspector-offline.png` — inspector with MassGIS blocked: truthful "Could not
  reach the live MassGIS endpoint" state while the local brief still renders.

### Acceptance mapping
- **Both Norfolk records independent** — verified in `checklist.test.js` and in
  the browser (two distinct cards with distinct `facility_id`/`evidence_hash`
  and independent MW values 1.05 vs 0.55; independent checklists).
- **Checklist survives reload without leaking** — browser checks 6 & 7.
- **External-service failure leaves local workflow usable** — browser checks 8 &
  9 (MassGIS network aborted; brief + compare + checklist still work; template
  plan served locally).
- **Browser-checked journey + print preview** — the journey above + the print
  screenshot.
- **Meaningful tests + production build** — above.

---

## Honesty / claims audit (items 2 & 5)

- Comparison "Spatial proximity" row renders **"unknown (open inspector to
  verify)"** when no live geometry has been fetched — absence does not improve a
  facility.
- The calculator is titled **"Illustrative Scenario (not verified)"**. Reported
  **source capacity is read-only** and shown separately from the **editable
  assumed capacity**. Labels read "Illustrative annual generation",
  "Illustrative subscriber scale (not verified)", "Illustrative dispatch (not a
  grid commitment)". The strings "verified EJ households served", "guaranteed
  savings", and "actual grid-peak contribution" appear only in **negations**.
- Non-solar records show "Scenario not applicable — reported technology is …".
- Checklist UI states "Marking done is a planning aid, not official
  verification."

---

## Demo script (≈110 s)

1. **(0:00–0:20) Triage.** Land on the table of 116 reported sites. Filter to
   `Permitted`/`Construction`. Note the "reported" framing and utility breakdown.
2. **(0:20–0:45) Shortlist.** Tick Springfield, then search "norfolk" and tick
   **both** Norfolk records — point out they are independent rows. Clear the
   search; the sticky bar still shows 3/3 (selection survived the filter).
3. **(0:45–1:10) Compare.** Open **Compare & Plan**. Walk the side-by-side
   evidence; call out an **"unknown"** spatial row (missing ≠ better). Show the
   attached plan (labeled Template/Claude) and the four-question **decision
   brief** per facility.
4. **(1:10–1:35) Plan + export.** On one card set a task's owner/status and type
   a note; it saves locally. Click **Copy combined brief** (or Print) — the
   export answers know / assume / unresolved / next and matches on-screen values.
5. **(1:35–1:50) Honest scenario + live proof.** Enable the **illustrative
   scenario** (note source vs assumed capacity, "not verified"). Close Compare,
   **Inspect** a site to verify proximity on live MassGIS geometry — and if the
   service is down, the brief still works.

---

## Remaining limitations
1. Live Claude still unverified in this environment (no key); planner is in
   labeled template mode. Everything else is exercised.
2. Shortlist is in-memory (survives filtering, not a full reload) — by design;
   the **checklist** is what persists across reloads (per facility_id).
3. The combined "Copy combined brief" export marks the scenario as not-run to
   avoid embedding a stale per-card scenario; per-facility copy/print reflects
   the scenario if enabled.
4. The browser journey requires a running dev server + installed Chromium; it is
   an acceptance script, not part of `npm test`.
