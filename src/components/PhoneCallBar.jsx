// src/components/PhoneCallBar.jsx
//
// The call you answered on your own PHONE (ring mode "My phone", or the
// in-app ring fell through to phones): the native dialer has it, not this
// app, so the server tells us — GET /calls/my-live, polled while the app is
// open and visible, and at once when you come back to it from the dialer.
// Draws the same bar as the in-app call (who, how long), with Transfer:
// the same transfer as in the app (English speakers first, then all, then
// ring-back). Plivo drops your phone when it moves the caller.
//
// Hidden while the in-app phone has a call of its own (its bar has
// Transfer already).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneForwarded, Smartphone } from 'lucide-react';
import { callsApi } from '../api/client';
import { describe, Elapsed, useInAppPhone } from './InAppPhone';

const POLL_MS = 4000;
// After "the call has ended", the note stays this long before the bar goes.
const ENDED_NOTE_MS = 4000;

export default function PhoneCallBar({ active }) {
  const inApp = useInAppPhone();
  const [call, setCall] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const callId = useRef(null);

  const poll = useCallback(async () => {
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    try {
      const { data } = await callsApi.myLive();
      const next = data?.call || null;
      // A different call (or none): what was said about the last one goes.
      if (String(next?.id || '') !== String(callId.current || '')) { setNote(''); setError(''); }
      callId.current = next?.id || null;
      setCall(next);
    } catch {
      // Unreachable for a moment: keep what is shown; the next poll decides.
    } finally {
      inFlight.current = false;
    }
  }, []);

  // While on duty — and, once a call is showing, until it ends even if you
  // go off duty meanwhile.
  const polling = !!active || !!call;
  useEffect(() => {
    if (!polling) return undefined;
    poll();
    const t = setInterval(poll, POLL_MS);
    const onShow = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, [polling, poll]);

  const transfer = async () => {
    if (!call || busy || !call.canTransfer) return;
    const id = call.id;
    setBusy(true); setError(''); setNote('');
    try {
      const { data } = await callsApi.transfer(id);
      if (callId.current !== id) return;
      setNote(`${data?.message || 'Transferring…'} The caller hears a hold message; your phone will be disconnected.`);
      setCall((c) => (c && c.id === id ? { ...c, transferring: true, canTransfer: false } : c));
    } catch (err) {
      if (callId.current !== id) return;
      const body = err?.response?.data || {};
      if (body.reason === 'ended') {
        // The phone or the caller hung up while this still showed Transfer.
        setError(body.message || 'This call has already ended.');
        setCall((c) => (c && c.id === id ? { ...c, canTransfer: false } : c));
        setTimeout(() => { if (callId.current === id) poll(); }, ENDED_NOTE_MS);
      } else {
        setError(body.message || 'The transfer did not go through. You are still connected to the caller.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!call || inApp.inCall || inApp.incoming) return null;
  const { who, about } = describe(call.log);
  const since = call.answeredAt ? new Date(call.answeredAt).getTime() : Date.now();
  const transferring = busy || call.transferring;

  return (
    <div className="fixed left-3 right-3 bottom-20 md:bottom-4 md:left-auto md:right-4 md:w-96 z-[250] rounded-2xl p-4 shadow-xl"
      style={{ background: 'var(--surface)', border: '1px solid rgba(0,212,170,.4)' }}>
      <div className="flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full pulse-dot" style={{ background: 'var(--accent)' }} />
        <div className="min-w-0 flex-1">
          <div className="font-bold font-mono truncate">{who}</div>
          <div className="text-xs truncate flex items-center gap-1" style={{ color: 'var(--text3)' }}>
            <Smartphone size={12} className="shrink-0" />
            <span className="truncate">On your phone · {about} · <Elapsed since={since} /></span>
          </div>
        </div>
        {(call.canTransfer || transferring) && (
          <button onClick={transfer} disabled={transferring || !call.canTransfer} aria-label="Transfer call"
            title="Transfer to another telecaller (English speakers first)"
            className="h-11 px-4 rounded-full flex items-center justify-center gap-1.5 text-sm font-semibold disabled:opacity-60"
            style={{ minWidth: 44, background: 'var(--surface2)', color: 'var(--blue)' }}>
            <PhoneForwarded size={16} />
            <span>{transferring ? 'Transferring…' : 'Transfer'}</span>
          </button>
        )}
      </div>
      {error && <div role="alert" className="text-xs mt-2" style={{ color: 'var(--amber)' }}>{error}</div>}
      {note && <div role="status" className="text-xs mt-2" style={{ color: 'var(--accent)' }}>{note}</div>}
      {!note && call.transferring && (
        <div role="status" className="text-xs mt-2" style={{ color: 'var(--accent)' }}>Transferring — the caller is on hold; your phone will be disconnected.</div>
      )}
      {!error && !note && call.lastTransferFailed && call.canTransfer && (
        <div className="text-xs mt-2" style={{ color: 'var(--text3)' }}>The last transfer did not go through — you are still connected. You can try again.</div>
      )}
    </div>
  );
}
