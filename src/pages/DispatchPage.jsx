// src/pages/DispatchPage.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { tripsApi, hospitalsApi, pricingApi, quotesApi } from '../api/client';
import AddressAutocomplete from '../components/AddressAutocomplete';
import CallButton from '../components/CallButton';
import { ambulanceTypeLabel, servicesFromPricing, fmtDuration } from '../utils/serviceTypes';
import RoutePreviewMap from '../components/RoutePreviewMap';
import { PageHeader, StatusBadge, Badge, Btn, Modal, rupee, Spinner, fmtDateTime as fmtStamp, timeAgo } from '../components/ui';
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
// www, matching the host the SMS and WhatsApp links use: an operator
// reading a link out to a caller must not quote a different one.
const TRACK_BASE = 'https://www.savelife.health/track';
const trackUrl = (t) => (t.trackingToken ? `${TRACK_BASE}/${t.trackingToken}` : null);

// "Send Quote Link": only the phone is required. Whatever is left blank the
// customer fills in on their own page before confirming.
const EMPTY_QUOTE = { phone: '', patientName: '', selectedType: '', acEnabled: false };

const QUOTE_STATUS = {
  sent     : { color: 'blue',  label: 'Sent' },
  viewed   : { color: 'amber', label: 'Viewed' },
  confirmed: { color: 'green', label: 'Confirmed' },
};

const isMobile = (v) => /^[6-9]\d{9}$/.test(String(v).replace(/\D/g, '').slice(-10));
const toQuotePlace = (p) => (p ? { address: p.label, lat: p.lat, lng: p.lng } : undefined);

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

const TRIP_TYPE_LABELS = { one_way: 'One Way', round_trip: 'Round Trip / Up & Down' };

// '' rather than '—' for a missing date: every caller here hides the line
// or badge when there's nothing to show.
const fmtDateTime = (v) => fmtStamp(v, '');

