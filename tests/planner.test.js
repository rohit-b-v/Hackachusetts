import { describe, it, expect, beforeEach } from "vitest";
import { buildEvidencePacket, packetIdSet } from "../src/lib/evidencePacket.js";
import { validatePlan, PROMPT_VERSION } from "../src/lib/planSchema.js";
import { buildTemplatePlan } from "../src/lib/templatePlan.js";
import { handlePlanRequest, __testing } from "../server/planHandler.js";

// --- Fixtures: two facilities with meaningfully different evidence ----------

const SPRINGFIELD = {
  facility_id: "fac_springfield_01",
  municipality: "SPRINGFIELD",
  town_key: "SPRINGFIELD",
  clean_town: "SPRINGFIELD",
  facility: "Crane Foundry Sand Landfill",
  type: "Solar",
  mw_permitted: 3.5,
  mw_operating: null,
  status: "Permitted",
  operating_since: null,
  elec: "Eversource Energy (NSTAR Electric)",
  elec_label: "NSTAR Electric d/b/a Eversource Energy",
  ej_block_group_count: 122,
  min_bg_mhhi: 11731,
  max_lim_eng_pct: 59.2,
  max_minority_pct: 97.0,
  ej_criteria_summary: ["Minority", "Minority and income"],
};

const BARNSTABLE = {
  facility_id: "fac_barnstable_01",
  municipality: "BARNSTABLE",
  town_key: "BARNSTABLE",
  clean_town: "BARNSTABLE",
  facility: "Barnstable Municipal LF",
  type: "Solar",
  mw_permitted: 4,
  mw_operating: 4,
  status: "Operating",
  operating_since: "2014-09-30",
  elec: "Eversource Energy (NSTAR Electric)",
  elec_label: "NSTAR Electric d/b/a Eversource Energy",
  ej_block_group_count: 11,
  min_bg_mhhi: 54000,
  max_lim_eng_pct: 2.1,
  max_minority_pct: 30.0,
  ej_criteria_summary: ["Minority"],
};

const VERIFIED_SPATIAL = {
  identity: { status: "verified" },
  primary: { verified: true },
  proximity: { inside: false, distanceMiles: 0.87 },
  ejSearch: { scope: "bounded-radius", radiusMiles: 5, complete: true, count: 11 },
};

const NO_GEOMETRY_SPATIAL = {
  identity: { status: "ambiguous" },
  primary: null,
  proximity: null,
  ejSearch: { scope: "bounded-radius", radiusMiles: 5, complete: true, count: 7 },
};

function noCreds() {
  return false;
}
function withCreds() {
  return true;
}

// Wrap a plan object in the Google AI Studio (Gemini) generateContent response
// shape: candidates[0].content.parts[].text.
function gemmaResponse(plan) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }],
      usageMetadata: { totalTokenCount: 123 },
    }),
  };
}

// A fake Gemma fetch returning a valid plan referencing only real IDs.
function fakeGemmaValid() {
  return async () => {
    // We don't know the packet here; build a plan from well-known IDs that
    // always exist in the packet.
    const plan = {
      selected_facts: [
        { id: "F_STATUS", relevance: "frames next step" },
        { id: "F_UTILITY", relevance: "who to contact" },
      ],
      actions: [
        {
          title: "Check grant eligibility",
          why_it_matters: "status alone does not confer eligibility",
          owner_role: "Town Sustainability Manager",
          needed_document: "eligibility determination",
          evidence_ids: ["U_GRANT_ELIGIBILITY", "F_STATUS"],
        },
        {
          title: "Ask utility about interconnection",
          why_it_matters: "capacity unknown",
          owner_role: "Electric Utility (interconnection)",
          needed_document: "hosting capacity answer",
          evidence_ids: ["U_INTERCONNECTION"],
        },
        {
          title: "Verify proximity",
          why_it_matters: "equity claim needs proof",
          owner_role: "Municipal Energy Committee",
          needed_document: "coordinates",
          evidence_ids: ["F_EJ_BG_COUNT"],
        },
      ],
      questions: [
        { audience: "municipal", question: "What has the town tried?" },
        { audience: "utility", question: "What is the hosting capacity?" },
        { audience: "developer", question: "What unblocks this?" },
      ],
    };
    return gemmaResponse(plan);
  };
}

