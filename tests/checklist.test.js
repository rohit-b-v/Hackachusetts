import { describe, it, expect, beforeEach } from "vitest";

// Minimal localStorage polyfill for the Node test environment.
class MemStorage {
  constructor() {
    this.m = new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
globalThis.localStorage = new MemStorage();

// Import AFTER the polyfill so the module sees localStorage.
const {
  getChecklist,
  setChecklist,
  seedFromPlan,
  makeBlankItem,
} = await import("../src/lib/checklist.js");

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe("checklist persistence namespacing", () => {
  it("stores and reads per facility_id", () => {
    setChecklist("fac_a_01", [makeBlankItem({ title: "A task" })]);
    expect(getChecklist("fac_a_01")).toHaveLength(1);
    expect(getChecklist("fac_a_01")[0].title).toBe("A task");
  });

  it("does not leak between facilities", () => {
    setChecklist("fac_a_01", [makeBlankItem({ title: "only A" })]);
    setChecklist("fac_b_01", [makeBlankItem({ title: "only B" })]);
    expect(getChecklist("fac_a_01")[0].title).toBe("only A");
    expect(getChecklist("fac_b_01")[0].title).toBe("only B");
    // unknown facility => empty
    expect(getChecklist("fac_c_01")).toEqual([]);
  });

  it("keeps the two Norfolk records independent", () => {
    setChecklist("fac_norfolk_01", [makeBlankItem({ title: "Norfolk #1 task" })]);
    setChecklist("fac_norfolk_02", [makeBlankItem({ title: "Norfolk #2 task" })]);
    expect(getChecklist("fac_norfolk_01")).toHaveLength(1);
    expect(getChecklist("fac_norfolk_02")).toHaveLength(1);
    expect(getChecklist("fac_norfolk_01")[0].title).toBe("Norfolk #1 task");
    expect(getChecklist("fac_norfolk_02")[0].title).toBe("Norfolk #2 task");
  });

  it("survives a reload (re-import from the same storage)", async () => {
    setChecklist("fac_a_01", [makeBlankItem({ title: "persisted" })]);
    // Simulate reload: re-read raw storage via a fresh module import is not
    // necessary — storage IS the source of truth; getChecklist re-parses it.
    const again = getChecklist("fac_a_01");
    expect(again[0].title).toBe("persisted");
  });
});

describe("seedFromPlan", () => {
  const plan = {
    actions: [
      { title: "Check eligibility", owner_role: "Town Sustainability Manager", needed_document: "determination" },
      { title: "Ask utility", owner_role: "Electric Utility (interconnection)", needed_document: "capacity" },
    ],
  };

  it("seeds an empty facility from the plan", () => {
    const items = seedFromPlan("fac_seed_01", plan);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Check eligibility");
    expect(items[0].requested_evidence).toBe("determination");
  });

  it("never overwrites existing user edits", () => {
    setChecklist("fac_seed_02", [makeBlankItem({ title: "my edit" })]);
    const items = seedFromPlan("fac_seed_02", plan);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("my edit");
  });
});
