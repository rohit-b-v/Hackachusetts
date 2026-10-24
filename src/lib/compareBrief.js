// Build the exported "Compare & plan" brief as structured sections and as a
// plain-text/Markdown rendering. Both the on-screen copy and the printed page
// derive from THIS single structure, so they cannot disagree.
//
// The brief answers four questions for each facility:
//   1. What do we know?        (supported facts)
//   2. What are we assuming?   (illustrative scenario inputs/outputs)
//   3. What remains unresolved?(unknowns + unverified spatial)
//   4. What should we do next? (plan actions + user checklist)

import { formatCurrency } from "./format.js";
import { isSolarRecord, sourceCapacity } from "./scenario.js";

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/#(\d)/g, "#$1");
}

function factVal(packet, id) {
  const f = (packet.facts || []).find((x) => x.id === id);
  return f ? f.value : null;
}

/**
 * Build the structured brief for one facility.
 * @param {object} args { record, packet, plan, scenario, checklist }
 */
export function buildFacilityBrief({ record, packet, plan, scenario, checklist }) {
  const know = [];
  const assume = [];
  const unresolved = [];
  const next = [];

  // 1. KNOW — supported facts with values present.
  for (const f of packet.facts) {
    if (f.value === null || f.value === undefined || f.value === "") continue;
    know.push({ id: f.id, label: f.label, value: String(f.value) });
  }

  // 2. ASSUME — scenario only when it applies (solar + capacity + run).
  const solar = isSolarRecord(record);
  const src = sourceCapacity(record);
  if (!solar) {
    assume.push({
      label: "Illustrative scenario",
      value: `Not applied — reported technology is "${record.type || "unknown"}", not solar.`,
    });
  } else if (scenario && scenario.applied) {
    assume.push({
      label: "Source capacity (reported, read-only)",
      value: src ? `${src.mw} MW (${src.basis})` : "no reported capacity",
    });
    assume.push({
      label: "Assumed capacity (editable)",
      value: `${scenario.assumedMw} MW${scenario.bess ? " + illustrative 4-hr storage" : ""}`,
    });
    assume.push({
      label: "Illustrative annual generation",
      value: `${Math.round(scenario.annualGenMwh).toLocaleString()} MWh/yr (assumption-based)`,
    });
    assume.push({
      label: "Illustrative subscriber scale",
      value: `~${scenario.illustrativeHouseholds.toLocaleString()} households at ~${formatCurrency(
        scenario.savingsPerHouseholdYr
      )}/yr each (illustrative, not verified)`,
    });
    if (scenario.bess) {
      assume.push({
        label: "Illustrative dispatchable capacity",
        value: `${scenario.illustrativeDispatchMw.toFixed(2)} MW (illustrative, not an actual grid-peak commitment)`,
      });
    }
  } else {
    assume.push({
      label: "Illustrative scenario",
      value: "Not run for this facility.",
    });
  }

  // 3. UNRESOLVED — every unknown in the packet.
  for (const u of packet.unknowns) {
    unresolved.push({ id: u.id, question: u.question, note: u.note || "" });
  }

  // 4. NEXT — plan actions + user checklist (clearly a planning aid).
  if (plan && Array.isArray(plan.actions)) {
    plan.actions.forEach((a, i) => {
      next.push({
        kind: "plan",
        n: i + 1,
        title: a.title,
        why: a.why_it_matters,
        owner: a.owner_role,
        document: a.needed_document,
        source: plan.__source || "plan",
      });
    });
  }
  if (Array.isArray(checklist)) {
    checklist.forEach((t) => {
      next.push({
        kind: "checklist",
        title: t.title,
        owner: t.owner_role,
        document: t.requested_evidence,
        status: t.status,
        note: t.note,
      });
    });
  }

  return {
    facility_id: record.facility_id,
    title: `${titleCase(record.municipality)} — ${record.facility}`,
    status: record.status,
    snapshot_dates: packet.meta?.snapshot_dates || {},
    evidence_hash: packet.hash,
    plan_source: plan?.__source || null,
    know,
    assume,
    unresolved,
    next,
  };
}

/** Render one or more facility briefs to plain text / Markdown. */
export function renderBriefText(briefs) {
  const out = [];
  out.push(`# Cap-to-Community — Compare & Plan Brief`);
  out.push(
    `Generated ${new Date().toISOString()} · snapshots: ${formatSnapshots(briefs[0]?.snapshot_dates)}`
  );
  out.push(
    `NOTE: Reported values are from dataset snapshots. Illustrative figures are ` +
      `assumption-based and NOT verified outcomes. User checklist completion is a ` +
      `planning aid, not official project verification.`
  );
  out.push("");

  for (const b of briefs) {
    out.push(`---`);
    out.push(`## ${b.title}`);
    out.push(`Reported status: ${b.status}`);
    if (b.plan_source) out.push(`Plan source: ${b.plan_source}`);
    out.push(`Evidence hash: ${b.evidence_hash}`);
    out.push("");

    out.push(`### 1. What do we know? (reported)`);
    for (const k of b.know) out.push(`- [${k.id}] ${k.label}: ${k.value}`);
    out.push("");

    out.push(`### 2. What are we assuming? (illustrative, not verified)`);
    for (const a of b.assume) out.push(`- ${a.label}: ${a.value}`);
    out.push("");

    out.push(`### 3. What remains unresolved?`);
    for (const u of b.unresolved) out.push(`- [${u.id}] ${u.question}`);
    out.push("");

    out.push(`### 4. What should the municipality do next?`);
    for (const n of b.next) {
      if (n.kind === "plan") {
        out.push(
          `- (plan ${n.n}) ${n.title} — owner: ${n.owner}; needs: ${n.document}`
        );
      } else {
        out.push(
          `- (checklist · ${n.status}) ${n.title} — owner: ${n.owner}; evidence: ${
            n.document || "—"
          }${n.note ? `; note: ${n.note}` : ""}`
        );
      }
    }
    out.push("");
  }
  return out.join("\n");
}

function formatSnapshots(dates) {
  if (!dates) return "n/a";
  return Object.entries(dates)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}
