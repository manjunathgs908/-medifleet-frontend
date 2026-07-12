// src/pages/FleetPage.jsx
import React, { useState, useEffect } from 'react';
import { vehiclesApi, authApi } from '../api/client';
import { PageHeader, StatusBadge, Btn, Modal, StatCard, Spinner, Empty } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, Gauge } from 'lucide-react';
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
  const [vehicles, setVehicles] = useState([]);
  const [drivers,  setDrivers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [form,     setForm]     = useState({ registrationNumber:'', model:'', type:'BLS', assignedDriver:'' });

  useEffect(() => {
    load();
    const interval = setInterval(loadDriversOnly, 15000);
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [v, d] = await Promise.all([vehiclesApi.getAll(), authApi.getUsers({ role: 'driver' })]);
      setVehicles(v.data.vehicles||[]);
      setDrivers(d.data.users||[]);
    } finally { setLoading(false); }
  };

  const loadDriversOnly = async () => {
    try {
      const d = await authApi.getUsers({ role: 'driver' });
      setDrivers(d.data.users||[]);
    } catch { /* silent */ }
  };

  const save = async () => {
    await vehiclesApi.create(form);
    toast.success('Vehicle added!');
    setModal(false);
    load();
  };

  const changeStatus = async (id, status) => {
    await vehiclesApi.update(id, { status });
    load();
  };

  const counts = {
    available:   vehicles.filter(v => v.status === 'available').length,
    on_trip:     vehicles.filter(v => v.status === 'on_trip').length,
    offline:     vehicles.filter(v => v.status === 'offline').length,
    maintenance: vehicles.filter(v => v.status === 'maintenance').length,
  };

  const trackedDrivers = drivers.filter(d => d.availability?.lat && d.availability?.lng);

  if (loading) return <Spinner />;

  return (
    <div className="page-enter">
      <PageHeader title="Fleet Tracker" subtitle="Live ambulance status · Driver assignment · Compliance"
        action={<Btn onClick={() => setModal(true)}><Plus size={14}/> Add Vehicle</Btn>} />

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

      {vehicles.length === 0 ? <Empty icon="🚑" message="No vehicles in fleet" /> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map(v => {
            const accentColor = v.status === 'available' ? 'var(--accent)' : v.status === 'on_trip' ? 'var(--amber)' : 'var(--text3)';
            const expiring = v.expiring || [];
            return (
              <div key={v._id} className="card"
                style={{ borderLeft: `3px solid ${accentColor}` }}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-mono text-xs mb-0.5" style={{ color: 'var(--accent)' }}>{v._id?.slice(-6).toUpperCase()}</div>
                    <div className="font-bold">{v.registrationNumber}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{v.model} · {v.type}</div>
                  </div>
                  <StatusBadge status={v.status} />
                </div>

                <div className="flex items-center gap-2 mb-3 p-2 rounded-lg" style={{ background: 'var(--surface2)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(59,158,255,.15)', color: 'var(--blue)' }}>
                    {v.assignedDriver?.name?.split(' ').map(w=>w[0]).join('').slice(0,2) || '??'}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{v.assignedDriver?.name || 'Unassigned'}</div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>{v.assignedDriver?.phone}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3 text-xs" style={{ color: 'var(--text2)' }}>
                  <div className="flex items-center gap-1"><Gauge size={11}/> {v.odometer?.toLocaleString('en-IN')} km</div>
                  <div>✅ {v.trips || 0} trips</div>
                </div>

                {expiring.length > 0 && (
                  <div className="mb-3 rounded-lg p-2 text-xs"
                    style={{ background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', color: 'var(--red)' }}>
                    ⚠️ {expiring.map(d => `${d.type} (${d.daysLeft}d)`).join(', ')}
                  </div>
                )}

                <select value={v.status} onChange={e => changeStatus(v._id, e.target.value)}
                  className="inp text-xs py-1.5 w-full">
                  <option value="available">Available</option>
                  <option value="on_trip">On Trip</option>
                  <option value="offline">Offline</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            );
          })}
        </div>
      }

      <Modal open={modal} onClose={() => setModal(false)} title="Add Vehicle">
        <div className="space-y-4">
          {[['registrationNumber','Registration No.','DL-01-AA-1234'],['model','Model','Force Traveller ALS']].map(([k,l,p]) => (
            <div key={k}>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>{l}</label>
              <input className="inp" placeholder={p} value={form[k]} onChange={e => setForm(f=>({...f,[k]:e.target.value}))} />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Type</label>
            <select className="inp" value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))}>
              <option value="ALS">ALS</option><option value="BLS">BLS</option><option value="Patient_Transport">Patient Transport</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Assign Driver</label>
            <select className="inp" value={form.assignedDriver} onChange={e => setForm(f=>({...f,assignedDriver:e.target.value}))}>
              <option value="">-- Select Driver --</option>
              {drivers.map(d => <option key={d._id} value={d._id}>{d.name} · {d.phone}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Btn className="flex-1" onClick={save}>Save Vehicle</Btn>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}