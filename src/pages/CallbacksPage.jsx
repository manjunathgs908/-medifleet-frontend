// src/pages/CallbacksPage.jsx
//
// Missed-call callback queue (medifleet-backend /api/callbacks). A
// customer's incoming call that nobody answered becomes one task per number;
// repeated misses from that number join it. The desk assigns it, schedules
// it, calls back through the masked "Call back" (agent's phone rings first)
// and resolves it with what happened.
//
// Calling back never closes a task, and neither does a later connected call
// — that is shown as evidence, and a person resolves. "Overdue" is the
// CRM's own reminder: nothing here calls, messages or notifies anyone.
// "Not routed by CRM" calls are kept apart: nobody was rung for them, so a
// person decides whether they need a callback.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ChevronDown, PhoneIncoming, PhoneOutgoing, CheckCircle2 } from 'lucide-react';
import { callbacksApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Tabs, Badge, Btn, Spinner, Empty, custPhone, fmtDateTime, timeAgo } from '../components/ui';
import CallButton from '../components/CallButton';
import { STATUS, fmtSec } from '../components/CallLogList';

const POLL_MS = 30 * 1000;

// Same keys as the backend's CallbackTask OUTCOMES.
const OUTCOMES = [
  ['reached', 'Spoke to the customer'],
  ['booked', 'Booked a trip'],
  ['not_needed', 'Customer no longer needs help'],
  ['wrong_number', 'Wrong number'],
  ['unreachable', 'Could not reach after trying'],
  ['handled_elsewhere', 'Already handled elsewhere'],
  ['other', 'Other'],
];
const NOTE_REQUIRED = ['unreachable', 'handled_elsewhere', 'other'];

const EVENT_TEXT = {
  created                 : 'Missed call — added to the queue',
  missed_again            : 'Missed again — added to this callback',
  added_manually          : 'Added from "Not routed by CRM"',
  missed_before_resolution: 'Missed call from before it was resolved',
  assigned                : (d) => `Assigned to ${d?.to}${d?.from ? ` (was ${d.from})` : ''}`,
  unassigned              : (d) => `Unassigned${d?.from ? ` (was ${d.from})` : ''}`,
  scheduled               : (d) => `Callback scheduled for ${fmtDateTime(d?.at)}`,
  schedule_cleared        : 'Scheduled time cleared',
  resolved                : (d) => `Resolved — ${OUTCOMES.find(([k]) => k === d?.outcome)?.[1] || d?.outcome}${d?.note ? `: “${d.note}”` : ''}`,
};

const statusLabel = (s) => STATUS[s]?.label || s;
// A value for <input type="datetime-local"> in this browser's time.
const localInput = (d) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};
const minutesUntil = (d) => Math.round((new Date(d).getTime() - Date.now()) / 60000);

function DueBadge({ due, nextCallbackAt }) {
  if (!due) return null;
  if (due.overdue) return <Badge color="red">Overdue</Badge>;
  const m = minutesUntil(due.dueAt);
  if (nextCallbackAt && Math.abs(new Date(due.dueAt) - new Date(nextCallbackAt)) < 1000) {
    return <Badge color="blue">Scheduled</Badge>;
  }
  return <Badge color="amber">{m <= 1 ? 'Due now' : `Due in ${m} min`}</Badge>;
}

