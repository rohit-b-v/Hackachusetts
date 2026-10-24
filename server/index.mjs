// Standalone production/preview server: serves built dist/ + the /api/plan
// endpoint. Run after `npm run build` with: node server/index.mjs
// Reads GEMMA_API_KEY / GEMMA_MODEL from the process environment.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { handleApi } from "./httpBridge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveStatic(req, res) {
  let path = (req.url || "/").split("?")[0];
  if (path === "/") path = "/index.html";
  // prevent path traversal
  const safe = normalize(path).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(DIST, safe);
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, "index.html");
    const data = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader("content-type", MIME[extname(filePath)] || "application/octet-stream");
    res.end(data);
  } catch {
    // SPA fallback to index.html
    try {
      const data = await readFile(join(DIST, "index.html"));
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const handled = await handleApi(req, res);
    if (handled) return;
    await serveStatic(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.end("Server error");
  }
});

server.listen(PORT, () => {
  const hasKey = Boolean(process.env.GEMMA_API_KEY);
  console.log(`Cap-to-Community server on http://localhost:${PORT}`);
  console.log(`  GEMMA_API_KEY: ${hasKey ? "present" : "MISSING (template fallback)"}`);
  console.log(`  GEMMA_MODEL:   ${process.env.GEMMA_MODEL || "(default gemma-3-27b-it)"}`);
});
