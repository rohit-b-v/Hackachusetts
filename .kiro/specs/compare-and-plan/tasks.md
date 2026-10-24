# Tasks — Compare & Plan workflow

Status legend: [x] done · [ ] not started

- [x] 1. Shortlist state in App.jsx (bounded to 3, keyed by facility_id) with a
      sticky compare action bar. _(R1, R8)_
- [x] 2. Shortlist checkbox column in OpportunityTable (checked/disabled logic,
      preserved across filters). _(R1)_
- [x] 3. `src/lib/checklist.js` — localStorage checklist namespaced by
      facility_id, with plan-seeding that never overwrites edits. _(R3, R8)_
- [x] 4. `src/lib/scenario.js` — illustrative scenario math, solar gating, and
      source-vs-assumed capacity separation. _(R5)_
- [x] 5. `src/lib/compareBrief.js` — build + render the four-question brief from
      one source for copy and print. _(R4, R7)_
- [x] 6. `CompareView.jsx` — comparison table, per-facility scenario + plan +
      checklist + decision brief, combined export (copy/print). _(R2, R3, R4)_
- [x] 7. Relabel GrantBrief estimator as illustrative; remove verified-outcome
      claims; gate to solar records. _(R5)_
- [x] 8. Inspector reliability: `fetchJson` timeout + composed abort signal;
      stale-response request-id guards; fix transmission self-cancellation.
      _(R6)_
- [x] 9. Print CSS: isolate `.print-root`, keep `print-block` sections unclipped,
      `no-print` chrome/map. _(R7)_
- [x] 10. Tests: checklist + scenario unit suites; Playwright browser journey.
- [x] 11. Docs: steering (product/tech/structure), this spec, working README.
- [x] 12. Verification: full `npm test` + `npm run build` + browser journey;
      evidence written to evidence/03-workflow.md.
