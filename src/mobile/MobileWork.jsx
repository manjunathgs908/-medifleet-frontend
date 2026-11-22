// src/mobile/MobileWork.jsx — "/m/work".
//
// Built from existing endpoints:
//   GET /api/leads?view=overdue / ?view=due_today   (active leads; IST day)
//   GET /api/callbacks?state=open                   (open missed-call callbacks)
// Sections (logic.mjs buildMyWork):
//   Overdue / Later today   your assigned items (the owner: everyone's)
//   Unassigned              nobody's yet — every operator sees these, with
//                           "Assign to me" (the existing rev-guarded assign),
//                           so unowned work is never invisible
// A telecaller never sees items assigned to someone else. The next action
// is the existing masked call. When an endpoint's cap is reached the
// screen says so instead of implying the list is complete.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardCheck, RefreshCw, Clock, User, UserPlus } from 'lucide-react';
import { leadsApi, callbacksApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { buildMyWork, dueLabel, workLimitsHit, LEAD_VIEW_LIMIT, CALLBACK_OPEN_LIMIT } from './logic.mjs';
import { Skeleton, ErrorState, EmptyState, MCallButton } from './ui';
import './mobile.css';

const POLL_MS = 60 * 1000;

function WorkCard({ item, onOpen, onAssign, assigning }) {
  return (
    <article className="m-card p-4" style={item.overdue ? { borderColor: '#f3b4b4', background: '#fff8f8', boxShadow: 'inset 4px 0 0 var(--m-red)' } : undefined}
      aria-label={`${item.overdue ? 'Overdue: ' : ''}${item.name}`}>
      <button type="button" onClick={onOpen} className="w-full text-left m-tap -my-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold truncate">{item.name}</div>
            <div className="font-mono text-[14px] mt-0.5" style={{ color: 'var(--m-text2)' }}>{item.phone}</div>
          </div>
          <span className={`m-pill ${item.overdue ? 'm-pill-red' : 'm-pill-amber'} flex-shrink-0`}>
            {item.overdue ? 'Overdue' : 'Today'}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[13px]" style={{ color: 'var(--m-text2)' }}>
          <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden="true" />Due {dueLabel(item.dueAt)}</span>
          <span className="inline-flex items-center gap-1 min-w-0"><User size={14} aria-hidden="true" /><span className="truncate">{item.assignee}</span></span>
          <span>{item.kind === 'callback' ? 'Missed-call callback' : 'Lead follow-up'}</span>
        </div>
      </button>
      <div className={`grid ${item.bucket === 'unassigned' ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mt-3`}>
        <MCallButton target={item.action.target} label={item.action.label} />
        {item.bucket === 'unassigned' && (
          <button type="button" className="m-btn m-tap" onClick={onAssign} disabled={assigning}>
            <UserPlus size={18} aria-hidden="true" />{assigning ? 'Assigning…' : 'Assign to me'}
          </button>
        )}
      </div>
    </article>
  );
}

function Section({ id, title, tone, items, render }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[15px] font-bold mb-2" style={tone ? { color: tone } : undefined}>{title} ({items.length})</h2>
      <div className="space-y-3">{items.map(render)}</div>
    </section>
  );
}