// A fake Gemma fetch returning a plan with a BAD evidence id.
async function fakeGemmaBadId() {
  const plan = {
    selected_facts: [{ id: "F_STATUS", relevance: "x" }],
    actions: [
      {
        title: "a",
        why_it_matters: "b",
        owner_role: "Town Sustainability Manager",
        needed_document: "d",
        evidence_ids: ["F_DOES_NOT_EXIST"],
      },
      {
        title: "a2",
        why_it_matters: "b2",
        owner_role: "Electric Utility (interconnection)",
        needed_document: "d2",
        evidence_ids: ["U_INTERCONNECTION"],
      },
      {
        title: "a3",
        why_it_matters: "b3",
        owner_role: "Municipal Energy Committee",
        needed_document: "d3",
        evidence_ids: ["F_EJ_BG_COUNT"],
      },
    ],
    questions: [
      { audience: "municipal", question: "q1" },
      { audience: "utility", question: "q2" },
      { audience: "developer", question: "q3" },
    ],
  };
  return gemmaResponse(plan);
}

// A fake Gemma fetch that always errors (simulate API failure).
async function fakeGemmaError() {
  return { ok: false, status: 500, text: async () => "boom" };
}

beforeEach(() => {
  __testing.cache.clear();
  delete process.env.GEMMA_MODEL;
});

