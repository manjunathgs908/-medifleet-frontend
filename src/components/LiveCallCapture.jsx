// src/components/LiveCallCapture.jsx
//
// LIVE CALL CAPTURE — the panel on the booking form while a customer call
// is going (medifleet-backend services/callCapture). The server listens to
// the call (listen-only), transcribes it and extracts the booking details;
// this panel shows the transcript as it arrives and hands each new draft to
// the form (onCapture), which fills only the fields the operator has not
// touched. Nothing is booked from here: the operator reviews and presses
// Book, as always.
//
// Also exports LiveCaptureButton, for the in-call bars: "Fill booking"
// opens /dispatch?captureCall=<call log id>.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Radio, X, AlertTriangle } from 'lucide-react';
import { callCaptureApi, streamCallCapture } from '../api/client';

const FIND_TRIES = 15;     // the draft appears a moment after answering
const FIND_EVERY_MS = 2000;
const ROLE = { customer: 'Caller', operator: 'You' };

export function LiveCaptureButton({ logId }) {
  const navigate = useNavigate();
  if (!logId) return null;
  return (
    <button onClick={() => navigate(`/dispatch?captureCall=${logId}`)} aria-label="Fill booking from this call"
      title="Open the booking form — it fills itself from what the caller says"
      className="h-11 px-3 rounded-full flex items-center justify-center gap-1.5 text-xs font-semibold"
      style={{ minWidth: 44, background: 'var(--surface2)', color: 'var(--accent)' }}>
      <FileText size={16} />
      <span className="hidden sm:inline">Fill booking</span>
    </button>
  );
}

export default function LiveCallCapture({ logId, onCapture, onPickPlace, onClose }) {
  const [capture, setCapture] = useState(null);
  const [note, setNote]       = useState('Connecting to the call…');
  const [partial, setPartial] = useState({});   // role -> words still being spoken
  const [ended, setEnded]     = useState(false);
  const bottomRef = useRef(null);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  // Find the draft for this call, then follow it live.
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    const take = (c) => { setCapture(c); onCaptureRef.current?.(c); };
    (async () => {
      for (let i = 0; i < FIND_TRIES && !cancelled; i += 1) {
        try {
          const { data } = await callCaptureApi.byCall(logId);
          if (data.capture) {
            take(data.capture);
            setNote('');
            stop = streamCallCapture(data.capture._id, {
              onCapture: (c) => { take(c); setPartial({}); },
              onPartial: ({ role, delta }) => setPartial((p) => ({ ...p, [role]: `${p[role] || ''}${delta}` })),
              onEnd    : () => setEnded(true),
              onError  : (m) => setNote(m),
            });
            return;
          }
          if (data.reason && data.reason !== 'starting') { setNote(`Not capturing this call: ${data.reason}`); return; }
        } catch { /* try again */ }
        await new Promise((r) => setTimeout(r, FIND_EVERY_MS));
      }
      if (!cancelled) setNote('No live capture for this call — fill the form as usual.');
    })();
    return () => { cancelled = true; stop(); };
  }, [logId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [capture?.transcript?.length, partial]);

  const status = capture?.status;
  const isLive = status === 'live' && !ended;
  const problems = capture?.problems || [];
  const options = (which) => (capture?.[`${which}Options`] || []);

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface2)', border: '1px solid rgba(0,212,170,.35)' }}>
      <div className="flex items-center gap-2">
        <Radio size={15} style={{ color: isLive ? 'var(--accent)' : 'var(--text3)' }} className={isLive ? 'pulse-dot' : ''} />
        <span className="font-semibold text-sm">Live call capture</span>
        <span className="text-xs" style={{ color: 'var(--text3)' }}>
          {isLive ? '· listening — fields fill as the caller speaks' : status === 'failed' ? '· could not start' : capture ? '· call ended — review and book' : ''}
        </span>
        <button type="button" onClick={onClose} className="ml-auto p-1" aria-label="Close live capture" style={{ color: 'var(--text3)' }}><X size={15} /></button>
      </div>

      {note && <div className="text-xs" style={{ color: 'var(--text3)' }}>{note}</div>}

      {capture && (
        <div className="rounded-lg p-2.5 space-y-1 max-h-48 overflow-y-auto text-sm" style={{ background: 'var(--ink2)' }}>
          {(capture.transcript || []).length === 0 && !Object.keys(partial).length && (
            <div style={{ color: 'var(--text3)' }}>Waiting for the caller to speak…</div>
          )}
          {(capture.transcript || []).map((t, i) => (
            <div key={i}><span className="font-semibold" style={{ color: t.role === 'customer' ? 'var(--accent)' : 'var(--text2)' }}>{ROLE[t.role] || t.role}:</span> {t.text}</div>
          ))}
          {Object.entries(partial).map(([role, text]) => (
            <div key={role} style={{ color: 'var(--text3)' }}><span className="font-semibold">{ROLE[role] || role}:</span> {text}…</div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {['pickup', 'drop'].map((which) => options(which).length > 0 && (
        <div key={which} className="text-xs space-y-1">
          <div style={{ color: 'var(--amber)' }}>Several places match the {which} “{capture.fields?.[`${which}Text`]}” — choose one, or type it in:</div>
          <div className="flex flex-wrap gap-1.5">
            {options(which).map((o, i) => (
              <button key={i} type="button" onClick={() => onPickPlace?.(which, o)}
                className="px-2 py-1 rounded-md text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}>{o.label}</button>
            ))}
          </div>
        </div>
      ))}

      {capture?.pickupSource === 'whatsapp' && capture.pickup && (
        <div className="text-xs" style={{ color: 'var(--accent)' }}>📍 Pickup shared by the caller on WhatsApp: {capture.pickup.label}</div>
      )}
      {capture?.summary && <div className="text-xs"><span className="font-semibold">Summary:</span> {capture.summary}</div>}

      {problems.length > 0 && (
        <div className="text-[11px] flex gap-1.5" style={{ color: 'var(--amber)' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{problems.at(-1).message}{problems.length > 1 ? ` (+${problems.length - 1} more)` : ''} — what was captured is kept.</span>
        </div>
      )}
      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
        AI-filled from the call — check every field with the caller. Fields you change are never overwritten. Nothing is booked until you press Book.
      </div>
    </div>
  );
}
