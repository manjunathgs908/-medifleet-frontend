// src/components/Shell.jsx
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { sosApi, tripCallEventsApi, callsApi } from '../api/client';
import { InstallAppButton } from '../lib/installApp';
import InAppPhone, { useInAppPhone } from './InAppPhone';
import { APP_BUILD } from '../lib/pwaUpdate';
import { fmtDateTime } from './ui';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Radio, Truck, FileText, Receipt,
  TrendingUp, Users, Target, ShieldCheck, Building2, UserCheck,
  LogOut, Menu, X, Bell, BellOff, ChevronRight, AlertTriangle, PhoneMissed, MapPin, MessageCircle, MessageSquare, Sparkles,
  PhoneCall, Headphones
} from 'lucide-react';

const SOS_POLL_MS = 30000;
const NO_RESPONSE_POLL_MS = 30000;

const NAV = [
  { label: 'Dashboard',   to: '/',           icon: LayoutDashboard, roles: ['owner'] },
  { label: 'Dispatch',    to: '/dispatch',   icon: Radio,           roles: ['owner', 'telecaller'] },
  { label: 'Fleet',       to: '/fleet',      icon: Truck,           roles: ['owner', 'telecaller'] },
  { label: 'Trips',       to: '/trips',      icon: FileText,        roles: ['owner', 'telecaller'] },
  { label: 'Billing',     to: '/billing',    icon: Receipt,     roles: ['owner'] },
  { label: 'SOS Alerts',  to: '/sos',        icon: AlertTriangle,   roles: ['owner', 'telecaller'], badgeKey: 'sos' },
  { label: 'Trip Alerts', to: '/trip-alerts', icon: PhoneMissed,    roles: ['owner', 'telecaller'], badgeKey: 'noResponse' },
  { label: 'Posting Alerts', to: '/posting-alerts', icon: MapPin,   roles: ['owner', 'telecaller'] },
  { label: 'WhatsApp Leads', to: '/whatsapp-leads', icon: MessageCircle, roles: ['owner', 'telecaller'] },
  { label: 'WhatsApp Chats', to: '/whatsapp-conversations', icon: MessageSquare, roles: ['owner', 'telecaller'] },
  { label: 'Call Logs',   to: '/call-logs',  icon: PhoneCall,       roles: ['owner', 'telecaller'] },
  { label: 'SEO Studio',  to: '/seo-studio', icon: Sparkles,        roles: ['owner'] },
  { label: 'Leads',       to: '/leads',      icon: Target,          roles: ['owner', 'telecaller'] },
  { label: 'Finance',     to: '/finance',    icon: TrendingUp,      roles: ['owner'] },{ label: 'Salaries',    to: '/salary',     icon: Users,           roles: ['owner'] },
  { label: 'Staff',       to: '/staff',      icon: Users,           roles: ['owner'] },
  { label: 'Advances',    to: '/advances',   icon: Users,           roles: ['owner'] },  { label: 'Compliance',  to: '/compliance', icon: ShieldCheck,     roles: ['owner'] },
  { label: 'Owners',      to: '/owners',     icon: UserCheck,       roles: ['owner'] },
  { label: 'Hospitals',   to: '/hospitals',  icon: Building2,       roles: ['owner', 'telecaller'] },
];

// Phone-only bottom tab bar: the pages used most on the move, reachable
// with one thumb. "More" opens the full drawer, so nothing is out of reach.
const MOBILE_TABS = [
  { label: 'Dispatch', to: '/dispatch',               icon: Radio },
  { label: 'Trips',    to: '/trips',                  icon: FileText },
  { label: 'SOS',      to: '/sos',                    icon: AlertTriangle, badgeKey: 'sos' },
  { label: 'WhatsApp', to: '/whatsapp-conversations', icon: MessageSquare },
];

