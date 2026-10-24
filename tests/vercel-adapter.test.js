import { describe, it, expect, beforeEach, afterEach } from "vitest";
import handler from "../api/plan.js";
import { __testing } from "../server/planHandler.js";

// Minimal mock of a Vercel (Node) response object capturing what the adapter
// writes. The adapter sets statusCode, headers, and ends with a JSON string.
function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(payload) {
      this.body = payload;
      this.ended = true;
    },
  };
}

function mockReq({ method = "POST", body, headers = {} } = {}) {
  return { method, body, headers };
}

const RECORD = {
  facility_id: "fac_acton_01",
  municipality: "ACTON",
  town_key: "ACTON",
  facility: "Acton LF",
  type: "Solar",
  status: "Operating",
  mw_operating: 2,
  elec_label: "X",
};

// The adapter calls the real handler, which reads GEMMA_API_KEY from the
// environment. Force a NO-credentials config here so we exercise the labeled
// template fallback deterministically and never touch the network.
let savedKey;
beforeEach(() => {
  savedKey = process.env.GEMMA_API_KEY;
  delete process.env.GEMMA_API_KEY;
  __testing.cache.clear(); // isolate: avoid cross-test cache hits on same evidence
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.GEMMA_API_KEY;
  else process.env.GEMMA_API_KEY = savedKey;
});

describe("Vercel adapter — api/plan.js", () => {
  it("valid POST (object body) returns 200 with a labeled template plan (no key)", async () => {
    const res = mockRes();
    await handler(mockReq({ body: { record: RECORD } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["cache-control"]).toBe("no-store");
    const out = JSON.parse(res.body);
    expect(out.source).toBe("template");
    expect(out.label).toBe("Template-generated");
    expect(out.reason).toBe("no_credentials");
    expect(out.plan.actions.length).toBe(3);
  });

  it("accepts a stringified JSON body (parses it)", async () => {
    const res = mockRes();
    await handler(mockReq({ body: JSON.stringify({ record: RECORD }) }), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).source).toBe("template");
  });

  it("unsupported method returns 405", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(res.body).error).toMatch(/POST/);
  });

  it("invalid JSON string body returns 400", async () => {
    const res = mockRes();
    await handler(mockReq({ body: "{ not valid json" }), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Invalid JSON/i);
  });

  it("missing record returns the handler's 400", async () => {
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBeTruthy();
  });

  it("oversized body (declared content-length) returns 413", async () => {
    const res = mockRes();
    await handler(
      mockReq({ body: { record: RECORD }, headers: { "content-length": String(300 * 1024) } }),
      res
    );
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toMatch(/too large/i);
  });

  it("oversized string body (no content-length) still returns 413", async () => {
    const big = JSON.stringify({ record: RECORD, pad: "x".repeat(300 * 1024) });
    const res = mockRes();
    await handler(mockReq({ body: big }), res);
    expect(res.statusCode).toBe(413);
  });
});