// scheduleDate is only persisted for scheduleType 'later', but a stray date
// on a booking with no scheduleType is still worth surfacing rather than
// swallowing. A 'later' booking's time is shown on BookingSummary's
// "📅 Scheduled:" line instead, so the badge doesn't repeat it.
const scheduleLabel = (t) => {
  const when = fmtDateTime(t.scheduleDate);
  if (t.scheduleType === 'later') return 'Scheduled';
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
  // Same strict test as AC: a trip that predates the field shows no badge.
  const hasHelper = typeof t.helperEnabled === 'boolean';
  const isRound   = t.tripType === 'round_trip';
  const eta       = fmtDuration(t.estimatedDurationSec);
  const bookedAt  = fmtDateTime(t.createdAt);
  const pickupAt  = t.scheduleType === 'later' ? fmtDateTime(t.scheduleDate) : '';
  const money     = dotJoin(km !== null && `📏 ${km} km`, eta && `⏱️ ${eta}`, fare !== null && `💰 ${rupee(fare)}`);
  const hasBadges = ambulance || hasAc || hasHelper || tripType || schedule || emergency;

  return (
    <div className="space-y-1">
      {(bookedAt || pickupAt) && (
        <div className="text-[11px] font-mono flex flex-wrap gap-x-3" style={{ color: 'var(--text3)' }}>
          {bookedAt && <span>🕒 Booked {bookedAt}</span>}
          {pickupAt && <span style={{ color: 'var(--amber)' }}>📅 Scheduled: {pickupAt}</span>}
        </div>
      )}

      {hasBadges && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {ambulance && <Badge color="green">🚑 {ambulance}</Badge>}
          {hasAc     && <Badge color={t.acEnabled ? 'blue' : 'gray'}>{t.acEnabled ? '❄️ AC Included' : 'Non-AC'}</Badge>}
          {hasHelper && <Badge color={t.helperEnabled ? 'green' : 'gray'}>{t.helperEnabled ? '🧑‍⚕️ Helper added' : 'No helper'}</Badge>}
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
  // tripId -> ranked suggestions, fetched when the operator opens the
  // assign dropdown for that trip. Not preloaded for every trip on the
  // board: it is a per-trip distance calculation and most rows on screen
  // are already assigned.
  const [suggestions, setSuggestions] = useState({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [newBookings, setNewBookings]   = useState([]); // freshly-arrived trips awaiting acknowledgment
  const [quotes,      setQuotes]      = useState([]);
  const [quoteOpen,   setQuoteOpen]   = useState(false);
  const [quoteForm,   setQuoteForm]   = useState(EMPTY_QUOTE);
  const [quotePickup, setQuotePickup] = useState(null);
  const [quoteDrop,   setQuoteDrop]   = useState(null);
  const [sendingQuote, setSendingQuote] = useState(false);
  const intervalRef      = useRef();
  const knownTripIdsRef  = useRef(null); // null = baseline not yet captured (skip alert on first load)
  const audioCtxRef      = useRef(null);
  const ringTimerRef     = useRef(null);
  const soundEnabledRef  = useRef(false); // mirrors soundEnabled for the setInterval closure
  const estimateSeqRef   = useRef(0);     // drops out-of-order quote responses

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // The dropdown is whatever the Pricing collection currently offers.
  const services = useMemo(() => servicesFromPricing(pricing), [pricing]);

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
    intervalRef.current = setInterval(() => { loadLiveBoard(); loadQuotes(); }, 20000);
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
      await Promise.all([loadLiveBoard(), loadQuotes()]);
    } finally { setLoading(false); }
  };

  const loadQuotes = async () => {
    try {
      const { data } = await quotesApi.getAll();
      setQuotes(data.quotes || []);
    } catch { /* silent, like the live board */ }
  };

  const setQuoteField = (k, v) => setQuoteForm(f => ({ ...f, [k]: v }));

  const closeQuote = () => {
    setQuoteOpen(false);
    setQuoteForm(EMPTY_QUOTE);
    setQuotePickup(null);
    setQuoteDrop(null);
  };

  const quoteService     = services.find(s => s.id === quoteForm.selectedType) || null;
  const quoteAcAvailable = !!quoteService?.acPerKm;

  const sendQuote = async (e) => {
    e.preventDefault();
    if (!isMobile(quoteForm.phone)) { toast.error('Enter a valid 10-digit mobile number'); return; }

    setSendingQuote(true);
    try {
      const { data } = await quotesApi.create({
        phone       : quoteForm.phone,
        patientName : quoteForm.patientName.trim() || undefined,
        pickup      : toQuotePlace(quotePickup),
        drop        : toQuotePlace(quoteDrop),
        selectedType: quoteForm.selectedType || undefined,
        acEnabled   : quoteAcAvailable && quoteForm.acEnabled,
      });
      if (data.quote?.whatsappSent) {
        toast.success('📲 Quote link sent on WhatsApp');
      } else {
        // The quote still exists — the operator can copy its link from the
        // Quote Links list and share it another way.
        toast.error(`WhatsApp not sent${data.quote?.whatsappError ? ` — ${data.quote.whatsappError}` : ''}. Copy the link from Quote Links.`, { duration: 8000 });
      }
      closeQuote();
      await loadQuotes();
    } catch { /* axios interceptor shows error */ }
    finally { setSendingQuote(false); }
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
      // Ambulance-sourced units only. The legacy Vehicle collection is
      // empty in production and nothing creates one, so a 'vehicle' entry
      // here would be a row a dispatcher could pick that no driver is
      // actually sitting in.
      setVehicles((data.availableVehicles || []).filter(v => v.source === 'ambulance'));
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
  const loadSuggestions = async (tripId) => {
    if (suggestions[tripId] || loadingSuggestions === tripId) return;
    setLoadingSuggestions(tripId);
    try {
      const { data } = await tripsApi.suggestedAmbulances(tripId);
      setSuggestions(prev => ({ ...prev, [tripId]: data }));
    } catch {
      // Silent: the dropdown still lists every on-duty unit from the live
      // board below, just unranked. A failed ranking must not block
      // dispatch.
      setSuggestions(prev => ({ ...prev, [tripId]: null }));
    } finally { setLoadingSuggestions(null); }
  };

  const assignDriver = async (tripId, id, source) => {
    if (!id) return;
    setAssigning(tripId);
    try {
      // ambulanceId only — the backend's vehicleId branch is gone with the
      // legacy Vehicle path, and every unit offered above is ambulance-sourced.
      await tripsApi.assign(tripId, { ambulanceId: id });
      toast.success('🚑 Driver assigned!');
      // Drop the cached ranking for this trip. The unit just taken is no
      // longer free, and a stale list would keep offering it.
      setSuggestions(prev => { const next = { ...prev }; delete next[tripId]; return next; });
      await loadLiveBoard();
    } catch { /* axios interceptor shows error */ }
    finally { setAssigning(null); }
  };

  // navigator.clipboard needs a secure context and can be refused; the
  // toast shows the URL either way so the operator can still read it out
  // or select it by hand.
  const copyTrackingLink = (t) => copyLink(trackUrl(t), 'Tracking link copied');

  const copyLink = async (url, message) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(message);
    } catch {
      toast(url, { duration: 8000 });
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        title="Dispatch Center"
        subtitle="Book emergency · Live fleet board · Assign ambulance"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="blue" size="sm" onClick={() => setQuoteOpen(true)}>
              <Link2 size={13} /> Send Quote Link
            </Btn>
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
        <div className="fixed top-4 left-4 right-4 sm:left-auto z-50 space-y-2 sm:w-full max-w-sm">
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
                <Phone size={10} /> {b.patientPhoneMasked}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Patient Name *</label>
              <input className="inp" value={form.patientName} onChange={e => set('patientName', e.target.value)} placeholder="Full name" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Phone *</label>
              <input className="inp" value={form.patientPhone} onChange={e => set('patientPhone', e.target.value)} placeholder="+91 XXXXX XXXXX" required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            <Phone size={10}/> {t.patientPhoneMasked}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <StatusBadge status={t.status} />
                          {/* Masked: the CRM never has the number; this rings
                              your phone and connects to the customer. */}
                          <CallButton target={{ tripId: t._id }} />
                        </div>
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
                            onFocus={() => loadSuggestions(t._id)}
                            onMouseDown={() => loadSuggestions(t._id)}
                            onChange={(e) => {
                              const [id, source] = e.target.value.split('|');
                              assignDriver(t._id, id, source);
                            }}
                          >
                            <option value="">
                              {assigning === t._id
                                ? 'Assigning...'
                                : loadingSuggestions === t._id
                                  ? 'Finding nearest…'
                                  : '🚑 Assign Vehicle / Driver'}
                            </option>

                            {/* Ranked by how far the driver's last GPS fix
                                is from this pickup. Shown first so the
                                nearest crew is the easiest thing to pick —
                                the dispatcher still chooses. */}
                            {suggestions[t._id]?.suggestions?.length > 0 && (
                              <optgroup label={suggestions[t._id].pickupHasCoordinates
                                ? 'Nearest first'
                                : 'On duty (no pickup GPS — not ranked)'}>
                                {suggestions[t._id].suggestions.map(s => (
                                  <option key={`s-${s._id}`} value={`${s._id}|ambulance`}>
                                    {s.distanceKm != null ? `${s.distanceKm} km · ` : 'No GPS · '}
                                    {s.partner?.isPlatformOwner ? '★ ' : ''}
                                    {s.partner?.label ? `${s.partner.label} · ` : ''}
                                    {s.registrationNumber}
                                    {s.driver?.name ? ` · ${s.driver.name}` : ''}
                                    {s.locationAgeSec != null && s.locationAgeSec > 300
                                      ? ` · ${Math.round(s.locationAgeSec / 60)}m old`
                                      : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}

                            {/* The unranked live-board list stays as the
                                fallback, so a failed or not-yet-loaded
                                ranking never leaves the dispatcher with an
                                empty dropdown. */}
                            <optgroup label="All on duty">
                              {vehicles.map(v => (
                                <option key={v._id} value={`${v._id}|${v.source}`}>
                                  {v.partner?.isPlatformOwner ? '★ ' : ''}
                                  {v.partner?.label ? `${v.partner.label} · ` : ''}
                                  {v.registrationNumber} · {v.assignedDriver?.name || 'No driver'}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div className="text-xs font-mono" style={{ color: 'var(--amber)' }}>
                            🚑 {t.vehicle?.registrationNumber || t.ambulance?.registrationNumber} · {t.driver?.name}
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{timeAgo(t.createdAt)}</div>
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

          {/* ── Quote Links: what each customer did with the link ── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold font-display text-sm">Quote Links</h3>
              <button onClick={loadQuotes}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: 'var(--text3)', background: 'var(--surface2)' }}>
                <RefreshCw size={13} />
              </button>
            </div>

            {quotes.length === 0
              ? <div className="text-center py-6 text-sm" style={{ color: 'var(--text3)' }}>No quote links in the last 7 days</div>
              : <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 420 }}>
                  {quotes.map(q => {
                    const st = q.expired
                      ? { color: 'gray', label: 'Expired' }
                      : (QUOTE_STATUS[q.status] || { color: 'gray', label: q.status });
                    return (
                      <div key={q._id} className="rounded-xl p-3"
                        style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{q.patientName || 'Customer'}</div>
                            <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text3)' }}>
                              <Phone size={10} /> {q.phoneMasked}
                              {q.selectedType && <> · {ambulanceTypeLabel(q.selectedType)}</>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <Badge color={st.color}>{st.label}</Badge>
                            <CallButton target={{ quoteId: q._id }} />
                          </div>
                        </div>

                        <div className="text-[11px] font-mono mt-2 space-y-0.5" style={{ color: 'var(--text3)' }}>
                          <div>📤 Sent {fmtStamp(q.sentAt)}</div>
                          {q.viewedAt    && <div>👀 Viewed {fmtStamp(q.viewedAt)}</div>}
                          {q.confirmedAt && <div style={{ color: 'var(--accent)' }}>✅ Confirmed {fmtStamp(q.confirmedAt)}</div>}
                        </div>

                        {!q.whatsappSent && (
                          <div className="text-[11px] mt-1.5" style={{ color: 'var(--amber)' }}>
                            ⚠️ WhatsApp not sent{q.whatsappError ? ` — ${q.whatsappError}` : ''}. Share the link by hand.
                          </div>
                        )}

                        {q.trip && (
                          <div className="text-xs font-mono mt-1.5" style={{ color: 'var(--amber)' }}>
                            🚑 {q.trip.tripNumber}{numOr(q.trip.estimatedFare) !== null && <> · {rupee(q.trip.estimatedFare)}</>}
                          </div>
                        )}

                        {q.status !== 'confirmed' && !q.expired && (
                          <button
                            type="button"
                            onClick={() => copyLink(q.url, 'Quote link copied')}
                            className="w-full flex items-center justify-center gap-1 mt-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{ background: 'rgba(59,158,255,.1)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.2)' }}
                          >
                            <Link2 size={11} /> Copy Quote Link
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        </div>
      </div>

      {/* ── Send Quote Link ── */}
      <Modal open={quoteOpen} onClose={closeQuote} title="📲 Send Quote Link" width="max-w-xl">
        <form onSubmit={sendQuote} className="space-y-4">
          <div className="text-xs" style={{ color: 'var(--text3)' }}>
            Only the phone is required. Anything you leave empty, the customer fills in on their link before confirming.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>WhatsApp Number *</label>
              <input className="inp" value={quoteForm.phone} onChange={e => setQuoteField('phone', e.target.value)} placeholder="+91 XXXXX XXXXX" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Patient Name</label>
              <input className="inp" value={quoteForm.patientName} onChange={e => setQuoteField('patientName', e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AddressAutocomplete
              label="Pickup"
              value={quotePickup} onSelect={setQuotePickup}
              dotColor="#00d4aa"
              placeholder="Optional — customer can share GPS"
            />
            <AddressAutocomplete
              label="Drop / Destination"
              value={quoteDrop} onSelect={setQuoteDrop}
              dotColor="#ff4d6d"
              placeholder="Optional"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Ambulance / Service</label>
              <select className="inp" value={quoteForm.selectedType}
                onChange={e => {
                  const svc = services.find(s => s.id === e.target.value);
                  setQuoteForm(f => ({ ...f, selectedType: e.target.value, acEnabled: svc?.acPerKm ? f.acEnabled : false }));
                }}>
                <option value="">-- Customer chooses --</option>
                {services.map(sv => <option key={sv.id} value={sv.id}>{sv.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>AC</label>
              <button
                type="button"
                disabled={!quoteAcAvailable}
                onClick={() => setQuoteField('acEnabled', !quoteForm.acEnabled)}
                className="inp flex items-center justify-between text-left"
                style={{ opacity: quoteAcAvailable ? 1 : 0.45, cursor: quoteAcAvailable ? 'pointer' : 'not-allowed' }}
              >
                <span>{!quoteAcAvailable ? (quoteForm.selectedType ? 'Not available for this service' : 'Choose a service first') : quoteForm.acEnabled ? '❄️ AC Included' : 'Non-AC'}</span>
                <span className="w-8 h-4 rounded-full relative transition-colors"
                  style={{ background: quoteForm.acEnabled ? 'var(--accent)' : 'var(--border2)' }}>
                  <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                    style={{ left: quoteForm.acEnabled ? 18 : 2 }} />
                </span>
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Btn type="submit" disabled={sendingQuote} className="flex-1">
              {sendingQuote ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              Send on WhatsApp
            </Btn>
            <Btn type="button" variant="ghost" onClick={closeQuote}>Cancel</Btn>
          </div>
        </form>
      </Modal>

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