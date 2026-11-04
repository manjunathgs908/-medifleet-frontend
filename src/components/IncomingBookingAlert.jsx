// src/components/IncomingBookingAlert.jsx
//
// Ola/Uber-style incoming alert: a full-screen ringing popup, on every CRM
// page, for each item nobody has answered yet — a new customer booking
// (website, app, WhatsApp, customer-confirmed quote link), a new WhatsApp
// lead, or a WhatsApp conversation that just reached a service choice.
// Polls GET /api/trips/incoming (its typed `alerts` list) — the server
// decides what counts as unanswered, so anything Accepted/Opened or
// Dismissed by ANY operator, in any tab, stops ringing everywhere on the
// next poll and never rings again after a reload. Bookings an operator
// typed at the CRM desk never appear there.
//
// One at a time; the rest queue behind it. Rings until Accept/Open,
// Dismiss or RING_TIMEOUT_MS. One that times out is NOT acknowledged on
// the server (nobody answered it) — it just stops ringing in this tab and
// stays on its page (Dispatch board, WhatsApp Leads, WhatsApp Chats).
//
// Sound goes through Shell's SOS AudioContext, so the one "Enable SOS
// sound" tap unlocks both. Foreground only: a background/locked-screen push
// is a later phase.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Phone, PhoneOff, MapPin, Volume2, MessageCircle } from 'lucide-react';
import { tripsApi, alertsApi } from '../api/client';
import { ambulanceTypeLabel } from '../utils/serviceTypes';
import { custPhone, rupee, fmtDateTime } from './ui';

const POLL_MS         = 5000;
const RING_TIMEOUT_MS = 60000;
const RING_ON_S       = 1.8;   // one "brrrrring"
const RING_CYCLE_MS   = 2500;  // ring + ~0.7s gap
// Matches one ring cycle: buzz while it rings, rest in the gap.
const VIBRATE_PATTERN = [1800, 700];
// Final output level — just under digital full scale (1.0), so the
// clipped, square-ish signal is as loud as the device volume allows
// without inter-sample overs crackling. The SOS siren peaks at 0.3.
const RING_LEVEL      = 0.95;

const SOURCE_LABELS = { whatsapp: 'WhatsApp', web: 'Website', app: 'Website / App' };
// The server marks a quote link the customer confirmed (incomingVia).
const sourceLabel = (t) => (t.incomingVia === 'quote_link'
  ? 'Quote link — confirmed by customer'
  : SOURCE_LABELS[t.bookingSource] || 'Website / App');

// Soft-clip curve (tanh): drives the mixed tones up to full scale, so the
// ring keeps near-maximum loudness all the way through instead of only on
// peaks, and adds the gritty harmonics a ringer has.
const CLIP_CURVE = (() => {
  const n = 2048;
  const k = 4;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
})();

// One classic telephone ring: 440 Hz + 480 Hz together (the standard ring
// pair — their 40 Hz beat is the landline "brrrr" warble), square waves for
// harmonics that carry on small laptop/phone speakers, soft-clipped to
// full scale, sharp 5 ms attack, RING_ON_S long. Deliberately unlike the
// SOS siren (short alternating 1046/784 Hz beeps at 0.3): long, low,
// warbling and much louder. No compressor — at its defaults it turns the
// signal DOWN, which is what made the earlier ring quiet.
const playRingCycle = (ctx) => {
  const t0  = ctx.currentTime + 0.02;
  const end = t0 + RING_ON_S;

  const drive = ctx.createGain();   // into the clipper: past full scale on purpose
  drive.gain.value = 0.8;
  const shaper = ctx.createWaveShaper();
  shaper.curve = CLIP_CURVE;
  shaper.oversample = '4x';         // keeps the clipping from aliasing into hiss

  // Envelope after the clipper, so the attack stays sharp and the gap silent.
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(RING_LEVEL, t0 + 0.005);
  env.gain.setValueAtTime(RING_LEVEL, end - 0.02);
  env.gain.linearRampToValueAtTime(0, end);

  drive.connect(shaper);
  shaper.connect(env);
  env.connect(ctx.destination);

  [440, 480].forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.connect(drive);
    osc.start(t0);
    osc.stop(end);
  });
};

