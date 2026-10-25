// src/pages/QuotePage.jsx
//
// The customer's "Quote & Confirm" page, opened from the WhatsApp link the
// dispatch desk sends (/q/:token). Public: no login, and the only thing it
// can read or change is the one quote its token names.
//
// The customer fills in whatever the operator left blank, sees the fare, and
// confirms. The fare is never computed here — every change asks the backend,
// which prices it with the same code as the CRM's own booking form, and the
// confirm books the trip through the same path as POST /api/trips.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { quotesApi, pricingApi, placesApi } from '../api/client';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { Btn, Spinner, rupee, fmtDateTime } from '../components/ui';
import { servicesFromPricing, fmtDuration } from '../utils/serviceTypes';
import { LocateFixed, RefreshCw, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';

const errMessage = (err, fallback) => err?.response?.data?.message || fallback;

// A stored quote place is { address, lat, lng }; AddressAutocomplete works in
// { label, lat, lng }. Converted at the edges only.
const toPicked = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { label: p.address, lat: p.lat, lng: p.lng } : null);
const toPlace  = (p) => (p ? { address: p.label, lat: p.lat, lng: p.lng } : null);

const GEO_ERRORS = {
  1: 'Location permission was denied. Please type your pickup address below.',
  2: 'Your location could not be found. Please type your pickup address below.',
  3: 'Finding your location took too long. Please try again or type the address below.',
};

const Label = ({ children }) => (
  <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>{children}</label>
);

const Shell = ({ children }) => (
  <div className="min-h-screen px-4 py-6" style={{ background: 'var(--ink)' }}>
    <div className="max-w-md mx-auto space-y-4">
      <div className="text-center">
        <div className="text-3xl">🚑</div>
        <div className="font-bold font-display text-lg mt-1" style={{ color: 'var(--accent)' }}>SaveLife Ambulance</div>
      </div>
      {children}
    </div>
  </div>
);

// The helpline comes from the backend (its SUPPORT_PHONE setting), never
// from this file, so there is one number to keep current.
const CallUs = ({ phone, action = 'for help' }) => (phone
  ? <>Please call us on <a href={`tel:${String(phone).replace(/[^\d+]/g, '')}`} style={{ color: 'var(--accent)' }}>{phone}</a> {action}.</>
  : <>Please call SaveLife {action}.</>);

const Notice = ({ icon, title, children }) => (
  <div className="card text-center space-y-2 py-8">
    <div className="flex justify-center">{icon}</div>
    <div className="font-bold font-display">{title}</div>
    <div className="text-sm" style={{ color: 'var(--text2)' }}>{children}</div>
  </div>
);

