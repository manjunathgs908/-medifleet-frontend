// src/pages/LeadsPage.jsx
//
// Leads Dashboard (medifleet-backend /api/leads): FB / Google ads, inbound
// calls and WhatsApp call outcomes, with the follow-up work on each lead —
// assign it, set the next follow-up (India time), add notes, move its
// status (Lost needs a reason). Overdue / due today / unassigned are the
// CRM's own reminders: nothing here calls, messages or notifies anyone.
//
// Missed-call callbacks stay on their own page; a lead only shows a
// callback the call log already linked to it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, Megaphone, Search, PhoneIncoming, PenLine, Footprints, Users, MessageCircle, Mail,
  RefreshCw, ChevronDown, PhoneForwarded, StickyNote,
} from 'lucide-react';
import { leadsApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, StatusBadge, Badge, Btn, Spinner, Empty, custPhone } from '../components/ui';
import CallButton from '../components/CallButton';

const POLL_MS = 60 * 1000;
const STATUSES = ['all', 'new', 'contacted', 'converted', 'lost'];
const ACTIVE = ['new', 'contacted'];

const SRC_ICONS = {
  facebook_ad: Megaphone, google_ad: Search, inbound_call: PhoneIncoming, manual: PenLine,
  walk_in: Footprints, referral: Users, whatsapp: MessageCircle,
};

