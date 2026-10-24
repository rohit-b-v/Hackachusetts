import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  CircleMarker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { formatCurrency, formatPct } from "../lib/format.js";

// Fix Leaflet's default marker icon paths under a bundler (Vite) by pointing
// to the CDN assets. Without this, markers render as broken images.
const landfillIcon = new L.Icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/** Imperatively fit the map to the combined geometry bounds. */
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [bounds, map]);
  return null;
}

export default function SpatialMap({ spatial, transmissionLines = [] }) {
  const { primary, landfills, ejPolygons, proximity } = spatial;

  // Build the bounds from all geometry.
  const bounds = L.latLngBounds([]);
  landfills.forEach((l) => bounds.extend(l.position));
  ejPolygons.forEach((p) => p.rings.forEach((ring) => ring.forEach((v) => bounds.extend(v))));
  transmissionLines.forEach((t) =>
    t.paths.forEach((path) => path.forEach((v) => bounds.extend(v)))
  );

  const center = primary ? primary.position : [42.1, -71.5];

  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom
      className="h-full w-full"
      style={{ minHeight: 360 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* HIFLD high-voltage transmission lines */}
      {transmissionLines.map((line, i) =>
        line.paths.map((path, j) => (
          <Polyline
            key={`tx-${i}-${j}`}
            positions={path}
            pathOptions={{
              color: "#f97316",
              weight: 2.5,
              opacity: 0.9,
              dashArray: "8 5",
            }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-semibold text-slate-900">
                  Transmission Line
                </div>
                <div>Owner: {line.attributes.OWNER || "—"}</div>
                <div>
                  Voltage:{" "}
                  {line.attributes.VOLTAGE !== undefined &&
                  line.attributes.VOLTAGE !== null &&
                  line.attributes.VOLTAGE >= 0
                    ? `${line.attributes.VOLTAGE} kV`
                    : line.attributes.VOLT_CLASS || "—"}
                </div>
                <div>Status: {line.attributes.STATUS || "—"}</div>
              </div>
            </Popup>
          </Polyline>
        ))
      )}

      {/* EJ block group polygons */}
      {ejPolygons.map((poly, i) => (
        <Polygon
          key={`ej-${i}`}
          positions={poly.rings}
          pathOptions={{
            color: "#7c3aed",
            weight: 1.5,
            fillColor: "#a78bfa",
            fillOpacity: 0.3,
          }}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-semibold text-slate-900">
                EJ Block Group — {poly.attributes.MUNICIPALITY}
              </div>
              <div>Population: {poly.attributes.TOTAL_POP ?? "—"}</div>
              <div>Minority: {formatPct(poly.attributes.PCT_MINORITY)}</div>
              <div>Limited-English: {formatPct(poly.attributes.LIMENGHHPCT)}</div>
              <div>Median income: {formatCurrency(poly.attributes.BG_MHHI)}</div>
              <div className="mt-1 italic text-slate-500">
                {poly.attributes.EJ_CRIT_DESC}
              </div>
            </div>
          </Popup>
        </Polygon>
      ))}

      {/* Landfill point markers */}
      {landfills.map((l, i) => (
        <Marker key={`lf-${i}`} position={l.position} icon={landfillIcon}>
          <Popup>
            <div className="text-xs">
              <div className="font-semibold text-slate-900">
                {l.attributes.FACILITY}
              </div>
              <div>{l.attributes.MUNICIPALITY}</div>
              <div>Status: {l.attributes.STATUS_1}</div>
              <div>Type: {l.attributes.TYPE_}</div>
              <div>
                MW: {l.attributes.MW_PERMITTED ?? "—"} permitted /{" "}
                {l.attributes.MW_OPERATING ?? "—"} operating
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Line from the verified landfill point to the nearest EJ boundary
          point (an edge point, not a vertex). nearestPointLngLat is GeoJSON
          [lng,lat]; convert to Leaflet [lat,lng] for rendering. */}
      {primary && proximity?.nearestPointLngLat && !proximity.inside && (
        <>
          <Polyline
            positions={[
              primary.position,
              [proximity.nearestPointLngLat[1], proximity.nearestPointLngLat[0]],
            ]}
            pathOptions={{ color: "#ef4444", weight: 2, dashArray: "6 6" }}
          />
          <CircleMarker
            center={[proximity.nearestPointLngLat[1], proximity.nearestPointLngLat[0]]}
            radius={5}
            pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }}
          />
        </>
      )}

      <FitBounds bounds={bounds} />
    </MapContainer>
  );
}