const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* unsupported */ } };

// The server's typed alert list (bookings + WhatsApp). An older backend
// without `alerts` still rings for its bookings.
const alertsFrom = (data) => data.alerts || (data.trips || []).map((t) => ({
  key: `booking:${t._id}`, type: 'booking', id: t._id, at: t.createdAt,
  title: 'New booking', link: `/dispatch?trip=${t._id}`, trip: t,
}));

// What each kind of alert says and does. Same ring, popup and queue.
const KIND = {
  booking: { emoji: '🚑', accept: 'Accept', noun: 'booking',
    missed: (a) => `⏰ Booking for ${a.trip?.patientName || 'a customer'} not answered — still waiting on the Dispatch board` },
  wa_lead: { emoji: '💬', accept: 'Open', noun: 'lead',
    missed: (a) => `⏰ WhatsApp lead (${a.service}) not answered — it's on the WhatsApp Leads page` },
  wa_chat: { emoji: '💬', accept: 'Open', noun: 'enquiry',
    missed: (a) => `⏰ WhatsApp enquiry (${a.service}) not answered — it's on WhatsApp Chats` },
};
const kindOf = (a) => KIND[a.type] || KIND.booking;

export default function IncomingBookingAlert({ active, audioCtxRef, soundEnabled, onEnableSound }) {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);      // unanswered alerts, oldest first; queue[0] is ringing
  const [busy, setBusy]   = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RING_TIMEOUT_MS / 1000);
  const handledRef = useRef(new Set());        // keys answered or timed out in this tab: never re-queued

  const current = queue[0] || null;

  // ── Poll ────────────────────────────────────────────────
  useEffect(() => {
    if (!active) { setQueue([]); return; }
    let stopped = false;
    const load = async () => {
      try {
        const { data } = await tripsApi.incoming();
        if (stopped) return;
        const alerts = alertsFrom(data).filter((a) => !handledRef.current.has(a.key));
        const live = new Set(alerts.map((a) => a.key));
        setQueue((prev) => {
          // Drop what someone else answered (or that got assigned, cancelled,
          // or whose conversation ended), keep the order of what's already
          // queued, append the new ones. Refresh the kept ones' details — a
          // WhatsApp enquiry's stage moves on while it rings.
          const byKey = new Map(alerts.map((a) => [a.key, a]));
          const kept = prev.filter((a) => live.has(a.key)).map((a) => byKey.get(a.key));
          const keptKeys = new Set(kept.map((a) => a.key));
          return [...kept, ...alerts.filter((a) => !keptKeys.has(a.key))];
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
  }, [current?.key, soundEnabled]);

  // ── 60s timeout, per alert (not restarted by enabling sound) ──
  useEffect(() => {
    if (!current) return undefined;
    const alert = current;
    const endsAt = Date.now() + RING_TIMEOUT_MS;
    setSecondsLeft(RING_TIMEOUT_MS / 1000);
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        handledRef.current.add(alert.key);
        setQueue((prev) => prev.filter((a) => a.key !== alert.key));
        toast(kindOf(alert).missed(alert), { duration: 8000 });
      }
    }, 500);
    return () => clearInterval(tick);
  }, [current?.key]);

  if (!current) return null;

  const answer = async (action) => {
    const alert = current;
    setBusy(true);
    handledRef.current.add(alert.key);
    setQueue((prev) => prev.filter((a) => a.key !== alert.key)); // stop ringing at once
    try {
      const { data } = alert.type === 'booking'
        ? await tripsApi.acknowledge(alert.id, action)
        : await alertsApi.acknowledge(alert.type, alert.id, action);
      if (!data.acknowledged && data.ack) {
        const who = data.ack.by?.name || 'another operator';
        toast(`Already ${data.ack.action || 'handled'} by ${who}`, { icon: 'ℹ️' });
      }
    } catch (err) {
      // Network failure (HTTP errors already toast via the API client).
      if (!err.response) toast.error(`Could not reach the server — other screens may keep ringing for this ${kindOf(alert).noun}`);
    } finally {
      setBusy(false);
    }
    if (action === 'accepted') navigate(alert.link);
  };

  const kind    = kindOf(current);
  const waiting = queue.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="alertdialog" aria-modal="true" aria-labelledby="incoming-booking-title"
      style={{ background: 'rgba(5,8,18,.88)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-3xl p-6 banner-pop"
        style={{ background: 'var(--surface)', border: '2px solid var(--accent)', boxShadow: '0 0 0 6px rgba(0,212,170,.15), 0 20px 60px rgba(0,0,0,.6)' }}>

        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full pulse-dot flex-shrink-0" style={{ background: 'var(--accent)' }} />
            <span id="incoming-booking-title" className="text-sm font-bold uppercase tracking-wider truncate" style={{ color: 'var(--accent)' }}>
              {current.title}
            </span>
          </div>
          <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text3)' }}>{secondsLeft}s</span>
        </div>

        {current.type === 'booking' ? <BookingDetails t={current.trip} /> : <WhatsAppDetails a={current} emoji={kind.emoji} />}

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
            {current.type === 'booking' ? <Phone size={20} /> : <MessageCircle size={20} />} {kind.accept}
          </button>
        </div>

        {waiting > 0 && (
          <div className="text-center text-xs font-semibold mt-3" style={{ color: 'var(--amber)' }}>
            +{waiting} more waiting
          </div>
        )}
      </div>
    </div>
  );
}

