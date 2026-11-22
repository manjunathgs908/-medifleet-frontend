// src/mobile/MobileChrome.jsx
//
// The phone layout's header, bottom tab bar and sheets. Rendered by
// components/Shell.jsx ONLY at <= 430px, in place of its desktop header and
// tablet tab bar; everything Shell runs (SOS polling and siren, the booking
// ring, in-app phone, call duty, push) keeps running underneath. State that
// Shell owns — SOS count, call duty, sign-out — comes in as props.
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Home, Target, PhoneCall, ClipboardList, Menu, X, AlertTriangle, ChevronRight,
  Headphones, LogOut, LayoutGrid,
} from 'lucide-react';
import logo from '../assets/invoice/savelife-logo.png';
import { moreItems, notifications } from './logic.mjs';
import { useMobileSummary, readyData } from './hooks';
import './mobile.css';

// A bottom sheet that the phone's Back button closes (as in native apps),
// instead of leaving the page underneath. Opening it adds one history entry
// at the same URL; Back (or X / backdrop / Esc, which go back) removes it.
// A link inside the sheet navigates with { replace: true } over that entry,
// so Back afterwards returns to the page — not to a reopened sheet.
const sheetOnTop = () => !!window.history.state?.mSheet;
function Sheet({ title, onClose, children, labelId }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    window.history.pushState({ ...(window.history.state || {}), mSheet: true }, '');
    const onPop = () => onCloseRef.current();
    const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); };
  }, []);
  const requestClose = () => { if (sheetOnTop()) window.history.back(); else onCloseRef.current(); };
  return (
    <>
      <div className="m-sheet-backdrop" onClick={requestClose} aria-hidden="true" />
      <div className="m-sheet m-ui" role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <div className="m-sheet-grip" aria-hidden="true" />
        <div className="flex items-center mb-3">
          <h2 id={labelId} className="text-lg font-bold">{title}</h2>
          <button type="button" className="m-tap ml-auto -mr-2 w-12 flex items-center justify-center" onClick={requestClose} aria-label="Close" autoFocus>
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

const SheetLink = ({ to, label, onGo, urgent, badge }) => (
  <button type="button" onClick={() => onGo(to)}
    className="m-tap w-full flex items-center gap-3 px-3 rounded-xl text-left text-[16px] font-semibold"
    style={urgent ? { background: 'var(--m-red-bg)', color: 'var(--m-red)' } : { background: '#f6f8fb' }}>
    {urgent && <AlertTriangle size={20} aria-hidden="true" />}
    <span className="flex-1">{label}</span>
    {badge > 0 && <span className="m-pill m-pill-red">{badge}</span>}
    <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--m-text3)' }} />
  </button>
);

