// src/mobile/ui.jsx — small building blocks shared by the mobile screens.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Phone, Loader2, RefreshCw, AlertCircle, Inbox } from 'lucide-react';
import { callsApi } from '../api/client';

// Loading / error / empty, in one place, so every screen has all three.
export function Skeleton({ rows = 3, height = 76 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="m-skel" style={{ height }} />)}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="m-card p-5 text-center" role="alert">
      <AlertCircle size={28} className="mx-auto mb-2" style={{ color: 'var(--m-red)' }} aria-hidden="true" />
      <div className="font-semibold">Couldn’t load this</div>
      <div className="m-sub mt-1 break-words">{message || 'Check your connection and try again.'}</div>
      {onRetry && (
        <button type="button" className="m-btn m-tap mt-4 w-full" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, icon }) {
  return (
    <div className="m-card p-6 text-center">
      <div className="mx-auto mb-2 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#eef1f5', color: 'var(--m-text3)' }} aria-hidden="true">
        {icon || <Inbox size={20} />}
      </div>
      <div className="font-semibold">{title}</div>
      {hint && <div className="m-sub mt-1">{hint}</div>}
    </div>
  );
}

/**
 * The existing masked call (POST /api/calls/click-to-call, exactly as
 * components/CallButton.jsx sends it): `target` names WHO to call
 * ({ leadId } / { callbackTaskId } / …), never a number. Plivo rings the
 * staff member's own phone first; the customer sees the company number.
 */
export function MCallButton({ target, label = 'Call', variant = 'primary', className = '', onPlaced }) {
  const [placing, setPlacing] = useState(false);
  const call = async (e) => {
    e?.stopPropagation?.();
    setPlacing(true);
    try {
      const { data } = await callsApi.clickToCall(target);
      toast.success(data.message || 'Your phone will ring now — answer it to connect.', { duration: 6000 });
      onPlaced?.(data);
    } catch { /* the API client shows the backend's message */ }
    finally { setPlacing(false); }
  };
  return (
    <button type="button" onClick={call} disabled={placing}
      className={`m-btn m-tap ${variant === 'primary' ? 'm-btn-primary' : ''} ${className}`}
      aria-label={placing ? 'Calling…' : `${label} (masked call — your phone rings first)`}>
      {placing ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />}
      {placing ? 'Calling…' : label}
    </button>
  );
}

export const TONE_PILL = { red: 'm-pill-red', amber: 'm-pill-amber', blue: 'm-pill-blue', green: 'm-pill-green', gray: 'm-pill-gray' };
const STATUS_TONE = { new: 'blue', contacted: 'amber', converted: 'green', lost: 'gray', spam: 'gray' };
export const StatusPill = ({ status }) => (
  <span className={`m-pill ${TONE_PILL[STATUS_TONE[status || 'new']] || 'm-pill-gray'} capitalize`}>{status || 'new'}</span>
);
