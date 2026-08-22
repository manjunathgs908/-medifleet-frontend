// src/components/RoutePreviewMap.jsx
//
// Pickup marker, drop marker and the real driving route between them.
//
// The polyline is Google's encoded overview_polyline, handed to us by the
// backend's estimate endpoint — the same route Google measured the billing
// distance along, so the line on screen and the number on the invoice can
// never disagree. Rendering is Leaflet/OSM, which is what FleetPage already
// uses; no second mapping stack and no Maps key in the browser.
import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BANGALORE_CENTER = [12.9716, 77.5946];

const pinIcon = (color, glyph) => new L.DivIcon({
  html: `<div style="background:${color};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);display:grid;place-items:center">
           <span style="transform:rotate(45deg);font-size:10px;line-height:1">${glyph}</span>
         </div>`,
  className : '',
  iconSize  : [22, 22],
  iconAnchor: [11, 22],
});

const PICKUP_ICON = pinIcon('#00d4aa', '&#9679;');
const DROP_ICON   = pinIcon('#ff4d6d', '&#9873;');

// Decodes Google's encoded polyline into [lat,lng] pairs. Ported verbatim
// from savelife-web's lib/pricing.js so both surfaces trace the same line.
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

// Leaflet needs an imperative nudge when the geometry changes — a declarative
// `bounds` prop only applies at mount.
function FitBounds({ points }) {
  const map = useMap();
  React.useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.setView(points[0], 14); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
  }, [map, JSON.stringify(points)]);
  return null;
}

export default function RoutePreviewMap({ pickup, drop, polyline, height = 260 }) {
  const path = useMemo(() => (polyline ? decodePolyline(polyline) : []), [polyline]);

  const fitPoints = useMemo(() => {
    if (path.length) return path;
    const pts = [];
    if (pickup) pts.push([pickup.lat, pickup.lng]);
    if (drop)   pts.push([drop.lat, drop.lng]);
    return pts;
  }, [path, pickup, drop]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border2)', height }}>
      <MapContainer
        center={pickup ? [pickup.lat, pickup.lng] : BANGALORE_CENTER}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {pickup && (
          <Marker position={[pickup.lat, pickup.lng]} icon={PICKUP_ICON}>
            <Popup>Pickup — {pickup.label}</Popup>
          </Marker>
        )}

        {drop && (
          <Marker position={[drop.lat, drop.lng]} icon={DROP_ICON}>
            <Popup>Drop — {drop.label}</Popup>
          </Marker>
        )}

        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#00d4aa', weight: 4, opacity: 0.85 }} />}

        <FitBounds points={fitPoints} />
      </MapContainer>
    </div>
  );
}
