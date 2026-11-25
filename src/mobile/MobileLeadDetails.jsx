// src/mobile/MobileLeadDetails.jsx — "/m/leads/:id".
//
// One lead: name + masked number (the full number only reaches the owner,
// decided by the backend), status, assignee, follow-up. Actions:
//   Call      the existing masked call ({ leadId })
//   WhatsApp chat   this customer's WhatsApp history on the WhatsApp Chats
//                   page (?customer=<customerRef>); read-only, sends nothing
//   Book ambulance  Dispatch with this lead (?lead=<id>): name filled in, the
//                   number filled in by the server (never shown to a
//                   telecaller), the booking linked to the lead, once
//   Open booking    instead, when the lead is already booked
// Add note / set follow-up use the existing lead endpoints (rev-guarded;
// on a 409 the screen takes the server's current lead).
// Notes & history (from the lead) and customer history
// (GET /api/whatsapp/customer/:customerRef) expand on tap.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Truck, ChevronDown, StickyNote, CalendarClock, User, Clock } from 'lucide-react';
import { leadsApi } from '../api/client';
import { leadHistoryRows, shownPhone, dueLabel, istInput } from './logic.mjs';
import { Skeleton, ErrorState, MCallButton, StatusPill } from './ui';
import './mobile.css';

const fmt = (v) => (v ? dueLabel(new Date(v).getTime()) : '—');

function Expander({ id, title, count, children, onOpen }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="m-card mt-3">
      <button type="button" className="m-tap w-full flex items-center gap-2 px-4 text-left font-semibold"
        aria-expanded={open} aria-controls={id} onClick={() => { const next = !open; setOpen(next); if (next) onOpen?.(); }}>
        <span className="flex-1">{title}{count != null ? ` (${count})` : ''}</span>
        <ChevronDown size={18} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && <div id={id} className="px-4 pb-4">{children}</div>}
    </section>
  );
}

