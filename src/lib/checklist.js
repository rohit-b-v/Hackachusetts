// Local, per-facility next-action checklist persistence.
//
// Stored in localStorage keyed by facility_id. This is a PLANNING aid only:
// user-marked completion is NOT official project verification, and the UI must
// say so. State is namespaced per facility_id so entries never leak between
// facilities (the two Norfolk records have distinct IDs and distinct state).

const STORAGE_KEY = "c2c.checklist.v1";

export const TASK_STATUSES = ["todo", "in_progress", "done", "blocked"];

export const OWNER_ROLES = [
  "Town Sustainability Manager",
  "Municipal Energy Committee",
  "Town Counsel / Legal",
  "Electric Utility (interconnection)",
  "Community Solar Developer",
  "DOER / State Program Office",
];

function safeParse(raw) {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/** Read the entire store ({ [facilityId]: { items: [...] } }). */
function readStore() {
  if (typeof localStorage === "undefined") return {};
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

function writeStore(store) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / privacy mode — fail silently, UI still works in-memory */
  }
}

/** Get the checklist for one facility, or an empty list. */
export function getChecklist(facilityId) {
  if (!facilityId) return [];
  const store = readStore();
  const entry = store[facilityId];
  return entry && Array.isArray(entry.items) ? entry.items : [];
}

/** Replace the checklist for one facility (only that key is touched). */
export function setChecklist(facilityId, items) {
  if (!facilityId) return;
  const store = readStore();
  store[facilityId] = { items: Array.isArray(items) ? items : [], updated_at: Date.now() };
  writeStore(store);
}

let idSeq = 0;
function makeItemId() {
  idSeq += 1;
  return `task_${Date.now().toString(36)}_${idSeq}`;
}

/**
 * Seed a checklist from an action plan (Gemma/template) if the facility has no
 * saved items yet. Never overwrites existing user edits.
 */
export function seedFromPlan(facilityId, plan) {
  if (!facilityId || !plan || !Array.isArray(plan.actions)) return getChecklist(facilityId);
  const existing = getChecklist(facilityId);
  if (existing.length > 0) return existing;
  const items = plan.actions.map((a) => ({
    id: makeItemId(),
    title: a.title,
    owner_role: a.owner_role || OWNER_ROLES[0],
    requested_evidence: a.needed_document || "",
    status: "todo",
    note: "",
    source: "plan",
  }));
  setChecklist(facilityId, items);
  return items;
}

/** Add a blank item. */
export function makeBlankItem(partial = {}) {
  return {
    id: makeItemId(),
    title: partial.title || "",
    owner_role: partial.owner_role || OWNER_ROLES[0],
    requested_evidence: partial.requested_evidence || "",
    status: partial.status || "todo",
    note: partial.note || "",
    source: partial.source || "user",
  };
}
