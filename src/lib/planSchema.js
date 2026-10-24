// Structured output contract for the next-action plan + validation.
//
// The model (Gemma) must return JSON matching this shape. We validate types AND that every
// referenced evidence ID actually exists in the canonical packet. Any dangling
// ID -> the whole plan is rejected (caller falls back to the template).

export const PROMPT_VERSION = "plan-v1";

export const OWNER_ROLES = [
  "Town Sustainability Manager",
  "Municipal Energy Committee",
  "Town Counsel / Legal",
  "Electric Utility (interconnection)",
  "Community Solar Developer",
  "DOER / State Program Office",
];

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Validate a plan object against the schema and a packet's valid ID set.
 *
 * @param {object} plan     parsed JSON from the model
 * @param {Set<string>} validIds  all IDs present in the evidence packet
 * @returns {{ ok: true, plan } | { ok: false, errors: string[] }}
 */
export function validatePlan(plan, validIds) {
  const errors = [];
  const badIds = [];

  const checkIds = (ids, where) => {
    if (!Array.isArray(ids)) {
      errors.push(`${where}: evidence_ids must be an array`);
      return;
    }
    for (const id of ids) {
      if (!isNonEmptyString(id)) {
        errors.push(`${where}: evidence id must be a non-empty string`);
      } else if (!validIds.has(id)) {
        badIds.push(id);
        errors.push(`${where}: references unknown evidence id "${id}"`);
      }
    }
  };

  if (!plan || typeof plan !== "object") {
    return { ok: false, errors: ["plan is not an object"], badIds };
  }

  // selected_facts: array of { id, why } referencing supported fact IDs.
  if (!Array.isArray(plan.selected_facts) || plan.selected_facts.length === 0) {
    errors.push("selected_facts must be a non-empty array");
  } else {
    plan.selected_facts.forEach((f, i) => {
      if (!f || typeof f !== "object") {
        errors.push(`selected_facts[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(f.id)) errors.push(`selected_facts[${i}].id required`);
      else if (!validIds.has(f.id)) {
        badIds.push(f.id);
        errors.push(`selected_facts[${i}] unknown id "${f.id}"`);
      }
      if (!isNonEmptyString(f.relevance))
        errors.push(`selected_facts[${i}].relevance required`);
    });
  }

  // actions: exactly 3 prioritized next investigation actions.
  if (!Array.isArray(plan.actions) || plan.actions.length !== 3) {
    errors.push("actions must be an array of exactly 3 items");
  } else {
    plan.actions.forEach((a, i) => {
      if (!a || typeof a !== "object") {
        errors.push(`actions[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(a.title)) errors.push(`actions[${i}].title required`);
      if (!isNonEmptyString(a.why_it_matters))
        errors.push(`actions[${i}].why_it_matters required`);
      if (!isNonEmptyString(a.owner_role))
        errors.push(`actions[${i}].owner_role required`);
      if (!isNonEmptyString(a.needed_document))
        errors.push(`actions[${i}].needed_document required`);
      checkIds(a.evidence_ids, `actions[${i}]`);
    });
  }

  // questions: 3 useful questions for municipal/developer/utility staff.
  if (!Array.isArray(plan.questions) || plan.questions.length !== 3) {
    errors.push("questions must be an array of exactly 3 items");
  } else {
    plan.questions.forEach((q, i) => {
      if (!q || typeof q !== "object") {
        errors.push(`questions[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(q.audience))
        errors.push(`questions[${i}].audience required`);
      if (!isNonEmptyString(q.question))
        errors.push(`questions[${i}].question required`);
    });
  }

  if (errors.length) return { ok: false, errors, badIds: [...new Set(badIds)] };
  return { ok: true, plan };
}

/** JSON shape description embedded in the prompt so the model returns valid JSON. */
export const OUTPUT_SHAPE = {
  selected_facts: [{ id: "F_...", relevance: "why this supported fact matters" }],
  actions: [
    {
      title: "short action title",
      why_it_matters: "why this matters for THIS facility",
      owner_role: `one of: ${OWNER_ROLES.join(" | ")}`,
      needed_document: "the document or answer required",
      evidence_ids: ["F_... or U_... that this action addresses"],
    },
  ],
  questions: [
    { audience: "municipal | developer | utility", question: "a concrete question" },
  ],
};