export default function MobileLeadDetails() {
  const { id } = useParams();
  const { state: navState } = useLocation();
  const navigate = useNavigate();
  const [lead, setLead] = useState(navState?.lead || null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // null | 'note' | 'followup'
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { data } = await leadsApi.getOne(id);
      setLead(data.lead);
      setStatus('ready');
      setError(null);
    } catch (e) {
      setStatus('error');
      setError(e?.response?.status === 404 ? 'This lead no longer exists.' : (e?.response?.data?.message || e?.message));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Keep the open form (and its Save button) in view when the keyboard opens.
  useEffect(() => {
    if (!mode) return undefined;
    const vv = window.visualViewport;
    const keep = () => formRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    vv?.addEventListener('resize', keep);
    return () => vv?.removeEventListener('resize', keep);
  }, [mode]);

  const act = async (fn) => {
    setBusy(true);
    try {
      const { data } = await fn();
      setLead((prev) => ({ ...data.lead, customerRef: prev?.customerRef }));
      setMode(null);
      window.dispatchEvent(new Event('leads:changed'));
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.lead) { setLead((prev) => ({ ...e.response.data.lead, customerRef: prev?.customerRef })); setMode(null); }
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/m/leads'))}
      className="m-tap -ml-2 mb-2 px-2 inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--m-text2)' }}>
      <ArrowLeft size={20} aria-hidden="true" /> Back
    </button>
  );

  if (!lead && status === 'loading') return <div className="m-ui m-screen">{back}<Skeleton rows={3} height={110} /></div>;
  if (!lead && status === 'error') return <div className="m-ui m-screen">{back}<ErrorState message={error} onRetry={load} /></div>;

  const active = ['new', 'contacted'].includes(lead.status || 'new') && !lead.convertedTrip;
  const history = leadHistoryRows(lead, fmt);
  const due = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : NaN;
  // The customer's own WhatsApp history: the existing route the WhatsApp
  // Chats page already supports (?customer=<customerRef>, an opaque token —
  // no number in the URL). It only opens the history; nothing is sent.
  const waLink = lead.customerRef ? `/whatsapp-conversations?customer=${encodeURIComponent(lead.customerRef)}` : null;
  // Call shows only when the lead has a number; three actions stack icon over label.
  const actionCount = (lead.phoneMasked ? 1 : 0) + (waLink ? 1 : 0) + 1;
  const stack = actionCount === 3 ? 'm-btn-stack' : '';

  return (
    <div className="m-ui m-screen">
      {back}
      {status === 'error' && <div className="m-sub mb-2" role="status">Couldn’t refresh — showing what was loaded. <button type="button" className="underline" onClick={load}>Retry</button></div>}

      <section className="m-card p-4">
        <div className="flex items-start gap-2">
          <h1 className="m-title flex-1 min-w-0 break-words">{lead.patientName || 'Unknown'}</h1>
          <StatusPill status={lead.status} />
        </div>
        {lead.booking && !lead.booking.needsReview && (
          <div className="mt-2"><span className="m-pill m-pill-green">Booked{lead.booking.tripNumber ? ` · ${lead.booking.tripNumber}` : ''}</span></div>
        )}
        {lead.booking?.needsReview && (
          // An older booking carries this lead but the lead never recorded it.
          <div className="mt-2" data-booking-review="needs-review">
            <span className="m-pill m-pill-amber">Booking needs review{lead.booking.tripNumber ? ` · ${lead.booking.tripNumber}` : ''}</span>
            <p className="text-[13px] mt-1" style={{ color: 'var(--m-text2)' }}>
              A booking from this lead already exists, but the lead was never marked as booked. Open it and check before booking again.
            </p>
          </div>
        )}
        <div className="font-mono text-[16px] mt-1" style={{ color: 'var(--m-text2)' }}>{shownPhone(lead.phone, lead.phoneMasked)}</div>
        <dl className="mt-3 space-y-2 text-[14px]">
          <div className="flex items-center gap-2"><User size={16} aria-hidden="true" style={{ color: 'var(--m-text3)' }} />
            <dt className="sr-only">Assigned to</dt><dd>{lead.assignedToName || (lead.assignedTo ? 'Staff member' : 'Unassigned')}</dd></div>
          <div className="flex items-center gap-2"><Clock size={16} aria-hidden="true" style={{ color: 'var(--m-text3)' }} />
            <dt className="sr-only">Follow-up</dt>
            <dd style={lead.followUp === 'overdue' ? { color: 'var(--m-red)', fontWeight: 600 } : undefined}>
              {Number.isFinite(due) ? `${lead.followUp === 'overdue' ? 'Overdue · ' : 'Follow-up '}${dueLabel(due)}` : 'No follow-up set'}
            </dd></div>
        </dl>
        {lead.message && <p className="mt-3 text-[14px] break-words" style={{ color: 'var(--m-text2)' }}>{lead.message}</p>}
      </section>

      <div className={`grid ${['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3'][actionCount]} gap-2 mt-3`}>
        {lead.phoneMasked && <MCallButton target={{ leadId: lead._id }} className={stack} />}
        {waLink && (
          <Link to={waLink} className={`m-btn m-tap ${stack}`} aria-label="Open this customer’s WhatsApp chat history">
            <MessageCircle size={18} aria-hidden="true" />WhatsApp chat
          </Link>
        )}
        {lead.booking
          ? <Link to={`/dispatch?trip=${encodeURIComponent(lead.booking._id)}`} className={`m-btn m-tap ${stack}`}
              aria-label={`Open booking${lead.booking.tripNumber ? ` ${lead.booking.tripNumber}` : ''}`}>
              <Truck size={18} aria-hidden="true" />Open booking
            </Link>
          : <Link to={`/dispatch?lead=${encodeURIComponent(lead._id)}`} className={`m-btn m-tap ${stack}`}>
              <Truck size={18} aria-hidden="true" />Book ambulance
            </Link>}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button type="button" className="m-btn m-tap" aria-expanded={mode === 'note'} onClick={() => { setText(''); setMode(mode === 'note' ? null : 'note'); }}>
          <StickyNote size={18} aria-hidden="true" />Add note
        </button>
        {active && (
          <button type="button" className="m-btn m-tap" aria-expanded={mode === 'followup'}
            onClick={() => { setWhen(istInput(lead.nextFollowUpAt || Date.now() + 3600000)); setMode(mode === 'followup' ? null : 'followup'); }}>
            <CalendarClock size={18} aria-hidden="true" />Follow-up
          </button>
        )}
      </div>

      {mode === 'note' && (
        <form ref={formRef} className="m-card p-4 mt-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) act(() => leadsApi.addNote(lead._id, text.trim())); }}>
          <label htmlFor="m-note" className="block font-semibold mb-2">Note</label>
          <textarea id="m-note" className="m-input" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} required
            placeholder="e.g. Wants an ICU ambulance on Friday, call after 6 pm" autoFocus />
          <div className="m-savebar">
            <button type="button" className="m-btn m-tap flex-1" onClick={() => setMode(null)}>Cancel</button>
            <button type="submit" className="m-btn m-btn-primary m-tap flex-1" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save note'}</button>
          </div>
        </form>
      )}

      {mode === 'followup' && (
        <form ref={formRef} className="m-card p-4 mt-3" onSubmit={(e) => { e.preventDefault(); if (when) act(() => leadsApi.followUp(lead._id, when, lead.rev)); }}>
          <label htmlFor="m-when" className="block font-semibold mb-2">Next follow-up (India time)</label>
          <input id="m-when" type="datetime-local" className="m-input" value={when} min={istInput(Date.now())} onChange={(e) => setWhen(e.target.value)} required />
          <div className="m-sub mt-2">A reminder in the CRM only — no call or message is sent.</div>
          <div className="m-savebar">
            <button type="button" className="m-btn m-tap flex-1" onClick={() => setMode(null)}>Cancel</button>
            <button type="submit" className="m-btn m-btn-primary m-tap flex-1" disabled={busy || !when}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}

      <Expander id="m-lead-history" title="Notes & history" count={history.length + (lead.notes ? 1 : 0)}>
        {history.length || lead.notes ? (
          <ol className="space-y-3">
            {history.map((r, i) => (
              <li key={i} className="text-[14px] break-words">
                <span className="m-sub block">{fmt(r.at)} · {r.by || 'system'}</span>
                {r.note ? <><StickyNote size={13} className="inline mr-1" aria-label="Note" style={{ color: 'var(--m-amber)' }} />“{r.text}”</> : r.text}
              </li>
            ))}
            {lead.notes && <li className="text-[14px] whitespace-pre-wrap break-words"><span className="m-sub block">Earlier notes</span>{lead.notes}</li>}
          </ol>
        ) : <div className="m-sub">No notes or changes yet.</div>}
      </Expander>

      {lead.customerRef && (
        <Link to={`/customer/${encodeURIComponent(lead.customerRef)}`} className="m-card m-tap mt-3 px-4 flex items-center justify-between font-semibold">
          <span>View customer<span className="block m-sub font-normal">Calls, callbacks, bookings and the full timeline</span></span>
          <span aria-hidden="true">›</span>
        </Link>
      )}
    </div>
  );
}
