// Client wrapper for the server-side planner endpoint.
//
// The browser sends the selected record + spatial result; the SERVER rebuilds
// the canonical evidence packet and talks to Gemma. No API key is ever present
// in the browser. If the network call itself fails, we build the deterministic
// template plan locally so the UI always has a working, labeled result.

import { buildEvidencePacket } from "./evidencePacket.js";
import { buildTemplatePlan } from "./templatePlan.js";

/**
 * Request a next-action plan for a facility.
 * @param {object} args { record, spatial, manifest }
 * @returns {Promise<object>} normalized plan response (always has plan/source/label/packet)
 */
export async function requestPlan({ record, spatial = null, manifest = null }) {
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ record, spatial, manifest }),
    });
    if (!res.ok) throw new Error(`Planner HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.plan) throw new Error("Malformed planner response");
    return data;
  } catch (err) {
    // Last-resort client fallback (e.g., server unreachable): local template.
    const packet = buildEvidencePacket({ record, spatial, manifest });
    return {
      plan: buildTemplatePlan(packet),
      source: "template",
      label: "Template-generated",
      reason: "client_offline",
      error_detail: String(err && err.message ? err.message : err),
      evidence_hash: packet.hash,
      packet,
    };
  }
}
