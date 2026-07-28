// src/components/Shell.jsx
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { sosApi } from '../api/client';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Radio, Truck, FileText, Receipt,
  TrendingUp, Users, Target, ShieldCheck, Building2, UserCheck,
  LogOut, Menu, X, Bell, BellOff, ChevronRight, AlertTriangle
} from 'lucide-react';

const SOS_POLL_MS = 30000;

const NAV = [
  { label: 'Dashboard',   to: '/',           icon: LayoutDashboard, roles: ['owner'] },
  { label: 'Dispatch',    to: '/dispatch',   icon: Radio,           roles: ['owner'] },
  { label: 'Fleet',       to: '/fleet',      icon: Truck,           roles: ['owner'] },
  { label: 'Trips',       to: '/trips',      icon: FileText,        roles: ['owner'] },
  { label: 'Billing',     to: '/billing',    icon: Receipt,     roles: ['owner'] },
  { label: 'SOS Alerts',  to: '/sos',        icon: AlertTriangle,   roles: ['owner'], badgeKey: 'sos' },
  { label: 'Leads',       to: '/leads',      icon: Target,          roles: ['owner'] },
  { label: 'Finance',     to: '/finance',    icon: TrendingUp,      roles: ['owner'] },{ label: 'Salaries',    to: '/salary',     icon: Users,           roles: ['owner'] },
  { label: 'Staff',       to: '/staff',      icon: Users,           roles: ['owner'] },
  { label: 'Advances',    to: '/advances',   icon: Users,           roles: ['owner'] },  { label: 'Compliance',  to: '/compliance', icon: ShieldCheck,     roles: ['owner'] },
  { label: 'Owners',      to: '/owners',     icon: UserCheck,       roles: ['owner'] },
  { label: 'Building2s',   to: '/Building2s',  icon: Building2,        roles: ['owner'] },
];

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
  const [clock,    setClock]    = useState(new Date());
  const [sosCount, setSosCount] = useState(0);
  const sosIntervalRef = useRef();

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

  const enableSosSound = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!sosAudioCtxRef.current) sosAudioCtxRef.current = new Ctx();
      if (sosAudioCtxRef.current.state === 'suspended') sosAudioCtxRef.current.resume();
      setSosSoundEnabled(true);
      playSosSiren(); // audible confirmation that the unlock worked
      toast.success('🚨 SOS sound alerts enabled for this session');
    } catch {
      toast.error('Could not enable audio in this browser');
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
    if (user?.role !== 'owner') return;
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

  const visibleNav = NAV.filter(n => n.roles.includes(user?.role));

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
          <button onClick={() => setSideOpen(false)} className="ml-auto p-1" style={{ color: 'var(--text3)' }}>
            <X size={18} />
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
              `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-[13px] font-medium transition-all
               ${isActive
                 ? 'text-[var(--accent)] bg-[rgba(0,212,170,.1)]'
                 : 'text-[var(--text2)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,.04)]'
               }`
            }
          >
            <Icon size={15} />
            {label}
            {badgeKey === 'sos' && sosCount > 0 && (
              <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: 'var(--red)', color: '#fff', minWidth: 18, textAlign: 'center' }}>
                {sosCount}
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
          an owner is on /dispatch. */}
      {newSosAlerts.length > 0 && (
        <div className="fixed top-4 left-4 z-50 space-y-2 w-full max-w-sm">
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
          <div className="w-56 h-full"><Sidebar mobile /></div>
          <div className="flex-1 bg-black/50" onClick={() => setSideOpen(false)} />
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-5 py-3 sticky top-0 z-40"
          style={{ background: 'rgba(10,15,30,.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
          <button className="md:hidden p-1.5 rounded-lg"
            style={{ color: 'var(--text2)', background: 'var(--surface2)' }}
            onClick={() => setSideOpen(true)}>
            <Menu size={17} />
          </button>

          {/* Breadcrumb hint */}
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text3)' }}>
            <span>MediFleet</span>
            <ChevronRight size={12} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* SOS sound unlock — same gesture-unlock pattern as DispatchPage's
                own "Enable sound alerts" button, own AudioContext instance. */}
            {user?.role === 'owner' && (
              <button
                onClick={enableSosSound}
                disabled={sosSoundEnabled}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={sosSoundEnabled
                  ? { background: 'rgba(0,212,170,.1)', color: 'var(--accent)', cursor: 'default' }
                  : { background: 'rgba(255,77,109,.1)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.25)', cursor: 'pointer' }}
                title={sosSoundEnabled ? 'SOS sound alerts are on for this session' : 'Click to unlock audible SOS alerts'}
              >
                {sosSoundEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                <span className="hidden sm:inline">{sosSoundEnabled ? 'SOS Sound On' : 'Enable SOS sound'}</span>
              </button>
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

        {/* Page content */}
        <main className="flex-1 p-5 md:p-7 page-enter overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
