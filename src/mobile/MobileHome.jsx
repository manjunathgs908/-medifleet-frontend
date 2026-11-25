// src/mobile/MobileHome.jsx — "/m": four count cards + quick actions.
//
// Every count comes from an existing endpoint (see hooks.js). A card whose
// request failed keeps its label and says "Couldn't load" with Retry — never
// a fake 0 or a stale number. A card is hidden only when the backend
// answered but does not support that count.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, MessageCircle, Truck, ChevronRight, RefreshCw, UserPlus, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { callsApi } from '../api/client';
import { dashboardCards, quickActions, callsSummary, istDayStart, dueLabel } from './logic.mjs';
import { useMobileSummary, refreshMobileSummary } from './hooks';
import { loadMyWork } from './work';
import './mobile.css';

const TONE = {
  blue : { bg: 'var(--m-blue-bg)',  fg: 'var(--m-blue)' },
  amber: { bg: 'var(--m-amber-bg)', fg: 'var(--m-amber)' },
  red  : { bg: 'var(--m-red-bg)',   fg: 'var(--m-red)' },
  green: { bg: 'var(--m-green-bg)', fg: 'var(--m-green)' },
};
const QUICK_ICON = { call: Phone, whatsapp: MessageCircle, newLead: UserPlus, book: Truck };
const POLL_MS = 60 * 1000;

// One small loader with its own loading / error / retry state, so a failure
// in one Home section never blanks another, and never shows a fake zero.
function useLoader(fn, deps) {
  const [st, setSt] = useState({ status: 'loading' });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const n = ++seq.current;
    setSt((p) => (p.status === 'ready' ? p : { status: 'loading' }));
    try { const data = await fn(); if (n === seq.current) setSt({ status: 'ready', data }); }
    catch (e) { if (n === seq.current) setSt({ status: 'error', error: e?.response?.data?.message || 'Could not load' }); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); const t = setInterval(run, POLL_MS); return () => clearInterval(t); }, [run]);
  return [st, run];
}

const SectionError = ({ what, onRetry }) => (
  <div className="m-card p-3 flex items-center gap-3" role="alert">
    <span className="flex-1 text-[14px]" style={{ color: 'var(--m-red)' }}>Couldn’t load {what}.</span>
    <button type="button" className="m-btn m-tap !min-h-[40px] !text-[14px]" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Retry</button>
  </div>
);

// Today's calls: the server's own classification (GET /api/calls/performance)
// for the India day so far. Each figure says whose calls it counts.
function TodaysCalls({ role, userId }) {
  const [st, retry] = useLoader(async () => {
    const { data } = await callsApi.performanceQuiet({ from: istDayStart(), to: new Date().toISOString() });
    return callsSummary(data, role, userId);
  }, [role, userId]);
  const whose = st.data?.scope === 'you' ? 'You' : 'Team';
  const tiles = st.data ? [
    { k: 'incoming', label: 'Incoming', sub: 'Company line', n: st.data.incoming },
    { k: 'missed', label: 'Missed', sub: 'Company line', n: st.data.missed, tone: st.data.missed ? 'var(--m-red)' : undefined },
    { k: 'outgoing', label: 'Outgoing attempts', sub: whose, n: st.data.outgoing },
    { k: 'connected', label: 'Customer connected', sub: whose, n: st.data.connected, tone: 'var(--m-green)' },
  ] : [];
  return (
    <section aria-labelledby="m-home-calls" className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 id="m-home-calls" className="text-[15px] font-bold">Today’s calls</h2>
        <Link to="/call-logs" className="text-[13px] font-semibold m-tap inline-flex items-center" style={{ color: 'var(--m-blue)' }}>Call Logs</Link>
      </div>
      {st.status === 'error' ? <SectionError what="today’s calls" onRetry={retry} />
        : st.status === 'loading' ? <div className="m-skel" style={{ height: 72 }} aria-busy="true" />
          : (
            <div className="m-card grid grid-cols-4 divide-x" style={{ borderColor: 'var(--m-line)' }}>
              {tiles.map((t) => (
                <div key={t.k} className="px-1.5 py-2.5 text-center min-w-0" aria-label={`${t.label} (${t.sub}): ${t.n}`}>
                  <div className="text-[22px] font-bold leading-none" style={t.tone ? { color: t.tone } : undefined}>{t.n}</div>
                  <div className="text-[11.5px] font-semibold leading-tight mt-1">{t.label}</div>
                  <div className="text-[10.5px] leading-tight" style={{ color: 'var(--m-text3)' }}>{t.sub}</div>
                </div>
              ))}
            </div>
          )}
    </section>
  );
}