export default function QuotePage() {
  const { token } = useParams();

  const [quote,    setQuote]    = useState(null);
  const [loadError, setLoadError] = useState('');
  const [supportPhone, setSupportPhone] = useState(null);
  const [pricing,  setPricing]  = useState([]);

  const [patientName, setPatientName] = useState('');
  const [pickup,   setPickup]   = useState(null); // { label, lat, lng }
  const [drop,     setDrop]     = useState(null);
  const [selectedType, setSelectedType] = useState('');
  const [acEnabled, setAcEnabled] = useState(false);

  const [locating,  setLocating]  = useState(false);
  const [geoError,  setGeoError]  = useState('');

  const [estimate,  setEstimate]  = useState(null); // { distanceKm, durationSec, fare }
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const estimateSeqRef = useRef(0);

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [q, p] = await Promise.allSettled([quotesApi.getPublic(token), pricingApi.getAll()]);
        if (cancelled) return;
        if (q.status === 'rejected') {
          setSupportPhone(q.reason?.response?.data?.supportPhone || null);
          setLoadError(errMessage(q.reason, 'This booking link could not be opened.'));
          return;
        }
        const data = q.value.data.quote;
        setQuote(data);
        setSupportPhone(data.supportPhone || null);
        setPatientName(data.patientName || '');
        setPickup(toPicked(data.pickup));
        setDrop(toPicked(data.drop));
        setSelectedType(data.selectedType || '');
        setAcEnabled(!!data.acEnabled);
        if (p.status === 'fulfilled') setPricing(p.value.data.pricing || []);
      } catch {
        if (!cancelled) setLoadError('This booking link could not be opened.');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const services = useMemo(() => servicesFromPricing(pricing), [pricing]);
  const activeService = services.find(s => s.id === String(selectedType).toLowerCase()) || null;
  const acAvailable = !!activeService?.acPerKm;
  const isOpen = quote && quote.status !== 'confirmed' && !quote.expired;

  // Re-price whenever anything the fare depends on changes, once all three
  // are set. Debounced like the dispatch form: every call is a Google
  // Directions request.
  useEffect(() => {
    if (!isOpen || !pickup || !drop || !selectedType) {
      setEstimate(null); setEstimateError(''); setEstimating(false);
      return;
    }
    const seq = ++estimateSeqRef.current;
    setEstimating(true);
    setEstimateError('');
    const timer = setTimeout(async () => {
      try {
        const { data } = await quotesApi.estimatePublic(token, {
          pickup: toPlace(pickup), drop: toPlace(drop), selectedType, acEnabled,
        });
        if (seq !== estimateSeqRef.current) return;
        setEstimate(data);
        setEstimateError(data.fareError || '');
      } catch (err) {
        if (seq !== estimateSeqRef.current) return;
        setEstimate(null);
        setEstimateError(errMessage(err, 'Could not calculate the fare. Please check both addresses.'));
      } finally {
        if (seq === estimateSeqRef.current) setEstimating(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [isOpen, token, pickup, drop, selectedType, acEnabled]);

  const chooseService = (id) => {
    setSelectedType(id);
    const svc = services.find(s => s.id === id);
    if (!svc?.acPerKm) setAcEnabled(false);
  };

  // GPS is a shortcut, never a requirement: every failure leaves the
  // address box ready to type in.
  const shareLocation = () => {
    setGeoError('');
    if (!('geolocation' in navigator)) {
      setGeoError('Location is not available on this device. Please type your pickup address below.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const lat = coords.latitude;
        const lng = coords.longitude;
        let label = `My current location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        try {
          const { data } = await placesApi.reverse(lat, lng);
          if (data.formatted_address) label = data.formatted_address;
        } catch { /* the coordinates are what matter; keep the fallback label */ }
        setPickup({ label, lat, lng });
        setLocating(false);
      },
      (err) => {
        setGeoError(GEO_ERRORS[err.code] || GEO_ERRORS[2]);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const confirm = async () => {
    setConfirmError('');
    if (!patientName.trim()) { setConfirmError('Please enter the patient name.'); return; }
    setConfirming(true);
    try {
      const { data } = await quotesApi.confirmPublic(token, {
        patientName: patientName.trim(),
        pickup: toPlace(pickup), drop: toPlace(drop), selectedType, acEnabled,
      });
      setQuote(data.quote);
    } catch (err) {
      setConfirmError(errMessage(err, 'Could not confirm the booking. Please try again.'));
    } finally {
      setConfirming(false);
    }
  };

  // ── Page states ────────────────────────────────────────────
  if (loadError) {
    return (
      <Shell>
        <Notice icon={<AlertTriangle size={30} style={{ color: 'var(--red)' }} />} title="Link not available">
          {loadError}<br /><CallUs phone={supportPhone} />
        </Notice>
      </Shell>
    );
  }

  if (!quote) return <Shell><Spinner /></Shell>;

  if (quote.status === 'confirmed') {
    return (
      <Shell>
        <Notice icon={<CheckCircle size={34} style={{ color: 'var(--accent)' }} />} title="Booking confirmed">
          {quote.tripNumber && <div className="font-mono mb-2" style={{ color: 'var(--accent)' }}>{quote.tripNumber}</div>}
          Our team is assigning an ambulance now. You will get the driver details on WhatsApp.
        </Notice>
        {quote.trackingUrl && (
          <a href={quote.trackingUrl}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(59,158,255,.12)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.3)' }}>
            <ExternalLink size={14} /> Track your ambulance
          </a>
        )}
      </Shell>
    );
  }

  if (quote.expired) {
    return (
      <Shell>
        <Notice icon={<AlertTriangle size={30} style={{ color: 'var(--amber)' }} />} title="This link has expired">
          It expired on {fmtDateTime(quote.expiresAt)}.<br /><CallUs phone={supportPhone} action="to book" />
        </Notice>
      </Shell>
    );
  }

  const fare = estimate?.fare || null;
  const ready = !!(pickup && drop && selectedType && fare && patientName.trim());

  return (
    <Shell>
      <div className="text-center text-sm" style={{ color: 'var(--text2)' }}>
        Confirm your ambulance booking{quote.phoneMasked ? ` for ${quote.phoneMasked}` : ''}.
      </div>

      <div className="card space-y-4">
        <div>
          <Label>Patient name *</Label>
          <input className="inp" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Full name" maxLength={80} />
        </div>

        <div className="space-y-2">
          <Btn type="button" variant="blue" size="lg" className="w-full justify-center" onClick={shareLocation} disabled={locating}>
            {locating ? <RefreshCw size={15} className="animate-spin" /> : <LocateFixed size={15} />}
            {locating ? 'Finding your location…' : 'Share my location'}
          </Btn>
          {geoError && <div className="text-xs" style={{ color: 'var(--amber)' }}>⚠️ {geoError}</div>}
          <AddressAutocomplete
            label="Pickup" required
            value={pickup} onSelect={setPickup}
            dotColor="#00d4aa"
            placeholder="Or search your pickup address"
          />
        </div>

        <AddressAutocomplete
          label="Drop / Hospital" required
          value={drop} onSelect={setDrop}
          dotColor="#ff4d6d"
          placeholder="Hospital, address or landmark"
        />

        <div>
          <Label>Service *</Label>
          <select className="inp" value={String(selectedType).toLowerCase()} onChange={e => chooseService(e.target.value)}>
            <option value="">{services.length ? '-- Select service --' : 'Loading services...'}</option>
            {services.map(sv => <option key={sv.id} value={sv.id}>{sv.label}</option>)}
          </select>
        </div>

        {acAvailable && (
          <button
            type="button"
            onClick={() => setAcEnabled(v => !v)}
            className="inp flex items-center justify-between text-left"
          >
            <span>{acEnabled ? '❄️ AC Included' : 'Non-AC'}</span>
            <span className="w-8 h-4 rounded-full relative transition-colors"
              style={{ background: acEnabled ? 'var(--accent)' : 'var(--border2)' }}>
              <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                style={{ left: acEnabled ? 18 : 2 }} />
            </span>
          </button>
        )}
      </div>

      {/* ── Fare ── */}
      <div className="rounded-xl px-4 py-4"
        style={{ background: 'rgba(0,212,170,.06)', border: '1px solid rgba(0,212,170,.18)' }}>
        {!pickup || !drop || !selectedType ? (
          <div className="text-sm text-center" style={{ color: 'var(--text3)' }}>
            Set pickup, drop and service to see your fare.
          </div>
        ) : estimating ? (
          <div className="text-sm flex items-center justify-center gap-2" style={{ color: 'var(--text2)' }}>
            <RefreshCw size={13} className="animate-spin" /> Calculating fare…
          </div>
        ) : estimateError ? (
          <div className="text-sm" style={{ color: 'var(--red)' }}>⚠️ {estimateError}</div>
        ) : estimate && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm" style={{ color: 'var(--text2)' }}>
              <span>Distance</span><span className="font-mono">{Number(estimate.distanceKm).toFixed(1)} km</span>
            </div>
            {fmtDuration(estimate.durationSec) && (
              <div className="flex justify-between text-sm" style={{ color: 'var(--text2)' }}>
                <span>Approx. travel time</span><span className="font-mono">{fmtDuration(estimate.durationSec)}</span>
              </div>
            )}
            {fare && (
              <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid var(--border2)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>TOTAL</span>
                <span className="text-2xl font-bold font-mono" style={{ color: 'var(--accent)' }}>{rupee(fare.grandTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmError && <div className="text-sm text-center" style={{ color: 'var(--red)' }}>⚠️ {confirmError}</div>}

      <Btn type="button" size="lg" className="w-full justify-center py-4 text-base" onClick={confirm} disabled={!ready || confirming || estimating}>
        {confirming ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle size={16} />}
        {confirming ? 'Confirming…' : 'Confirm Booking'}
      </Btn>

      <div className="text-[11px] text-center" style={{ color: 'var(--text3)' }}>
        Final bill may include waiting charges as per SaveLife's rate card. Link valid until {fmtDateTime(quote.expiresAt)}.
      </div>
    </Shell>
  );
}
