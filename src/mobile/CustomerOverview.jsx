// src/mobile/CustomerOverview.jsx — "/customer/:ref": one customer at a glance.
//
// From the EXISTING customer history (GET /api/whatsapp/customer/:ref, its
// `overview` — medifleet-backend services/customerOverview.js). Grouped by the
// customer's number, never merged by name (a shared number is flagged).
//   Right now     next action + who it is assigned to; enquiry, callback task
//                 and booking statuses — each its own status, never mixed
//   Contact       calls by direction for a stated period (Today / 7 days /
//                 30 days / All time, India-time days), counted by the server
//                 over EVERY call on record; last attempt and last connected
//                 conversation (who spoke) kept apart
//   Latest note   with who, when and where it was written
//   Timeline      everything, newest first
//   Calls         the newest calls; the detailed records (the existing call
//                 cards with the recording player) page through all of them
// The number is masked unless the backend sent it in full (owner only).
// Payments appear only when the backend includes them (owner only).
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MessageCircle, AlertTriangle, PhoneIncoming, PhoneOutgoing, PhoneMissed, StickyNote, Truck,
  ClipboardList, ChevronDown, Wallet, Clock, User,
} from 'lucide-react';
import { whatsappCustomerApi, callsApi } from '../api/client';
import CallLogList from '../components/CallLogList';
import { shownPhone, dueLabel } from './logic.mjs';
import { Skeleton, ErrorState, MCallButton } from './ui';
import './mobile.css';

const when = (v) => (v ? dueLabel(new Date(v).getTime()) : '—');
const dur = (s) => (s > 0 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : null);
const KIND_ICON = { call: PhoneIncoming, callback: ClipboardList, lead: User, note: StickyNote, whatsapp: MessageCircle, booking: Truck, payment: Wallet };
const TIMELINE_FIRST = 25;
const PERIODS = [['today', 'Today'], ['last7Days', '7 days'], ['last30Days', '30 days'], ['allTime', 'All time']];
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '');

function Row({ label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--m-line)' }}>
      <div className="w-32 flex-shrink-0 text-[13px] font-semibold" style={{ color: 'var(--m-text3)' }}>{label}</div>
      <div className="min-w-0 flex-1 text-[15px]">{children}</div>
    </div>
  );
}

function Count({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#f6f8fb' }}>
      <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--m-text2)' }}><Icon size={15} aria-hidden="true" />{label}</div>
      <div className="text-[26px] font-bold leading-tight mt-1" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="text-[12.5px]" style={{ color: 'var(--m-text3)' }}>{sub}</div>}
    </div>
  );
}

