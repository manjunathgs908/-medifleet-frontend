// src/pages/DispatchPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { tripsApi, hospitalsApi } from '../api/client';
import { PageHeader, StatusBadge, Badge, Btn, Modal, rupee, Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import { Send, RefreshCw, CheckCircle, XCircle, MapPin, Phone, Bell, BellOff, X } from 'lucide-react';

const MAX_RINGS = 12; // ~12s of ringing if never dismissed

const EMERGENCY_TYPES = [
  { value:'cardiac',      label:'🫀 Cardiac Emergency' },
  { value:'trauma',       label:'🩹 Trauma / Accident' },
  { value:'maternity',    label:'🤱 Maternity' },
  { value:'respiratory',  label:'🫁 Respiratory' },
  { value:'neurological', label:'🧠 Neurological' },
  { value:'general',      label:'🏥 General' },
  { value:'critical',     label:'🚨 Critical' },
];

// ── Trip line formatting ──
// A card shows only what the API actually returned: WhatsApp bookings
// carry dropAddress with no dropHospital, and a booking has no fare or
// distance until it is quoted. Every piece is optional and disappears
// when absent — never "undefined", "NaN", or a stranded "·".
const dotJoin = (...parts) => parts.filter(Boolean).join(' · ');
const numOr   = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

// ── Website booking options ──
// selectedType is the Pricing serviceType id and arrives in whichever case
// the sending client used: savelife-web posts lowercase ('bls',
// 'als_tempo'), while the backend's own catalog in
// utils/ambulanceServiceTypes.js is uppercase. Normalising to uppercase
// lets one map serve both. An id not listed here degrades to a readable
// "Als Tempo" rather than leaking the raw token onto the dispatch board.
const AMBULANCE_TYPE_LABELS = {
  BLS             : 'BLS Ambulance — Maruti Eeco',
  BLS_TEMPO       : 'BLS Ambulance — Tempo Traveller',
  ALS_TEMPO       : 'ALS Ambulance — Tempo Traveller',
  ACLS_TEMPO      : 'ACLS Ambulance — Tempo Traveller',
  NICU_TEMPO      : 'NICU Ambulance — Tempo Traveller',
  BODY_TEMPO      : 'Body Shifting Ambulance — Tempo Traveller',
  BODY_MINI       : 'Body Shifting Mini — Maruti Eeco',
  HEARSE          : 'Hearse',
  HEARSE_BASIC    : 'Hearse — Basic',
  HEARSE_STANDARD : 'Hearse — Standard',
  HEARSE_LUXURY   : 'Hearse — Luxury',
  FREEZER_BOX     : 'Freezer Box',
};

const titleCase = (v) => String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const ambulanceTypeLabel = (v) =>
  v ? (AMBULANCE_TYPE_LABELS[String(v).trim().toUpperCase()] || titleCase(v)) : '';

const TRIP_TYPE_LABELS = { one_way: 'One Way', round_trip: 'Round Trip / Up & Down' };

const fmtDateTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

// scheduleDate is only persisted for scheduleType 'later', but a stray date
// on a 'now' booking is still worth surfacing rather than swallowing.
const scheduleLabel = (t) => {
  const when = fmtDateTime(t.scheduleDate);
  if (t.scheduleType === 'later') return when ? `Scheduled · ${when}` : 'Scheduled';
  if (t.scheduleType === 'now')   return 'Right Now';
  return when ? `Scheduled · ${when}` : '';
};

const EMERGENCY_LABELS = Object.fromEntries(EMERGENCY_TYPES.map((o) => [o.value, o.label]));

// One implementation, rendered by both the new-booking popup and the Active
// Trips card — the two showed different subsets before and drifted apart.
// Every row and badge is independently optional: a CRM-desk or WhatsApp
// booking carries none of the website's option fields and simply renders
// fewer badges rather than "undefined".
const BookingSummary = ({ t }) => {
  const ambulance = ambulanceTypeLabel(t.selectedType);
  const tripType  = TRIP_TYPE_LABELS[t.tripType] || '';
  const schedule  = scheduleLabel(t);
  const emergency = EMERGENCY_LABELS[t.emergencyType] || t.emergencyType || '';
  const drop      = t.dropHospital?.name || t.dropAddress;
  const km        = numOr(t.distanceKm);
  const fare      = numOr(t.estimatedFare);
  // Strict boolean test, not truthiness: acEnabled === false is a real
  // answer ("Non-AC") and must not be collapsed into the field being absent
  // on a booking that never offered the choice.
  const hasAc     = typeof t.acEnabled === 'boolean';
  const isRound   = t.tripType === 'round_trip';
  const money     = dotJoin(km !== null && `📏 ${km} km`, fare !== null && `💰 ${rupee(fare)}`);
  const hasBadges = ambulance || hasAc || tripType || schedule || emergency;

  return (
    <div className="space-y-1">
      {hasBadges && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {ambulance && <Badge color="green">🚑 {ambulance}</Badge>}
          {hasAc     && <Badge color={t.acEnabled ? 'blue' : 'gray'}>{t.acEnabled ? '❄️ AC Included' : 'Non-AC'}</Badge>}
          {tripType  && <Badge color={isRound ? 'amber' : 'gray'}>{isRound ? '🔄' : '➡️'} {tripType}</Badge>}
          {schedule  && <Badge color={t.scheduleType === 'later' ? 'amber' : 'gray'}>🕐 {schedule}</Badge>}
          {emergency && <Badge color="gray">{emergency}</Badge>}
        </div>
      )}

      {t.pickup?.address && (
        <div className="text-xs flex items-start gap-1" style={{ color: 'var(--text2)' }}>
          <MapPin size={10} className="mt-0.5 flex-shrink-0" /> {t.pickup.address}
        </div>
      )}

      {drop && (
        <div className="text-xs" style={{ color: 'var(--text2)' }}>🏥 {drop}</div>
      )}

      {isRound && t.returnAddress && (
        <div className="text-xs" style={{ color: 'var(--text2)' }}>↩️ Return: {t.returnAddress}</div>
      )}

      {money && (
        <div className="text-xs font-mono" style={{ color: 'var(--text2)' }}>{money}</div>
      )}
    </div>
  );
};

