// src/components/AddressAutocomplete.jsx
//
// Google Places autocomplete for the dispatch desk, proxied through the
// backend's /api/places/* so the Maps key never reaches the browser — the
// same two-step (predictions -> details) the SaveLife website booking form
// uses, so an operator taking a phone booking resolves a location to the
// exact same lat/lng a customer would.
//
// onSelect fires only once a prediction has been resolved to coordinates.
// Typing alone never produces a value: a booking with an address string but
// no coordinates cannot be routed or priced, and silently accepting one is
// how a trip ends up with a guessed fare.
import React, { useState, useEffect, useRef } from 'react';
import { placesApi } from '../api/client';
import { MapPin, X, Loader2 } from 'lucide-react';

const DEBOUNCE_MS = 350;
const MIN_CHARS   = 3;

export default function AddressAutocomplete({
  label,
  placeholder = 'Search address, area or landmark',
  value,          // { label, lat, lng } | null
  onSelect,
  dotColor = 'var(--accent)',
  required = false,
}) {
  const [text,    setText]    = useState(value?.label || '');
  const [preds,   setPreds]   = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef  = useRef(null);
  const boxRef    = useRef(null);
  // Guards against a slow response for an earlier keystroke overwriting the
  // predictions for a later one.
  const seqRef    = useRef(0);

  // Keep the input in step when the parent clears or replaces the value.
  useEffect(() => { setText(value?.label || ''); }, [value?.label]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = (raw) => {
    setText(raw);
    // The old selection is stale the moment the text diverges from it — tell
    // the parent now so the fare and map clear instead of showing a price
    // for an address that is no longer in the box.
    if (value && raw !== value.label) onSelect(null);

    clearTimeout(timerRef.current);
    if (raw.trim().length < MIN_CHARS) { setPreds([]); setOpen(false); return; }

    timerRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      setLoading(true);
      try {
        const { data } = await placesApi.autocomplete(raw.trim());
        if (seq !== seqRef.current) return;
        setPreds(data.predictions || []);
        setOpen(true);
      } catch {
        if (seq === seqRef.current) { setPreds([]); setOpen(false); }
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const choose = async (p) => {
    setOpen(false);
    setLoading(true);
    try {
      const { data } = await placesApi.details(p.place_id);
      if (!data.success || data.lat == null || data.lng == null) return;
      const picked = { label: data.formatted_address || p.description, lat: data.lat, lng: data.lng };
      setText(picked.label);
      onSelect(picked);
    } catch {
      /* interceptor toasts */
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setText('');
    setPreds([]);
    setOpen(false);
    onSelect(null);
  };

  return (
    <div ref={boxRef} className="relative">
      {label && (
        <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: dotColor }} />
          {label}{required && ' *'}
        </label>
      )}

      <div className="relative">
        <input
          className="inp pr-8"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => preds.length && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
          {loading
            ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text3)' }} />
            : text && <button type="button" onClick={clear} style={{ color: 'var(--text3)' }}><X size={13} /></button>}
        </span>
      </div>

      {/* Coordinates confirmed — the operator can see the location is
          routable, not just typed. */}
      {value && (
        <div className="text-[10px] mt-1 font-mono" style={{ color: 'var(--accent)' }}>
          ✓ {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </div>
      )}

      {open && preds.length > 0 && (
        <div
          className="absolute z-30 left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border2)', maxHeight: 240, overflowY: 'auto' }}
        >
          {preds.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onClick={() => choose(p)}
              className="w-full text-left px-3 py-2 text-xs flex items-start gap-2 transition-colors"
              style={{ color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <MapPin size={11} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text3)' }} />
              <span>{p.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