// Everything that happened, oldest first: missed calls, callback attempts,
// connected calls and people's changes.
function History({ task }) {
  const [open, setOpen] = useState(false);
  const id = `cb-history-${task._id}`;
  const rows = useMemo(() => {
    const out = [];
    for (const c of task.calls || []) {
      out.push({ at: c.at, icon: 'in', text: c.answeredLater
        ? `Call first reported ${statusLabel(c.status)} — answered after all (not a missed call)`
        : `Missed call (${statusLabel(c.status)})${c.statusNow && c.statusNow !== c.status ? ` — now reported ${statusLabel(c.statusNow)}` : ''}` });
    }
    for (const a of task.attempts || []) {
      out.push({ at: a.startedAt, icon: 'out', text: `Call back by ${a.agentName || 'staff'} — ${statusLabel(a.status)}${a.talkSec ? ` · talk ${fmtSec(a.talkSec)}` : ''}` });
    }
    for (const c of task.connectedAfter || []) {
      if (c.wasAttempt) continue;
      out.push({ at: c.startedAt, icon: c.direction === 'inbound' ? 'in' : 'out', text: `${c.direction === 'inbound' ? 'Customer called again — answered' : 'Connected call'}${c.agentName ? ` by ${c.agentName}` : ''}${c.talkSec ? ` · talk ${fmtSec(c.talkSec)}` : ''}` });
    }
    for (const e of task.events || []) {
      if (!e.by) continue; // system entries are the missed calls above
      const t = EVENT_TEXT[e.type];
      out.push({ at: e.at, icon: 'person', text: `${typeof t === 'function' ? t(e.detail) : t || e.type} — ${e.byName}` });
    }
    return out.sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [task]);

  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        className="inline-flex items-center gap-1 text-[11px] font-semibold rounded px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{ color: 'var(--text3)' }}>
        <ChevronDown size={12} aria-hidden="true" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }} />
        History ({rows.length})
      </button>
      {open && (
        <ol id={id} className="mt-1.5 rounded-lg p-2.5 space-y-1 text-[11px]" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
          {rows.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-shrink-0 font-mono" style={{ color: 'var(--text3)' }}>{fmtDateTime(r.at)}</span>
              <span className="min-w-0 break-words">
                {r.icon === 'in' && <PhoneIncoming size={11} className="inline mr-1" aria-label="Incoming" style={{ color: 'var(--blue)' }} />}
                {r.icon === 'out' && <PhoneOutgoing size={11} className="inline mr-1" aria-label="Outgoing" style={{ color: 'var(--accent)' }} />}
                {r.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TaskCard({ task, assignees, me, onChanged }) {
  const [mode, setMode] = useState(null); // null | 'schedule' | 'resolve'
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState('');
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const open = task.state === 'open';
  const name = task.trip?.patientName || task.lead?.patientName || null;
  const phone = custPhone(task.customerPhone, task.customerMasked, 'Unknown number');
  const lastAttempt = (task.attempts || []).at(-1);
  const gotThrough = task.connectedAfter || []; // connected calls with this number since the first miss

  // Applies one change; on 409 the API client shows why and the card
  // takes the current task the server sent back.
  const act = async (fn) => {
    setBusy(true);
    try {
      const { data } = await fn();
      onChanged(data.task);
      setMode(null);
      return true;
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.task) { onChanged(e.response.data.task); setMode(null); }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const formId = `cb-form-${task._id}`;
  return (
    <div className="card-sm" data-task-id={task._id} style={task.due?.overdue ? { borderColor: 'rgba(255,77,109,.45)' } : undefined}>
      <div className="flex items-start justify-between gap-x-3 gap-y-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-sm font-semibold">
            <PhoneIncoming size={14} className="flex-shrink-0" style={{ color: 'var(--blue)' }} aria-hidden="true" />
            {name
              ? <><span className="truncate">{name}</span><span className="font-mono text-xs font-normal" style={{ color: 'var(--text3)' }}>{phone}</span></>
              : <span className="font-mono">{phone}</span>}
            {open ? <DueBadge due={task.due} nextCallbackAt={task.nextCallbackAt} />
              : task.state === 'withdrawn' ? <Badge color="gray">Answered after all</Badge> : <Badge color="green">Resolved</Badge>}
            {task.missedCount > 1 && <Badge color="red">{task.missedCount} missed calls</Badge>}
            {task.source === 'not_routed' && <Badge color="gray">From not routed</Badge>}
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
            {[
              `Last missed ${fmtDateTime(task.lastMissedAt)}${timeAgo(task.lastMissedAt) ? ` (${timeAgo(task.lastMissedAt)})` : ''}`,
              task.trip?.tripNumber && `Trip ${task.trip.tripNumber}`,
              task.lead && !task.trip && 'Lead',
            ].filter(Boolean).join(' · ')}
          </div>
          {open && (
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text2)' }}>
              {[
                task.assignedToName ? `Assigned: ${task.assignedToName}` : 'Unassigned',
                task.nextCallbackAt ? `Next callback ${fmtDateTime(task.nextCallbackAt)}` : null,
                task.due && `Due ${fmtDateTime(task.due.dueAt)}`,
                (task.attempts || []).length ? `${task.attempts.length} attempt${task.attempts.length > 1 ? 's' : ''} — last: ${statusLabel(lastAttempt.status)}` : 'No callback yet',
              ].filter(Boolean).join(' · ')}
            </div>
          )}
          {open && gotThrough.length > 0 && (
            <div className="text-[11px] mt-1 flex items-start gap-1" style={{ color: 'var(--accent)' }}>
              <CheckCircle2 size={12} className="flex-shrink-0 mt-px" aria-hidden="true" />
              <span>
                Connected with this customer {fmtDateTime(gotThrough.at(-1).startedAt)}
                {gotThrough.at(-1).agentName ? ` (${gotThrough.at(-1).agentName})` : ''} — if that settled it, resolve this callback.
              </span>
            </div>
          )}
          {task.state === 'resolved' && task.resolution?.outcome && (
            <div className="text-[11px] mt-1" style={{ color: 'var(--text2)' }}>
              {task.resolution.outcomeLabel}{task.resolution.note ? ` — “${task.resolution.note}”` : ''} · by {task.resolution.byName} · {fmtDateTime(task.resolution.at)}
            </div>
          )}
          {task.state === 'withdrawn' && (
            <div className="text-[11px] mt-1" style={{ color: 'var(--text2)' }}>
              Withdrawn {fmtDateTime(task.withdrawn?.at)} — Plivo later reported the call answered, so there was nothing to call back.
            </div>
          )}
        </div>
        {/* The masked call: your phone rings first. It does not close the task. */}
        <CallButton target={{ callbackTaskId: task._id }} label="Call back" />
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <label className="sr-only" htmlFor={`cb-assign-${task._id}`}>Assigned to</label>
          <select id={`cb-assign-${task._id}`} className="inp !w-auto !py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" disabled={busy}
            value={task.assignedTo || ''}
            onChange={(e) => act(() => callbacksApi.assign(task._id, e.target.value || null, task.rev))}>
            <option value="">Unassigned</option>
            {assignees.map((u) => <option key={u._id} value={u._id}>{String(u._id) === String(me) ? `${u.name} (me)` : u.name}</option>)}
          </select>
          <Btn size="sm" variant="ghost" disabled={busy} aria-expanded={mode === 'schedule'} aria-controls={formId}
            onClick={() => { setWhen(task.nextCallbackAt ? localInput(task.nextCallbackAt) : localInput(Date.now() + 30 * 60000)); setMode(mode === 'schedule' ? null : 'schedule'); }}>
            {task.nextCallbackAt ? 'Reschedule' : 'Schedule'}
          </Btn>
          <Btn size="sm" variant="ghost" disabled={busy} aria-expanded={mode === 'resolve'} aria-controls={formId}
            onClick={() => { setOutcome(''); setNote(''); setMode(mode === 'resolve' ? null : 'resolve'); }}>
            Resolve…
          </Btn>
        </div>
      )}

      {open && mode === 'schedule' && (
        <form id={formId} className="mt-2 rounded-lg p-2.5 flex flex-wrap items-end gap-2" style={{ background: 'var(--surface2)' }}
          onSubmit={(e) => { e.preventDefault(); if (when) act(() => callbacksApi.schedule(task._id, new Date(when).toISOString(), task.rev)); }}>
          <div>
            <label htmlFor={`cb-when-${task._id}`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Call back at</label>
            <input id={`cb-when-${task._id}`} type="datetime-local" className="inp !py-1.5 text-xs" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <Btn size="sm" type="submit" disabled={busy || !when}>Save</Btn>
          {task.nextCallbackAt && <Btn size="sm" variant="ghost" type="button" disabled={busy} onClick={() => act(() => callbacksApi.schedule(task._id, null, task.rev))}>Clear time</Btn>}
          <Btn size="sm" variant="ghost" type="button" onClick={() => setMode(null)}>Cancel</Btn>
        </form>
      )}

      {open && mode === 'resolve' && (
        <form id={formId} className="mt-2 rounded-lg p-2.5 space-y-2" style={{ background: 'var(--surface2)' }}
          onSubmit={(e) => { e.preventDefault(); act(() => callbacksApi.resolve(task._id, outcome, note.trim(), task.rev)); }}>
          <div className="text-[11px]" style={{ color: 'var(--text2)' }}>Close this callback only when it is dealt with. Unsuccessful attempts keep it open.</div>
          <div className="flex flex-wrap gap-2">
            <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
              <label htmlFor={`cb-outcome-${task._id}`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>What happened</label>
              <select id={`cb-outcome-${task._id}`} className="inp !py-1.5 text-xs" value={outcome} onChange={(e) => setOutcome(e.target.value)} required>
                <option value="" disabled>Pick one…</option>
                {OUTCOMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="min-w-0 flex-[2]" style={{ minWidth: 180 }}>
              <label htmlFor={`cb-note-${task._id}`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>
                Note {NOTE_REQUIRED.includes(outcome) ? '(required)' : '(optional)'}
              </label>
              <input id={`cb-note-${task._id}`} className="inp !py-1.5 text-xs" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                required={NOTE_REQUIRED.includes(outcome)} placeholder="e.g. Booked BLS for 6 pm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Btn size="sm" type="submit" disabled={busy || !outcome || (NOTE_REQUIRED.includes(outcome) && !note.trim())}>Resolve callback</Btn>
            <Btn size="sm" variant="ghost" type="button" onClick={() => setMode(null)}>Cancel</Btn>
          </div>
        </form>
      )}

      <History task={task} />
    </div>
  );
}

function NotRouted({ calls, onDone }) {
  const [dismissing, setDismissing] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); setDismissing(null); setNote(''); } catch { /* toast from client */ } finally { setBusy(false); onDone(); }
  };
  return (
    <>
      <div className="card-sm mb-3 text-xs" style={{ color: 'var(--text2)' }}>
        Plivo reported these incoming calls only when they ended — the CRM never decided who to ring, so no staff member missed them.
        This usually points to a Plivo setup problem (see Call Logs). Add a caller to the callback queue if they need a call back, or dismiss with a reason.
        Only calls from the last 7 days logged since this list existed are shown.
      </div>
      {!calls.length ? <Empty icon="✅" message="No not-routed calls waiting for a decision." /> : (
        <div className="flex flex-col gap-2">
          {calls.map((c) => {
            const name = c.trip?.patientName || c.lead?.patientName;
            return (
              <div key={c._id} className="card-sm" data-call-id={c._id}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-sm font-semibold">
                      <PhoneIncoming size={14} style={{ color: 'var(--blue)' }} aria-hidden="true" />
                      {name && <span>{name}</span>}
                      <span className={name ? 'font-mono text-xs font-normal' : 'font-mono'} style={name ? { color: 'var(--text3)' } : undefined}>{custPhone(c.customerPhone, c.customerMasked, 'Unknown number')}</span>
                      <Badge color="amber">Not routed by CRM</Badge>
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>Incoming · {fmtDateTime(c.startedAt)}</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Btn size="sm" variant="blue" disabled={busy} onClick={() => run(() => callbacksApi.queueNotRouted(c._id))}>Add to callback queue</Btn>
                    <Btn size="sm" variant="ghost" disabled={busy} aria-expanded={dismissing === c._id} onClick={() => { setDismissing(dismissing === c._id ? null : c._id); setNote(''); }}>Dismiss…</Btn>
                  </div>
                </div>
                {dismissing === c._id && (
                  <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => callbacksApi.dismissNotRouted(c._id, note.trim())); }}>
                    <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                      <label htmlFor={`nr-note-${c._id}`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Why no callback is needed (required)</label>
                      <input id={`nr-note-${c._id}`} className="inp !py-1.5 text-xs" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} required />
                    </div>
                    <Btn size="sm" variant="danger" type="submit" disabled={busy || !note.trim()}>Dismiss</Btn>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function CallbacksPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('open');
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState(null);
  const [dueMinutes, setDueMinutes] = useState(null);
  const [notRouted, setNotRouted] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef();

  const load = async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [list, nr] = await Promise.all([
        tab === 'not_routed' ? null : callbacksApi.list(tab === 'resolved' ? 'resolved' : 'open'),
        callbacksApi.notRouted(),
      ]);
      if (list) { setTasks(list.data.tasks || []); setCounts(list.data.counts); setDueMinutes(list.data.config?.dueMinutes ?? null); }
      setNotRouted(nr.data.calls || []);
      setError(null);
      window.dispatchEvent(new Event('callbacks:changed'));
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Could not load the callback queue.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { callbacksApi.assignees().then(({ data }) => setAssignees(data.users || [])).catch(() => {}); }, []);
  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [tab]);

  const replace = (t) => {
    setTasks((prev) => {
      const rest = prev.filter((x) => x._id !== t._id);
      // A task that left this tab (resolved while on Pending) drops out.
      return (tab === 'resolved') === (t.state !== 'open') ? prev.map((x) => (x._id === t._id ? t : x)) : rest;
    });
    load({ silent: true });
  };

  // Overdue first, then whatever is due soonest.
  const shown = tab === 'open'
    ? [...tasks].sort((a, b) => (b.due?.overdue - a.due?.overdue) || (new Date(a.due?.dueAt) - new Date(b.due?.dueAt)))
    : tasks;

  return (
    <div className="page-enter">
      <PageHeader
        title="Missed-call callbacks"
        subtitle={`Customers whose call nobody answered · overdue when not called back within ${dueMinutes ?? 15} min of the missed call, or after its scheduled time`}
        action={
          <button onClick={() => load()} aria-label="Refresh" className="p-2 rounded-lg" style={{ color: 'var(--text3)', background: 'var(--surface2)' }}>
            <RefreshCw size={14} />
          </button>
        }
      />

      {counts && (
        <div className="card-sm mb-4 text-xs flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: 'var(--text2)' }}>
          <span><strong style={{ color: 'var(--text)' }}>{counts.open}</strong> pending</span>
          <span style={counts.overdue ? { color: 'var(--red)' } : undefined}><strong>{counts.overdue}</strong> overdue</span>
          <span style={{ color: 'var(--text3)' }}>Calling back does not close a callback — resolve it with what happened.</span>
        </div>
      )}

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'open', label: `Pending${counts ? ` (${counts.open})` : ''}` },
        { key: 'resolved', label: 'Resolved' },
        { key: 'not_routed', label: `Not routed by CRM${notRouted.length ? ` (${notRouted.length})` : ''}` },
      ]} />

      {error && <div className="card-sm mb-4 text-xs" style={{ color: 'var(--red)' }}>{error}</div>}
      {loading ? <Spinner /> : tab === 'not_routed'
        ? <NotRouted calls={notRouted} onDone={() => load({ silent: true })} />
        : !shown.length
          ? <Empty icon={tab === 'open' ? '✅' : '📭'} message={tab === 'open' ? 'No customers waiting for a callback.' : 'No resolved callbacks yet.'} />
          : (
            <div className="flex flex-col gap-2">
              {shown.map((t) => <TaskCard key={t._id} task={t} assignees={assignees} me={user?.id || user?._id} onChanged={replace} />)}
            </div>
          )}
    </div>
  );
}