export function MobileHeader({ user, sosCount = 0, isCallStaff, onDuty, onToggleDuty, onLogout, onOpenFullMenu }) {
  const navigate = useNavigate();
  const summary = useMobileSummary();
  const [sheet, setSheet] = useState(null); // null | 'bell' | 'profile'
  const bell = notifications({ leads: readyData(summary.leads), callbacks: readyData(summary.callbacks) });
  // From inside a sheet: replace the sheet's history entry (see Sheet).
  const go = (to) => { const replace = sheetOnTop(); setSheet(null); navigate(to, { replace }); };
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="m-ui">
      <header className="m-header">
        <button type="button" onClick={() => navigate('/m')} className="m-tap flex items-center gap-1.5 min-w-0 pr-1" aria-label="SaveLife home">
          <img src={logo} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
          <span className="font-bold text-[17px] whitespace-nowrap" style={{ color: 'var(--m-brand)' }}>SaveLife</span>
        </button>
        <div className="ml-auto flex items-center">
          {/* SOS: one tap from every screen. */}
          <button type="button" onClick={() => navigate('/sos')}
            className="m-tap relative px-2.5 rounded-full text-[13px] font-bold flex items-center gap-1 mr-1 whitespace-nowrap flex-shrink-0"
            style={{ background: sosCount > 0 ? 'var(--m-red)' : 'var(--m-red-bg)', color: sosCount > 0 ? '#fff' : 'var(--m-red)', minHeight: 40 }}
            aria-label={sosCount > 0 ? `SOS alerts: ${sosCount} active` : 'SOS alerts'}>
            <AlertTriangle size={16} aria-hidden="true" /> SOS{sosCount > 0 ? ` ${sosCount}` : ''}
          </button>
          <button type="button" onClick={() => setSheet('bell')} className="m-tap relative w-11 flex-shrink-0 flex items-center justify-center"
            aria-label={bell.count ? `Notifications: ${bell.count}` : 'Notifications'}>
            <Bell size={22} style={{ color: 'var(--m-text2)' }} />
            {bell.count > 0 && <span className="m-badge" style={{ top: 8, marginLeft: 2 }}>{bell.count}</span>}
          </button>
          <button type="button" onClick={() => setSheet('profile')} className="m-tap w-11 flex-shrink-0 flex items-center justify-center" aria-label="Profile and settings">
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold" style={{ background: 'var(--m-blue-bg)', color: 'var(--m-blue)' }}>{initials}</span>
          </button>
        </div>
      </header>

      {sheet === 'bell' && (
        <Sheet title="Notifications" labelId="m-bell-title" onClose={() => setSheet(null)}>
          {summary.leads.status === 'loading' && summary.callbacks.status === 'loading' && !bell.count ? (
            <div className="m-sub py-4">Loading…</div>
          ) : bell.count ? (
            <div className="space-y-2">
              {bell.items.map((n) => <SheetLink key={n.key} to={n.to} label={n.text} onGo={go} urgent={n.tone === 'red'} />)}
            </div>
          ) : (
            <div className="m-sub py-4">You’re all caught up — nothing overdue and no new leads.</div>
          )}
          {(summary.leads.status === 'error' || summary.callbacks.status === 'error') && (
            <div className="m-sub mt-3" role="status">Some counts couldn’t be loaded right now.</div>
          )}
        </Sheet>
      )}

      {sheet === 'profile' && (
        <Sheet title={user?.name || 'Profile'} labelId="m-profile-title" onClose={() => setSheet(null)}>
          <div className="m-sub -mt-2 mb-4 capitalize">{user?.role}</div>
          <div className="space-y-2">
            {isCallStaff && onDuty !== null && (
              <button type="button" onClick={onToggleDuty} role="switch" aria-checked={!!onDuty}
                className="m-tap w-full flex items-center gap-3 px-3 rounded-xl text-left text-[16px] font-semibold" style={{ background: '#f6f8fb' }}>
                <Headphones size={20} aria-hidden="true" />
                <span className="flex-1">Call duty</span>
                <span className={`m-pill ${onDuty ? 'm-pill-green' : 'm-pill-gray'}`}>{onDuty ? 'On' : 'Off'}</span>
              </button>
            )}
            <button type="button" onClick={() => { if (sheetOnTop()) window.history.back(); setSheet(null); onOpenFullMenu(); }}
              className="m-tap w-full flex items-center gap-3 px-3 rounded-xl text-left text-[16px] font-semibold" style={{ background: '#f6f8fb' }}>
              <LayoutGrid size={20} aria-hidden="true" /><span className="flex-1">All pages</span><ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={onLogout}
              className="m-tap w-full flex items-center gap-3 px-3 rounded-xl text-left text-[16px] font-semibold" style={{ background: 'var(--m-red-bg)', color: 'var(--m-red)' }}>
              <LogOut size={20} aria-hidden="true" /> Sign out
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

const TABS = [
  { label: 'Home',    to: '/m',         icon: Home, end: true },
  { label: 'Leads',   to: '/m/leads',   icon: Target },
  { label: 'Calls',   to: '/call-logs', icon: PhoneCall },
  { label: 'My Work', to: '/m/work',    icon: ClipboardList, badge: 'work' },
];

// A text field has focus = the on-screen keyboard is up: mark <html> so the
// tab bar steps aside (mobile.css html.m-kbd). Buttons and checkboxes don't count.
const TYPING = 'textarea, select, input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio])';
function useKeyboardFlag() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.classList.toggle('m-kbd', !!document.activeElement?.matches?.(TYPING));
    const onOut = () => setTimeout(sync, 0); // after focus has moved
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', onOut);
    sync();
    return () => {
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', onOut);
      root.classList.remove('m-kbd');
    };
  }, []);
}

export function MobileTabBar({ role, sosCount = 0, onOpenFullMenu }) {
  useKeyboardFlag();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const summary = useMobileSummary();
  const [more, setMore] = useState(false);
  useEffect(() => { setMore(false); }, [pathname]);
  const items = moreItems(role);
  // Owner only: team-wide overdue follow-ups + callbacks, which is what the
  // owner's My Work lists. No per-person count exists, so a telecaller gets
  // no badge rather than a team number that would not match their list.
  // Shown only when both counts loaded — a half-known number is not shown.
  const lc = readyData(summary.leads);
  const cc = readyData(summary.callbacks);
  const workBadge = role === 'owner' && lc && cc ? (lc.overdue || 0) + (cc.overdue || 0) : 0;
  const moreActive = items.some((m) => pathname === m.to || pathname.startsWith(`${m.to}/`));

  return (
    <div className="m-ui">
      <nav className="m-tabbar" aria-label="Main">
        {TABS.map(({ label, to, icon: Icon, end, badge }) => (
          <NavLink key={to} to={to} end={end} className="m-tab m-tap">
            <Icon size={22} aria-hidden="true" />
            {label}
            {badge === 'work' && workBadge > 0 && <span className="m-badge" aria-label={`${workBadge} overdue`}>{workBadge}</span>}
          </NavLink>
        ))}
        <button type="button" className="m-tab m-tap" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more}
          aria-current={moreActive ? 'page' : undefined}>
          <Menu size={22} aria-hidden="true" />
          More
          {sosCount > 0 && <span className="m-badge" aria-label={`${sosCount} SOS`}>{sosCount}</span>}
        </button>
      </nav>

      {more && (
        <Sheet title="More" labelId="m-more-title" onClose={() => setMore(false)}>
          {/* Every page this role has in the sidebar (lib/navAccess.mjs), grouped the same way. */}
          <div className="space-y-2">
            {items.map((m, i) => (
              <React.Fragment key={m.key}>
                {!m.urgent && (m.group !== items[i - 1]?.group || items[i - 1]?.urgent) && (
                  <h3 className="text-[12px] font-bold uppercase tracking-wider pt-3 pb-1 px-1" style={{ color: 'var(--m-text3)' }}>{m.groupLabel}</h3>
                )}
                <SheetLink to={m.to} label={m.label} urgent={m.urgent} badge={m.key === 'sos' ? sosCount : 0}
                  onGo={(to) => { const replace = sheetOnTop(); setMore(false); navigate(to, { replace }); }} />
              </React.Fragment>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