describe("evidence packet", () => {
  it("gives every fact and unknown an ID and a stable hash", () => {
    const p = buildEvidencePacket({ record: SPRINGFIELD, spatial: VERIFIED_SPATIAL });
    expect(p.facts.every((f) => typeof f.id === "string")).toBe(true);
    expect(p.unknowns.every((u) => typeof u.id === "string")).toBe(true);
    expect(p.hash).toMatch(/^[0-9a-f]{16}$/);
    // Determinism
    const p2 = buildEvidencePacket({ record: SPRINGFIELD, spatial: VERIFIED_SPATIAL });
    expect(p2.hash).toBe(p.hash);
  });

  it("keeps missing geometry as an UNKNOWN (never a guessed fact)", () => {
    const p = buildEvidencePacket({ record: BARNSTABLE, spatial: NO_GEOMETRY_SPATIAL });
    const ids = packetIdSet(p);
    expect(ids.has("U_PROXIMITY")).toBe(true);
    expect(p.facts.find((f) => f.id === "F_PROXIMITY")).toBeUndefined();
  });

  it("includes guardrail unknowns that must not be inferred", () => {
    const p = buildEvidencePacket({ record: SPRINGFIELD, spatial: VERIFIED_SPATIAL });
    const ids = packetIdSet(p);
    for (const id of [
      "U_GRANT_ELIGIBILITY",
      "U_INTERCONNECTION",
      "U_STORAGE_FEASIBILITY",
      "U_SUBSCRIBER_BENEFIT",
      "U_LEGAL_REQUIREMENTS",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("two different facilities produce different evidence hashes", () => {
    const a = buildEvidencePacket({ record: SPRINGFIELD, spatial: VERIFIED_SPATIAL });
    const b = buildEvidencePacket({ record: BARNSTABLE, spatial: VERIFIED_SPATIAL });
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("validatePlan rejects dangling IDs", () => {
  it("rejects a plan referencing an unknown evidence id", () => {
    const p = buildEvidencePacket({ record: SPRINGFIELD, spatial: VERIFIED_SPATIAL });
    const validIds = packetIdSet(p);
    const bad = {
      selected_facts: [{ id: "F_STATUS", relevance: "x" }],
      actions: [
        { title: "a", why_it_matters: "b", owner_role: "Town Sustainability Manager", needed_document: "d", evidence_ids: ["F_NOPE"] },
        { title: "a", why_it_matters: "b", owner_role: "Town Sustainability Manager", needed_document: "d", evidence_ids: ["F_STATUS"] },
        { title: "a", why_it_matters: "b", owner_role: "Town Sustainability Manager", needed_document: "d", evidence_ids: ["F_STATUS"] },
      ],
      questions: [
        { audience: "municipal", question: "q" },
        { audience: "utility", question: "q" },
        { audience: "developer", question: "q" },
      ],
    };
    const res = validatePlan(bad, validIds);
    expect(res.ok).toBe(false);
    expect(res.badIds).toContain("F_NOPE");
  });

  it("accepts the deterministic template plan (self-consistent IDs)", () => {
    const p = buildEvidencePacket({ record: SPRINGFIELD, spatial: VERIFIED_SPATIAL });
    const res = validatePlan(buildTemplatePlan(p), packetIdSet(p));
    expect(res.ok).toBe(true);
  });
});

describe("template plans differ by facility evidence", () => {
  it("permitted vs operating produce different first actions", () => {
    const sp = buildTemplatePlan(buildEvidencePacket({ record: SPRINGFIELD, spatial: VERIFIED_SPATIAL }));
    const ba = buildTemplatePlan(buildEvidencePacket({ record: BARNSTABLE, spatial: VERIFIED_SPATIAL }));
    expect(sp.actions[0].title).not.toBe(ba.actions[0].title);
    expect(sp.actions[0].owner_role).not.toBe(ba.actions[0].owner_role);
  });
});

describe("handlePlanRequest", () => {
  it("returns labeled template when no credentials", async () => {
    const { status, body } = await handlePlanRequest(
      { record: SPRINGFIELD, spatial: VERIFIED_SPATIAL },
      { hasCredentials: noCreds }
    );
    expect(status).toBe(200);
    expect(body.source).toBe("template");
    expect(body.label).toBe("Template-generated");
    expect(body.reason).toBe("no_credentials");
    expect(body.prompt_version).toBe(PROMPT_VERSION);
  });

  it("returns live plan from (fake) Gemma and caches by hash+model+prompt", async () => {
    const first = await handlePlanRequest(
      { record: SPRINGFIELD, spatial: VERIFIED_SPATIAL },
      { hasCredentials: withCreds, fetchImpl: fakeGemmaValid() }
    );
    expect(first.body.source).toBe("live");
    expect(first.body.label).toBe("Gemma");
    expect(first.body.model).toBe("gemma-3-27b-it");

    // Second call with a fetch that would throw -> must be served from cache.
    const second = await handlePlanRequest(
      { record: SPRINGFIELD, spatial: VERIFIED_SPATIAL },
      {
        hasCredentials: withCreds,
        fetchImpl: async () => {
          throw new Error("should not be called");
        },
      }
    );
    expect(second.body.source).toBe("cache");
    expect(second.body.cached).toBe(true);
  });

  it("falls back to labeled template when Gemma output has a bad ID", async () => {
    const { body } = await handlePlanRequest(
      { record: SPRINGFIELD, spatial: VERIFIED_SPATIAL },
      { hasCredentials: withCreds, fetchImpl: fakeGemmaBadId }
    );
    expect(body.source).toBe("template");
    expect(body.reason).toBe("validation_failed");
    expect(body.validation_errors.join(" ")).toMatch(/F_DOES_NOT_EXIST/);
  });

  it("falls back to labeled template on API failure", async () => {
    const { body } = await handlePlanRequest(
      { record: BARNSTABLE, spatial: VERIFIED_SPATIAL },
      { hasCredentials: withCreds, fetchImpl: fakeGemmaError }
    );
    expect(body.source).toBe("template");
    expect(body.reason).toBe("api_error");
    expect(body.label).toBe("Template-generated");
  });

  it("missing geometry remains unknown through the whole pipeline", async () => {
    const { body } = await handlePlanRequest(
      { record: BARNSTABLE, spatial: NO_GEOMETRY_SPATIAL },
      { hasCredentials: noCreds }
    );
    const ids = body.packet.facts.map((f) => f.id);
    expect(ids).not.toContain("F_PROXIMITY");
    expect(body.packet.unknowns.map((u) => u.id)).toContain("U_PROXIMITY");
  });

  it("rejects a request with no record", async () => {
    const { status, body } = await handlePlanRequest({}, { hasCredentials: noCreds });
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("never leaks the API key in the response body", async () => {
    process.env.GEMMA_API_KEY = "AIza-SECRET-TEST-KEY";
    const { body } = await handlePlanRequest(
      { record: SPRINGFIELD, spatial: VERIFIED_SPATIAL },
      { hasCredentials: withCreds, fetchImpl: fakeGemmaValid() }
    );
    const json = JSON.stringify(body);
    expect(json).not.toContain("AIza-SECRET-TEST-KEY");
    delete process.env.GEMMA_API_KEY;
  });
});
