// src/components/MyCallSettings.jsx
//
// The signed-in user's own "call ring number": the phone Plivo rings for
// their click-to-calls and, while On call duty, for incoming customer
// calls. Separate from the login number. Customers never see it — every
// masked call shows them the company number, shown here as "Customers see".
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, PhoneCall } from 'lucide-react';
import { callsApi } from '../api/client';
import { Btn } from './ui';

const fmt = (n) => (n ? String(n).replace(/^(\d{5})(\d{5})$/, '$1 $2') : '—');

export default function MyCallSettings() {
  const [me,     setMe]     = useState(null);
  const [value,  setValue]  = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    callsApi.getMe()
      .then(({ data }) => { setMe(data.me); setValue(data.me.callPhone || ''); })
      .catch(() => {});
  }, []);

  const save = async (next) => {
    const digits = String(next).replace(/\D/g, '').slice(-10);
    if (next && !/^[6-9]\d{9}$/.test(digits)) { toast.error('Enter a valid 10-digit mobile number'); return; }
    setSaving(true);
    try {
      const { data } = await callsApi.setMe(next ? digits : '');
      setMe(data.me);
      setValue(data.me.callPhone || '');
      toast.success(next ? `Plivo will now ring ${fmt(data.me.ringPhone)}` : 'Using your login number again');
    } catch { /* the API client shows the backend's message */ }
    finally { setSaving(false); }
  };

  const chooseMode = async (callMode) => {
    if (callMode === me.callMode) return;
    setSaving(true);
    try {
      const { data } = await callsApi.setMode(callMode);
      setMe(data.me);
      // The header's duty switch and in-app phone pick this up.
      window.dispatchEvent(new Event('calls:settings-changed'));
      toast.success(callMode === 'app'
        ? 'Incoming calls will ring here in the CRM while it is open (your phone when it is not)'
        : 'Incoming calls will ring your phone');
    } catch { /* the API client shows the backend's message */ }
    finally { setSaving(false); }
  };

  if (!me) return null;

  return (
    <div className="card mb-6">
      <div className="flex items-center gap-2 mb-1">
        <PhoneCall size={16} style={{ color: 'var(--accent)' }} />
        <h2 className="font-bold font-display">My call ring number</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text3)' }}>
        The phone Plivo rings when you tap Call, and for incoming customer calls while you are On call duty.
        Separate from your login number.
      </p>

      {/* How incoming calls reach you while On call duty. */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text3)' }}>Incoming calls ring</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            ['app',   '💻 In the CRM app', 'Answer in this browser or the installed app. Needs the microphone and the app open — if it is closed, your phone rings instead.'],
            ['phone', '📱 My phone',       'Plivo rings the number below. Works with the app closed.'],
          ].map(([key, title, hint]) => (
            <button key={key} type="button" disabled={saving} onClick={() => chooseMode(key)}
              className="text-left rounded-lg p-3 transition-all"
              style={me.callMode === key
                ? { background: 'rgba(0,212,170,.1)', border: '1px solid rgba(0,212,170,.4)' }
                : { background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
              <div className="font-semibold text-sm" style={{ color: me.callMode === key ? 'var(--accent)' : 'var(--text)' }}>{title}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>{hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <div className="rounded-lg p-3" style={{ background: 'var(--surface2)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Plivo rings</div>
          <div className="font-mono font-bold mt-0.5" style={{ color: 'var(--accent)' }}>{fmt(me.ringPhone)}</div>
          {me.usingLogin && <div className="text-[10px] mt-0.5" style={{ color: 'var(--amber)' }}>your login number — set one below</div>}
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--surface2)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Login number</div>
          <div className="font-mono mt-0.5">{fmt(me.loginPhone)}</div>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--surface2)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Customers see</div>
          <div className="font-mono mt-0.5">{me.callerId || 'Plivo not configured'}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="inp max-w-xs"
          inputMode="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="10-digit mobile, e.g. 98765 43210"
        />
        <Btn onClick={() => save(value.trim())} disabled={saving}>Save</Btn>
        {me.callPhone && (
          <Btn variant="ghost" onClick={() => save('')} disabled={saving}>Use login number</Btn>
        )}
      </div>

      <TestRing ringPhone={me.ringPhone} />
    </div>
  );
}

// "Ring my phone now (test)": Plivo calls the ring number from the company
// number and, if answered, says it is a test and hangs up. Polls the test's
// call log for the outcome, so the phone path can be checked from one
// device — no second phone needed to call in from.
const TEST_POLL_MS = 2000;
const TEST_MAX_MS = 90 * 1000;
const TEST_OUTCOME = {
  initiated  : { label: 'Ringing…',                         color: 'var(--blue)' },
  completed  : { label: 'Answered — your ring number works', color: 'var(--accent)' },
  agent_busy : { label: 'Busy',                             color: 'var(--red)' },
  agent_missed: { label: 'Rang, not answered',             color: 'var(--amber)' },
  failed     : { label: 'Failed',                           color: 'var(--red)' },
  cancelled  : { label: 'Cancelled',                        color: 'var(--text3)' },
};

function TestRing({ ringPhone }) {
  const [log,  setLog]  = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const poll = (id, startedAt) => {
    timer.current = setTimeout(async () => {
      try {
        const { data } = await callsApi.getCall(id);
        setLog(data.log);
        // Ended once Plivo's hang-up report is in.
        if (data.log.endedAt || Date.now() - startedAt > TEST_MAX_MS) { setBusy(false); return; }
      } catch { /* keep polling */ }
      poll(id, startedAt);
    }, TEST_POLL_MS);
  };

  const start = async () => {
    clearTimeout(timer.current);
    setBusy(true);
    setLog(null);
    try {
      const { data } = await callsApi.testRing();
      setLog({ _id: data.callLogId, status: 'initiated' });
      poll(data.callLogId, Date.now());
    } catch {
      setBusy(false); // the API client shows the backend's message
    }
  };

  const outcome = log && (TEST_OUTCOME[log.status] || { label: log.status, color: 'var(--text2)' });
  const h = log?.hangup || {};
  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border2)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="ghost" onClick={start} disabled={busy}>
          <BellRing size={14} className="inline mr-1" />{busy ? 'Test call in progress…' : 'Ring my phone now (test)'}
        </Btn>
        <span className="text-[11px]" style={{ color: 'var(--text3)' }}>
          Plivo calls {fmt(ringPhone)} from the company number and plays a short test message. Nothing is recorded.
        </span>
      </div>
      {outcome && (
        <div className="mt-2 text-xs">
          <span className="font-semibold" style={{ color: outcome.color }}>{outcome.label}</span>
          {log.endedAt && (h.CallStatus || h.HangupCauseName || h.HangupCause) && (
            <span className="font-mono" style={{ color: 'var(--text3)' }}>
              {' '}· Plivo: {[h.CallStatus, h.HangupCauseName || h.HangupCause, h.HangupCauseCode && `(${h.HangupCauseCode})`, h.HangupSource && `ended by ${h.HangupSource}`].filter(Boolean).join(' · ')}
            </span>
          )}
          {log.error && <div style={{ color: 'var(--red)' }}>{log.error}</div>}
          {log.status === 'agent_busy' && (
            <div className="mt-1" style={{ color: 'var(--text2)' }}>
              If the phone never rang, the busy came from the carrier or handset: usually call forwarding (dial ##002# on that phone to clear it), DND/call barring, or the phone was already on a call.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
