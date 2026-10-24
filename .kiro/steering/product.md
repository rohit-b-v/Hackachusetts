---
inclusion: always
---

# Cap-to-Community — product

A planning tool for Massachusetts town staff evaluating renewable projects on
capped landfills. It joins three reported datasets (landfill projects, town
electric utility, EJ block groups), lets staff shortlist up to three facilities,
compare their reported evidence side by side, attach an AI/template next-action
plan, keep a local investigation checklist, and export a decision brief.

## Non-negotiable honesty rules

These shape every feature and every label:

- **Reported vs. verified.** Dataset values are "reported" from snapshots. We do
  not present them as verified facts about the world.
- **Missing evidence stays unknown.** Absent data is shown as "unknown" and must
  never improve a facility's standing or be inferred.
- **No inference of eligibility/feasibility.** Grant eligibility, interconnection
  capacity, storage feasibility, subscriber benefits, and legal requirements are
  never derived from status or proximity. They remain open questions.
- **Illustrative ≠ outcome.** The scenario calculator is an assumption-based
  illustration, not verified EJ households served, guaranteed savings, or an
  actual grid-peak contribution. Source capacity (reported) is kept separate
  from editable assumptions.
- **AI is separate and labeled.** Gemma/template suggestions are visibly
  distinct from source facts and labeled by source (live / cached / template).
- **Checklist completion is a planning aid**, not official project verification.
- **Identity is never guessed.** Two live points sharing a facility name (the two
  Norfolk records) are reported as ambiguous and resolved by user choice.
- **Second Look keeps three value classes distinct.** Reported source data
  (shown with a source date), planner-entered **hypothetical** grid-capacity
  inputs (always labeled hypothetical, never an interconnection approval), and
  **unknown** site constraints (absent data never improves a site). The serving
  feeder is never inferred from the nearest mapped line or the town utility; an
  unverified site-to-feeder association stays unknown. Screening verdicts are a
  three-state `potential constraint / no flag from available evidence / unknown`
  — there is no "pass", and the grid screen is a deterministic screen against a
  hypothetical value, not a live hosting-capacity/interconnection integration.
