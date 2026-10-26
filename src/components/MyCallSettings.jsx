// src/components/MyCallSettings.jsx
//
// The signed-in user's own "call ring number": the phone Plivo rings for
// their click-to-calls and, while On call duty, for incoming customer
// calls. Separate from the login number. Customers never see it — every
// masked call shows them the company number, shown here as "Customers see".
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PhoneCall } from 'lucide-react';
import { callsApi } from '../api/client';
import { Btn } from './ui';

const fmt = (n) => (n ? String(n).replace(/^(\d{5})(\d{5})$/, '$1 $2') : '—');

export default function MyCallSettings() {
  const [me,     setMe]     = useState(null);
  const [value,  setValue]  = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    callsApi.getMe()
      .then(({ data }) => { setMe(data.me); setValue(data.me.callPhone || ''); })
      .catch(() => {});
  }, []);

  const save = async (next) => {
    const digits = String(next).replace(/\D/g, '').slice(-10);
    if (next && !/^[6-9]\d{9}$/.test(digits)) { toast.error('Enter a valid 10-digit mobile number'); return; }
    setSaving(true);
    try {
      const { data } = await callsApi.setMe(next ? digits : '');
      setMe(data.me);
      setValue(data.me.callPhone || '');
      toast.success(next ? `Plivo will now ring ${fmt(data.me.ringPhone)}` : 'Using your login number again');
    } catch { /* the API client shows the backend's message */ }
    finally { setSaving(false); }
  };

  const chooseMode = async (callMode) => {
    if (callMode === me.callMode) return;
    setSaving(true);
    try {
      const { data } = await callsApi.setMode(callMode);
      setMe(data.me);
      // The header's duty switch and in-app phone pick this up.
      window.dispatchEvent(new Event('calls:settings-changed'));
      toast.success(callMode === 'app'
        ? 'Incoming calls will ring here in the CRM while it is open (your phone when it is not)'
        : 'Incoming calls will ring your phone');
    } catch { /* the API client shows the backend's message */ }
    finally { setSaving(false); }
  };

  if (!me) return null;

  return (
    <div className="card mb-6">
      <div className="flex items-center gap-2 mb-1">
        <PhoneCall size={16} style={{ color: 'var(--accent)' }} />
        <h2 className="font-bold font-display">My call ring number</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text3)' }}>
        The phone Plivo rings when you tap Call, and for incoming customer calls while you are On call duty.
        Separate from your login number.
      </p>

      {/* How incoming calls reach you while On call duty. */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text3)' }}>Incoming calls ring</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            ['app',   '💻 In the CRM app', 'Answer in this browser or the installed app. Needs the microphone and the app open — if it is closed, your phone rings instead.'],
            ['phone', '📱 My phone',       'Plivo rings the number below. Works with the app closed.'],
          ].map(([key, title, hint]) => (
            <button key={key} type="button" disabled={saving} onClick={() => chooseMode(key)}
              className="text-left rounded-lg p-3 transition-all"
              style={me.callMode === key
                ? { background: 'rgba(0,212,170,.1)', border: '1px solid rgba(0,212,170,.4)' }
                : { background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
              <div className="font-semibold text-sm" style={{ color: me.callMode === key ? 'var(--accent)' : 'var(--text)' }}>{title}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>{hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <div className="rounded-lg p-3" style={{ background: 'var(--surface2)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Plivo rings</div>
          <div className="font-mono font-bold mt-0.5" style={{ color: 'var(--accent)' }}>{fmt(me.ringPhone)}</div>
          {me.usingLogin && <div className="text-[10px] mt-0.5" style={{ color: 'var(--amber)' }}>your login number — set one below</div>}
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--surface2)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Login number</div>
          <div className="font-mono mt-0.5">{fmt(me.loginPhone)}</div>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--surface2)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Customers see</div>
          <div className="font-mono mt-0.5">{me.callerId || 'Plivo not configured'}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="inp max-w-xs"
          inputMode="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="10-digit mobile, e.g. 98765 43210"
        />
        <Btn onClick={() => save(value.trim())} disabled={saving}>Save</Btn>
        {me.callPhone && (
          <Btn variant="ghost" onClick={() => save('')} disabled={saving}>Use login number</Btn>
        )}
      </div>
    </div>
  );
}
