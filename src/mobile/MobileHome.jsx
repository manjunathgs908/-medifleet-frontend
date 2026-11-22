// src/mobile/MobileHome.jsx — "/m": four count cards + quick actions.
//
// Every count comes from an existing endpoint (see hooks.js). A card whose
// request failed keeps its label and says "Couldn't load" with Retry — never
// a fake 0 or a stale number. A card is hidden only when the backend
// answered but does not support that count.
import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, MessageCircle, Truck, ChevronRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dashboardCards, quickActions } from './logic.mjs';
import { useMobileSummary, refreshMobileSummary } from './hooks';
import './mobile.css';

const TONE = {
  blue : { bg: 'var(--m-blue-bg)',  fg: 'var(--m-blue)' },
  amber: { bg: 'var(--m-amber-bg)', fg: 'var(--m-amber)' },
  red  : { bg: 'var(--m-red-bg)',   fg: 'var(--m-red)' },
  green: { bg: 'var(--m-green-bg)', fg: 'var(--m-green)' },
};
const QUICK_ICON = { call: Phone, whatsapp: MessageCircle, book: Truck };

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
          <div className="grid grid-cols-3 gap-3">
            {quick.map((q) => {
              const Icon = QUICK_ICON[q.key];
              return (
                <Link key={q.key} to={q.to} className="m-card m-tap py-3 px-2 flex flex-col items-center justify-center gap-2 text-center" style={{ minHeight: 88 }}>
                  <span className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={q.key === 'book' ? { background: 'var(--m-brand)', color: '#fff' } : { background: '#eef1f5', color: 'var(--m-text)' }}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="text-[13px] font-semibold leading-tight">{q.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <Link to="/m/work" className="m-card m-tap mt-6 px-4 flex items-center justify-between">
        <span className="font-semibold">Open My Work</span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </div>
  );
}