// The booking card body — exactly what the booking popup always showed.
function BookingDetails({ t }) {
  const ambulance = ambulanceTypeLabel(t.selectedType);
  const drop      = t.dropHospital?.name || t.dropAddress;
  const fare      = Number.isFinite(Number(t.estimatedFare)) && t.estimatedFare != null ? rupee(t.estimatedFare) : '';
  const isLater   = t.scheduleType === 'later';
  return (
    <>
      <div className="text-center mb-5">
        <div className="text-5xl mb-2" aria-hidden="true">🚑</div>
        <div className="text-2xl font-bold font-display">{t.patientName || 'Customer'}</div>
        <div className="text-base font-mono mt-1" style={{ color: 'var(--text2)' }}>
          {custPhone(t.patientPhone, t.patientPhoneMasked)}
        </div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
          via {sourceLabel(t)} · {fmtDateTime(t.createdAt)}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl p-4 mb-4 text-sm" style={{ background: 'var(--surface2)' }}>
        {t.pickup?.address && (
          <div className="flex items-start gap-2">
            <MapPin size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
            <span><span className="font-semibold">Pickup:</span> {t.pickup.address}</span>
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
          {t.tripType === 'round_trip' && <span>🔄 Round trip</span>}
          {fare && <span>💰 {fare}</span>}
          <span style={isLater ? { color: 'var(--amber)' } : undefined}>
            {isLater ? `📅 Scheduled ${fmtDateTime(t.scheduleDate)}` : '⚡ Now'}
          </span>
        </div>
      </div>
    </>
  );
}

const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi', kn: 'Kannada', te: 'Telugu' };

// A WhatsApp lead or enquiry: who, what they asked for, where they are.
function WhatsAppDetails({ a, emoji }) {
  return (
    <>
      <div className="text-center mb-5">
        <div className="text-5xl mb-2" aria-hidden="true">{emoji}</div>
        <div className="text-2xl font-bold font-display">{a.service || 'WhatsApp customer'}</div>
        <div className="text-base font-mono mt-1" style={{ color: 'var(--text2)' }}>
          {custPhone(a.phone, a.phoneMasked)}
        </div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
          via WhatsApp{LANGUAGE_NAMES[a.language] ? ` · ${LANGUAGE_NAMES[a.language]}` : ''} · {fmtDateTime(a.at)}
        </div>
      </div>

      {a.stage && (
        <div className="rounded-2xl p-4 mb-4 text-sm text-center" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
          {a.stage}
        </div>
      )}
    </>
  );
}
