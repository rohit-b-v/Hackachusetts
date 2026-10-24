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
// Default to a real, documented Gemma model on Google AI Studio. Verified
// 2026-10-24 via ListModels that this key's generateContent-capable Gemma models
// are gemma-4-26b-a4b-it and gemma-4-31b-it (the older gemma-3-27b-it returns
// HTTP 404 "not supported for generateContent"). Override with GEMMA_MODEL.
const DEFAULT_MODEL = "gemma-4-26b-a4b-it";
const MAX_RETRIES = 1; // total model attempts = 1 + MAX_RETRIES
// Gemma-4 models take ~25s for a full planning generation, so the per-attempt
// abort must be well above that (Gemma-3 answered in a few seconds). Worst case
// here is (1 + MAX_RETRIES) * GEMMA_TIMEOUT_MS; keep retries low to bound it.
const GEMMA_TIMEOUT_MS = 60000;
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

/**
 * Scan for the first BALANCED top-level JSON object, ignoring braces inside
 * strings. More robust than a greedy /\{[\s\S]*\}/ when the model wraps the
 * JSON in prose (Gemma-4 may prepend a "thinking" preamble).
 */
function firstBalancedObject(s) {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * If the model wrapped the plan object in a single-element array
 * (Gemma-4 sometimes returns `[{...}]`), unwrap it to the object.
 */
function unwrapPlan(parsed) {
  if (Array.isArray(parsed) && parsed.length >= 1 && parsed[0] && typeof parsed[0] === "object") {
    return parsed[0];
  }
  return parsed;
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  // Strip accidental markdown fences.
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return unwrapPlan(JSON.parse(fenced));
  } catch {
    // Fall back to the first balanced {...} block (tolerates a prose preamble
    // and trailing commentary around the JSON).
    const block = firstBalancedObject(fenced);
    if (block) {
      try {
        return JSON.parse(block);
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
async function callGemma(packet, { fetchImpl = fetch, signalTimeoutMs = GEMMA_TIMEOUT_MS } = {}) {
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
            // Gemma-4 reasons with an internal "thinking" process that otherwise
            // emits verbose markdown before (or instead of) JSON and blows past
            // the timeout. Minimize it so the model returns the JSON directly.
            // Harmless on models that don't support thinking (ignored).
            thinkingConfig: { thinkingLevel: "minimal" },
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
