// src/pages/WhatsappConversationsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { whatsappConversationsApi, whatsappCustomerApi } from '../api/client';
import { PageHeader, Spinner, Empty, SectionLabel, StatusBadge, rupee } from '../components/ui';
import { AlertTriangle, Phone, X, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

const POLL_MS = 30000;

const DAY_OPTIONS = [
  { key: 1,  label: '1 day' },
  { key: 7,  label: '7 days' },
  { key: 30, label: '30 days' },
];

// bucket is a SERVER-side filter (medifleet-backend's GET /conversations
// ?bucket=), unlike the chips below which filter client-side over
// whatever bucket is currently fetched -- "To call" is the default view
// since that's the actual work queue this page exists for.
const BUCKET_OPTIONS = [
  { key: 'needs_call', label: 'To call' },
  { key: 'done',       label: 'Done' },
  { key: 'all',        label: 'All' },
];

// The count chips ("Total/Live/Dropped/Completed") filter the already-fetched
// list client-side rather than triggering a refetch per tap -- the API's
// `status` param only knows all/dropped/completed (see
// routes/whatsappRoutes.js's /conversations), it has no server-side concept
// of "live" at all, so every chip (including Dropped/Completed) is applied
// here uniformly against the one status=all fetch instead of mixing
// server-filtered and client-filtered chips.
const CHIPS = [
  { key: 'total',     label: 'Total' },
  { key: 'live',      label: 'Live' },
  { key: 'dropped',   label: 'Dropped' },
  { key: 'completed', label: 'Completed' },
];

// Mutually exclusive: every conversation is exactly one of live/dropped/
// completed (Total is the whole set, not a fourth partition) -- a
// still-live conversation must never also count as dropped just because
// it hasn't completed yet.
function matchesChip(row, chip) {
  if (chip === 'live')      return row.isLive;
  if (chip === 'dropped')   return !row.completed && !row.isLive;
  if (chip === 'completed') return row.completed;
  return true; // total
}

const OUTCOME_LABELS = {
  booked: 'Booked',
  followup: 'Follow-up',
  not_interested: 'Not interested',
  no_answer: 'No answer',
};

// Custom buttons (not the shared <Btn> component's "sm" size, which runs
// too small for a comfortable thumb target) -- py-3 keeps each one close
// to the ~44px minimum touch target guideline, important here since the
// 4-button grid is the primary action on every card on a page used mostly
// on a phone.
const OUTCOME_BUTTONS = [
  { key: 'booked',         label: 'Booked',         color: 'var(--accent)', bg: 'rgba(0,212,170,.12)',  border: 'rgba(0,212,170,.3)' },
  { key: 'followup',       label: 'Follow-up',      color: 'var(--blue)',   bg: 'rgba(59,158,255,.12)', border: 'rgba(59,158,255,.3)' },
  { key: 'not_interested', label: 'Not interested', color: 'var(--text2)',  bg: 'var(--surface2)',      border: 'rgba(255,255,255,.08)' },
  { key: 'no_answer',      label: 'No answer',      color: 'var(--amber)',  bg: 'rgba(255,184,48,.12)', border: 'rgba(255,184,48,.3)' },
];

// "4 min ago" / "2 hrs ago" -- shared by minutesSince (a plain number from
// the API) and lastCalledAt (an ISO date, converted to minutes first).
function friendlyMinutes(mins) {
  if (mins == null) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
}

function minutesSince(iso) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

// green while the session is still live regardless of completed (a phone
// can complete a booking and immediately start a fresh conversation within
// the same window) -- grey only once it's both done AND no longer live,
// amber for everything else (mid-flow, session gone -- abandoned).
function StatusDot({ row }) {
  const color = row.isLive ? 'var(--accent)' : row.completed ? 'var(--text3)' : 'var(--amber)';
  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />;
}

export default function WhatsappConversationsPage() {
  const [conversations, setConversations] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [loadedOnce,   setLoadedOnce]   = useState(false);
  const [days,         setDays]         = useState(7);
  const [bucket,       setBucket]       = useState('needs_call');
  const [chip,         setChip]         = useState('total');
  const intervalRef = useRef();

  // Per-phone draft state for the outcome-logging UI -- { note, tripNumber,
  // followUpAt } keyed by phone, so switching between cards (or a
  // background refresh replacing rows) never bleeds one card's in-progress
  // input into another's.
  const [drafts,        setDrafts]        = useState({});
  const [activePanel,   setActivePanel]   = useState({}); // { [phone]: 'booked'|'followup'|null }
  const [forceShow,     setForceShow]     = useState({}); // { [phone]: true } -- "Call now anyway"
  const [submittingPhone, setSubmittingPhone] = useState(null);

  // Full-screen customer-history modal (Part 2).
  const [historyPhone,   setHistoryPhone]   = useState(null);
  const [historyData,    setHistoryData]    = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError,   setHistoryError]   = useState(null);

  // Re-runs on day-range/bucket change (both are server-side params):
  // fetches immediately (non-silent, so switching either shows a spinner),
  // then resumes background polling. Same silent/loadedOnce/error handling
  // as WhatsappLeadsPage/SosAlertsPage. Chip taps do NOT re-run this --
  // they're a pure client-side filter over what's already loaded.
  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [days, bucket]);

  // Full-screen modal open while historyPhone is set -- lock body scroll,
  // same convention as components/ui.jsx's own Modal.
  useEffect(() => {
    document.body.style.overflow = historyPhone ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [historyPhone]);

  const load = async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await whatsappConversationsApi.getAll({ days, status: 'all', bucket });
      setConversations(data.conversations || []);
      setError(null);
      setLoadedOnce(true);
    } catch (e) {
      // Deliberately does NOT clear conversations here -- a failed
      // fetch must never be indistinguishable from "no conversations".
      // Last-known-good data (if any) stays on screen under the error banner.
      setError(e.response?.data?.message || e.message || 'Could not load WhatsApp conversations.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const filtered = useMemo(
    () => conversations.filter((c) => matchesChip(c, chip)),
    [conversations, chip]
  );

  // Same three checks as matchesChip, applied once per conversation instead
  // of re-filtering the array four times. Total + live + dropped +
  // completed won't reconcile as a simple sum -- Total is the whole set,
  // the other three partition it. These counts are scoped to whatever
  // bucket is currently selected (they're derived from `conversations`,
  // which the server already filtered by bucket) -- e.g. under "To call",
  // "Total" means "total needing a call", not the grand total everywhere.
  const counts = useMemo(() => {
    const result = { total: conversations.length, live: 0, dropped: 0, completed: 0 };
    for (const c of conversations) {
      if (c.isLive) result.live += 1;
      if (!c.completed && !c.isLive) result.dropped += 1;
      if (c.completed) result.completed += 1;
    }
    return result;
  }, [conversations]);

  const chipLabel = CHIPS.find((c) => c.key === chip)?.label.toLowerCase();
  const bucketLabel = BUCKET_OPTIONS.find((b) => b.key === bucket)?.label.toLowerCase();
  const dayLabel = `${days} day${days === 1 ? '' : 's'}`;
  const emptyMessage = [
    'No',
    chip !== 'total' ? chipLabel : null,
    'conversations',
    bucket !== 'all' ? `(${bucketLabel})` : null,
    `in the last ${dayLabel}`,
  ].filter(Boolean).join(' ');

  const getDraft = (phone) => drafts[phone] || { note: '', tripNumber: '', followUpAt: '' };
  const updateDraft = (phone, field, value) =>
    setDrafts((prev) => ({ ...prev, [phone]: { ...getDraft(phone), [field]: value } }));

  const handleOutcomeTap = (phone, outcome) => {
    if (outcome === 'not_interested' || outcome === 'no_answer') {
      submitOutcome(phone, outcome);
      return;
    }
    // booked/followup open an inline panel for the extra field -- tapping
    // the same one again collapses it.
    setActivePanel((prev) => ({ ...prev, [phone]: prev[phone] === outcome ? null : outcome }));
  };

  const submitOutcome = async (phone, outcome) => {
    const draft = getDraft(phone);
    const body = { phone, outcome };
    if (draft.note?.trim()) body.note = draft.note.trim();
    if (outcome === 'booked' && draft.tripNumber?.trim()) body.tripId = draft.tripNumber.trim();

    if (outcome === 'followup') {
      if (!draft.followUpAt) {
        toast.error('Pick a follow-up date and time.');
        return;
      }
      const followUpDate = new Date(draft.followUpAt);
      if (Number.isNaN(followUpDate.getTime()) || followUpDate <= new Date()) {
        toast.error('Follow-up time must be in the future.');
        return;
      }
      body.followUpAt = followUpDate.toISOString();
    }

    setSubmittingPhone(phone);
    try {
      await whatsappConversationsApi.logOutcome(body);
      toast.success('Call outcome saved');
      setDrafts((prev) => { const next = { ...prev }; delete next[phone]; return next; });
      setActivePanel((prev) => ({ ...prev, [phone]: null }));
      setForceShow((prev) => ({ ...prev, [phone]: false }));
      // Silent -- a tap on one card must never yank the whole page back to
      // the full-screen spinner.
      await load({ silent: true });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not save this call outcome.');
    } finally {
      setSubmittingPhone(null);
    }
  };

  const openHistory = async (phone) => {
    setHistoryPhone(phone);
    setHistoryData(null);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const { data } = await whatsappCustomerApi.get(phone);
      setHistoryData(data);
    } catch (e) {
      setHistoryError(e.response?.data?.message || e.message || 'Could not load customer history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setHistoryPhone(null);
    setHistoryData(null);
    setHistoryError(null);
  };

  return (
    <div className="page-enter">
      <PageHeader title="WhatsApp Chats" subtitle="Every customer conversation with the WhatsApp booking bot -- live, dropped off, or completed" />

      {error && (
        <div className="card mb-4" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--red)' }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        </div>
      )}

      {/* Bucket toggle -- primary control, full-width thumb-sized segments */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--surface)' }}>
        {BUCKET_OPTIONS.map((b) => (
          <button
            key={b.key}
            onClick={() => setBucket(b.key)}
            className="py-2.5 rounded-lg text-xs font-bold transition-all"
            style={bucket === b.key
              ? { background: 'var(--accent)', color: 'var(--ink)' }
              : { color: 'var(--text3)' }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Count chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChip(c.key)}
            className="card-sm text-left transition-all"
            style={{
              borderColor: chip === c.key ? 'var(--accent)' : 'var(--border)',
              background : chip === c.key ? 'rgba(0,212,170,.08)' : 'var(--surface)',
            }}
          >
            <div className="text-xs font-semibold tracking-widest" style={{ color: 'var(--text3)' }}>
              {c.label.toUpperCase()}
            </div>
            <div className="text-xl font-bold font-mono mt-0.5"
              style={{ color: chip === c.key ? 'var(--accent)' : 'var(--text)' }}>
              {counts[c.key] ?? 0}
            </div>
          </button>
        ))}
      </div>

      {/* Day range */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'var(--surface)', width: 'fit-content' }}>
        {DAY_OPTIONS.map((d) => (
          <button key={d.key}
            onClick={() => setDays(d.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${days === d.key
                ? 'text-[var(--text)] bg-[var(--surface2)]'
                : 'text-[var(--text3)] hover:text-[var(--text2)]'
              }`}>
            {d.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {loadedOnce && filtered.length === 0 && !error && (
            <Empty icon="💬" message={emptyMessage} />
          )}

          {filtered.length > 0 && (
            <div className="flex flex-col gap-3">
              {filtered.map((c) => {
                const hasPendingFollowUp = c.followUpAt && new Date(c.followUpAt) > new Date();
                const showButtons = !hasPendingFollowUp || forceShow[c.phone];
                const draft = getDraft(c.phone);
                const isSubmitting = submittingPhone === c.phone;

                return (
                  <div key={c.phone} className="card">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-2"><StatusDot row={c} /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => openHistory(c.phone)}
                              className="text-xl font-bold font-mono truncate text-left"
                              style={{ color: 'var(--text)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                            >
                              {c.phone}
                            </button>
                            {c.isReturning && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: 'rgba(255,77,109,.15)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.3)' }}>
                                <RotateCcw size={10} /> REPEAT
                              </span>
                            )}
                          </div>
                          <div className="text-sm mt-1" style={{ color: 'var(--text2)' }}>{c.lastStepLabel}</div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {c.serviceLabel && (
                              <span className="text-xs inline-flex items-center px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(59,158,255,.12)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.3)' }}>
                                {c.serviceLabel}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: 'var(--text3)' }}>
                              {friendlyMinutes(c.minutesSince)}
                            </span>
                          </div>
                          {c.lastCalledAt && (
                            <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                              Last call: {OUTCOME_LABELS[c.lastOutcome] || c.lastOutcome} · {friendlyMinutes(minutesSince(c.lastCalledAt))}
                            </div>
                          )}
                        </div>
                      </div>

                      <a href={`tel:${c.phone}`}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-bold flex-shrink-0 w-full sm:w-auto"
                        style={{ background: 'rgba(0,212,170,.14)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,.35)' }}>
                        <Phone size={16} /> Call
                      </a>
                    </div>

                    {/* Call-outcome logging */}
                    {hasPendingFollowUp && !showButtons ? (
                      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2.5"
                        style={{ background: 'rgba(59,158,255,.08)', border: '1px solid rgba(59,158,255,.25)' }}>
                        <span className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                          Follow up on {formatDateTime(c.followUpAt)}
                        </span>
                        <button onClick={() => setForceShow((p) => ({ ...p, [c.phone]: true }))}
                          className="text-xs underline flex-shrink-0" style={{ color: 'var(--text3)' }}>
                          Call now anyway
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          {OUTCOME_BUTTONS.map((ob) => (
                            <button
                              key={ob.key}
                              disabled={isSubmitting}
                              onClick={() => handleOutcomeTap(c.phone, ob.key)}
                              className="rounded-lg text-xs font-bold py-3 px-2 transition-all disabled:opacity-50"
                              style={activePanel[c.phone] === ob.key
                                ? { background: ob.color, color: 'var(--ink)', border: `1px solid ${ob.color}` }
                                : { background: ob.bg, color: ob.color, border: `1px solid ${ob.border}` }}
                            >
                              {ob.label}
                            </button>
                          ))}
                        </div>

                        <input
                          className="inp mt-2 text-xs"
                          placeholder="Optional note..."
                          value={draft.note}
                          onChange={(e) => updateDraft(c.phone, 'note', e.target.value)}
                        />

                        {activePanel[c.phone] === 'booked' && (
                          <div className="mt-2 flex gap-2">
                            <input className="inp text-xs flex-1" placeholder="Trip number (optional)"
                              value={draft.tripNumber}
                              onChange={(e) => updateDraft(c.phone, 'tripNumber', e.target.value)} />
                            <button
                              onClick={() => submitOutcome(c.phone, 'booked')}
                              disabled={isSubmitting}
                              className="px-4 rounded-lg text-xs font-bold flex-shrink-0 disabled:opacity-50"
                              style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                              {isSubmitting ? '...' : 'Confirm'}
                            </button>
                          </div>
                        )}

                        {activePanel[c.phone] === 'followup' && (
                          <div className="mt-2 flex gap-2 flex-wrap">
                            <input type="datetime-local" className="inp text-xs flex-1" style={{ minWidth: 170 }}
                              value={draft.followUpAt}
                              onChange={(e) => updateDraft(c.phone, 'followUpAt', e.target.value)} />
                            <button
                              onClick={() => submitOutcome(c.phone, 'followup')}
                              disabled={isSubmitting}
                              className="px-4 rounded-lg text-xs font-bold flex-shrink-0 disabled:opacity-50"
                              style={{ background: 'var(--blue)', color: '#fff' }}>
                              {isSubmitting ? '...' : 'Confirm'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===================== Customer history — full-screen ===================== */}
      {historyPhone && (
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: 'var(--ink)' }}>
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <button onClick={closeHistory}
              className="p-2 rounded-lg flex-shrink-0"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
              <X size={18} />
            </button>
            <div className="text-lg font-bold font-mono truncate">{historyPhone}</div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {historyLoading && <Spinner />}

            {historyError && (
              <div className="card mb-4" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--red)' }}>
                  <AlertTriangle size={16} /> {historyError}
                </div>
              </div>
            )}

            {historyData && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
                  {[
                    ['Conversations', historyData.summary.totalConversations],
                    ['Completed', historyData.summary.completedBookings],
                    ['Trips', historyData.summary.totalTrips],
                    ['Cancelled', historyData.summary.cancelledTrips],
                    ['Calls made', historyData.summary.totalCallsMade],
                  ].map(([label, value]) => (
                    <div key={label} className="card-sm text-center">
                      <div className="text-lg font-bold font-mono">{value}</div>
                      <div className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--text3)' }}>{label}</div>
                    </div>
                  ))}
                </div>

                <SectionLabel>Conversations</SectionLabel>
                {historyData.conversations.length === 0 ? (
                  <div className="text-sm mb-6" style={{ color: 'var(--text3)' }}>No conversations found.</div>
                ) : (
                  <div className="flex flex-col gap-2 mb-6">
                    {historyData.conversations.map((conv, i) => (
                      <div key={i} className="card-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{conv.lastStepLabel}</span>
                          {conv.completed && <span className="badge badge-green">Completed</span>}
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                          {conv.serviceLabel ? `${conv.serviceLabel} · ` : ''}{formatDateTime(conv.startedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <SectionLabel>Calls</SectionLabel>
                {historyData.calls.length === 0 ? (
                  <div className="text-sm mb-6" style={{ color: 'var(--text3)' }}>No calls logged.</div>
                ) : (
                  <div className="flex flex-col gap-2 mb-6">
                    {historyData.calls.map((call, i) => (
                      <div key={i} className="card-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{OUTCOME_LABELS[call.outcome] || call.outcome}</span>
                          <span className="text-xs" style={{ color: 'var(--text3)' }}>{formatDateTime(call.createdAt)}</span>
                        </div>
                        {call.note && <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{call.note}</div>}
                        {(call.calledBy || call.followUpAt || call.tripId) && (
                          <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                            {[
                              call.calledBy ? `By ${call.calledBy}` : null,
                              call.followUpAt ? `Follow-up ${formatDateTime(call.followUpAt)}` : null,
                              call.tripId ? `Trip ${call.tripId}` : null,
                            ].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <SectionLabel>Trips</SectionLabel>
                {historyData.trips.length === 0 ? (
                  <div className="mb-6">
                    <div className="text-sm" style={{ color: 'var(--text3)' }}>No trips found.</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                      If this customer has booked before, the phone number format may not match.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 mb-6">
                    {historyData.trips.map((trip) => (
                      <div key={trip.tripNumber} className="card-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold font-mono">{trip.tripNumber}</span>
                          <StatusBadge status={trip.status} />
                        </div>
                        {trip.serviceType && (
                          <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{trip.serviceType}</div>
                        )}
                        <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                          {trip.pickup?.address || '—'} → {trip.drop?.address || '—'}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs" style={{ color: 'var(--text3)' }}>{formatDateTime(trip.createdAt)}</span>
                          {trip.fare != null && <span className="text-xs font-mono font-semibold">{rupee(trip.fare)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