export default function MobileWork() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const me = user?.id || user?._id;
  const isOwner = user?.role === 'owner';
  const [items, setItems] = useState(null);
  const [limits, setLimits] = useState({ leads: false, callbacks: false });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [callbacksFailed, setCallbacksFailed] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async ({ silent } = {}) => {
    const n = ++seq.current;
    if (!silent) setLoading(true);
    try {
      // Team-wide lists (telecallers already see every lead on the Leads
      // page); buildMyWork keeps only what this user should see.
      const [over, today, cbs] = await Promise.all([
        leadsApi.getAll({ view: 'overdue' }),
        leadsApi.getAll({ view: 'due_today' }),
        callbacksApi.list('open').catch(() => ({ data: { tasks: [] }, failed: true })),
      ]);
      if (n !== seq.current) return;
      const input = { overdueLeads: over.data.leads || [], todayLeads: today.data.leads || [], callbacks: cbs.data.tasks || [] };
      setCallbacksFailed(!!cbs.failed);
      setLimits(workLimitsHit(input));
      setItems(buildMyWork({ ...input, role: user?.role, userId: me }));
      setError(null);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e?.response?.data?.message || e?.message || 'Could not load your work.');
    } finally {
      if (n === seq.current && !silent) setLoading(false);
    }
  }, [me, user?.role]);

  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // The existing assign endpoints, at the rev this screen saw: if someone
  // took it first the API answers 409 (its message is shown) and the list
  // reloads with who has it now.
  const assignToMe = async (item) => {
    setAssigning(`${item.kind}:${item.id}`);
    try {
      if (item.kind === 'lead') await leadsApi.assign(item.id, me, item.rev);
      else await callbacksApi.assign(item.id, me, item.rev);
      toast.success('Assigned to you');
      window.dispatchEvent(new Event(item.kind === 'lead' ? 'leads:changed' : 'callbacks:changed'));
    } catch { /* the API client shows the backend's message */ }
    finally {
      setAssigning(null);
      load({ silent: true });
    }
  };

  const assigned = (items || []).filter((i) => i.bucket !== 'unassigned');
  const overdue = assigned.filter((i) => i.overdue);
  const today = assigned.filter((i) => !i.overdue);
  const unassigned = (items || []).filter((i) => i.bucket === 'unassigned');
  const card = (i) => (
    <WorkCard key={`${i.kind}:${i.id}`} item={i} onOpen={() => navigate(i.to)}
      onAssign={() => assignToMe(i)} assigning={assigning === `${i.kind}:${i.id}`} />
  );

  return (
    <div className="m-ui m-screen">
      <div className="flex items-center mb-1">
        <h1 className="m-title">My Work</h1>
        <button type="button" onClick={() => load()} className="m-tap ml-auto w-12 flex items-center justify-center -mr-2" aria-label="Refresh">
          <RefreshCw size={20} style={{ color: 'var(--m-text2)' }} />
        </button>
      </div>
      <div className="m-sub mb-4">
        {isOwner ? 'Everyone’s follow-ups and callbacks due today (India time)' : 'Your follow-ups and callbacks due today, plus unassigned work (India time)'}
      </div>
      {callbacksFailed && items && (
        <div className="m-card p-3 mb-3 text-[14px]" role="status" style={{ background: 'var(--m-amber-bg)', borderColor: '#f5d9a8' }}>
          Callbacks couldn’t load — showing lead follow-ups only. <button type="button" className="underline font-semibold" onClick={() => load()}>Retry</button>
        </div>
      )}
      {(limits.leads || limits.callbacks) && items && (
        <div className="m-card p-3 mb-3 text-[14px]" role="status" style={{ background: 'var(--m-amber-bg)', borderColor: '#f5d9a8' }}>
          This list may be incomplete: {[
            limits.leads && `lead follow-ups stop at ${LEAD_VIEW_LIMIT} per list`,
            limits.callbacks && `callbacks stop at the newest ${CALLBACK_OPEN_LIMIT} open`,
          ].filter(Boolean).join('; ')}. Open the full Leads or Callbacks page for everything.
        </div>
      )}

      {loading && !items ? <Skeleton rows={4} height={132} />
        : error && !items ? <ErrorState message={error} onRetry={() => load()} />
          : !items?.length ? (
            <EmptyState icon={<ClipboardCheck size={20} />} title="Nothing due right now"
              hint={isOwner ? 'No overdue or due-today follow-ups or callbacks.' : 'Nothing overdue or due today is assigned to you or waiting unassigned.'} />
          ) : (
            <div className="space-y-6">
              {error && <div className="m-sub" role="status">Showing the last loaded list — refresh failed.</div>}
              <Section id="m-work-overdue" title="Overdue" tone="var(--m-red)" items={overdue} render={card} />
              <Section id="m-work-today" title="Later today" items={today} render={card} />
              {!assigned.length && (
                <div className="m-sub">{isOwner ? 'No assigned work is due.' : 'Nothing is assigned to you right now.'}</div>
              )}
              <Section id="m-work-unassigned" title="Unassigned — needs someone" items={unassigned} render={card} />
            </div>
          )}
    </div>
  );
}