export default function CustomerOverview() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const [st, setSt] = useState({ status: 'loading' });
  const [period, setPeriod] = useState('allTime');
  const [allEvents, setAllEvents] = useState(false);
  const [details, setDetails] = useState({ open: false, status: 'idle', logs: [], next: null, total: null });

  const load = useCallback(async () => {
    setSt({ status: 'loading' });
    try {
      const { data } = await whatsappCustomerApi.get(ref);
      setSt({ status: 'ready', data });
    } catch (e) {
      setSt({ status: 'error', error: e?.response?.status === 400 ? 'Unknown customer.' : (e?.response?.data?.message || 'Could not load this customer.') });
    }
  }, [ref]);
  useEffect(() => { load(); }, [load]);

  const openDetails = async () => {
    const open = !details.open;
    setDetails((d) => ({ ...d, open }));
    if (!open || details.status === 'ready') return;
    setDetails((d) => ({ ...d, status: 'loading' }));
    try {
      const { data } = await callsApi.history({ customerRef: ref, limit: 50 });
      setDetails({ open: true, status: 'ready', logs: data.logs || [], next: data.nextCursor || null, total: data.total ?? null });
    } catch {
      setDetails({ open: true, status: 'error', logs: [], next: null, total: null });
    }
  };
  const moreDetails = async () => {
    if (!details.next) return;
    setDetails((d) => ({ ...d, status: 'more' }));
    try {
      const { data } = await callsApi.history({ customerRef: ref, limit: 50, cursor: details.next });
      setDetails((d) => ({ ...d, status: 'ready', logs: [...d.logs, ...(data.logs || [])], next: data.nextCursor || null }));
    } catch {
      setDetails((d) => ({ ...d, status: 'ready', moreError: true }));
    }
  };

  const back = (
    <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/m'))}
      className="m-tap -ml-2 mb-2 px-2 inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--m-text2)' }}>
      <ArrowLeft size={20} aria-hidden="true" /> Back
    </button>
  );
  if (st.status === 'loading') return <div className="m-ui m-screen">{back}<Skeleton rows={4} height={120} /></div>;
  if (st.status === 'error') return <div className="m-ui m-screen">{back}<ErrorState message={st.error} onRetry={load} /></div>;

  const d = st.data;
  const o = d.overview;
  const name = o?.names?.[0] || 'Customer';
  if (!o) {
    return (
      <div className="m-ui m-screen">{back}
        <h1 className="m-title">{name}</h1>
        <ErrorState message="The customer overview could not be built right now. The rest of the history is unaffected." onRetry={load} />
      </div>
    );
  }
  const c = o.counts[period] || o.counts.allTime;
  const from = o.period?.from || {};
  const periodLabel = {
    today: `Today (since 12:00 am India time)`,
    last7Days: `Last 7 days · since ${day(from.last7Days ? new Date(new Date(from.last7Days).getTime() + 1) : null)} (India time)`,
    last30Days: `Last 30 days · since ${day(from.last30Days ? new Date(new Date(from.last30Days).getTime() + 1) : null)} (India time)`,
    allTime: `All time · since ${when(o.period.firstContactAt)}`,
  }[period];
  const basis = o.countsBasis;
  const totalCalls = o.callsPage?.logicalCalls ?? o.calls.length;
  const events = allEvents ? o.timeline : o.timeline.slice(0, TIMELINE_FIRST);

  return (
    <div className="m-ui m-screen" data-customer-overview>
      {back}
      <section className="m-card p-4">
        <h1 className="m-title break-words">{name}</h1>
        <div className="font-mono text-[16px] mt-1" style={{ color: 'var(--m-text2)' }}>{shownPhone(d.phone, d.phoneMasked)}</div>
        {o.sharedNumber && (
          <div className="mt-3 rounded-xl p-3 text-[14px] flex gap-2" role="note" style={{ background: 'var(--m-amber-bg)' }}>
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" style={{ color: 'var(--m-amber)' }} />
            <span>This number is used by more than one name: <strong>{o.names.join(', ')}</strong>. Records are grouped by number and may belong to different people.</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <MCallButton target={{ customerRef: d.customerRef }} />
          <Link to={`/whatsapp-conversations?customer=${encodeURIComponent(d.customerRef)}`} className="m-btn m-tap">
            <MessageCircle size={18} aria-hidden="true" />WhatsApp chat
          </Link>
        </div>
      </section>

      <section className="m-card px-4 pt-3 pb-1 mt-3" aria-labelledby="co-now">
        <h2 id="co-now" className="font-bold mb-1">Right now</h2>
        <Row label="Next action">
          {o.nextAction ? (
            <span>
              <strong>{o.nextAction.label}</strong>
              {o.nextAction.dueAt && <> · {o.nextAction.overdue ? <span className="m-pill m-pill-red">Overdue · {when(o.nextAction.dueAt)}</span> : when(o.nextAction.dueAt)}</>}
              <span className="block text-[13px]" style={{ color: 'var(--m-text2)' }}>{o.nextAction.assignee ? `Assigned to ${o.nextAction.assignee}` : o.nextAction.dueAt ? 'Not assigned to anyone' : ''}</span>
            </span>
          ) : <span style={{ color: 'var(--m-text3)' }}>Nothing scheduled</span>}
        </Row>
        <Row label="Enquiry">
          {o.enquiry ? <span>{o.enquiry.statusLabel}{o.enquiry.active ? '' : ' (closed)'}{o.enquiry.assignee ? ` · ${o.enquiry.assignee}` : ''}{' '}<Link className="underline text-[13px]" to={`/m/leads/${o.enquiry._id}`}>Open lead</Link></span> : <span style={{ color: 'var(--m-text3)' }}>No enquiry</span>}
        </Row>
        <Row label="Callback task">
          {o.callbackTask ? <span>Open · due {when(o.callbackTask.dueAt)}{o.callbackTask.overdue ? ' (overdue)' : ''}{o.callbackTask.assignee ? ` · ${o.callbackTask.assignee}` : ' · not assigned'}</span> : <span style={{ color: 'var(--m-text3)' }}>None open</span>}
        </Row>
        <Row label="Booking now">
          {o.booking.current
            ? <span><strong>{o.booking.current.tripNumber}</strong> · {o.booking.current.statusLabel} <Link className="underline text-[13px]" to={`/dispatch?trip=${encodeURIComponent(o.booking.current._id)}`}>Open</Link></span>
            : <span style={{ color: 'var(--m-text3)' }}>No active booking</span>}
          {o.booking.last && (
            <span className="block text-[13px] mt-0.5" style={{ color: 'var(--m-text2)' }}>
              Last booking {o.booking.last.tripNumber}: {o.booking.last.statusLabel}{o.booking.last.cancelledAt ? ` ${when(o.booking.last.cancelledAt)}` : o.booking.last.completedAt ? ` ${when(o.booking.last.completedAt)}` : ''}{o.booking.last.cancellationReason ? ` — “${o.booking.last.cancellationReason}”` : ''}
            </span>
          )}
          {o.booking.total > 0 && <span className="block text-[12.5px]" style={{ color: 'var(--m-text3)' }}>{o.booking.total} booking{o.booking.total === 1 ? '' : 's'} in total · {o.booking.completed} completed · {o.booking.cancelled} cancelled</span>}
        </Row>
      </section>

      <section className="m-card p-4 mt-3" aria-labelledby="co-contact">
        <h2 id="co-contact" className="font-bold mb-2">Contact</h2>
        {/* Four periods on their own row: all visible at 320 px, no sideways scrolling. */}
        <div className="grid grid-cols-4 gap-1.5 mb-2" role="group" aria-label="Period">
          {PERIODS.map(([k, l]) => (
            <button key={k} type="button" className="m-chip m-tap !min-h-[40px] !px-1 !text-[13px] justify-center" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        <div className="m-sub mb-2">{periodLabel}</div>
        {basis && <div className="text-[12.5px] mb-2" style={{ color: 'var(--m-text3)' }} data-counts-basis>Counted from all {basis.logicalCalls} call{basis.logicalCalls === 1 ? '' : 's'} on record — each call once{basis.callRows > basis.logicalCalls ? ` (${basis.callRows - basis.logicalCalls} duplicate record${basis.callRows - basis.logicalCalls === 1 ? '' : 's'} not counted again)` : ''}.</div>}
        <div className="grid grid-cols-2 gap-2">
          <Count icon={PhoneIncoming} label="Customer called" value={c.incoming.total} sub={`${c.incoming.answered} answered · ${c.incoming.missed} missed${c.incoming.unconfirmed ? ` · ${c.incoming.unconfirmed} unconfirmed` : ''}`} />
          <Count icon={PhoneOutgoing} label="We called" value={c.outgoing.attempts} sub={`${c.outgoing.connected} connected`} />
          <Count icon={ClipboardList} label="Callbacks" value={c.outgoing.callbackAttempts} sub={`${c.outgoing.callbackConnected} connected (part of “We called”)`} />
          <Count icon={PhoneMissed} label="Missed" value={c.incoming.missed} tone={c.incoming.missed ? 'var(--m-red)' : undefined} sub="customer calls nobody answered" />
        </div>
        {c.driverCalls > 0 && <div className="m-sub mt-2">Plus {c.driverCalls} masked driver ↔ customer call{c.driverCalls === 1 ? '' : 's'} (not counted above).</div>}
        <div className="mt-3">
          <Row label="Last attempt">
            {o.lastAttempt ? <span>{when(o.lastAttempt.at)} · {o.lastAttempt.direction === 'inbound' ? 'customer called' : o.lastAttempt.callback ? 'we called back' : 'we called'} · <strong>{o.lastAttempt.outcomeLabel}</strong>{o.lastAttempt.staff ? ` · ${o.lastAttempt.staff}` : ''}</span> : <span style={{ color: 'var(--m-text3)' }}>No calls</span>}
          </Row>
          <Row label="Last spoke">
            {o.lastConnected ? <span>{when(o.lastConnected.at)} · <strong>{o.lastConnected.staff || 'Staff'}</strong>{dur(o.lastConnected.talkSec) ? ` · ${dur(o.lastConnected.talkSec)}` : ''}</span> : <span style={{ color: 'var(--m-text3)' }}>Never connected</span>}
          </Row>
        </div>
      </section>

      <section className="m-card p-4 mt-3" aria-labelledby="co-note">
        <h2 id="co-note" className="font-bold mb-1">Latest note</h2>
        {o.latestNote ? (
          <p className="text-[15px] break-words">“{o.latestNote.text}”<span className="block m-sub mt-1">{o.latestNote.by || 'Staff'} · {when(o.latestNote.at)} · {o.latestNote.source}</span></p>
        ) : <div className="m-sub">No notes yet.</div>}
      </section>

      <section className="m-card p-4 mt-3" aria-labelledby="co-timeline">
        <h2 id="co-timeline" className="font-bold mb-2">Timeline</h2>
        {events.length ? (
          <ol className="space-y-3">
            {events.map((e, i) => {
              const Icon = KIND_ICON[e.kind] || Clock;
              return (
                <li key={i} className="flex gap-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#eef1f5', color: 'var(--m-text2)' }}><Icon size={15} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1 text-[14.5px]">
                    <span className="block font-semibold break-words">{e.title}</span>
                    {e.detail && <span className="block break-words" style={{ color: 'var(--m-text2)' }}>{e.kind === 'note' ? `“${e.detail}”` : e.detail}</span>}
                    <span className="block text-[12.5px]" style={{ color: 'var(--m-text3)' }}>{when(e.at)}{e.by ? ` · ${e.by}` : ''}{e.dueAt ? ` · for ${when(e.dueAt)}` : ''}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : <div className="m-sub">Nothing recorded yet.</div>}
        {o.timeline.length > TIMELINE_FIRST && (
          <button type="button" className="m-btn m-tap w-full mt-3" onClick={() => setAllEvents((v) => !v)}>{allEvents ? 'Show fewer' : `Show all ${o.timeline.length}`}</button>
        )}
      </section>

      <section className="m-card p-4 mt-3" aria-labelledby="co-calls">
        <h2 id="co-calls" className="font-bold mb-2">Calls ({totalCalls})</h2>
        {o.calls.length ? (
          <ul className="divide-y" style={{ borderColor: 'var(--m-line)' }}>
            {o.calls.map((x) => (
              <li key={x.id} className="py-2 flex items-center gap-2 text-[14px]">
                <span className="flex-shrink-0">{x.kind === 'incoming' ? (x.outcome === 'missed' ? <PhoneMissed size={16} style={{ color: 'var(--m-red)' }} aria-label="Missed incoming" /> : <PhoneIncoming size={16} aria-label="Incoming" />) : <PhoneOutgoing size={16} aria-label={x.kind === 'driver' ? 'Driver call' : 'Outgoing'} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{x.kind === 'driver' ? 'Driver call' : x.kind === 'incoming' ? 'Customer called' : x.callback ? 'Callback' : 'We called'}</span> · {x.outcomeLabel}
                  <span className="block text-[12.5px]" style={{ color: 'var(--m-text3)' }}>{when(x.at)}{x.staff ? ` · ${x.staff}` : ''}{dur(x.talkSec) ? ` · ${dur(x.talkSec)}` : ''}{x.hasRecording ? ' · recorded' : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : <div className="m-sub">No calls with this customer yet.</div>}
        {totalCalls > o.calls.length && <div className="m-sub mt-2">Showing the latest {o.calls.length} of {totalCalls}. Every call is in the detailed records below.</div>}
        <button type="button" className="m-btn m-tap w-full mt-3" aria-expanded={details.open} onClick={openDetails}>
          Detailed call records <ChevronDown size={16} aria-hidden="true" style={{ transform: details.open ? 'rotate(180deg)' : 'none' }} />
        </button>
        {details.open && (
          <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--ink)' }} data-call-details>
            {details.status === 'loading' ? <div className="text-sm" style={{ color: 'var(--text3)' }}>Loading…</div>
              : details.status === 'error' ? <div className="text-sm" style={{ color: 'var(--red)' }}>Couldn’t load the call records.</div>
                : (
                  <>
                    {details.total != null && <div className="text-xs mb-2" style={{ color: 'var(--text3)' }}>Showing {details.logs.length} of {details.total} call record{details.total === 1 ? '' : 's'}, newest first</div>}
                    <CallLogList logs={details.logs} emptyText="No recorded calls with this customer yet." showCallBack={false} />
                    {details.next && (
                      <button type="button" className="m-btn m-tap w-full mt-3" onClick={moreDetails} disabled={details.status === 'more'}>
                        {details.status === 'more' ? 'Loading…' : 'Load more call records'}
                      </button>
                    )}
                    {details.moreError && <div className="text-sm mt-2" style={{ color: 'var(--red)' }}>Couldn’t load more. Try again.</div>}
                  </>
                )}
          </div>
        )}
      </section>

      {o.payments && (
        <section className="m-card p-4 mt-3" aria-labelledby="co-pay">
          <h2 id="co-pay" className="font-bold mb-2">Payments <span className="m-sub">(owner only)</span></h2>
          {o.payments.length ? (
            <ul className="space-y-2 text-[14px]">
              {o.payments.map((p) => (
                <li key={p.receiptNumber} className="flex justify-between gap-2">
                  <span>{p.receiptNumber} · {p.kind} · {p.method}<span className="block m-sub">{when(p.receivedAt)}</span></span>
                  <span className="font-semibold">₹{(p.amountPaise / 100).toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ul>
          ) : <div className="m-sub">No payments recorded.</div>}
        </section>
      )}
    </div>
  );
}