// Telecallers run operations: dispatch, SOS and calls on the phone tab bar.
const TELECALLER_TABS = [
  { label: 'Dispatch',  to: '/dispatch',  icon: Radio },
  { label: 'Trips',     to: '/trips',     icon: FileText },
  { label: 'SOS',       to: '/sos',       icon: AlertTriangle, badgeKey: 'sos' },
  { label: 'Call Logs', to: '/call-logs', icon: PhoneCall },
];
const CALL_STAFF = ['owner', 'telecaller'];

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
  const [clock,    setClock]    = useState(new Date());
  const [sosCount, setSosCount] = useState(0);
  const sosIntervalRef = useRef();
  const [noResponseCount, setNoResponseCount] = useState(0);
  const noResponseIntervalRef = useRef();

  // Audible SOS alert — same Web Audio API approach as DispatchPage.jsx's
  // playChime/startRinging (own AudioContext, gesture-unlocked, ref-mirrored
  // enabled flag for the setInterval closure). Deliberately a SEPARATE
  // AudioContext instance from DispatchPage's own — browsers support
  // multiple concurrent contexts fine, and unlock state is per-instance,
  // so this needs its own "enable sound" gesture regardless of whether
  // DispatchPage's has already been unlocked. Unlike that chime, this
  // rings with no auto-stop cap — an SOS must keep ringing until acknowledged.
  const [sosSoundEnabled, setSosSoundEnabled] = useState(false);
  const [newSosAlerts, setNewSosAlerts] = useState([]); // freshly-arrived alerts awaiting acknowledgment
  const sosSoundEnabledRef = useRef(false);
  const sosAudioCtxRef     = useRef(null);
  const sosRingTimerRef    = useRef(null);
  const knownSosIdsRef     = useRef(null); // null = baseline not yet captured (skip alert on first load)

  React.useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { sosSoundEnabledRef.current = sosSoundEnabled; }, [sosSoundEnabled]);

  // Two-tone wail, square wave (harsher harmonics than DispatchPage's sine
  // chime) — deliberately more piercing than the booking sound.
  const playSosSiren = () => {
    const ctx = sosAudioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [[1046, 0], [784, 0.14]].forEach(([freq, delay]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.14);
    });
  };

  const startSosRinging = () => {
    if (!sosSoundEnabledRef.current || !sosAudioCtxRef.current || sosRingTimerRef.current) return;
    playSosSiren();
    // No MAX_RINGS cap, unlike DispatchPage's chime — an SOS keeps ringing
    // until dismissSosAlert/dismissAllSosAlerts stops it.
    sosRingTimerRef.current = setInterval(playSosSiren, 800);
  };

  const stopSosRinging = () => {
    if (sosRingTimerRef.current) { clearInterval(sosRingTimerRef.current); sosRingTimerRef.current = null; }
  };

  // Doubles as both the initial gesture-unlock AND a repeatable test-tone
  // button (per-request: the owner needs a way to confirm sound works
  // without waiting for a real SOS). First click creates+unlocks+enables;
  // every click after that just re-plays the tone. resume() is awaited
  // here (DispatchPage's equivalent doesn't) — not proven to be the actual
  // cause of the silent-siren bug (see investigation), but scheduling audio
  // before resume() has genuinely finished is a real, if narrow, footgun,
  // and awaiting it costs nothing.
  const enableSosSound = async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const firstEnable = !sosSoundEnabled;
      if (!sosAudioCtxRef.current) sosAudioCtxRef.current = new Ctx();
      if (sosAudioCtxRef.current.state === 'suspended') await sosAudioCtxRef.current.resume();
      if (firstEnable) {
        setSosSoundEnabled(true);
        toast.success('🚨 SOS sound alerts enabled for this session');
      } else {
        toast.success('🔊 Test tone played');
      }
      playSosSiren(); // audible confirmation / on-demand test tone
    } catch {
      toast.error('Could not play audio in this browser');
    }
  };

  const dismissSosAlert = (id) => {
    setNewSosAlerts(prev => {
      const next = prev.filter(a => a._id !== id);
      if (next.length === 0) stopSosRinging();
      return next;
    });
  };

  const dismissAllSosAlerts = () => {
    setNewSosAlerts([]);
    stopSosRinging();
  };

  // Own independent poll (not shared with SosAlertsPage's) so the badge
  // stays live from any page in the CRM, not just while on /sos — same
  // per-component polling convention DispatchPage already uses, just no
  // shared data layer exists in this codebase to hook into instead.
  useEffect(() => {
    if (!CALL_STAFF.includes(user?.role)) return;
    const loadSos = async () => {
      try {
        const { data } = await sosApi.getAll();
        const alerts = data.alerts || [];
        setSosCount(alerts.length);

        const currentIds = new Set(alerts.map(a => a._id));
        if (knownSosIdsRef.current === null) {
          // First load — just record the baseline, don't alert for pre-existing alerts.
          knownSosIdsRef.current = currentIds;
        } else {
          const freshlyArrived = alerts.filter(a => !knownSosIdsRef.current.has(a._id));
          if (freshlyArrived.length) {
            setNewSosAlerts(prev => [...prev, ...freshlyArrived]);
            startSosRinging();
          }
          knownSosIdsRef.current = currentIds;
        }
      } catch { /* badge/ringing just stay at their last known state */ }
    };
    loadSos();
    sosIntervalRef.current = setInterval(loadSos, SOS_POLL_MS);
    return () => {
      clearInterval(sosIntervalRef.current);
      stopSosRinging();
      sosAudioCtxRef.current?.close();
    };
  }, [user?.role]);

  // Live "stuck right now" count for the Trip Alerts nav badge — no sound,
  // just a number, unlike SOS above. type: 'NO_RESPONSE' hits the cheap
  // live-snapshot-only path in getEvents (no persisted-events query at all).
  useEffect(() => {
    if (!CALL_STAFF.includes(user?.role)) return;
    const loadNoResponse = async () => {
      try {
        const { data } = await tripCallEventsApi.getAll({ type: 'NO_RESPONSE' });
        setNoResponseCount((data.events || []).length);
      } catch { /* badge just stays at its last known value */ }
    };
    loadNoResponse();
    noResponseIntervalRef.current = setInterval(loadNoResponse, NO_RESPONSE_POLL_MS);
    return () => clearInterval(noResponseIntervalRef.current);
  }, [user?.role]);

  // "On call duty": while on, customer calls to the company number ring
  // this user — in this app or on their phone, as they chose on the Staff
  // page (callMode). Stored on the server, so it follows the user across
  // devices; null until the first read returns.
  // CRM admins and telecallers both take customer calls.
  const isCallStaff = CALL_STAFF.includes(user?.role);
  const [onDuty, setOnDuty] = useState(null);
  const [callMode, setCallMode] = useState('phone');
  const loadCallSettings = () =>
    callsApi.getMe().then(({ data }) => { setOnDuty(!!data.me.onDuty); setCallMode(data.me.callMode || 'phone'); }).catch(() => {});
  useEffect(() => {
    if (!isCallStaff) return;
    loadCallSettings();
    // The Staff page's call settings card announces changes.
    window.addEventListener('calls:settings-changed', loadCallSettings);
    return () => window.removeEventListener('calls:settings-changed', loadCallSettings);
  }, [user?.role]);

  const phoneState = useInAppPhone();

  const toggleDuty = async () => {
    try {
      const { data } = await callsApi.setDuty(!onDuty);
      setOnDuty(!!data.onDuty);
      toast.success(data.onDuty
        ? (callMode === 'app'
          ? '📞 On call duty — incoming customer calls will ring here in the app'
          : '📞 On call duty — incoming customer calls will ring your phone')
        : 'Off call duty — incoming calls will not ring you');
    } catch { /* the API client shows the backend's message */ }
  };

  // What the in-app phone is doing, for the header chip.
  const appChip = onDuty && callMode === 'app' ? ({
    starting   : { text: 'Connecting…',                color: 'var(--text3)' },
    other_tab  : { text: 'Ringing in another tab',     color: 'var(--text3)' },
    ready      : { text: 'Ringing in app',             color: 'var(--accent)' },
    mic_blocked: { text: 'Mic blocked → your phone',   color: 'var(--amber)' },
    unsupported: { text: 'No in-app calls → your phone', color: 'var(--amber)' },
    error      : { text: 'In-app off → your phone',    color: 'var(--amber)' },
  })[phoneState.status] : null;

  const visibleNav = NAV.filter(n => n.roles.includes(user?.role));
  const badgeCounts = { sos: sosCount, noResponse: noResponseCount };

  const Sidebar = ({ mobile = false }) => (
    <aside
      className={`flex flex-col ${mobile ? 'w-full h-full' : 'w-56 min-h-screen fixed left-0 top-0 z-50'}`}
      style={{ background: 'var(--ink2)', borderRight: '1px solid var(--border)' }}
    >
      {/* Logo */}
      <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
          style={{ background: 'linear-gradient(135deg, var(--accent), #3b9eff)' }}>
          🚑
        </div>
        <div>
          <div className="text-sm font-bold font-display">MediFleet</div>
          <div className="text-xs font-mono" style={{ color: 'var(--accent)' }}>
            {user?.role?.toUpperCase()}
          </div>
        </div>
        {mobile && (
          <button onClick={() => setSideOpen(false)} className="ml-auto p-2.5 -mr-2" style={{ color: 'var(--text3)' }} aria-label="Close menu">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto px-2">
        {visibleNav.map(({ label, to, icon: Icon, badgeKey }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => mobile && setSideOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 ${mobile ? 'py-3 text-sm' : 'py-2.5 text-[13px]'} rounded-lg mb-0.5 font-medium transition-all
               ${isActive
                 ? 'text-[var(--accent)] bg-[rgba(0,212,170,.1)]'
                 : 'text-[var(--text2)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,.04)]'
               }`
            }
          >
            <Icon size={15} />
            {label}
            {badgeKey && badgeCounts[badgeKey] > 0 && (
              <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: 'var(--red)', color: '#fff', minWidth: 18, textAlign: 'center' }}>
                {badgeCounts[badgeKey]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: clock + logout */}
      <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full pulse-dot flex-shrink-0"
            style={{ background: 'var(--accent)' }} />
          <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>
            {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        {/* Which build this page is running — to confirm a deploy took. */}
        <div className="text-[10px] font-mono mb-3" style={{ color: 'var(--text3)' }}
          title={APP_BUILD.builtAt ? `Built ${fmtDateTime(APP_BUILD.builtAt)}` : undefined}>
          Build {APP_BUILD.commit}
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'rgba(59,158,255,.15)', color: 'var(--blue)' }}>
            {user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{user?.name}</div>
          </div>
        </div>
        <button onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
          style={{ color: 'var(--text3)', background: 'rgba(255,77,109,.07)', border: '1px solid rgba(255,77,109,.15)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
        >
          <LogOut size={13} /> Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      {/* SOS acknowledgment banner — top-LEFT, deliberately opposite corner
          from DispatchPage's own top-right "New Booking" banner, so the two
          can never visually stack on top of each other if both fire while
          an owner is on /dispatch.
          Position must clear two fixed/sticky siblings that would otherwise
          cover it: the desktop sidebar (`w-56` = 224px wide, `fixed
          left-0 top-0`, z-50) and the header (`py-3` + its tallest row
          content ≈ 52px tall, `sticky top-0`, z-40). left-4 alone put it
          under the sidebar's 224px-wide column at every vertical position;
          top-4 alone put it under the header. md:left-60 (240px = sidebar
          width + 1rem gap) clears the sidebar on desktop, left-4 is safe on
          mobile since the sidebar there is `hidden md:block` (only a
          transient overlay when manually opened). top-16 (64px) clears the
          ~52px header with margin. z-[60] is strictly above both the
          sidebar/mobile-overlay (z-50) and header (z-40) — needed because
          the sidebar div is later in the DOM and was painting over the
          banner at their old equal z-50, independent of position. */}
      {newSosAlerts.length > 0 && (
        <div className="fixed top-16 left-4 right-4 md:right-auto md:left-60 z-[60] space-y-2 md:w-full max-w-sm">
          {newSosAlerts.length > 1 && (
            <button onClick={dismissAllSosAlerts}
              className="w-full text-center text-[11px] font-semibold py-1 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>
              Dismiss all ({newSosAlerts.length})
            </button>
          )}
          {newSosAlerts.map(a => (
            <div key={a._id} className="rounded-xl p-4 shadow-lg banner-pop"
              style={{ background: 'var(--surface)', border: '2px solid var(--red)', boxShadow: '0 0 0 2px rgba(255,77,109,.35), 0 8px 28px rgba(255,77,109,.4)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold font-display text-sm" style={{ color: 'var(--red)' }}>
                  🚨 SOS Alert!
                </div>
                <button onClick={() => dismissSosAlert(a._id)} style={{ color: 'var(--text3)' }}>
                  <X size={16} />
                </button>
              </div>
              <div className="text-sm font-semibold mt-1.5">{a.driver?.name || 'Unknown driver'}</div>
              {a.driver?.phone && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{a.driver.phone}</div>
              )}
              {a.trip?.tripNumber && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Trip {a.trip.tripNumber}</div>
              )}
              <button onClick={() => dismissSosAlert(a._id)}
                className="w-full mt-2.5 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(255,77,109,.08)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.2)' }}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:block w-56 flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sideOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-72 max-w-[85vw] h-full"><Sidebar mobile /></div>
          <div className="flex-1 bg-black/50" onClick={() => setSideOpen(false)} />
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-5 py-3 sticky top-0 z-40"
          style={{ background: 'rgba(10,15,30,.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
          <button className="md:hidden p-2.5 rounded-lg"
            style={{ color: 'var(--text2)', background: 'var(--surface2)' }}
            onClick={() => setSideOpen(true)}
            aria-label="Open menu">
            <Menu size={18} />
          </button>

          {/* Breadcrumb hint */}
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text3)' }}>
            <span>MediFleet</span>
            <ChevronRight size={12} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* SOS sound unlock — same gesture-unlock pattern as DispatchPage's
                own "Enable sound alerts" button, own AudioContext instance.
                Stays clickable after enabling (no `disabled`) so it doubles
                as a repeatable test-tone button — an owner can confirm audio
                actually works at the start of a shift without waiting for a
                real SOS. */}
            {CALL_STAFF.includes(user?.role) && (
              <button
                onClick={enableSosSound}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={sosSoundEnabled
                  ? { background: 'rgba(0,212,170,.1)', color: 'var(--accent)', cursor: 'pointer' }
                  : { background: 'rgba(255,77,109,.1)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.25)', cursor: 'pointer' }}
                title={sosSoundEnabled ? 'Click to play a test tone' : 'Click to unlock audible SOS alerts'}
              >
                {sosSoundEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                <span className="hidden sm:inline">{sosSoundEnabled ? 'SOS Sound On' : 'Enable SOS sound'}</span>
              </button>
            )}

            <InstallAppButton compact />

            {isCallStaff && onDuty !== null && (
              <button
                onClick={toggleDuty}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={onDuty
                  ? { background: 'rgba(0,212,170,.12)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,.3)' }
                  : { background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border2)' }}
                title={onDuty ? 'Incoming customer calls ring your phone. Click to go off duty.' : 'Click to take incoming customer calls on your phone.'}
              >
                <Headphones size={13} />
                <span className="hidden sm:inline">{onDuty ? 'On call duty' : 'Off call duty'}</span>
              </button>
            )}
            {appChip && (
              <span className="text-[11px] font-semibold px-2 py-1 rounded-lg" title={phoneState.error || ''}
                style={{ color: appChip.color, background: 'var(--surface2)' }}>
                {appChip.text}
              </span>
            )}

            {/* Notification bell */}
            <button className="relative p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text2)', background: 'var(--surface2)' }}>
              <Bell size={16} />
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full"
                style={{ background: 'var(--red)' }} />
            </button>

            <div className="text-xs font-mono hidden sm:block" style={{ color: 'var(--text3)' }}>
              {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Page content. Extra bottom padding on phones keeps the last row
            clear of the bottom tab bar. */}
        <main className="flex-1 p-4 pb-28 md:p-7 page-enter overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* In-app calling: ringing screen + in-call bar. Live only while on
          duty with "Ring in app" chosen. */}
      {isCallStaff && <InAppPhone active={!!onDuty && callMode === 'app'} />}

      {/* Phone bottom tab bar — hidden from md up, where the sidebar shows. */}
      <nav className="mobile-tabbar md:hidden fixed bottom-0 inset-x-0 z-40 flex"
        style={{ background: 'rgba(17,24,39,.97)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--border)' }}>
        {(user?.role === 'telecaller' ? TELECALLER_TABS : MOBILE_TABS).map(({ label, to, icon: Icon, badgeKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[11px] font-semibold
               ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}
          >
            <Icon size={20} />
            {label}
            {badgeKey && badgeCounts[badgeKey] > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 px-1.5 rounded-full text-[10px] font-bold leading-4"
                style={{ background: 'var(--red)', color: '#fff', minWidth: 16, textAlign: 'center' }}>
                {badgeCounts[badgeKey]}
              </span>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setSideOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[11px] font-semibold"
          style={{ color: 'var(--text3)' }}
        >
          <Menu size={20} />
          More
        </button>
      </nav>
    </div>
  );
}
