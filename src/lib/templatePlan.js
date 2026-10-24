// Deterministic, offline next-action plan derived purely from the evidence
// packet. Used when Gemma is unavailable or its output fails validation.
// Produces the SAME structured shape as the model so the UI renders uniformly.
// Labeled "Template-generated" by the caller.

import { packetIdSet } from "./evidencePacket.js";

function factById(packet, id) {
  return (packet.facts || []).find((f) => f.id === id) || null;
}
function has(packet, id) {
  const f = factById(packet, id);
  return f && f.value !== null && f.value !== undefined && f.value !== "";
}

export function buildTemplatePlan(packet) {
  const ids = packetIdSet(packet);
  const status = factById(packet, "F_STATUS")?.value || "unknown";
  const statusLower = String(status).toLowerCase();
  const isStalled = statusLower === "permitted" || statusLower === "construction";

  // Selected facts: the supported, present facts most useful for next steps.
  const candidateFactIds = [
    "F_STATUS",
    "F_UTILITY",
    "F_EJ_BG_COUNT",
    "F_EJ_MIN_INCOME",
    "F_PROXIMITY",
    "F_IDENTITY",
  ];
  const selected_facts = candidateFactIds
    .filter((id) => ids.has(id) && has(packet, id))
    .slice(0, 5)
    .map((id) => ({
      id,
      relevance: defaultRelevance(id, isStalled),
    }));
  // Guarantee at least one selected fact (status always present).
  if (selected_facts.length === 0 && ids.has("F_FACILITY")) {
    selected_facts.push({ id: "F_FACILITY", relevance: "Baseline project identity." });
  }

  // Three next INVESTIGATION actions keyed to unknowns we must resolve.
  const actions = [
    {
      title: isStalled
        ? "Confirm grant-program eligibility and application window"
        : "Scope a storage/retrofit feasibility review",
      why_it_matters: isStalled
        ? "Reported status is " +
          status +
          ". Eligibility cannot be inferred from status or EJ proximity; a program-by-program check determines whether a grant can actually unblock this project."
        : "This is an operating site; co-location value is unverified and depends on a feasibility study, not on the reported data.",
      owner_role: isStalled ? "Town Sustainability Manager" : "Community Solar Developer",
      needed_document: isStalled
        ? "Written eligibility determination against a named state/federal program"
        : "Site feasibility / geotechnical scoping memo",
      evidence_ids: pickIds(ids, [
        isStalled ? "U_GRANT_ELIGIBILITY" : "U_STORAGE_FEASIBILITY",
        "F_STATUS",
      ]),
    },
    {
      title: "Request interconnection / hosting-capacity information from the utility",
      why_it_matters:
        "Only the town-level distribution utility (" +
        (factById(packet, "F_UTILITY")?.value || "unknown") +
        ") is reported. Site service and available capacity are unknown and gate any build.",
      owner_role: "Electric Utility (interconnection)",
      needed_document: "Interconnection / hosting-capacity answer for this site's feeder",
      evidence_ids: pickIds(ids, ["U_INTERCONNECTION", "U_SITE_SERVICE", "F_UTILITY"]),
    },
    {
      title: packet.meta?.location_verified
        ? "Validate EJ proximity on the ground for outreach planning"
        : "Verify the landfill's exact location and EJ proximity",
      why_it_matters: packet.meta?.location_verified
        ? "A boundary distance is available, but confirming the physical relationship supports equitable, well-targeted community outreach planning."
        : "Location is not verified from live geometry, so proximity to EJ block groups is still unknown and must be confirmed before equity claims are made.",
      owner_role: "Municipal Energy Committee",
      needed_document: packet.meta?.location_verified
        ? "Outreach plan referencing the nearest EJ block groups"
        : "Confirmed site coordinates / parcel record",
      evidence_ids: pickIds(ids, [
        packet.meta?.location_verified ? "F_PROXIMITY" : "U_PROXIMITY",
        "F_EJ_BG_COUNT",
      ]),
    },
  ];

  const questions = [
    {
      audience: "municipal",
      question:
        "Which capital or grant programs has the town already pursued for this landfill, and what blocked them?",
    },
    {
      audience: "utility",
      question:
        "What is the interconnection status and available hosting capacity on the feeder serving this site?",
    },
    {
      audience: "developer",
      question: isStalled
        ? "What specifically is needed to move this permitted/construction project to operation?"
        : "What would a storage co-location at this operating site require in cost, space, and interconnection?",
    },
  ];

  return { selected_facts, actions, questions };
}

function pickIds(validIds, wanted) {
  const out = wanted.filter((id) => validIds.has(id));
  return out.length ? out : [...validIds].slice(0, 1);
}

function defaultRelevance(id, isStalled) {
  switch (id) {
    case "F_STATUS":
      return "Reported status frames whether the next step is unblocking (permitted/construction) or feasibility (operating).";
    case "F_UTILITY":
      return "Names the town distribution utility to contact for interconnection questions (site service still unverified).";
    case "F_EJ_BG_COUNT":
      return "Town EJ context relevant to equitable outreach planning.";
    case "F_EJ_MIN_INCOME":
      return "Lowest block-group income signals where bill-relief outreach could matter most.";
    case "F_PROXIMITY":
      return "Verified distance supports (but does not prove) an equity rationale.";
    case "F_IDENTITY":
      return "Shows whether the live location was verified before drawing spatial conclusions.";
    default:
      return "Supported fact relevant to next steps.";
  }
}
