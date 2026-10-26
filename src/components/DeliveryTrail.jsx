// src/components/DeliveryTrail.jsx
//
// TEMPORARY diagnostics: how one incoming call was delivered to the CRM
// app, from the server-side capture (survives reloads). Per device: did
// the call arrive (onIncomingCall), did the Answer screen show, did the
// ring-tone fallback run, what cleared it, was it answered. Then the full
// timeline. Loaded only when opened.
import React, { useState } from 'react';
import { callsApi } from '../api/client';

const yes = (v) => (v ? '✓' : '✗');
const time = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

export default function DeliveryTrail({ log }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (data) return;
    setLoading(true);
    try {
      const { data: d } = await callsApi.trail(log._id);
      setData(d);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load the delivery trail.');
    } finally {
      setLoading(false);
    }
  };

  const appDevices = (log.routing?.appUsers || []).flatMap((u) => (u.devices || []).map((d) => ({ ...d, user: u.name })));

  return (
    <div className="mt-1.5 text-[11px]" style={{ color: 'var(--text3)' }}>
      {log.flow?.length > 0 && <div className="font-mono">Route: {log.flow.join(' → ')}</div>}
      <button type="button" onClick={toggle} className="underline mt-0.5" style={{ color: 'var(--blue)' }}>
        {open ? 'Hide in-app delivery' : 'In-app delivery'}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg p-2.5 space-y-2" style={{ background: 'var(--surface2)' }}>
          {appDevices.length > 0 && (
            <div>
              <div className="font-semibold" style={{ color: 'var(--text2)' }}>Rang in the app on</div>
              {appDevices.map((d, i) => (
                <div key={i} className="font-mono">{yes(d.dialled)} {d.user} · {d.device || 'device'}</div>
              ))}
            </div>
          )}
          {loading && <div>Loading…</div>}
          {error && <div style={{ color: 'var(--red)' }}>{error}</div>}
          {data && (
            <>
              <div>
                <div className="font-semibold" style={{ color: 'var(--text2)' }}>What each open CRM did</div>
                {data.sessions.length === 0 && (
                  <div>No CRM app reported anything during this call — it did not reach any open app (or none was open).</div>
                )}
                {data.sessions.map((s) => (
                  <div key={s.sessionId} className="font-mono">
                    {s.device || 'device'} — call arrived {yes(s.gotIncoming)} · Answer screen {yes(s.answerScreenShown)}
                    {s.ringtoneFallback && ' · ring-tone fallback ran'}
                    {s.cleared.length > 0 && ` · cleared: ${s.cleared.join(', ')}`}
                    {s.answered && ' · answered'}
                  </div>
                ))}
              </div>
              <details>
                <summary className="cursor-pointer" style={{ color: 'var(--text2)' }}>Timeline ({data.events.length})</summary>
                <div className="font-mono mt-1 space-y-0.5 max-h-56 overflow-y-auto">
                  {data.events.map((e, i) => (
                    <div key={i}>
                      {time(e.at)} · {e.device ? `${e.device} · ` : 'server · '}{e.event}{e.reason ? ` (${e.reason})` : ''}
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}