// ── India time, whatever this device's own time zone ─────────────
const IST = 'Asia/Kolkata';
const IST_OFFSET_MIN = 330;
const fmtIst = (v, withDate = true) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('en-IN', {
    timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true,
    ...(withDate ? { day: '2-digit', month: 'short', year: 'numeric' } : {}),
  })} IST`;
};
// "YYYY-MM-DDTHH:mm" in India time, for <input type="datetime-local">.
// Sent back as-is: the server reads a time without a zone as India time.
const istInput = (v) => new Date(new Date(v).getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 16);

const WA_OUTCOME = { booked: 'Booked', followup: 'Follow up', not_interested: 'Not interested', no_answer: 'No answer' };
const historyText = (e) => {
  const d = e.detail || {};
  switch (e.type) {
    case 'assigned'         : return `Assigned to ${d.to}${d.from ? ` (was ${d.from})` : ''}`;
    case 'unassigned'       : return `Unassigned${d.from ? ` (was ${d.from})` : ''}`;
    case 'follow_up_set'    : return `Follow-up set for ${fmtIst(d.at)}${d.from ? ` (was ${fmtIst(d.from)})` : ''}`;
    case 'follow_up_cleared': return `Follow-up cleared (was ${fmtIst(d.from)})`;
    case 'status'           : return [
      `Status ${d.from || 'new'} → ${d.to}`,
      d.trip && `booked as trip ${d.trip}`,
      d.reason && `reason: “${d.reason}”`,
      d.followUpCleared && `follow-up ${fmtIst(d.followUpCleared)} ended`,
    ].filter(Boolean).join(' · ');
    case 'whatsapp_outcome' : return [
      `WhatsApp call outcome: ${WA_OUTCOME[d.outcome] || d.outcome}`,
      d.from !== d.to && `status ${d.from || 'new'} → ${d.to}`,
      d.keptBooked && 'booked lead, stays converted',
      d.followUpAt && `follow-up ${fmtIst(d.followUpAt)}`,
      d.reason && `reason: “${d.reason}”`,
    ].filter(Boolean).join(' · ');
    default: return e.type;
  }
};

function FollowUpBadge({ lead }) {
  if (lead.followUp === 'overdue') return <Badge color="red">Follow-up overdue</Badge>;
  if (lead.followUp === 'today') return <Badge color="amber">Due today {fmtIst(lead.nextFollowUpAt, false)}</Badge>;
  if (lead.followUp === 'upcoming') return <Badge color="blue">Follow-up {fmtIst(lead.nextFollowUpAt)}</Badge>;
  return null;
}

// Notes (who + when) and every assignment / follow-up / status change,
// newest first. The old free-text notes field is shown as it was.
function Activity({ lead }) {
  const [open, setOpen] = useState(false);
  const id = `lead-activity-${lead._id}`;
  const rows = useMemo(() => [
    ...(lead.followUpNotes || []).map((n) => ({ at: n.at, note: true, text: n.text, by: n.byName })),
    ...(lead.history || []).map((e) => ({ at: e.at, text: historyText(e), by: e.byName })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)), [lead]);
  const count = rows.length + (lead.notes ? 1 : 0);
  if (!count) return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        className="inline-flex items-center gap-1 text-[11px] font-semibold rounded px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{ color: 'var(--text3)' }}>
        <ChevronDown size={12} aria-hidden="true" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }} />
        Notes &amp; history ({count})
      </button>
      {open && (
        <ol id={id} className="mt-1.5 rounded-lg p-2.5 space-y-1.5 text-[11px]" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
          {rows.map((r, i) => (
            <li key={i} className="flex flex-col sm:flex-row sm:gap-2">
              <span className="flex-shrink-0 font-mono" style={{ color: 'var(--text3)' }}>{fmtIst(r.at)}</span>
              <span className="min-w-0 break-words">
                {r.note && <StickyNote size={11} className="inline mr-1" aria-label="Note" style={{ color: 'var(--amber)' }} />}
                {r.note ? `“${r.text}”` : r.text}
                <span style={{ color: 'var(--text3)' }}> — {r.by || 'system'}</span>
              </span>
            </li>
          ))}
          {lead.notes && (
            <li className="pt-1.5" style={{ borderTop: '1px solid var(--border, rgba(255,255,255,.06))' }}>
              <div className="font-semibold mb-0.5" style={{ color: 'var(--text3)' }}>Earlier notes</div>
              <div className="whitespace-pre-wrap break-words">{lead.notes}</div>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function LeadCard({ lead, assignees, me, onChanged }) {
  const [mode, setMode] = useState(null); // null | 'followup' | 'note' | 'lost'
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState('');
  const [text, setText] = useState('');
  // Linked to a booked trip: stays converted, no follow-up (as the server enforces).
  const booked = !!lead.convertedTrip;
  const active = ACTIVE.includes(lead.status || 'new') && !booked;
  const Icon = SRC_ICONS[lead.source] || Mail;
  const lastNote = (lead.followUpNotes || []).at(-1);
  const assigneeKnown = !lead.assignedTo || assignees.some((u) => String(u._id) === String(lead.assignedTo));

  // One change; on 409 the API client shows why and the card takes the
  // current lead the server sent back.
  const act = async (fn) => {
    setBusy(true);
    try {
      const { data } = await fn();
      onChanged(data.lead);
      setMode(null);
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.lead) { onChanged(e.response.data.lead); setMode(null); }
    } finally {
      setBusy(false);
    }
  };
  const toggle = (m, init = '') => { setText(init); setMode(mode === m ? null : m); };
  const formId = `lead-form-${lead._id}`;
  const urgent = lead.followUp === 'overdue';

  return (
    <div className="card-sm" data-lead-id={lead._id} style={urgent ? { borderColor: 'rgba(255,77,109,.45)' } : undefined}>
      <div className="flex items-start justify-between gap-x-3 gap-y-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-sm font-semibold">
            <Icon size={14} className="flex-shrink-0" style={{ color: 'var(--text3)' }} aria-label={lead.source?.replace('_', ' ') || 'source'} />
            <span className="truncate">{lead.patientName || 'Unknown'}</span>
            <span className="font-mono text-xs font-normal" style={{ color: 'var(--text3)' }}>{custPhone(lead.phone, lead.phoneMasked, '-')}</span>
            <StatusBadge status={lead.status || 'new'} />
            <FollowUpBadge lead={lead} />
            {lead.openCallback && (
              <Link to="/callbacks" className="badge badge-blue inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                <PhoneForwarded size={10} aria-hidden="true" /> Missed-call callback pending
              </Link>
            )}
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
            {[
              lead.source?.replace('_', ' '),
              (lead.adName || lead.formName) && `Campaign: ${lead.adName || lead.formName}`,
              `Received ${fmtIst(lead.receivedAt || lead.createdAt)}`,
            ].filter(Boolean).join(' · ')}
          </div>
          {lead.message && <div className="text-xs mt-1 break-words" style={{ color: 'var(--text2)' }}>{lead.message}</div>}
          <div className="text-[11px] mt-1" style={{ color: 'var(--text2)' }}>
            {[
              lead.assignedTo ? `Assigned: ${lead.assignedToName || 'staff member'}` : 'Unassigned',
              active && !lead.nextFollowUpAt && 'No follow-up set',
              booked && 'Booked as a trip',
            ].filter(Boolean).join(' · ')}
          </div>
          {lead.status === 'lost' && lead.lostReason && (
            <div className="text-[11px] mt-1" style={{ color: 'var(--text2)' }}>Lost — “{lead.lostReason}”</div>
          )}
          {lastNote && (
            <div className="text-[11px] mt-1 break-words" style={{ color: 'var(--text2)' }}>
              <StickyNote size={11} className="inline mr-1" aria-hidden="true" style={{ color: 'var(--amber)' }} />
              “{lastNote.text}” <span style={{ color: 'var(--text3)' }}>— {lastNote.byName}, {fmtIst(lastNote.at)}</span>
            </div>
          )}
        </div>
        {lead.phoneMasked && <CallButton target={{ leadId: lead._id }} />}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <label className="sr-only" htmlFor={`lead-assign-${lead._id}`}>Assigned to</label>
        <select id={`lead-assign-${lead._id}`} className="inp !w-auto !py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" disabled={busy}
          value={lead.assignedTo || ''}
          onChange={(e) => act(() => leadsApi.assign(lead._id, e.target.value || null, lead.rev))}>
          <option value="">Unassigned</option>
          {!assigneeKnown && <option value={lead.assignedTo} disabled>{lead.assignedToName || 'Staff member'} (inactive)</option>}
          {assignees.map((u) => <option key={u._id} value={u._id}>{String(u._id) === String(me) ? `${u.name} (me)` : u.name}</option>)}
        </select>
        {active && (
          <Btn size="sm" variant="ghost" disabled={busy} aria-expanded={mode === 'followup'} aria-controls={formId}
            onClick={() => { setWhen(istInput(lead.nextFollowUpAt || Date.now() + 60 * 60000)); setMode(mode === 'followup' ? null : 'followup'); }}>
            {lead.nextFollowUpAt ? 'Change follow-up' : 'Set follow-up'}
          </Btn>
        )}
        <Btn size="sm" variant="ghost" disabled={busy} aria-expanded={mode === 'note'} aria-controls={formId} onClick={() => toggle('note')}>Add note</Btn>
        {lead.status === 'new' && !booked && <Btn size="sm" variant="blue" disabled={busy} onClick={() => act(() => leadsApi.setStatus(lead._id, 'contacted', undefined, lead.rev))}>Contacted</Btn>}
        {lead.status === 'contacted' && <Btn size="sm" disabled={busy} onClick={() => act(() => leadsApi.setStatus(lead._id, 'converted', undefined, lead.rev))}>Convert</Btn>}
        {!['lost', 'spam'].includes(lead.status) && !booked && (
          <Btn size="sm" variant="danger" disabled={busy} aria-expanded={mode === 'lost'} aria-controls={formId} onClick={() => toggle('lost')}>Lost…</Btn>
        )}
        {['lost', 'spam'].includes(lead.status) && (
          <Btn size="sm" variant="ghost" disabled={busy} onClick={() => act(() => leadsApi.setStatus(lead._id, 'contacted', undefined, lead.rev))}>Reopen</Btn>
        )}
      </div>

      {mode === 'followup' && (
        <form id={formId} className="mt-2 rounded-lg p-2.5 flex flex-wrap items-end gap-2" style={{ background: 'var(--surface2)' }}
          onSubmit={(e) => { e.preventDefault(); if (when) act(() => leadsApi.followUp(lead._id, when, lead.rev)); }}>
          <div>
            <label htmlFor={`lead-when-${lead._id}`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Next follow-up (India time, IST)</label>
            <input id={`lead-when-${lead._id}`} type="datetime-local" className="inp !py-1.5 text-xs" value={when} min={istInput(Date.now())} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <Btn size="sm" type="submit" disabled={busy || !when}>Save</Btn>
          {lead.nextFollowUpAt && <Btn size="sm" variant="ghost" type="button" disabled={busy} onClick={() => act(() => leadsApi.followUp(lead._id, null, lead.rev))}>Clear</Btn>}
          <Btn size="sm" variant="ghost" type="button" onClick={() => setMode(null)}>Cancel</Btn>
          <div className="w-full text-[11px]" style={{ color: 'var(--text3)' }}>A reminder in the CRM only — no call or message is sent.</div>
        </form>
      )}

      {mode === 'note' && (
        <form id={formId} className="mt-2 rounded-lg p-2.5 space-y-2" style={{ background: 'var(--surface2)' }}
          onSubmit={(e) => { e.preventDefault(); act(() => leadsApi.addNote(lead._id, text.trim())); }}>
          <label htmlFor={`lead-note-${lead._id}`} className="block text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Follow-up note</label>
          <textarea id={`lead-note-${lead._id}`} className="inp !py-1.5 text-xs" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} required
            placeholder="e.g. Wants an ICU ambulance on Friday, call after 6 pm" />
          <div className="flex gap-2">
            <Btn size="sm" type="submit" disabled={busy || !text.trim()}>Save note</Btn>
            <Btn size="sm" variant="ghost" type="button" onClick={() => setMode(null)}>Cancel</Btn>
          </div>
        </form>
      )}

      {mode === 'lost' && (
        <form id={formId} className="mt-2 rounded-lg p-2.5 space-y-2" style={{ background: 'var(--surface2)' }}
          onSubmit={(e) => { e.preventDefault(); act(() => leadsApi.setStatus(lead._id, 'lost', text.trim(), lead.rev)); }}>
          <label htmlFor={`lead-reason-${lead._id}`} className="block text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Why is this lead lost? (required)</label>
          <input id={`lead-reason-${lead._id}`} className="inp !py-1.5 text-xs" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} required
            placeholder="e.g. Booked another provider" />
          {lead.nextFollowUpAt && <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Its follow-up ({fmtIst(lead.nextFollowUpAt)}) ends; it stays in the history.</div>}
          <div className="flex gap-2">
            <Btn size="sm" variant="danger" type="submit" disabled={busy || !text.trim()}>Mark lost</Btn>
            <Btn size="sm" variant="ghost" type="button" onClick={() => setMode(null)}>Cancel</Btn>
          </div>
        </form>
      )}

      <Activity lead={lead} />
    </div>
  );
}

export default function LeadsPage() {
  const { user } = useAuth();
  const me = user?.id || user?._id;
  const [status, setStatus] = useState('new');
  const [view, setView] = useState('all');
  const [staff, setStaff] = useState('');
  // `leads` always belongs to `leadsFor` — the filters it was fetched for —
  // so rows from one filter are never shown under another.
  const [leads, setLeads] = useState([]);
  const [leadsFor, setLeadsFor] = useState(null);
  const [counts, setCounts] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Only the newest request may update the list.
  const requestSeq = useRef(0);
  const key = `${status}|${view}|${staff}`;

  const load = async ({ silent } = {}) => {
    const seq = ++requestSeq.current;
    const forKey = key;
    if (!silent) setLoading(true);
    leadsApi.summary().then(({ data }) => setCounts(data.counts)).catch(() => {});
    try {
      const params = {};
      if (status !== 'all') params.status = status;
      if (view !== 'all') params.view = view;
      if (staff) params.assignedTo = staff;
      const { data } = await leadsApi.getAll(params);
      if (seq !== requestSeq.current) return;
      // Checked here too, so a tab never shows another status.
      const rows = data.leads || [];
      setLeads(status === 'all' ? rows : rows.filter((l) => (l.status || 'new') === status));
      setLeadsFor(forKey);
      setError(null);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      // A failed fetch shows the error — never an empty "no leads" list.
      setError(e.response?.data?.message || e.message || 'Could not load leads.');
    } finally {
      if (seq === requestSeq.current && !silent) setLoading(false);
    }
  };

  useEffect(() => { leadsApi.assignees().then(({ data }) => setAssignees(data.users || [])).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(t);
  }, [key]);

  const replace = (l) => {
    setLeads((prev) => prev.map((x) => (x._id === l._id ? l : x)));
    window.dispatchEvent(new Event('leads:changed'));
    load({ silent: true });
  };

  // A reminder view lists every active lead it counts (new and contacted),
  // so the list always matches the number on its chip.
  const pickView = (v) => { setView(v); if (v === 'unassigned' || v === 'mine') setStaff(''); if (v !== 'all') setStatus('all'); };
  const pickStatus = (s) => { setStatus(s); if (!ACTIVE.includes(s) && s !== 'all') setView('all'); };

  const shown = leadsFor === key ? leads : [];
  const VIEWS = [
    ['all', 'All leads', null, null],
    ['overdue', 'Overdue', counts?.overdue, 'red'],
    ['due_today', 'Due today', counts?.dueToday, 'amber'],
    ['unassigned', 'Unassigned', counts?.unassigned, 'blue'],
    ['mine', 'My leads', counts?.mine, null],
  ];
  const emptyMessage = view === 'overdue' ? 'No overdue follow-ups.'
    : view === 'due_today' ? 'Nothing else due today.'
      : view === 'unassigned' ? 'Every active lead has someone on it.'
        : view === 'mine' ? 'No active leads assigned to you.'
          : status === 'all' ? 'No leads yet' : `No ${status} leads`;

  return (
    <div className="page-enter">
      <PageHeader
        title="Leads Dashboard"
        subtitle="FB Ads · Google Ads · Inbound Calls · WhatsApp · follow-up times are India time (IST)"
        action={
          <button onClick={() => load()} aria-label="Refresh" className="p-2 rounded-lg" style={{ color: 'var(--text3)', background: 'var(--surface2)' }}>
            <RefreshCw size={14} />
          </button>
        }
      />

      <div role="group" aria-label="Follow-up reminders" className="flex flex-wrap gap-2 mb-3">
        {VIEWS.map(([k, label, n, color]) => {
          const on = view === k;
          const hot = color && n > 0;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => pickView(k)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{
                background: on ? 'var(--surface2)' : 'var(--surface)',
                color: on ? 'var(--text)' : 'var(--text2)',
                borderColor: on ? 'var(--accent)' : 'rgba(255,255,255,.06)',
              }}>
              {label}
              {n != null && (
                <span className={hot ? `badge badge-${color}` : 'badge badge-gray'} style={{ padding: '0 6px' }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-1 flex-wrap p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => pickStatus(s)} aria-pressed={status === s}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
                ${status === s ? 'bg-[var(--surface2)] text-[var(--text)]' : 'text-[var(--text3)]'}`}>{s}</button>
          ))}
        </div>
        <label className="sr-only" htmlFor="lead-staff-filter">Assigned to</label>
        <select id="lead-staff-filter" className="inp !w-auto !py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          value={staff} onChange={(e) => setStaff(e.target.value)} disabled={view === 'unassigned' || view === 'mine'}>
          <option value="">Everyone</option>
          {assignees.map((u) => <option key={u._id} value={u._id}>{String(u._id) === String(me) ? `${u.name} (me)` : u.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="card mb-4" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
          <div className="text-sm" style={{ color: 'var(--red)' }}>Error: {error}</div>
        </div>
      )}

      {loading ? <Spinner /> : leadsFor !== key ? null : !shown.length
        ? <div className="card"><Empty icon={<Target size={36} />} message={emptyMessage} /></div>
        : (
          <div className="flex flex-col gap-2">
            {shown.map((l) => <LeadCard key={l._id} lead={l} assignees={assignees} me={me} onChanged={replace} />)}
          </div>
        )}
    </div>
  );
}
