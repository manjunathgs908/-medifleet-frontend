// src/pages/AiTelecallerPage.jsx
//
// AI Telecaller — PILOT (owner only). medifleet-backend /api/ai-caller.
// Shows the two switches (server env + this CRM toggle — both must be on),
// anything not set up, the server's test-number allowlist with a "Call this
// test number" button each, and every AI call with its transcript.
//
// The server refuses any number not on AI_CALL_TEST_NUMBERS, any number
// that never contacted SaveLife, and a second call while one is running —
// this page only offers what it allows, it does not enforce anything.
import React, { useEffect, useState } from 'react';
import { aiCallerApi } from '../api/client';
import { PageHeader, Btn, Badge, Spinner, Empty, fmtDateTime, custPhone, rupee } from '../components/ui';
import toast from 'react-hot-toast';
import { PhoneOutgoing, Power, RefreshCw, AlertTriangle, Bot } from 'lucide-react';

const OUTCOME = {
  booked    : { color: 'green', label: 'Booked' },
  follow_up : { color: 'amber', label: 'Callback queued' },
  handed_off: { color: 'blue',  label: 'Handed to a person' },
  ended     : { color: 'gray',  label: 'Ended' },
  no_answer : { color: 'gray',  label: 'No answer' },
  failed    : { color: 'red',   label: 'Failed' },
};
const ACTIVE = ['dialing', 'in_progress', 'handing_off'];
const ROLE_LABEL = { assistant: 'AI', caller: 'Caller', system: 'System' };

