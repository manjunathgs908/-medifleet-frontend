// src/pages/DispatchPage.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { tripsApi, hospitalsApi, pricingApi } from '../api/client';
import AddressAutocomplete from '../components/AddressAutocomplete';
import RoutePreviewMap from '../components/RoutePreviewMap';
import { PageHeader, StatusBadge, Badge, Btn, Modal, rupee, Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import { Send, RefreshCw, CheckCircle, XCircle, MapPin, Phone, Bell, BellOff, X, Link2, ExternalLink } from 'lucide-react';

const MAX_RINGS = 12; // ~12s of ringing if never dismissed

// Every field the operator actually chooses. Distance, base fare, per-km rate
// and total are deliberately absent: they are computed by the backend from
// the route and the Pricing collection, never typed at the desk.
const EMPTY_FORM = {
  patientName   : '',
  patientPhone  : '',
  emergencyType : 'general',
  dropHospitalId: '',
  selectedType  : '',
  tripType      : 'one_way',
  acEnabled     : false,
  scheduleType  : 'now',
  scheduleDate  : '',
};

// Built from the trackingToken the backend stores on the trip — never
// generated here. A link the CRM invented would not resolve.
const TRACK_BASE = 'https://savelife.health/track';
const trackUrl = (t) => (t.trackingToken ? `${TRACK_BASE}/${t.trackingToken}` : null);

const fmtDuration = (sec) => {
  if (!Number.isFinite(Number(sec))) return null;
  const m = Math.round(Number(sec) / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

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
  const eta       = fmtDuration(t.estimatedDurationSec);
  const money     = dotJoin(km !== null && `📏 ${km} km`, eta && `⏱️ ${eta}`, fare !== null && `💰 ${rupee(fare)}`);
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
  const [form,      setForm]      = useState(EMPTY_FORM);
  // Resolved to coordinates by AddressAutocomplete — a bare typed string is
  // never enough, because it can be neither routed nor priced.
  const [pickup,    setPickup]    = useState(null); // { label, lat, lng }
  const [drop,      setDrop]      = useState(null);
  const [pricing,   setPricing]   = useState([]);   // the bookable-service source of truth
  const [estimate,  setEstimate]  = useState(null); // backend quote: route + fare
  const [estimating,   setEstimating]   = useState(false);
  const [estimateError, setEstimateError] = useState('');
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
  const estimateSeqRef   = useRef(0);     // drops out-of-order quote responses

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // The dropdown is whatever the Pricing collection currently offers. A
  // service with no active Pricing doc is not bookable — showing it would
  // only let an operator reach "No active pricing found" at submit time.
  const services = useMemo(
    () => pricing
      .filter(p => p.active !== false && p.serviceType)
      .map(p => ({
        id     : String(p.serviceType).toLowerCase(), // same ids savelife-web posts
        label  : ambulanceTypeLabel(p.serviceType),
        acPerKm: Number(p.acPerKm) || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [pricing],
  );

  const activeService = services.find(s => s.id === form.selectedType) || null;
  const acAvailable   = !!activeService?.acPerKm;
  const fare          = estimate?.fare || null;

  // Re-quote whenever anything the price depends on changes. Debounced
  // because pickup/drop/options often change in quick succession, and every
  // call costs a Google Directions request.
  useEffect(() => {
    if (!pickup || !drop) { setEstimate(null); setEstimateError(''); setEstimating(false); return; }

    const seq = ++estimateSeqRef.current;
    setEstimating(true);
    setEstimateError('');

    const timer = setTimeout(async () => {
      try {
        const { data } = await tripsApi.estimate({
          pickupLat: pickup.lat, pickupLng: pickup.lng,
          dropLat  : drop.lat,   dropLng  : drop.lng,
          selectedType: form.selectedType || undefined,
          tripType    : form.tripType,
          acEnabled   : form.acEnabled,
        });
        if (seq !== estimateSeqRef.current) return;
        setEstimate(data);
        setEstimateError(data.fareError || '');
      } catch (err) {
        if (seq !== estimateSeqRef.current) return;
        setEstimate(null);
        setEstimateError(err.response?.data?.message || 'Could not calculate route and fare.');
      } finally {
        if (seq === estimateSeqRef.current) setEstimating(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [pickup, drop, form.selectedType, form.tripType, form.acEnabled]);

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
      const [hosp, price] = await Promise.allSettled([hospitalsApi.getAll(), pricingApi.getAll()]);
      if (hosp.value)  setHospitals(hosp.value.data.hospitals || []);
      // A pricing outage must not take the whole dispatch board down — the
      // live trips and the assign flow still work without the booking form.
      if (price.value) setPricing(price.value.data.pricing || []);
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

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setPickup(null);
    setDrop(null);
    setEstimate(null);
    setEstimateError('');
  };

  // Selecting a service that has no AC rate must also drop an AC choice made
  // against the previous one, or the operator sees "AC Included" on a trip
  // whose fare has no AC component.
  const selectService = (id) => setForm(f => {
    const svc = services.find(s => s.id === id);
    return { ...f, selectedType: id, acEnabled: svc?.acPerKm ? f.acEnabled : false };
  });

  const dispatch = async (e) => {
    e.preventDefault();
    if (!form.patientName.trim() || !form.patientPhone.trim()) { toast.error('Patient name and phone are required'); return; }
    if (!pickup || !drop)      { toast.error('Pick both locations from the suggestions'); return; }
    if (!form.selectedType)    { toast.error('Select an ambulance / service type'); return; }
    if (form.scheduleType === 'later' && !form.scheduleDate) { toast.error('Choose a date and time for the scheduled booking'); return; }
    if (!fare)                 { toast.error(estimateError || 'Waiting for the fare — try again in a moment'); return; }

    setSubmitting(true);
    try {
      // Exactly the payload savelife-web posts, so a call-desk booking and a
      // customer booking become the same Trip document. The backend re-verifies
      // the distance and recomputes the fare for both — nothing here is trusted
      // for money.
      await tripsApi.create({
        patientName  : form.patientName.trim(),
        patientPhone : form.patientPhone.trim(),
        emergencyType: form.emergencyType,
        pickupLabel  : pickup.label, pickupLat: pickup.lat, pickupLng: pickup.lng,
        dropLabel    : drop.label,   dropLat  : drop.lat,   dropLng  : drop.lng,
        dropHospitalId: form.dropHospitalId || undefined,
        dist         : estimate?.oneWayKm,
        effectiveDist: estimate?.distanceKm,
        selectedType : form.selectedType,
        tripType     : form.tripType,
        returnAddress: form.tripType === 'round_trip' ? pickup.label : null,
        acEnabled    : form.acEnabled,
        scheduleType : form.scheduleType,
        scheduleDate : form.scheduleType === 'later' ? form.scheduleDate : null,
      });
      toast.success('🚑 Ambulance dispatched!');
      resetForm();
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

  // navigator.clipboard needs a secure context and can be refused; the
  // toast shows the URL either way so the operator can still read it out
  // or select it by hand.
  const copyTrackingLink = async (t) => {
    const url = trackUrl(t);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Tracking link copied');
    } catch {
      toast(url, { duration: 8000 });
    }
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
              <input className="inp" value={form.patientName} onChange={e => set('patientName', e.target.value)} placeholder="Full name" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Phone *</label>
              <input className="inp" value={form.patientPhone} onChange={e => set('patientPhone', e.target.value)} placeholder="+91 XXXXX XXXXX" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <AddressAutocomplete
              label="Pickup" required
              value={pickup} onSelect={setPickup}
              dotColor="#00d4aa"
              placeholder="Where is the patient?"
            />
            <AddressAutocomplete
              label="Drop / Destination" required
              value={drop} onSelect={setDrop}
              dotColor="#ff4d6d"
              placeholder="Hospital, address or landmark"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Ambulance / Service *</label>
              <select className="inp" value={form.selectedType} onChange={e => selectService(e.target.value)} required>
                <option value="">{services.length ? '-- Select service --' : 'Loading services...'}</option>
                {services.map(sv => <option key={sv.id} value={sv.id}>{sv.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Emergency Type</label>
              <select className="inp" value={form.emergencyType} onChange={e => set('emergencyType', e.target.value)}>
                {EMERGENCY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Trip Type</label>
              <select className="inp" value={form.tripType} onChange={e => set('tripType', e.target.value)}>
                <option value="one_way">➡️ One Way</option>
                <option value="round_trip">🔄 Round Trip / Up &amp; Down</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Schedule</label>
              <div className="flex gap-2">
                <select className="inp" value={form.scheduleType} onChange={e => set('scheduleType', e.target.value)}>
                  <option value="now">🕐 Right Now</option>
                  <option value="later">📅 Scheduled</option>
                </select>
                {form.scheduleType === 'later' && (
                  <input className="inp" type="datetime-local" value={form.scheduleDate} onChange={e => set('scheduleDate', e.target.value)} />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>AC</label>
              {/* Offered only where the selected service actually has an
                  acPerKm rate — the price comes from that rate, never from
                  anything set in this file. */}
              <button
                type="button"
                disabled={!acAvailable}
                onClick={() => set('acEnabled', !form.acEnabled)}
                className="inp flex items-center justify-between text-left"
                style={{ opacity: acAvailable ? 1 : 0.45, cursor: acAvailable ? 'pointer' : 'not-allowed' }}
              >
                <span>{!acAvailable ? 'Not available for this service' : form.acEnabled ? '❄️ AC Included' : 'Non-AC'}</span>
                <span className="w-8 h-4 rounded-full relative transition-colors"
                  style={{ background: form.acEnabled ? 'var(--accent)' : 'var(--border2)' }}>
                  <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                    style={{ left: form.acEnabled ? 18 : 2 }} />
                </span>
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Tie-up Hospital (optional)</label>
              <select className="inp" value={form.dropHospitalId} onChange={e => set('dropHospitalId', e.target.value)}>
                <option value="">-- None --</option>
                {hospitals.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Route preview ── */}
          {(pickup || drop) && (
            <RoutePreviewMap pickup={pickup} drop={drop} polyline={estimate?.polyline} height={240} />
          )}

          {/* ── Automatic quote ── */}
          <div className="rounded-xl px-4 py-3"
            style={{ background: 'rgba(0,212,170,.06)', border: '1px solid rgba(0,212,170,.18)' }}>
            {!pickup || !drop ? (
              <div className="text-xs" style={{ color: 'var(--text3)' }}>
                Set pickup and drop — distance, duration and fare are calculated automatically.
              </div>
            ) : estimating ? (
              <div className="text-xs flex items-center gap-2" style={{ color: 'var(--text2)' }}>
                <RefreshCw size={12} className="animate-spin" /> Calculating route and fare...
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {estimate?.distanceKm != null && <Badge color="blue">📏 {estimate.distanceKm.toFixed(1)} km</Badge>}
                  {fmtDuration(estimate?.durationSec) && <Badge color="gray">⏱️ {fmtDuration(estimate.durationSec)}</Badge>}
                  {form.tripType === 'round_trip' && estimate?.oneWayKm != null && (
                    <Badge color="amber">🔄 {estimate.oneWayKm.toFixed(1)} km each way</Badge>
                  )}
                </div>

                {estimateError && (
                  <div className="text-xs" style={{ color: 'var(--red)' }}>⚠️ {estimateError}</div>
                )}

                {fare && (
                  <>
                    {[
                      ['Base fare', rupee(fare.baseFare)],
                      // compute() folds the AC add-on into additionalCharges and
                      // this quote sends no other extras, so the value is the AC
                      // charge whenever AC is on. Label follows the data.
                      ...(fare.additionalCharges
                        ? [[form.acEnabled ? 'AC charge' : 'Additional charges', rupee(fare.additionalCharges)]]
                        : []),
                      [`GST @ ${fare.gstRate}%`, rupee(fare.gstAmount)],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between text-xs" style={{ color: 'var(--text2)' }}>
                        <span>{label}</span><span className="font-mono">{val}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-1.5" style={{ borderTop: '1px solid var(--border2)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>TOTAL</span>
                      <span className="text-xl font-bold font-mono" style={{ color: 'var(--accent)' }}>{rupee(fare.grandTotal)}</span>
                    </div>
                  </>
                )}

                {!fare && !estimateError && (
                  <div className="text-xs" style={{ color: 'var(--text3)' }}>Select a service to see the fare.</div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Btn type="submit" disabled={submitting || !fare} className="flex-1">
              {submitting ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14} />}
              Dispatch Ambulance
            </Btn>
            <Btn type="button" variant="ghost" onClick={resetForm}>
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

                      {/* Tracking link — only for trips that carry a token.
                          Older trips predate the field; scripts/backfill-
                          tracking-tokens.js gives them one. */}
                      {trackUrl(t) && (
                        <div className="flex gap-2 mt-2.5">
                          <button
                            type="button"
                            onClick={() => copyTrackingLink(t)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{ background: 'rgba(59,158,255,.1)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.2)' }}
                          >
                            <Link2 size={11} /> Copy Tracking Link
                          </button>
                          <a
                            href={trackUrl(t)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center"
                            style={{ background: 'var(--surface)', color: 'var(--text2)', border: '1px solid var(--border2)' }}
                            title="Open the customer's tracking page"
                          >
                            <ExternalLink size={11} />
                          </a>
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