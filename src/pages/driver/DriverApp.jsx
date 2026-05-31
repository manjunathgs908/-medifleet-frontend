// src/pages/driver/DriverApp.jsx
// ============================================================
// Standalone mobile-first PWA for drivers.
// Features:
//  - Clock in/out with geolocation
//  - Pre-shift mandatory checklist
//  - Live trip assignment with sound alert
//  - Google Maps navigation deep-link
//  - Status toggle
//  - Own trip history + earnings
// ============================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { tripsApi, attendanceApi, vehiclesApi } from '../../api/client';
import toast from 'react-hot-toast';
import {
  CheckCircle, XCircle, MapPin, Phone, Clock,
  Zap, AlertTriangle, LogOut, Navigation, History
} from 'lucide-react';

const ALERT_SOUND_FREQ = 880;

const DriverApp = () => {
  const { user, logout } = useAuth();
  const [tab,          setTab]          = useState('home');       // home | history | checklist
  const [myTrip,       setMyTrip]       = useState(null);         // current active trip
  const [attendance,   setAttendance]   = useState(null);
  const [pastTrips,    setPastTrips]    = useState([]);
  const [status,       setStatus]       = useState(user?.availability?.status || 'offline');
  const [checklist,    setChecklist]    = useState({ oxygenLevelPct:100, kitComplete:false, vehicleOk:false, notes:'' });
  const [checklistDone,setChecklistDone]= useState(false);
  const [loading,      setLoading]      = useState(false);
  const audioRef = useRef(null);
  const pollRef  = useRef(null);

  // ── Play alert sound using Web Audio API ──────────────────
  const playAlert = useCallback(() => {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = ALERT_SOUND_FREQ;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.5);
    } catch { /* Web Audio not available */ }
  }, []);

  // ── Poll for active trip every 10s ────────────────────────
  const pollMyTrip = useCallback(async () => {
    try {
      const { data } = await tripsApi.getAll({ status: 'dispatched,en_route', limit: 1 });
      const active   = data.trips?.find(t => t.driver?._id === user._id || t.driver === user._id);
      if (active && !myTrip) {
        playAlert();
        toast('🚑 New trip assigned!', { icon: '🔔', duration: 6000 });
      }
      setMyTrip(active || null);
    } catch { /* silent */ }
  }, [user._id, myTrip, playAlert]);

  useEffect(() => {
    pollMyTrip();
    pollRef.current = setInterval(pollMyTrip, 10000);
    return () => clearInterval(pollRef.current);
  }, [pollMyTrip]);

  useEffect(() => {
    loadAttendance();
    loadHistory();
  }, []);

  const loadAttendance = async () => {
    try {
      const { data } = await attendanceApi.getRecords(user._id);
      // Get today's record
      const today    = new Date().toISOString().split('T')[0];
      const todayRec = data.records?.find(r => r.date?.startsWith(today));
      setAttendance(todayRec || null);
      if (todayRec?.shiftChecklist?.passed) setChecklistDone(true);
    } catch { /* silent */ }
  };

  const loadHistory = async () => {
    try {
      const { data } = await tripsApi.getAll({ status: 'completed', limit: 20 });
      setPastTrips(data.trips || []);
    } catch { /* silent */ }
  };

  const clockIn = async () => {
    setLoading(true);
    try {
      const pos = await getGeo();
      await attendanceApi.clockIn({ shift: 'day', lat: pos?.lat, lng: pos?.lng });
      toast.success('Clocked in ✓');
      loadAttendance();
    } finally { setLoading(false); }
  };

  const clockOut = async () => {
    setLoading(true);
    try {
      await attendanceApi.clockOut();
      toast.success('Clocked out');
      loadAttendance();
    } finally { setLoading(false); }
  };

  const submitChecklist = async () => {
    setLoading(true);
    try {
      const { data } = await attendanceApi.checklist(checklist);
      if (data.passed) {
        setChecklistDone(true);
        setStatus('available');
        toast.success('✅ Checklist passed! Status: Available');
      } else {
        toast.error(data.message || 'Checklist failed — check oxygen & kit');
      }
    } finally { setLoading(false); }
  };

  const updateTripStatus = async (tripId, newStatus) => {
    await tripsApi.updateStatus(tripId, newStatus);
    if (newStatus === 'en_route') { toast.success('En Route — navigating'); setStatus('on_trip'); }
    pollMyTrip();
  };

  const completeTrip = async (tripId) => {
    await tripsApi.complete(tripId, {});
    toast.success('Trip completed! 🎉');
    setStatus('available');
    setMyTrip(null);
    loadHistory();
  };

  const openMaps = (address) => {
    const q = encodeURIComponent(address);
    window.open(`https://maps.google.com/?q=${q}&navigate=yes`, '_blank');
  };

  const getGeo = () => new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null));
  });

  const rupee = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;

  const statusColors = {
    available: { bg:'rgba(0,212,170,.12)', text:'var(--accent)', border:'rgba(0,212,170,.3)' },
    on_trip:   { bg:'rgba(255,184,48,.12)', text:'var(--amber)',  border:'rgba(255,184,48,.3)' },
    offline:   { bg:'rgba(100,116,139,.1)', text:'var(--text3)', border:'rgba(100,116,139,.2)' },
  };
  const sc = statusColors[status] || statusColors.offline;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ink)', maxWidth: 430, margin: '0 auto' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-10"
        style={{ background: 'var(--ink2)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xl">🚑</span>
          <div>
            <div className="text-xs font-bold font-display">MediFleet Driver</div>
            <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>{user?.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1.5 pulse-dot" style={{ background: sc.text }} />
            {status.replace('_', ' ').toUpperCase()}
          </div>
          <button onClick={logout} className="p-1.5 rounded-lg" style={{ color: 'var(--text3)' }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* ── Active Trip Alert ── */}
      {myTrip && tab === 'home' && (
        <div className="mx-4 mt-4 rounded-2xl p-4 animate-slide-up"
          style={{ background: 'rgba(255,184,48,.1)', border: '2px solid rgba(255,184,48,.4)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--amber)' }} />
            <span className="font-bold font-display text-sm" style={{ color: 'var(--amber)' }}>Active Trip</span>
            <span className="ml-auto badge badge-amber text-[10px]">{myTrip.status.replace('_',' ')}</span>
          </div>

          <div className="font-bold text-lg mb-1">{myTrip.patientName}</div>
          <div className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--text2)' }}>
            <Phone size={10}/> {myTrip.patientPhone}
          </div>
          <div className="flex items-start gap-1 text-xs mb-1" style={{ color: 'var(--text2)' }}>
            <MapPin size={10} className="mt-0.5 flex-shrink-0" /> {myTrip.pickup?.address}
          </div>
          <div className="text-xs mb-3" style={{ color: 'var(--text2)' }}>
            🏥 {myTrip.dropHospital?.name}
            <span className="ml-2 badge badge-blue text-[10px] capitalize">{myTrip.emergencyType}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={() => openMaps(myTrip.pickup?.address)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
              style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
              <Navigation size={15}/> Navigate to Patient
            </button>
            <button onClick={() => openMaps(myTrip.dropHospital?.address || myTrip.dropHospital?.name)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
              style={{ background: 'rgba(59,158,255,.15)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.3)' }}>
              <Navigation size={15}/> Navigate to Hospital
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {myTrip.status === 'dispatched' && (
              <button onClick={() => updateTripStatus(myTrip._id, 'en_route')}
                className="py-2.5 rounded-xl font-semibold text-sm"
                style={{ background: 'rgba(255,184,48,.15)', color: 'var(--amber)', border: '1px solid rgba(255,184,48,.3)' }}>
                🚦 Start Trip
              </button>
            )}
            {myTrip.status === 'en_route' && (
              <button onClick={() => completeTrip(myTrip._id)}
                className="py-2.5 rounded-xl font-semibold text-sm col-span-2"
                style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                <CheckCircle size={14} className="inline mr-1"/> Complete Trip
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">

        {tab === 'home' && (
          <div className="py-4 space-y-4">
            {/* Attendance */}
            <div className="card-sm rounded-2xl">
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>Today's Attendance</div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={clockIn} disabled={!!attendance?.clockIn || loading}
                  className="py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'rgba(0,212,170,.1)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,.25)' }}>
                  <Clock size={14}/> {attendance?.clockIn ? 'Clocked In ✓' : 'Clock In'}
                </button>
                <button onClick={clockOut} disabled={!attendance?.clockIn || !!attendance?.clockOut || loading}
                  className="py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'rgba(255,77,109,.08)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.2)' }}>
                  <Clock size={14}/> {attendance?.clockOut ? 'Clocked Out ✓' : 'Clock Out'}
                </button>
              </div>
              {attendance?.clockIn && (
                <div className="text-xs mt-2 text-center font-mono" style={{ color: 'var(--text3)' }}>
                  In: {new Date(attendance.clockIn).toLocaleTimeString('en-IN')}
                  {attendance.clockOut && ` · Out: ${new Date(attendance.clockOut).toLocaleTimeString('en-IN')}`}
                </div>
              )}
            </div>

            {/* Monthly earnings */}
            <div className="card-sm rounded-2xl">
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>This Month</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface2)' }}>
                  <div className="text-xl font-bold font-mono" style={{ color: 'var(--accent)' }}>{pastTrips.length}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Trips</div>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface2)' }}>
                  <div className="text-xl font-bold font-mono" style={{ color: 'var(--amber)' }}>
                    {rupee(pastTrips.reduce((s,t)=>s+(t.grandTotal||0),0))}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Revenue</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'checklist' && (
          <div className="py-4 space-y-4">
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={16} style={{ color: 'var(--amber)' }} />
                <h3 className="font-bold font-display">Pre-Shift Safety Checklist</h3>
              </div>
              {checklistDone ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="font-bold" style={{ color: 'var(--accent)' }}>Checklist Complete</div>
                  <div className="text-sm mt-1" style={{ color: 'var(--text2)' }}>You are Available for trips</div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>
                      Oxygen Level % (min 80%)
                    </label>
                    <input type="range" min="0" max="100" value={checklist.oxygenLevelPct}
                      onChange={e=>setChecklist(c=>({...c,oxygenLevelPct:Number(e.target.value)}))}
                      className="w-full" />
                    <div className="text-center mt-1 font-bold font-mono text-lg"
                      style={{ color: checklist.oxygenLevelPct >= 80 ? 'var(--accent)' : 'var(--red)' }}>
                      {checklist.oxygenLevelPct}%
                    </div>
                  </div>
                  {[
                    ['kitComplete',  '🧰 Medical Kit Complete'],
                    ['vehicleOk',    '🚑 Vehicle Exterior OK'],
                  ].map(([k,l]) => (
                    <div key={k} onClick={() => setChecklist(c=>({...c,[k]:!c[k]}))}
                      className="flex items-center justify-between rounded-xl p-4 cursor-pointer transition-all"
                      style={{ background: checklist[k] ? 'rgba(0,212,170,.1)' : 'var(--surface2)', border: `1px solid ${checklist[k] ? 'rgba(0,212,170,.3)' : 'var(--border2)'}` }}>
                      <span className="font-medium text-sm">{l}</span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${checklist[k] ? '' : 'opacity-30'}`}
                        style={{ background: checklist[k] ? 'var(--accent)' : 'var(--surface3)' }}>
                        <CheckCircle size={14} color={checklist[k] ? 'var(--ink)' : 'var(--text3)'} />
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Notes (optional)</label>
                    <textarea className="inp" rows={2} value={checklist.notes} onChange={e=>setChecklist(c=>({...c,notes:e.target.value}))} />
                  </div>
                  <button onClick={submitChecklist} disabled={loading}
                    className="w-full py-3 rounded-xl font-semibold text-sm"
                    style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                    {loading ? '⏳ Submitting...' : 'Submit Checklist & Go Available'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="py-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
              Your Completed Trips
            </div>
            {pastTrips.length === 0
              ? <div className="text-center py-12 text-sm" style={{ color: 'var(--text3)' }}>No trips yet</div>
              : pastTrips.map(t => (
                  <div key={t._id} className="card-sm rounded-2xl">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-semibold text-sm">{t.patientName}</div>
                      <div className="font-bold font-mono text-sm" style={{ color: 'var(--accent)' }}>{rupee(t.grandTotal || t.baseFare)}</div>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text2)' }}>🏥 {t.dropHospital?.name}</div>
                    <div className="flex justify-between mt-1.5">
                      <span className="badge badge-green text-[10px]">{t.emergencyType}</span>
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>
                        {new Date(t.completedAt).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] flex"
        style={{ background: 'var(--ink2)', borderTop: '1px solid var(--border)', padding: '8px 0' }}>
        {[
          { key:'home',      icon:<Zap size={18}/>,     label:'Home' },
          { key:'checklist', icon:<CheckCircle size={18}/>, label:'Checklist' },
          { key:'history',   icon:<History size={18}/>, label:'History' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex flex-col items-center gap-1 py-1 text-[10px] font-semibold transition-all
              ${tab===t.key ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default DriverApp;