// The first few items from My Work (same loader and rules as the screen).
function WorkPreview({ role, userId }) {
  const [st, retry] = useLoader(() => loadMyWork({ role, userId, limit: 5 }), [role, userId]);
  const items = (st.data?.items || []).slice(0, 3);
  return (
    <section aria-labelledby="m-home-work" className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 id="m-home-work" className="text-[15px] font-bold">My Work</h2>
        <Link to="/m/work" className="text-[13px] font-semibold m-tap inline-flex items-center" style={{ color: 'var(--m-blue)' }}>View all</Link>
      </div>
      {st.status === 'error' ? <SectionError what="your work" onRetry={retry} />
        : st.status === 'loading' ? <div className="m-skel" style={{ height: 120 }} aria-busy="true" />
          : !items.length ? <div className="m-card p-4 m-sub">Nothing overdue or due today.</div>
            : (
              <ul className="m-card divide-y" style={{ borderColor: 'var(--m-line)' }}>
                {items.map((i) => (
                  <li key={`${i.kind}:${i.id}`}>
                    <Link to={i.to} className="m-tap flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold truncate">{i.name}</span>
                        <span className="block text-[13px]" style={{ color: 'var(--m-text2)' }}>
                          <Clock size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />{dueLabel(i.dueAt)} · {i.bucket === 'unassigned' ? 'Unassigned' : i.kind === 'callback' ? 'Callback' : 'Follow-up'}
                        </span>
                      </span>
                      <span className={`m-pill ${i.overdue ? 'm-pill-red' : 'm-pill-amber'}`}>{i.overdue ? 'Overdue' : 'Today'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
    </section>
  );
}

const greeting = () => {
  const h = Number(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// One card. Its label always shows; only the number area changes with the
// request's state (logic.mjs dashboardCards).
function CountCard({ c }) {
  const shell = 'm-card p-4 flex flex-col justify-between';
  const label = (
    <span className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--m-text2)' }}>{c.label}</span>
  );
  if (c.state === 'error') {
    return (
      <div className={shell} style={{ minHeight: 112, borderColor: '#f3c2c2' }} role="group" aria-label={`${c.label}: couldn’t load`}>
        <span className="text-[14px] font-semibold" style={{ color: 'var(--m-red)' }}>Couldn’t load</span>
        <span className="mt-2">{label}</span>
        <button type="button" onClick={() => refreshMobileSummary(c.source)} className="m-btn m-tap mt-2 !min-h-[40px] !text-[14px]">
          <RefreshCw size={15} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }
  if (c.state === 'loading') {
    return (
      <div className={shell} style={{ minHeight: 112 }} aria-busy="true" aria-label={`${c.label}: loading`}>
        <span className="m-skel block" style={{ width: 48, height: 34 }} />
        <span className="mt-3">{label}</span>
      </div>
    );
  }
  return (
    <Link to={c.to} className={`${shell} m-tap`} style={{ minHeight: 112 }} aria-label={`${c.label}: ${c.count}. Open list`}>
      <span className="text-[34px] font-bold leading-none" style={{ color: TONE[c.tone].fg }}>{c.count}</span>
      <span className="flex items-end justify-between gap-1 mt-3">
        {label}
        <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--m-text3)', flexShrink: 0 }} />
      </span>
    </Link>
  );
}

export default function MobileHome() {
  const { user } = useAuth();
  const s = useMobileSummary();
  const cards = dashboardCards(s);
  const quick = quickActions(user?.role);

  return (
    <div className="m-ui m-screen">
      <div className="mb-4">
        <div className="m-sub">{greeting()},</div>
        <h1 className="m-title truncate">{user?.name?.split(' ')[0] || 'there'}</h1>
      </div>

      <section aria-label="Today at a glance">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => <CountCard key={c.key} c={c} />)}
        </div>
      </section>

      {quick.length > 0 && (
        <section aria-label="Quick actions" className="mt-6">
          <h2 className="text-[15px] font-bold mb-2">Quick actions</h2>
          <div className="grid grid-cols-4 gap-2">
            {quick.map((q) => {
              const Icon = QUICK_ICON[q.key];
              return (
                <Link key={q.key} to={q.to} className="m-card m-tap py-2.5 px-1 flex flex-col items-center justify-center gap-1.5 text-center" style={{ minHeight: 84 }}>
                  <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={q.key === 'book' ? { background: 'var(--m-brand)', color: '#fff' } : { background: '#eef1f5', color: 'var(--m-text)' }}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="text-[12px] font-semibold leading-tight">{q.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <WorkPreview role={user?.role} userId={user?.id || user?._id} />
      <TodaysCalls role={user?.role} userId={user?.id || user?._id} />
    </div>
  );
}
