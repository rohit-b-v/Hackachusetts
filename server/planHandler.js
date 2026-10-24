// Server-side next-action planner handler (framework-agnostic).
//
// Runtime AI provider: Google AI Studio (Gemini API) serving Gemma.
//   - Endpoint: generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
//   - Auth: `x-goog-api-key` header (Google AI Studio API key)
//   - Model: GEMMA_MODEL (default gemma-3-27b-it)
//   Docs: https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
//
// Secrets stay here: GEMMA_API_KEY / GEMMA_MODEL are read from process.env and
// never returned to the client. The client posts the selected record + spatial
// result; the SERVER rebuilds the canonical evidence packet so authoritative
// facts are not trusted from the browser.
//
// Behavior (unchanged across the provider swap):
//   - cache keyed by (evidence hash, model, prompt version); bounded size
//   - bounded request body + bounded model retries
//   - deterministic template fallback (labeled) when Gemma is unavailable or
//     returns output that fails schema/ID validation
//   - response labels source: "live" | "cache" | "template"

import { buildEvidencePacket, packetIdSet } from "../src/lib/evidencePacket.js";
import { validatePlan, PROMPT_VERSION, OUTPUT_SHAPE, OWNER_ROLES } from "../src/lib/planSchema.js";
import { buildTemplatePlan } from "../src/lib/templatePlan.js";

// Google AI Studio (Gemini API) base. The model ID is interpolated per request.
const GEMMA_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
// Default to a real, documented Gemma model on Google AI Studio. Override with
// GEMMA_MODEL to use a different documented size (e.g. gemma-3-12b-it).
const DEFAULT_MODEL = "gemma-3-27b-it";
const MAX_RETRIES = 2; // total model attempts = 1 + MAX_RETRIES
const CACHE_MAX = 200;
const MAX_BODY_BYTES = 256 * 1024; // 256 KB request cap

