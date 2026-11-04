// src/components/IncomingBookingAlert.jsx
//
// Ola/Uber-style "Incoming Booking": a full-screen ringing alert, on every
// CRM page, for each new customer booking (website, app, WhatsApp) nobody
// has answered yet. Polls GET /api/trips/incoming — the server decides what
// counts as unanswered, so a booking Accepted or Dismissed by ANY operator,
// in any tab, stops ringing everywhere on the next poll and never rings
// again after a reload. Quote links the customer confirmed ring too;
// bookings an operator typed at the CRM desk never appear there.
//
// One booking at a time; the rest queue behind it. Rings until Accept,
// Dismiss or RING_TIMEOUT_MS. A booking that times out is NOT acknowledged
// on the server (nobody answered it) — it just stops ringing in this tab
// and stays waiting on the dispatch board.
//
// Sound goes through Shell's SOS AudioContext, so the one "Enable SOS
// sound" tap unlocks both. Foreground only: a background/locked-screen push
// is a later phase.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Phone, PhoneOff, MapPin, Volume2 } from 'lucide-react';
import { tripsApi } from '../api/client';
import { ambulanceTypeLabel } from '../utils/serviceTypes';
import { custPhone, rupee, fmtDateTime } from './ui';

const POLL_MS         = 5000;
const RING_TIMEOUT_MS = 60000;
const RING_CYCLE_MS   = 2000;
// Matches one ring cycle: buzz, gap, buzz, rest.
const VIBRATE_PATTERN = [400, 150, 400, 1050];

const SOURCE_LABELS = { whatsapp: 'WhatsApp', web: 'Website', app: 'Website / App' };
// The server marks a quote link the customer confirmed (incomingVia).
const sourceLabel = (t) => (t.incomingVia === 'quote_link'
  ? 'Quote link — confirmed by customer'
  : SOURCE_LABELS[t.bookingSource] || 'Website / App');

// One "brrring … brrring" — two bursts of a bright two-tone trill (a
// classic phone bell, ~22 Hz warble), through a compressor so it can run
// loud without clipping. Triangle waves and a trill, deliberately unlike
// the SOS square-wave wail, so the two are never confused.
const playRingCycle = (ctx) => {
  const t0 = ctx.currentTime + 0.02;
  const comp = ctx.createDynamicsCompressor();
  comp.connect(ctx.destination);
  [0, 0.55].forEach((start) => {
    const s = t0 + start;
    const burst = ctx.createGain();
    burst.gain.setValueAtTime(0, s);
    burst.gain.linearRampToValueAtTime(1, s + 0.01);
    burst.gain.setValueAtTime(1, s + 0.40);
    burst.gain.linearRampToValueAtTime(0, s + 0.45);
    burst.connect(comp);

    // Trill: an LFO swings this gain between 0 and 1.
    const trill = ctx.createGain();
    trill.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 22;
    depth.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(trill.gain);
    trill.connect(burst);
    lfo.start(s);
    lfo.stop(s + 0.46);

    [1046, 1318].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(trill);
      osc.start(s);
      osc.stop(s + 0.46);
    });
  });
};

const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* unsupported */ } };

