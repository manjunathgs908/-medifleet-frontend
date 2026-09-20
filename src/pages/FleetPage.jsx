// src/pages/FleetPage.jsx
import React, { useState, useEffect } from 'react';
import { ambulancesApi, authApi } from '../api/client';
import { PageHeader, StatusBadge, Btn, Modal, StatCard, Spinner, Empty } from '../components/ui';
import toast from 'react-hot-toast';
import { Gauge } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default region: Bengaluru
const BANGALORE_CENTER = [12.9716, 77.5946];

// Custom colored markers for driver status
const makeIcon = (color) => new L.DivIcon({
  html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const STATUS_ICONS = {
  available: makeIcon('#00d4aa'),
  on_trip:   makeIcon('#ffb020'),
  offline:   makeIcon('#6b7280'),
};

export default function FleetPage() {
  const [ambulances, setAmbulances] = useState([]);
  const [drivers,    setDrivers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  // '' = every partner. Filters the cards below by Ambulance.owner.
  const [partnerId, setPartnerId] = useState('');

  useEffect(() => {
    load();
    const interval = setInterval(loadDriversOnly, 15000);
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [a, d] = await Promise.all([
        ambulancesApi.getAdminList(),
        authApi.getUsers({ role: 'driver' }),
      ]);
      setAmbulances(a.data.ambulances||[]);
      setDrivers(d.data.users||[]);
    } finally { setLoading(false); }
  };

  const loadDriversOnly = async () => {
    try {
      const d = await authApi.getUsers({ role: 'driver' });
      setDrivers(d.data.users||[]);
    } catch { /* silent */ }
  };

  // Ambulance-only. The legacy Vehicle collection is empty in production
  // (vehicles = 0) and nothing creates one any more — every live unit is
  // an Ambulance, going on duty through the app's Assignment/Shift system.
  // Adding a Vehicle from here is gone with it: it wrote to a collection
  // the duty system never reads, so the row could never be driven.
  //
  // status <- displayStatus ('off' -> 'offline') keeps the existing card
  // markup and the counts above unchanged.
  const allItems = ambulances.map(a => ({
    ...a,
    status: a.displayStatus === 'off' ? 'offline' : a.displayStatus,
    source: 'ambulance',
  }));

  // Distinct partners present in the fleet, for the filter.
  const partners = Object.values(
    allItems.reduce((m, a) => {
      if (a.partner?._id) m[a.partner._id] = a.partner;
      return m;
    }, {}),
  ).sort((x, y) => Number(y.isPlatformOwner) - Number(x.isPlatformOwner)
    || x.label.localeCompare(y.label));

  const fleetItems = partnerId
    ? allItems.filter(a => a.partner?._id === partnerId)
    : allItems;

  const counts = {
    available:   fleetItems.filter(v => v.status === 'available').length,
    on_trip:     fleetItems.filter(v => v.status === 'on_trip').length,
    offline:     fleetItems.filter(v => v.status === 'offline').length,
    maintenance: fleetItems.filter(v => v.status === 'maintenance').length,
  };

  const trackedDrivers = drivers.filter(d => d.availability?.lat && d.availability?.lng);

  if (loading) return <Spinner />;

  return (
    <div className="page-enter">
      <PageHeader
        title="Fleet Tracker"
        subtitle="Live ambulance status across all partners"
        action={partners.length > 1 && (
          <select className="inp" style={{ minWidth: 200 }}
            value={partnerId} onChange={e => setPartnerId(e.target.value)}>
            <option value="">All partners ({allItems.length})</option>
            {partners.map(p => (
              <option key={p._id} value={p._id}>
                {p.isPlatformOwner ? '★ ' : ''}{p.label}
              </option>
            ))}
          </select>
        )}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Available"   value={counts.available}   color="green" />
        <StatCard label="On Trip"     value={counts.on_trip}     color="amber" />
        <StatCard label="Offline"     value={counts.offline}     color="blue"  />
        <StatCard label="Maintenance" value={counts.maintenance} color="red"   />
      </div>

      {/* ── Live Fleet Map ── */}
      <div className="card mb-6" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-bold font-display text-sm">🗺️ Live Fleet Map</h3>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text3)' }}>
            <span className="flex items-center gap-1"><span style={{width:8,height:8,borderRadius:'50%',background:'#00d4aa',display:'inline-block'}}/> Available</span>
            <span className="flex items-center gap-1"><span style={{width:8,height:8,borderRadius:'50%',background:'#ffb020',display:'inline-block'}}/> On Trip</span>
            <span className="flex items-center gap-1"><span style={{width:8,height:8,borderRadius:'50%',background:'#6b7280',display:'inline-block'}}/> Offline</span>
          </div>
        </div>
        <MapContainer center={BANGALORE_CENTER} zoom={12} style={{ height: 400, width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {trackedDrivers.map(d => (
            <Marker
              key={d._id}
              position={[d.availability.lat, d.availability.lng]}
              icon={STATUS_ICONS[d.availability.status] || STATUS_ICONS.offline}
            >
              <Popup>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 12 }}>{d.phone}</div>
                <div style={{ fontSize: 11, textTransform: 'capitalize', marginTop: 4 }}>
                  Status: {d.availability.status || 'offline'}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {trackedDrivers.length === 0 && (
          <div className="text-center py-3 text-xs" style={{ color: 'var(--text3)' }}>
            No drivers currently sharing live location
          </div>
        )}
      </div>

      {fleetItems.length === 0 ? <Empty icon="🚑" message="No vehicles in fleet" /> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fleetItems.map(v => {
            const accentColor = v.status === 'available' ? 'var(--accent)' : v.status === 'on_trip' ? 'var(--amber)' : 'var(--text3)';
            const expiring = v.expiring || [];
            return (
              <div key={v._id} className="card"
                style={{ borderLeft: `3px solid ${accentColor}` }}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-mono text-xs mb-0.5" style={{ color: 'var(--accent)' }}>{v._id?.slice(-6).toUpperCase()}</div>
                    <div className="font-bold">{v.registrationNumber}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>
                      {v.serviceTypeLabel || v.serviceType}
                    </div>
                    {/* Whose unit this is. The star marks SaveLife's own,
                        so a dispatcher can tell at a glance whether a
                        problem is ours to fix or a partner's to be told
                        about. */}
                    {v.partner && (
                      <div className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded"
                        style={v.partner.isPlatformOwner
                          ? { background: 'rgba(0,212,170,.15)', color: 'var(--accent)' }
                          : { background: 'var(--surface2)', color: 'var(--text3)' }}>
                        {v.partner.isPlatformOwner ? '★ ' : ''}{v.partner.label}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={v.status} />
                </div>

                <div className="flex items-center gap-2 mb-3 p-2 rounded-lg" style={{ background: 'var(--surface2)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(59,158,255,.15)', color: 'var(--blue)' }}>
                    {v.assignedDriver?.name?.split(' ').map(w=>w[0]).join('').slice(0,2) || '??'}
                  </div>
                  <div>
                    {/* On duty now, then the rostered driver. Two
                        different questions — see Ambulance.defaultDriver. */}
                    <div className="text-xs font-medium">
                      {v.assignedDriver?.name
                        || (v.defaultDriver?.name ? `${v.defaultDriver.name} (off duty)` : 'Unassigned')}
                    </div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>
                      {v.assignedDriver?.phone || v.defaultDriver?.phone}
                    </div>
                  </div>
                </div>

                {v.source !== 'ambulance' && (
                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs" style={{ color: 'var(--text2)' }}>
                    <div className="flex items-center gap-1"><Gauge size={11}/> {v.odometer?.toLocaleString('en-IN')} km</div>
                    <div>✅ {v.trips || 0} trips</div>
                  </div>
                )}

                {expiring.length > 0 && (
                  <div className="mb-3 rounded-lg p-2 text-xs"
                    style={{ background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', color: 'var(--red)' }}>
                    ⚠️ {expiring.map(d => `${d.type} (${d.daysLeft}d)`).join(', ')}
                  </div>
                )}

                {/* Ambulance status is driven by the owner/driver's own
                    on-duty toggle in the mobile app, not editable from
                    the CRM — show it read-only instead of a dropdown. */}
                <div className="text-xs py-1.5 text-center rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
                  Status set from mobile app
                </div>
              </div>
            );
          })}
        </div>
      }

    </div>
  );
}