// Simple bounded LRU-ish cache.
const cache = new Map();
function cacheGet(key) {
  if (!cache.has(key)) return null;
  const v = cache.get(key);
  cache.delete(key);
  cache.set(key, v); // refresh recency
  return v;
}
function cacheSet(key, value) {
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function modelName() {
  return process.env.GEMMA_MODEL || DEFAULT_MODEL;
}
function hasCredentials() {
  return Boolean(process.env.GEMMA_API_KEY);
}

function buildPrompt(packet) {
  const factLines = packet.facts
    .map((f) => `  ${f.id}: ${f.label} = ${JSON.stringify(f.value)}${f.note ? ` (note: ${f.note})` : ""}`)
    .join("\n");
  const unknownLines = packet.unknowns
    .map((u) => `  ${u.id}: ${u.question}${u.note ? ` (note: ${u.note})` : ""}`)
    .join("\n");

  const system = [
    "You are a municipal clean-energy planning analyst for Massachusetts capped-landfill solar projects.",
    "You help town staff decide the NEXT investigation steps. You do NOT make determinations.",
    "",
    "HARD RULES:",
    "- Use ONLY the evidence IDs provided. Never invent facts or numbers.",
    "- Every evidence_ids entry MUST be an ID from the FACTS or UNKNOWNS lists below.",
    "- NEVER infer grant eligibility, interconnection/hosting capacity, storage feasibility,",
    "  subscriber benefits, or legal requirements from status or proximity alone. Treat those as",
    "  open questions to investigate (they are provided as U_* unknowns).",
    "- Prefer actions that RESOLVE an unknown. Explain why each matters for THIS facility.",
    `- owner_role must be one of: ${OWNER_ROLES.join(" | ")}.`,
    "- Return ONLY minified JSON matching the shape. No prose, no markdown fences.",
  ].join("\n");

  const user = [
    `FACILITY_ID: ${packet.facility_id}`,
    `MUNICIPALITY: ${packet.meta?.municipality}`,
    `SNAPSHOT_DATES: ${JSON.stringify(packet.meta?.snapshot_dates || {})}`,
    "",
    "FACTS (supported; reference by ID):",
    factLines,
    "",
    "UNKNOWNS (open questions; reference by ID):",
    unknownLines,
    "",
    "Return JSON with exactly this shape:",
    JSON.stringify(OUTPUT_SHAPE),
    "",
    "Requirements: selected_facts = the most relevant SUPPORTED facts (ids from FACTS only);",
    "actions = exactly 3 prioritized next investigation actions; questions = exactly 3.",
  ].join("\n");

  // Gemma on the Gemini API has no separate system role, so fold the system
  // instructions and the user content into one prompt string.
  const combined = `${system}\n\n---\n\n${user}`;
  return { system, user, combined };
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  // Strip accidental markdown fences.
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(fenced);
  } catch {
    // Fall back to first {...} block.
    const m = fenced.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Call Gemma via the Google AI Studio (Gemini) generateContent endpoint.
 * Request/response per https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
 */
async function callGemma(packet, { fetchImpl = fetch, signalTimeoutMs = 20000 } = {}) {
  const { combined } = buildPrompt(packet);
  const model = modelName();
  const url = `${GEMMA_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), signalTimeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Google AI Studio API key auth (server-side only).
          "x-goog-api-key": process.env.GEMMA_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: combined }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(t);

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Gemma HTTP ${res.status}`);
        await sleep(250 * (attempt + 1));
        continue; // retry on transient errors
      }
      if (!res.ok) {
        // Non-retryable (4xx other than 429): surface and stop.
        const txt = await safeText(res);
        throw new Error(`Gemma HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      // Gemini response: candidates[].content.parts[].text
      const parts = json?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("")
        : "";
      return { text, model, usage: json.usageMetadata || null };
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr || new Error("Gemma call failed");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Core handler. Accepts a parsed request body and returns { status, body }.
 * `deps` allows tests to inject a fake fetch and force credential state.
 */
export async function handlePlanRequest(body, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const credentials = deps.hasCredentials ? deps.hasCredentials() : hasCredentials();

  if (!body || typeof body !== "object" || !body.record) {
    return { status: 400, body: { error: "Missing 'record' in request body." } };
  }

  // Rebuild the canonical packet SERVER-SIDE (don't trust client facts).
  const packet = buildEvidencePacket({
    record: body.record,
    spatial: body.spatial || null,
    manifest: body.manifest || null,
  });
  const validIds = packetIdSet(packet);
  const model = modelName();
  const cacheKey = `${packet.hash}::${model}::${PROMPT_VERSION}`;

  // Cache hit?
  const cached = cacheGet(cacheKey);
  if (cached) {
    return {
      status: 200,
      body: {
        ...cached,
        source: "cache",
        cached: true,
        evidence_hash: packet.hash,
        model,
        prompt_version: PROMPT_VERSION,
        packet,
      },
    };
  }

  // No credentials -> deterministic template, clearly labeled.
  if (!credentials) {
    const plan = buildTemplatePlan(packet);
    const payload = {
      plan,
      source: "template",
      label: "Template-generated",
      reason: "no_credentials",
      evidence_hash: packet.hash,
      model,
      prompt_version: PROMPT_VERSION,
      packet,
    };
    // Cache template results too (keyed identically) so repeat calls are fast.
    cacheSet(cacheKey, { plan, label: "Template-generated", reason: "no_credentials" });
    return { status: 200, body: payload };
  }

  // Live Gemma attempt with validation + fallback.
  try {
    const { text, usage } = await callGemma(packet, { fetchImpl });
    const parsed = extractJson(text);
    const result = validatePlan(parsed, validIds);
    if (!result.ok) {
      const plan = buildTemplatePlan(packet);
      return {
        status: 200,
        body: {
          plan,
          source: "template",
          label: "Template-generated",
          reason: "validation_failed",
          validation_errors: result.errors.slice(0, 8),
          evidence_hash: packet.hash,
          model,
          prompt_version: PROMPT_VERSION,
          packet,
        },
      };
    }
    cacheSet(cacheKey, {
      plan: result.plan,
      label: "Gemma",
      reason: "live",
      usage,
    });
    return {
      status: 200,
      body: {
        plan: result.plan,
        source: "live",
        label: "Gemma",
        reason: "live",
        usage,
        evidence_hash: packet.hash,
        model,
        prompt_version: PROMPT_VERSION,
        packet,
      },
    };
  } catch (err) {
    // API failure -> labeled working fallback.
    const plan = buildTemplatePlan(packet);
    return {
      status: 200,
      body: {
        plan,
        source: "template",
        label: "Template-generated",
        reason: "api_error",
        error_detail: String(err && err.message ? err.message : err).slice(0, 200),
        evidence_hash: packet.hash,
        model,
        prompt_version: PROMPT_VERSION,
        packet,
      },
    };
  }
}

export const __testing = { buildPrompt, extractJson, cache, modelName };