export default function DispatchPage() {
  const [form,      setForm]      = useState({ patientName:'', patientPhone:'', pickupAddress:'', dropHospitalId:'', emergencyType:'general', baseFare:1500, distanceKm:12, perKmRate:25 });
  const [hospitals, setHospitals] = useState([]);
  const [vehicles,  setVehicles]  = useState([]);
  const [liveTrips, setLiveTrips] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [billModal, setBillModal]   = useState(null);
  const [assigning, setAssigning]   = useState(null); // tripId currently being assigned
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [newBookings, setNewBookings]   = useState([]); // freshly-arrived trips awaiting acknowledgment
  const intervalRef      = useRef();
  const knownTripIdsRef  = useRef(null); // null = baseline not yet captured (skip alert on first load)
  const audioCtxRef      = useRef(null);
  const ringTimerRef     = useRef(null);
  const soundEnabledRef  = useRef(false); // mirrors soundEnabled for the setInterval closure

  const totalFare = Number(form.baseFare) + (Number(form.distanceKm) * Number(form.perKmRate));

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  useEffect(() => {
    loadInitialData();
    intervalRef.current = setInterval(loadLiveBoard, 20000);
    return () => {
      clearInterval(intervalRef.current);
      stopRinging();
      audioCtxRef.current?.close();
    };
  }, []);

  // ── Alert sound (Web Audio API — synthesized, no asset file, keeps
  // playing in a backgrounded tab once unlocked by a user gesture) ──
  const playChime = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [[880, 0], [660, 0.18]].forEach(([freq, delay]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.18);
    });
  };

  const startRinging = () => {
    if (!soundEnabledRef.current || !audioCtxRef.current || ringTimerRef.current) return;
    let count = 0;
    playChime();
    count++;
    ringTimerRef.current = setInterval(() => {
      if (count >= MAX_RINGS) { stopRinging(); return; }
      playChime();
      count++;
    }, 1000);
  };

  const stopRinging = () => {
    if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
  };

  const enableSound = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      setSoundEnabled(true);
      playChime(); // audible confirmation that the unlock worked
      toast.success('🔔 Sound alerts enabled for this session');
    } catch {
      toast.error('Could not enable audio in this browser');
    }
  };

  const dismissBooking = (id) => {
    setNewBookings(prev => {
      const next = prev.filter(b => b._id !== id);
      if (next.length === 0) stopRinging();
      return next;
    });
  };

  const dismissAllBookings = () => {
    setNewBookings([]);
    stopRinging();
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const { data } = await hospitalsApi.getAll();
      setHospitals(data.hospitals || []);
      // vehicles comes from loadLiveBoard's merged (Vehicle + on-duty
      // Ambulance) list below — no separate vehiclesApi call needed,
      // it would only be immediately overwritten and lacks the
      // source tag the assign dropdown relies on.
      await loadLiveBoard();
    } finally { setLoading(false); }
  };

  const loadLiveBoard = async () => {
    try {
      const { data } = await tripsApi.getLive();
      const trips = data.liveTrips || [];
      const currentIds = new Set(trips.map(t => t._id));

      if (knownTripIdsRef.current === null) {
        // First load — just record the baseline, don't alert for pre-existing bookings.
        knownTripIdsRef.current = currentIds;
      } else {
        const freshlyArrived = trips.filter(t => !knownTripIdsRef.current.has(t._id));
        if (freshlyArrived.length) {
          setNewBookings(prev => [...prev, ...freshlyArrived]);
          startRinging();
        }
        knownTripIdsRef.current = currentIds;
      }

      setLiveTrips(trips);
      setVehicles(data.availableVehicles || []);
    } catch { /* silent */ }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const dispatch = async (e) => {
    e.preventDefault();
    if (!form.patientName || !form.patientPhone || !form.pickupAddress ||!form.dropHospitalId) {
      toast.error('Fill all required fields'); return;
    }
    setSubmitting(true);
    try {
      await tripsApi.create(form);
      toast.success('🚑 Ambulance dispatched!');
      setForm({ patientName:'', patientPhone:'', pickupAddress:'', dropHospitalId:'', emergencyType:'general', baseFare:1500, distanceKm:12, perKmRate:25 });
      await loadLiveBoard();
    } finally { setSubmitting(false); }
  };

  const complete = async (tripId) => {
    try {
      const { data } = await tripsApi.complete(tripId, {});
      toast.success(`Trip completed! Bill: ${rupee(data.bill.grandTotal)}`);
      setBillModal(data.bill);
      await loadLiveBoard();
    } catch { /* axios interceptor shows error */ }
  };

  const cancel = async (tripId) => {
    if (!window.confirm('Cancel this trip?')) return;
    await tripsApi.cancel(tripId, 'Cancelled by dispatcher');
    toast.success('Trip cancelled');
    await loadLiveBoard();
  };

  // id is a merged-list entry's _id; source tells us whether it came
  // from the legacy Vehicle collection or an on-duty Ambulance (owner/
  // driver via the mobile app) — see tripController.getLiveBoard's
  // merged availableVehicles.
  const assignDriver = async (tripId, id, source) => {
    if (!id) return;
    setAssigning(tripId);
    try {
      await tripsApi.assign(tripId, source === 'ambulance' ? { ambulanceId: id } : { vehicleId: id });
      toast.success('🚑 Driver assigned!');
      await loadLiveBoard();
    } catch { /* axios interceptor shows error */ }
    finally { setAssigning(null); }
  };

  const elapsed = (iso) => {
    const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
    return mins < 60 ? `${mins}m ago` : `${Math.floor(mins/60)}h ${mins%60}m ago`;
  };

  return (
    <div className="page-enter">
      <PageHeader
        title="Dispatch Center"
        subtitle="Book emergency · Live fleet board · Assign ambulance"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={enableSound}
              disabled={soundEnabled}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={soundEnabled
                ? { background: 'rgba(0,212,170,.1)', color: 'var(--accent)', cursor: 'default' }
                : { background: 'rgba(255,77,109,.1)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.25)', cursor: 'pointer' }}
              title={soundEnabled ? 'Sound alerts are on for this session' : 'Click to unlock audible new-booking alerts'}
            >
              {soundEnabled ? <Bell size={13} /> : <BellOff size={13} />}
              {soundEnabled ? 'Alerts On' : 'Enable sound alerts'}
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'rgba(0,212,170,.1)', color: 'var(--accent)' }}>
              <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--accent)' }} />
              {vehicles.length} Available
            </div>
          </div>
        }
      />

      {/* ── New Booking Alert Banner ── */}
      {newBookings.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 w-full max-w-sm">
          {newBookings.length > 1 && (
            <button onClick={dismissAllBookings}
              className="w-full text-center text-[11px] font-semibold py-1 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>
              Dismiss all ({newBookings.length})
            </button>
          )}
          {newBookings.map(b => (
            <div key={b._id} className="rounded-xl p-4 shadow-lg banner-pop"
              style={{ background: 'var(--surface)', border: '1px solid var(--red)', boxShadow: '0 0 0 1px rgba(255,77,109,.25), 0 8px 24px rgba(255,77,109,.25)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold font-display text-sm" style={{ color: 'var(--red)' }}>
                  🚑 New Booking!
                </div>
                <button onClick={() => dismissBooking(b._id)} style={{ color: 'var(--text3)' }}>
                  <X size={16} />
                </button>
              </div>
              <div className="text-sm font-semibold mt-1.5">{b.patientName}</div>
              <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text2)' }}>
                <Phone size={10} /> {b.patientPhone}
              </div>
              <div className="mt-2">
                <BookingSummary t={b} />
              </div>
              <button onClick={() => dismissBooking(b._id)}
                className="w-full mt-2.5 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(255,77,109,.08)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.2)' }}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ── Booking Form ── */}
        <form onSubmit={dispatch} className="lg:col-span-3 card space-y-4">
          <h2 className="font-bold font-display" style={{ color: 'var(--accent)' }}>🚑 New Emergency Booking</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Patient Name *</label>
              <input className="inp" value={form.patientName} onChange={e=> set('patientName', e.target.value)} placeholder="Full name" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Phone *</label>
              <input className="inp" value={form.patientPhone} onChange={e => set('patientPhone', e.target.value)} placeholder="+91 XXXXX XXXXX" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Pickup Address *</label>
            <input className="inp" value={form.pickupAddress} onChange={e=> set('pickupAddress', e.target.value)} placeholder="Street, Area, Landmark" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Destination Hospital *</label>
              <select className="inp" value={form.dropHospitalId} onChange={e => set('dropHospitalId', e.target.value)} required>
                <option value="">-- Select Hospital --</option>
                {hospitals.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Emergency Type</label>
              <select className="inp" value={form.emergencyType} onChange={e => set('emergencyType', e.target.value)}>
                {EMERGENCY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Base Fare (₹)</label>
              <input className="inp" type="number" value={form.baseFare} onChange={e => set('baseFare', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Distance (km)</label>
              <input className="inp" type="number" value={form.distanceKm} onChange={e => set('distanceKm', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>₹ per km</label>
              <input className="inp" type="number" value={form.perKmRate}onChange={e => set('perKmRate', e.target.value)} />
            </div>
          </div>

          {/* Fare preview */}
          <div className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'rgba(0,212,170,.06)', border: '1px solid rgba(0,212,170,.18)' }}>
            <div className="text-xs" style={{ color: 'var(--text2)' }}>
              Base {rupee(form.baseFare)} + {form.distanceKm}km × ₹{form.perKmRate} = &nbsp;
            </div>
            <div className="text-xl font-bold font-mono" style={{ color: 'var(--accent)' }}>
              {rupee(totalFare)}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Btn type="submit" disabled={submitting} className="flex-1">
              {submitting ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14} />}
              Dispatch Ambulance
            </Btn>
            <Btn type="button" variant="ghost" onClick={() => setForm({ patientName:'', patientPhone:'', pickupAddress:'', dropHospitalId:'', emergencyType:'general', baseFare:1500, distanceKm:12, perKmRate:25 })}>
              Clear
            </Btn>
          </div>
        </form>

        {/* ── Active Trips Board ── */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="card flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold font-display text-sm">Active Trips</h3>
              <button onClick={loadLiveBoard}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: 'var(--text3)', background: 'var(--surface2)' }}>
                <RefreshCw size={13} />
              </button>
            </div>

            {liveTrips.length === 0
              ? <div className="text-center py-10 text-sm" style={{ color: 'var(--text3)' }}>No active trips</div>
              : <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 480 }}>
                  {liveTrips.map(t => (
                    <div key={t._id} className="rounded-xl p-3"
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-sm">{t.patientName}</div>
                          <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text3)' }}>
                            <Phone size={10}/> {t.patientPhone}
                          </div>
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="mb-2.5">
                        <BookingSummary t={t} />
                      </div>

                      {/* ── Assign Vehicle/Driver (only if not yet assigned) —
                          keyed on driver, not vehicle: an ambulance-sourced
                          assignment (owner/driver on duty via the mobile
                          app) never sets trip.vehicle at all. ── */}
                      {!t.driver ? (
                        <div className="mb-2.5">
                          <select
                            className="inp text-xs py-1.5 w-full"
                            disabled={assigning === t._id}
                            value=""
                            onChange={(e) => {
                              const [id, source] = e.target.value.split('|');
                              assignDriver(t._id, id, source);
                            }}
                          >
                            <option value="">
                              {assigning === t._id ? 'Assigning...' : '🚑 Assign Vehicle / Driver'}
                            </option>
                            {vehicles.map(v => (
                              <option key={v._id} value={`${v._id}|${v.source}`}>
                                {v.source === 'ambulance' ? '🧑‍✈️ ' : ''}{v.registrationNumber} · {v.assignedDriver?.name || 'No driver'}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div className="text-xs font-mono" style={{ color: 'var(--amber)' }}>
                            🚑 {t.vehicle?.registrationNumber || t.ambulance?.registrationNumber} · {t.driver?.name}
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{elapsed(t.createdAt)}</div>
                        </div>
                      )}

                      <div className="flex gap-2 mt-2.5">
                        <button onClick={() => complete(t._id)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={{ background: 'rgba(0,212,170,.1)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,.2)' }}>
                          <CheckCircle size={11}/> Complete
                        </button>
                        <button onClick={() => cancel(t._id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: 'rgba(255,77,109,.08)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.2)' }}>
                          <XCircle size={11}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>

      {/* ── Bill Modal ── */}
      <Modal open={!!billModal} onClose={() => setBillModal(null)} title="🧾 Trip Bill Generated" width="max-w-md">
        {billModal && (
          <div className="space-y-3">
            <div className="rounded-xl p-4" style={{ background: 'var(--surface2)' }}>
              <div className="text-xs font-mono mb-1" style={{ color: 'var(--accent)' }}>{billModal.billNumber}</div>
              <div className="font-bold">{billModal.patient}</div>
            </div>
            {[
              ['Base Fare',        rupee(billModal.baseFare)],
              [`Distance (${billModal.distanceKm}km × ₹${billModal.perKmRate})`, rupee(billModal.distanceCharge)],
              ['Additional',       rupee(billModal.additionalCharges)],
              [`GST @ ${billModal.gstRate}%`, rupee(billModal.gstAmount)],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm py-1.5"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text2)' }}>{label}</span>
                <span className="font-mono">{val}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 text-base font-bold">
              <span>Total</span>
              <span className="font-mono" style={{ color: 'var(--accent)'}}>{rupee(billModal.grandTotal)}</span>
            </div>
            <div className="flex gap-2 pt-2">
              <Btn variant="primary" className="flex-1" onClick={() => window.print()}>🖨️ Print</Btn>
              <Btn variant="ghost" className="flex-1" onClick={() => setBillModal(null)}>Close</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}