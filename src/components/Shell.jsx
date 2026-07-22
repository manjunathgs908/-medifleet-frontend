// src/components/Shell.jsx
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Radio, Truck, FileText, Receipt,
  TrendingUp, Users, Target, ShieldCheck, Building2, UserCheck,
  LogOut, Menu, X, Bell, ChevronRight
} from 'lucide-react';

const NAV = [
  { label: 'Dashboard',   to: '/',           icon: LayoutDashboard, roles: ['owner','telecaller'] },
  { label: 'Dispatch',    to: '/dispatch',   icon: Radio,           roles: ['owner','telecaller'] },
  { label: 'Fleet',       to: '/fleet',      icon: Truck,           roles: ['owner','telecaller'] },
  { label: 'Trips',       to: '/trips',      icon: FileText,        roles: ['owner','telecaller'] },
  { label: 'Billing',     to: '/billing',    icon: Receipt,     roles: ['owner','telecaller'] },
  { label: 'Leads',       to: '/leads',      icon: Target,          roles: ['owner','telecaller'] },
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

  React.useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
        {visibleNav.map(({ label, to, icon: Icon }) => (
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
