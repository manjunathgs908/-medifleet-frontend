// src/components/ui.jsx
// ─────────────────────────────────────────────────────────────
// Shared UI primitives used across all pages.
// Import what you need: import { StatCard, Modal, Btn } from '../components/ui';
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// ── Stat Card ─────────────────────────────────────────────────
export const StatCard = ({ label, value, sub, color = 'green', icon }) => {
  const colors = {
    green : { bar: 'stat-bar-green', val: 'var(--accent)' },
    red   : { bar: 'stat-bar-red',   val: 'var(--red)'    },
    blue  : { bar: 'stat-bar-blue',  val: 'var(--blue)'   },
    amber : { bar: 'stat-bar-amber', val: 'var(--amber)'  },
  };
  const c = colors[color] || colors.green;
  return (
    <div className={`relative card overflow-hidden ${c.bar}`}
      style={{ '--before-height': '2px' }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{
        background: `linear-gradient(90deg, ${c.val}, transparent)`
      }} />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold mb-1 tracking-widest" style={{ color: 'var(--text3)' }}>
            {label.toUpperCase()}
          </div>
          <div className="text-2xl font-bold font-mono" style={{ color: c.val }}>{value}</div>
          {sub && <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>{sub}</div>}
        </div>
        {icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: `${c.val}18` }}>
            <span style={{ color: c.val }}>{icon}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Page Header ───────────────────────────────────────────────
export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex items-start justify-between mb-6">
    <div>
      <h1 className="text-2xl font-bold font-display">{title}</h1>
      {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

// ── Button ────────────────────────────────────────────────────
export const Btn = ({ children, variant = 'primary', size = 'md', className = '', ...props }) => {
  const variants = {
    primary : 'bg-[var(--accent)] text-[var(--ink)] hover:bg-[var(--accent2)]',
    danger  : 'bg-[rgba(255,77,109,.12)] text-[var(--red)] border border-[rgba(255,77,109,.3)] hover:bg-[rgba(255,77,109,.22)]',
    ghost   : 'bg-[var(--surface2)] text-[var(--text2)] border border-[rgba(255,255,255,.08)] hover:text-[var(--text)]',
    amber   : 'bg-[rgba(255,184,48,.12)] text-[var(--amber)] border border-[rgba(255,184,48,.3)] hover:bg-[rgba(255,184,48,.22)]',
    blue    : 'bg-[rgba(59,158,255,.12)] text-[var(--blue)] border border-[rgba(59,158,255,.3)] hover:bg-[rgba(59,158,255,.22)]',
  };
  const sizes = {
    sm : 'px-3 py-1.5 text-xs gap-1.5',
    md : 'px-4 py-2 text-[13px] gap-2',
    lg : 'px-6 py-2.5 text-sm gap-2',
  };
  return (
    <button
      className={`inline-flex items-center font-semibold rounded-lg transition-all
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      style={{ fontFamily: "'DM Sans', sans-serif" }}
      {...props}
    >
      {children}
    </button>
  );
};

// ── Input field ───────────────────────────────────────────────
export const Input = React.forwardRef(({ label, error, ...props }, ref) => (
  <div>
    {label && <label className="block text-xs font-semibold mb-1 tracking-wide uppercase" style={{ color: 'var(--text2)' }}>{label}</label>}
    <input ref={ref} className="inp" {...props} />
    {error && <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>{error}</p>}
  </div>
));

// ── Select field ──────────────────────────────────────────────
export const Select = React.forwardRef(({ label, children, ...props }, ref) => (
  <div>
    {label && <label className="block text-xs font-semibold mb-1 tracking-wide uppercase" style={{ color: 'var(--text2)' }}>{label}</label>}
    <select ref={ref} className="inp" {...props}>{children}</select>
  </div>
));

// ── Modal ─────────────────────────────────────────────────────
export const Modal = ({ open, onClose, title, children, width = 'max-w-lg' }) => {
  const overlayRef = useRef();
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  return (
    <div ref={overlayRef} onClick={e => e.target === overlayRef.current && onClose()}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)' }}>
      <div className={`${width} w-full rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto`}
        style={{ background: 'var(--ink2)', border: '1px solid var(--border2)' }}>
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold font-display">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text3)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>
              <X size={17} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

// ── Form grid helper ──────────────────────────────────────────
export const FormGrid = ({ cols = 2, children }) => (
  <div className={`grid gap-4 grid-cols-1 sm:grid-cols-${cols}`}>{children}</div>
);

// ── Badge component ───────────────────────────────────────────
export const Badge = ({ color = 'gray', children }) => (
  <span className={`badge badge-${color}`}>{children}</span>
);

// ── Status badge by key ───────────────────────────────────────
const STATUS_MAP = {
  available  : { c: 'green', label: 'Available' },
  on_trip    : { c: 'amber', label: 'On Trip' },
  offline    : { c: 'gray',  label: 'Offline' },
  maintenance: { c: 'red',   label: 'Maintenance' },
  booked     : { c: 'blue',  label: 'Booked' },
  dispatched : { c: 'amber', label: 'Dispatched' },
  en_route   : { c: 'amber', label: 'En Route' },
  completed  : { c: 'green', label: 'Completed' },
  cancelled  : { c: 'red',   label: 'Cancelled' },
  pending    : { c: 'amber', label: 'Pending' },
  paid       : { c: 'green', label: 'Paid' },
  partial    : { c: 'blue',  label: 'Partial' },
  new        : { c: 'blue',  label: 'New' },
  contacted  : { c: 'amber', label: 'Contacted' },
  converted  : { c: 'green', label: 'Converted' },
  lost       : { c: 'red',   label: 'Lost' },
  spam       : { c: 'gray',  label: 'Spam' },
  draft      : { c: 'gray',  label: 'Draft' },
  approved   : { c: 'blue',  label: 'Approved' },
  overdue    : { c: 'red',   label: 'Overdue' },
  sent       : { c: 'amber', label: 'Sent' },
  active     : { c: 'green', label: 'Active' },
  closed     : { c: 'gray',  label: 'Closed' },
};

export const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || { c: 'gray', label: status };
  return <span className={`badge badge-${s.c}`}>{s.label}</span>;
};

// ── Loading spinner ───────────────────────────────────────────
export const Spinner = ({ size = 20 }) => (
  <div className="flex items-center justify-center p-8">
    <div className="rounded-full border-2 border-t-transparent animate-spin"
      style={{ width: size, height: size, borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
  </div>
);

// ── Empty state ───────────────────────────────────────────────
export const Empty = ({ icon = '📭', message = 'No records found' }) => (
  <div className="flex flex-col items-center justify-center py-14 gap-3">
    <div className="text-4xl">{icon}</div>
    <div className="text-sm" style={{ color: 'var(--text3)' }}>{message}</div>
  </div>
);

// ── Rupee formatter ───────────────────────────────────────────
export const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// ── Tab strip ─────────────────────────────────────────────────
export const Tabs = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'var(--surface)', width: 'fit-content' }}>
    {tabs.map(t => (
      <button key={t.key}
        onClick={() => onChange(t.key)}
        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all
          ${active === t.key
            ? 'text-[var(--text)] bg-[var(--surface2)]'
            : 'text-[var(--text3)] hover:text-[var(--text2)]'
          }`}>
        {t.label}
      </button>
    ))}
  </div>
);

// ── Section label ─────────────────────────────────────────────
export const SectionLabel = ({ children }) => (
  <div className="text-xs font-semibold uppercase tracking-widest mb-3 px-1"
    style={{ color: 'var(--text3)' }}>
    {children}
  </div>
);
