// Node http <-> handler bridge used by both the Vite dev middleware and the
// standalone preview server. Reads a size-bounded JSON body and dispatches to
// handlePlanRequest. Keeps all Gemma/provider logic server-side.

import { handlePlanRequest } from "./planHandler.js";

const MAX_BODY_BYTES = 256 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large"), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { code: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  // Never cache credentials/responses at the HTTP layer; vary by nothing.
  res.setHeader("cache-control", "no-store");
  res.end(payload);
}

/**
 * Handle POST /api/plan. Returns true if the request was handled, false if the
 * path/method did not match (so the caller can fall through to next()).
 */
export async function handleApi(req, res) {
  const url = req.url || "";
  const path = url.split("?")[0];
  if (path !== "/api/plan") return false;

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed. Use POST." });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    const { status, body: out } = await handlePlanRequest(body);
    sendJson(res, status, out);
  } catch (err) {
    const code = err && err.code ? err.code : 500;
    sendJson(res, code, { error: err.message || "Server error" });
  }
  return true;
}
