import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, AlertTriangle, Info, Cable, MapPin, HelpCircle } from "lucide-react";
import SpatialMap from "./SpatialMap.jsx";
import GrantBrief from "./GrantBrief.jsx";
import { fetchSpatial, fetchTransmission } from "../lib/massgis.js";
import { computeProximity } from "../lib/geo.js";

const SPATIAL_TIMEOUT_MS = 15000;
const TRANSMISSION_TIMEOUT_MS = 15000;

export default function InspectorDrawer({ site, onClose }) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  // When identity is ambiguous, the user picks which live point is the site.
  // null = not yet chosen; a number indexes data.identity.candidates.
  const [chosenCandidate, setChosenCandidate] = useState(null);

  // Transmission overlay. `wanted` = user intent (checkbox); the fetch state is
  // tracked separately so toggling status never re-triggers the fetch effect.
  const [showTransmission, setShowTransmission] = useState(false);
  const [transmission, setTransmission] = useState({
    status: "idle", // idle | loading | ready | error
    lines: [],
    error: null,
  });

  // ---- Main spatial fetch with stale-response protection -------------------
  // A monotonically increasing request id guards against an older in-flight
  // response (slow network, rapid re-select) overwriting a newer one.
  const spatialReqId = useRef(0);
  useEffect(() => {
    const myId = ++spatialReqId.current;
    const controller = new AbortController();
    setState({ status: "loading", data: null, error: null });
    setChosenCandidate(null);

    fetchSpatial(site.town_key || site.clean_town, site.facility, {
      signal: controller.signal,
      timeoutMs: SPATIAL_TIMEOUT_MS,
    })
      .then((data) => {
        // Ignore if a newer request superseded this one.
        if (myId === spatialReqId.current) setState({ status: "ready", data, error: null });
      })
      .catch((err) => {
        if (myId !== spatialReqId.current) return; // superseded; stay quiet
        if (err && /cancelled/i.test(err.message || "")) return; // our own abort
        setState({ status: "error", data: null, error: err.message || String(err) });
      });

    return () => {
      // Bump the id so any late resolution is ignored, and abort the request.
      spatialReqId.current++;
      controller.abort();
    };
  }, [site]);

  // Reset transmission when the selected site changes.
  useEffect(() => {
    setShowTransmission(false);
    setTransmission({ status: "idle", lines: [], error: null });
  }, [site]);

  // ---- Derivations (declared BEFORE effects that read them) ----------------
  const identity = state.data?.identity ?? null;
  const ejSearch = state.data?.ejSearch ?? null;

  // Effective verified point: the resolver's primary, or a user-chosen
  // candidate when identity was ambiguous. Null until resolved/chosen.
  const effectivePrimary = useMemo(() => {
    if (!state.data) return null;
    if (state.data.primary) return state.data.primary;
    if (
      identity?.status === "ambiguous" &&
      chosenCandidate !== null &&
      identity.candidates[chosenCandidate]
    ) {
      return identity.candidates[chosenCandidate];
    }
    return null;
  }, [state.data, identity, chosenCandidate]);

  // Stable anchor for the transmission query (string key avoids object-identity
  // churn re-running the effect every render).
  const transmissionAnchor = useMemo(() => {
    if (state.status !== "ready" || !state.data) return null;
    return (
      effectivePrimary?.position ||
      state.data.landfills[0]?.position ||
      state.data.ejPolygons[0]?.rings?.[0]?.[0] ||
      null
    );
  }, [state.status, state.data, effectivePrimary]);
  const anchorKey = transmissionAnchor ? transmissionAnchor.join(",") : "";

  // ---- Transmission fetch (fixed: no self-cancellation) --------------------
  // The effect depends ONLY on the enable flag + the anchor key, NOT on the
  // transmission status it mutates. A request-id ref (not a closure cancelled
  // flag tied to a status-dependent effect) decides whether a late result is
  // still current, so changing status to "loading" cannot cancel this request.
  const txReqId = useRef(0);
  useEffect(() => {
    if (!showTransmission) return;
    if (!anchorKey) {
      setTransmission({ status: "error", lines: [], error: "No coordinates to query around." });
      return;
    }
    const myId = ++txReqId.current;
    const controller = new AbortController();
    setTransmission({ status: "loading", lines: [], error: null });

    fetchTransmission(transmissionAnchor, 15, {
      signal: controller.signal,
      timeoutMs: TRANSMISSION_TIMEOUT_MS,
    })
      .then((lines) => {
        if (myId === txReqId.current) setTransmission({ status: "ready", lines, error: null });
      })
      .catch((err) => {
        if (myId !== txReqId.current) return;
        if (err && /cancelled/i.test(err.message || "")) return;
        setTransmission({ status: "error", lines: [], error: err.message || String(err) });
      });

    return () => {
      txReqId.current++;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTransmission, anchorKey]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Proximity: use resolver's result when it already verified, else recompute
  // against the user-chosen point. Null when location is not verified.
  const proximity = useMemo(() => {
    if (!state.data) return null;
    if (state.data.primary) return state.data.proximity;
    if (effectivePrimary) {
      return computeProximity(effectivePrimary.lngLat, state.data.ejPolygons);
    }
    return null;
  }, [state.data, effectivePrimary]);

  // Spatial payload handed to the map reflects the effective primary so the
  // connector line + fit bounds track the user's choice.
  const mapSpatial = useMemo(() => {
    if (!state.data) return null;
    return { ...state.data, primary: effectivePrimary, proximity };
  }, [state.data, effectivePrimary, proximity]);

  const locationVerified = Boolean(effectivePrimary);

  // Compact, serializable spatial summary for the Next-Action Planner. Only the
  // fields the evidence packet needs — not the full geometry payload.
  const spatialForPlanner = useMemo(() => {
    if (!state.data) return null;
    return {
      identity: { status: state.data.identity?.status ?? "not_run" },
      primary: effectivePrimary ? { verified: true } : null,
      proximity: proximity
        ? { inside: proximity.inside, distanceMiles: proximity.distanceMiles }
        : null,
      ejSearch: ejSearch
        ? {
            scope: ejSearch.scope,
            radiusMiles: ejSearch.radiusMiles,
            complete: ejSearch.complete,
            count: ejSearch.count,
          }
        : null,
    };
  }, [state.data, effectivePrimary, proximity, ejSearch]);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="no-print absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel (print-root so the printed brief isn't clipped) */}
      <div className="print-root relative ml-auto flex h-full w-full max-w-6xl flex-col bg-slate-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Honest Data Gap — Live Spatial Inspector
            </h2>
            <p className="text-xs text-slate-500">
              Querying <code className="rounded bg-slate-100 px-1">{site.town_key}</code> live
              from MassGIS
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="no-print rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close inspector"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Honesty banner */}
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
          <div className="flex gap-2 text-sm text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              A shared town name doesn&apos;t mean a landfill actually sits near an
              Environmental Justice neighborhood. This view measures the real distance
              from the landfill to the nearest EJ block group using live map data —{" "}
              <strong>including neighboring towns</strong> — instead of assuming proximity
              from the town name alone.
            </p>
          </div>
        </div>

        {/* Identity resolution notice */}
        {state.status === "ready" && identity && (
          <IdentityNotice
            identity={identity}
            site={site}
            chosen={chosenCandidate}
            onChoose={setChosenCandidate}
          />
        )}

        {/* Body: map (left) + brief (right) */}
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Map column (not printed — the interactive map would clip on paper) */}
          <div className="no-print flex min-h-[380px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Spatial Proximity Map
              </h3>
              <div className="flex items-center gap-3">
                {state.status === "ready" && (
                  <span className="text-xs text-slate-500">
                    {state.data.landfills.length} landfill pt(s) ·{" "}
                    {state.data.ejPolygons.length} EJ polygon(s)
                    {transmission.status === "ready" &&
                      ` · ${transmission.lines.length} line(s)`}
                  </span>
                )}
                <label
                  className={`inline-flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium ${
                    state.status === "ready" ? "text-slate-700" : "text-slate-400"
                  }`}
                  title="Query live HIFLD high-voltage transmission lines near this landfill"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                    checked={showTransmission}
                    disabled={state.status !== "ready"}
                    onChange={(e) => setShowTransmission(e.target.checked)}
                  />
                  <Cable className="h-3.5 w-3.5 text-orange-500" />
                  Overlay High-Voltage Transmission Lines (HIFLD)
                  {transmission.status === "loading" && (
                    <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
                  )}
                </label>
              </div>
            </div>
            {showTransmission && transmission.status === "error" && (
              <div className="border-b border-orange-200 bg-orange-50 px-4 py-1.5 text-xs text-orange-700">
                Transmission layer unavailable: {transmission.error}
              </div>
            )}
            {showTransmission &&
              transmission.status === "ready" &&
              transmission.lines.length === 0 && (
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-500">
                  No HIFLD transmission lines returned for this area.
                </div>
              )}
            {state.status === "ready" && ejSearch?.scope === "bounded-radius" && (
              <div className="border-b border-indigo-100 bg-indigo-50/60 px-4 py-1.5 text-[11px] text-indigo-700">
                EJ search scope: block groups within ~{ejSearch.radiusMiles} mi of
                the landfill (cross-municipal){" "}
                {ejSearch.pages > 1 && `· ${ejSearch.pages} pages`}
                {ejSearch.complete === false && (
                  <span className="font-semibold text-amber-700">
                    {" "}
                    · partial results (pagination cap reached)
                  </span>
                )}
                . Distances are measured to the nearest block-group boundary; a
                site may be nearest to an EJ area in an adjacent town.
              </div>
            )}
            <div className="relative flex-1">
              {state.status === "loading" && (
                <div className="flex h-full min-h-[340px] items-center justify-center text-slate-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Fetching live MassGIS geometry…
                </div>
              )}
              {state.status === "error" && (
                <div className="flex h-full min-h-[340px] flex-col items-center justify-center gap-2 p-6 text-center text-slate-600">
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                  <p className="font-medium text-slate-800">
                    Could not reach the live MassGIS endpoint.
                  </p>
                  <p className="max-w-md text-xs text-slate-500">{state.error}</p>
                  <p className="max-w-md text-xs text-slate-400">
                    The town-level join and grant brief below still work from the local
                    dataset.
                  </p>
                </div>
              )}
              {state.status === "ready" &&
                (state.data.landfills.length === 0 &&
                state.data.ejPolygons.length === 0 ? (
                  <div className="flex h-full min-h-[340px] items-center justify-center p-6 text-center text-slate-500">
                    Live MassGIS returned no geometry for this town.
                  </div>
                ) : (
                  <SpatialMap
                    spatial={mapSpatial}
                    transmissionLines={
                      showTransmission ? transmission.lines : []
                    }
                  />
                ))}
            </div>
          </div>

          {/* Brief column */}
          <div className="min-h-[380px]">
            <GrantBrief
              site={site}
              proximity={proximity}
              locationVerified={locationVerified}
              ejSearch={ejSearch}
              spatialForPlanner={spatialForPlanner}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Explains the live-geometry identity result and, when ambiguous, lets the
 * user pick which same-named point is the real site. No silent guessing.
 */
