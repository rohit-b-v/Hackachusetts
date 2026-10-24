# Requirements — Compare & Plan workflow

## Overview
Let town staff shortlist up to three facilities, compare their reported
evidence, attach a next-action plan, keep a local checklist, and export a
decision brief — without ever overstating what the data proves.

## Requirements (EARS)

### R1 — Shortlist selection
- WHEN a user selects a facility in the table THE SYSTEM SHALL add its
  `facility_id` to the shortlist, up to a maximum of three.
- WHEN the shortlist already holds three facilities THE SYSTEM SHALL prevent
  (disable) selecting a fourth.
- WHEN the active filters or search change THE SYSTEM SHALL CONTINUE TO retain
  the current shortlist (selection is keyed by `facility_id`, not row position).

### R2 — Side-by-side comparison
- WHEN two or more facilities are shortlisted and the user opens Compare THE
  SYSTEM SHALL show reported status/capacity, town utility, town EJ context,
  spatial evidence, source dates, and unresolved questions side by side.
- WHEN a comparison value is missing or not verified THE SYSTEM SHALL display it
  as "unknown" and SHALL NOT let the absence improve the facility's standing.

### R3 — Next-action plan + checklist
- WHEN a facility is shown in Compare THE SYSTEM SHALL attach its Gemma/template
  next-action plan, labeled by source.
- WHEN a user records an owner role, requested evidence, task status, or note THE
  SYSTEM SHALL persist that checklist locally keyed by `facility_id`.
- WHEN the page reloads THE SYSTEM SHALL CONTINUE TO show each facility's saved
  checklist, and SHALL NOT leak one facility's checklist into another.
- THE SYSTEM SHALL label user-marked completion as a planning aid, not official
  project verification.

### R4 — Decision brief export
- WHEN a user exports a brief THE SYSTEM SHALL answer: what do we know, what are
  we assuming, what remains unresolved, and what should the municipality do next.
- THE SYSTEM SHALL derive copied text and printed output from the same source so
  they agree on selected facility, snapshot, assumptions, and values.

### R5 — Illustrative scenario
- THE SYSTEM SHALL label the capacity calculator as an illustrative scenario and
  SHALL keep reported source capacity separate from editable assumptions.
- THE SYSTEM SHALL NOT claim verified EJ households served, guaranteed savings, or
  actual grid-peak contribution.
- WHEN a record's reported technology is not solar THE SYSTEM SHALL NOT apply
  solar generation/subscriber assumptions to it.

### R6 — Inspector reliability
- WHEN a live request exceeds its timeout THE SYSTEM SHALL abort it and show a
  truthful error state.
- WHEN a newer request supersedes an in-flight one THE SYSTEM SHALL ignore the
  stale response.
- WHEN the transmission overlay is toggled THE SYSTEM SHALL fetch exactly once
  per (enabled, anchor) and SHALL NOT cancel its own result by changing loading
  status.
- WHEN an external service fails THE SYSTEM SHALL CONTINUE TO allow the local
  workflow (brief, compare, checklist) to function.

### R7 — Print fidelity
- WHEN a user prints a brief THE SYSTEM SHALL render the selected facility,
  snapshot, assumptions, and values without being clipped by the drawer/modal.

### R8 — Identity independence
- THE SYSTEM SHALL keep the two Norfolk records independent across selection,
  comparison, checklist, and export.