export default function IncomingBookingAlert({ active, audioCtxRef, soundEnabled, onEnableSound }) {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);      // unanswered bookings, oldest first; queue[0] is ringing
  const [busy, setBusy]   = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RING_TIMEOUT_MS / 1000);
  const handledRef = useRef(new Set());        // answered or timed out in this tab: never re-queued

  const current = queue[0] || null;

  // ── Poll ────────────────────────────────────────────────
  useEffect(() => {
    if (!active) { setQueue([]); return; }
    let stopped = false;
    const load = async () => {
      try {
        const { data } = await tripsApi.incoming();
        if (stopped) return;
        const trips = (data.trips || []).filter((t) => !handledRef.current.has(t._id));
        const live = new Set(trips.map((t) => t._id));
        setQueue((prev) => {
          // Drop what someone else answered (or that got assigned/cancelled),
          // keep the order of what's already queued, append the new ones.
          const kept = prev.filter((t) => live.has(t._id));
          const keptIds = new Set(kept.map((t) => t._id));
          return [...kept, ...trips.filter((t) => !keptIds.has(t._id))];
        });
      } catch { /* the next poll retries; the queue stays as it was */ }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [active]);

  // ── Ring while a booking is showing ─────────────────────
  useEffect(() => {
    if (!current) return undefined;
    const ring = () => {
      const ctx = audioCtxRef.current;
      if (soundEnabled && ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        try { playRingCycle(ctx); } catch { /* audio unavailable */ }
      }
      vibrate(VIBRATE_PATTERN);
    };
    ring();
    const ringTimer = setInterval(ring, RING_CYCLE_MS);
    return () => { clearInterval(ringTimer); vibrate(0); };
  }, [current?._id, soundEnabled]);

  // ── 60s timeout, per booking (not restarted by enabling sound) ──
  useEffect(() => {
    if (!current) return undefined;
    const id = current._id;
    const name = current.patientName;
    const endsAt = Date.now() + RING_TIMEOUT_MS;
    setSecondsLeft(RING_TIMEOUT_MS / 1000);
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        handledRef.current.add(id);
        setQueue((prev) => prev.filter((t) => t._id !== id));
        toast(`⏰ Booking for ${name || 'a customer'} not answered — still waiting on the Dispatch board`, { duration: 8000 });
      }
    }, 500);
    return () => clearInterval(tick);
  }, [current?._id]);

  if (!current) return null;

  const answer = async (action) => {
    const trip = current;
    setBusy(true);
    handledRef.current.add(trip._id);
    setQueue((prev) => prev.filter((t) => t._id !== trip._id)); // stop ringing at once
    try {
      const { data } = await tripsApi.acknowledge(trip._id, action);
      if (!data.acknowledged && data.ack) {
        const who = data.ack.by?.name || 'another operator';
        toast(`Already ${data.ack.action || 'handled'} by ${who}`, { icon: 'ℹ️' });
      }
    } catch (err) {
      // Network failure (HTTP errors already toast via the API client).
      if (!err.response) toast.error('Could not reach the server — other screens may keep ringing for this booking');
    } finally {
      setBusy(false);
    }
    if (action === 'accepted') navigate(`/dispatch?trip=${trip._id}`);
  };

  const ambulance = ambulanceTypeLabel(current.selectedType);
  const drop      = current.dropHospital?.name || current.dropAddress;
  const fare      = Number.isFinite(Number(current.estimatedFare)) && current.estimatedFare != null ? rupee(current.estimatedFare) : '';
  const isLater   = current.scheduleType === 'later';
  const waiting   = queue.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="alertdialog" aria-modal="true" aria-labelledby="incoming-booking-title"
      style={{ background: 'rgba(5,8,18,.88)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-3xl p-6 banner-pop"
        style={{ background: 'var(--surface)', border: '2px solid var(--accent)', boxShadow: '0 0 0 6px rgba(0,212,170,.15), 0 20px 60px rgba(0,0,0,.6)' }}>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full pulse-dot" style={{ background: 'var(--accent)' }} />
            <span id="incoming-booking-title" className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              Incoming Booking
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>{secondsLeft}s</span>
        </div>

        <div className="text-center mb-5">
          <div className="text-5xl mb-2" aria-hidden="true">🚑</div>
          <div className="text-2xl font-bold font-display">{current.patientName || 'Customer'}</div>
          <div className="text-base font-mono mt-1" style={{ color: 'var(--text2)' }}>
            {custPhone(current.patientPhone, current.patientPhoneMasked)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
            via {sourceLabel(current)} · {fmtDateTime(current.createdAt)}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl p-4 mb-4 text-sm" style={{ background: 'var(--surface2)' }}>
          {current.pickup?.address && (
            <div className="flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <span><span className="font-semibold">Pickup:</span> {current.pickup.address}</span>
            </div>
          )}
          {drop && (
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0" aria-hidden="true">🏥</span>
              <span><span className="font-semibold">Drop:</span> {drop}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1" style={{ color: 'var(--text2)' }}>
            {ambulance && <span>🚑 {ambulance}</span>}
            {current.tripType === 'round_trip' && <span>🔄 Round trip</span>}
            {fare && <span>💰 {fare}</span>}
            <span style={isLater ? { color: 'var(--amber)' } : undefined}>
              {isLater ? `📅 Scheduled ${fmtDateTime(current.scheduleDate)}` : '⚡ Now'}
            </span>
          </div>
        </div>

        {!soundEnabled && (
          <button onClick={onEnableSound}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold mb-3"
            style={{ background: 'rgba(255,184,0,.12)', color: 'var(--amber)', border: '1px solid rgba(255,184,0,.35)' }}>
            <Volume2 size={16} /> Sound is off — tap to enable ringing
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => answer('dismissed')} disabled={busy}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold"
            style={{ background: 'var(--red)', color: '#fff' }}>
            <PhoneOff size={20} /> Dismiss
          </button>
          <button onClick={() => answer('accepted')} disabled={busy}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold"
            style={{ background: '#16a34a', color: '#fff' }}>
            <Phone size={20} /> Accept
          </button>
        </div>

        {waiting > 0 && (
          <div className="text-center text-xs font-semibold mt-3" style={{ color: 'var(--amber)' }}>
            +{waiting} more booking{waiting > 1 ? 's' : ''} waiting
          </div>
        )}
      </div>
    </div>
  );
}