function IdentityNotice({ identity, site, chosen, onChoose }) {
  if (identity.status === "verified") {
    return (
      <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-5 py-2 text-xs text-green-800">
        <MapPin className="h-3.5 w-3.5 text-green-600" />
        Location verified: matched one live landfill point for “{site.facility}”.
      </div>
    );
  }

  if (identity.status === "not_found") {
    return (
      <div className="flex items-start gap-2 border-b border-slate-200 bg-slate-100 px-5 py-2 text-xs text-slate-600">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span>
          <strong>Location not verified.</strong> No live landfill point in this
          town matched the facility name “{site.facility}”. Proximity distance is
          withheld; the town-level EJ context below still applies.
        </span>
      </div>
    );
  }

  // Ambiguous: present an explicit choice.
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900">
      <div className="mb-1.5 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>
          <strong>Ambiguous location.</strong> {identity.candidates.length} live
          points in this town share the facility name “{site.facility}” (e.g. the
          two Norfolk records). Select which point is this site to verify
          proximity — we will not guess.
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-5">
        {identity.candidates.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChoose(chosen === i ? null : i)}
            aria-pressed={chosen === i}
            className={`rounded-full border px-2.5 py-1 font-medium transition ${
              chosen === i
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
            }`}
          >
            Point {i + 1} · {c.position[0].toFixed(4)}, {c.position[1].toFixed(4)}
          </button>
        ))}
        {chosen !== null && (
          <span className="inline-flex items-center text-amber-700">
            Using point {chosen + 1} for proximity.
          </span>
        )}
      </div>
    </div>
  );
}