export default function AiTelecallerPage() {
  const [status, setStatus]   = useState(null);
  const [calls, setCalls]     = useState([]);
  const [openId, setOpenId]   = useState(null);
  const [detail, setDetail]   = useState(null);
  const [busy, setBusy]       = useState(null); // 'toggle' | phone being called

  const load = async () => {
    try {
      const [s, c] = await Promise.all([aiCallerApi.status(), aiCallerApi.calls()]);
      setStatus(s.data);
      setCalls(c.data.calls || []);
    } catch { /* the API client shows the error */ }
  };
  const loadDetail = async (id) => {
    try { setDetail((await aiCallerApi.get(id)).data.call); } catch { /* keep the last one */ }
  };

  useEffect(() => { load(); }, []);
  // While a call is live, follow it.
  const live = calls.some((c) => ACTIVE.includes(c.status));
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { load(); if (openId) loadDetail(openId); }, 3000);
    return () => clearInterval(t);
  }, [live, openId]);
  useEffect(() => { if (openId) loadDetail(openId); else setDetail(null); }, [openId]);

  const toggle = async () => {
    setBusy('toggle');
    try {
      const { data } = await aiCallerApi.setToggle(!status.toggle);
      toast.success(data.toggle ? 'AI calling switched ON in the CRM' : 'AI calling switched OFF');
      await load();
    } catch { /* toast from the client */ } finally { setBusy(null); }
  };

  const callNumber = async (n) => {
    if (!window.confirm(`Place a REAL AI test call to ${n.phoneMasked}? It is charged by Plivo and OpenAI.`)) return;
    setBusy(n.phone);
    try {
      const { data } = await aiCallerApi.call(n.phone);
      toast.success('Calling… the phone will ring shortly');
      setOpenId(data.callId);
      await load();
    } catch { /* the server's reason is toasted by the client */ } finally { setBusy(null); }
  };

  if (!status) return <div className="flex justify-center py-20"><Spinner /></div>;

  const canCall = status.enabled && !status.missing.length && !status.activeCallId;

  return (
    <div className="page-enter">
      <PageHeader
        title="AI Telecaller (pilot)"
        subtitle="Outbound AI calls to TEST numbers only. Kannada first · discloses it is automated and recorded · hands to a person on any doubt."
        action={<Btn variant="ghost" size="sm" onClick={load}><RefreshCw size={13} /> Refresh</Btn>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Switches */}
        <div className="card space-y-3">
          <h2 className="font-bold font-display flex items-center gap-2"><Power size={16} /> Kill-switch</h2>
          <div className="flex items-center justify-between text-sm">
            <span>Server (AI_CALLER_ENABLED)</span>
            <Badge color={status.envEnabled ? 'green' : 'red'}>{status.envEnabled ? 'On' : 'Off'}</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>CRM toggle</span>
            <Btn size="sm" variant={status.toggle ? 'danger' : 'primary'} onClick={toggle} disabled={busy === 'toggle'}>
              {status.toggle ? 'Switch OFF' : 'Switch ON'}
            </Btn>
          </div>
          <div className="text-xs" style={{ color: status.enabled ? 'var(--accent)' : 'var(--text3)' }}>
            {status.enabled ? 'AI calling is ON — calls can start.' : 'AI calling is OFF — no call can start. Both switches must be on.'}
          </div>
          {status.missing.length > 0 && (
            <div className="text-xs rounded-lg p-2.5 flex gap-2" style={{ background: 'rgba(255,184,48,.1)', color: 'var(--amber)' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Not set up on the server: {status.missing.join(', ')}</span>
            </div>
          )}
          <div className="text-[11px] font-mono" style={{ color: 'var(--text3)' }}>
            {status.models.realtime} + {status.models.delegate} · voice {status.models.voice} · max {status.limits.maxCallSeconds}s AI time
            {!status.costRatesSet && ' · cost not estimated (AI_COST_* not set)'}
          </div>
        </div>

        {/* Allowlist */}
        <div className="card space-y-3">
          <h2 className="font-bold font-display flex items-center gap-2"><PhoneOutgoing size={16} /> Test numbers (allowlist)</h2>
          {status.allowlist.length === 0
            ? <div className="text-sm" style={{ color: 'var(--text3)' }}>None. Set AI_CALL_TEST_NUMBERS on the server.</div>
            : status.allowlist.map((n) => (
              <div key={n.phone} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-mono">{custPhone(n.phone, n.phoneMasked)}</div>
                  <div className="text-[11px]" style={{ color: n.contactedVia ? 'var(--text3)' : 'var(--amber)' }}>
                    {n.contactedVia ? `Contacted us via ${n.contactedVia}` : 'Never contacted SaveLife — call or WhatsApp us from it first'}
                  </div>
                </div>
                <Btn size="sm" onClick={() => callNumber(n)} disabled={!canCall || !n.contactedVia || !!busy}>
                  {busy === n.phone ? 'Calling…' : 'Call this test number'}
                </Btn>
              </div>
            ))}
          {status.activeCallId && <div className="text-xs" style={{ color: 'var(--amber)' }}>A call is in progress — one at a time.</div>}
          <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
            Pilot rule: only numbers on the server allowlist that contacted SaveLife first. Never real leads.
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div className="card">
        <h2 className="font-bold font-display mb-3 flex items-center gap-2"><Bot size={16} /> AI calls</h2>
        {calls.length === 0 ? <Empty icon="🤖" message="No AI calls yet" /> : (
          <div className="space-y-2">
            {calls.map((c) => {
              const o = OUTCOME[c.outcome] || (ACTIVE.includes(c.status) ? { color: 'blue', label: c.status.replace('_', ' ') } : { color: 'gray', label: c.status });
              return (
                <div key={c._id} className="rounded-xl p-3" style={{ background: 'var(--surface2)', border: openId === c._id ? '1px solid var(--accent)' : '1px solid var(--border2)' }}>
                  <button className="w-full text-left flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" onClick={() => setOpenId(openId === c._id ? null : c._id)}>
                    <span className="font-mono">{custPhone(c.phone, c.phoneMasked)}</span>
                    <Badge color={o.color}>{o.label}</Badge>
                    {c.handoff && <Badge color="blue">Handoff: {c.handoffReason}</Badge>}
                    <span className="text-xs" style={{ color: 'var(--text3)' }}>{fmtDateTime(c.createdAt)}</span>
                    {c.durationSec != null && <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>{c.durationSec}s</span>}
                    {c.estCostPaise != null && <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>≈ {rupee((c.estCostPaise / 100).toFixed(2))}</span>}
                  </button>
                  {openId === c._id && detail && detail._id === c._id && (
                    <div className="mt-3 space-y-2 text-sm">
                      {detail.summary && <div><span className="font-semibold">Summary:</span> {detail.summary}</div>}
                      {detail.trip && <div><span className="font-semibold">Booking:</span> {detail.trip.tripNumber} ({detail.trip.status})</div>}
                      {detail.error && <div style={{ color: 'var(--red)' }}>{detail.error}</div>}
                      {/* Why the OpenAI side ended, in OpenAI's own words. */}
                      {detail.openaiClose && (detail.openaiClose.code || detail.openaiClose.reason) && (
                        <div className="text-xs font-mono" style={{ color: 'var(--amber)' }}>
                          OpenAI closed: {detail.openaiClose.code != null ? `code ${detail.openaiClose.code}` : ''} {detail.openaiClose.reason || ''}
                        </div>
                      )}
                      {(detail.openaiErrors || []).map((e, i) => (
                        <div key={i} className="text-xs font-mono" style={{ color: 'var(--amber)' }}>OpenAI error: {e.code} {e.message}</div>
                      ))}
                      <div className="text-[11px] font-mono" style={{ color: 'var(--text3)' }}>
                        tokens — audio in {detail.usage?.audioIn || 0} · audio out {detail.usage?.audioOut || 0} · text in {detail.usage?.textIn || 0} · text out {detail.usage?.textOut || 0}
                      </div>
                      <div className="rounded-lg p-3 space-y-1.5 max-h-80 overflow-y-auto" style={{ background: 'var(--ink2)' }}>
                        {(detail.transcript || []).length === 0
                          ? <div style={{ color: 'var(--text3)' }}>No transcript yet.</div>
                          : detail.transcript.map((t, i) => (
                            <div key={i} style={{ color: t.role === 'system' ? 'var(--text3)' : undefined }}>
                              <span className="font-semibold">{ROLE_LABEL[t.role] || t.role}:</span> {t.text}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
