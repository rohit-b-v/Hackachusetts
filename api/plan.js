// Vercel Node.js Function — POST /api/plan
//
// Thin adapter around the shared server handler. It intentionally does NOT use
// server/httpBridge.js: that bridge reads a raw request stream, but on Vercel
// the body is already parsed and exposed as `req.body`, so re-reading the
// stream would hang or read nothing. We reuse the real logic
// (handlePlanRequest) and reproduce the bridge's HTTP contract here:
//   - POST only (else 405)
//   - 256 KB request-body cap (else 413)
//   - invalid JSON -> 400
//   - application/json + cache-control: no-store on every response
//   - handler owns evidence validation, caching, retries, and the labeled
//     template fallback; GEMMA_API_KEY / GEMMA_MODEL stay server-side.

import { handlePlanRequest } from "../server/planHandler.js";

const MAX_BODY_BYTES = 256 * 1024; // parity with server/httpBridge.js

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(payload);
}

/**
 * Normalize Vercel's request body into a parsed object, enforcing the size cap.
 * Vercel may hand us: an already-parsed object, a string, a Buffer, or nothing.
 * Returns { body } on success or throws an Error with a `.code` (400/413).
 */
function parseBody(req) {
  // Size guard: prefer the declared content-length; fall back to the raw body.
  const declared = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw Object.assign(new Error("Request body too large"), { code: 413 });
  }

  const b = req.body;

  // Already parsed object (Vercel parses application/json automatically).
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) {
    // Enforce the cap even when content-length was absent/understated.
    if (Buffer.byteLength(JSON.stringify(b), "utf8") > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body too large"), { code: 413 });
    }
    return b;
  }

  // String or Buffer body: enforce cap, then parse (empty -> {}).
  if (typeof b === "string" || Buffer.isBuffer(b)) {
    const raw = Buffer.isBuffer(b) ? b.toString("utf8") : b;
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body too large"), { code: 413 });
    }
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw Object.assign(new Error("Invalid JSON body"), { code: 400 });
    }
  }

  // No body.
  return {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed. Use POST." });
    return;
  }

  let body;
  try {
    body = parseBody(req);
  } catch (err) {
    sendJson(res, err.code || 400, { error: err.message || "Bad request" });
    return;
  }

  try {
    const { status, body: out } = await handlePlanRequest(body);
    sendJson(res, status, out);
  } catch (err) {
    sendJson(res, (err && err.code) || 500, { error: (err && err.message) || "Server error" });
  }
}

// Allow larger-than-default parsed bodies up to our own cap; Vercel's default
// JSON body limit is small, and we enforce 256 KB ourselves in parseBody.
export const config = {
  api: {
    bodyParser: { sizeLimit: "256kb" },
  },
};
