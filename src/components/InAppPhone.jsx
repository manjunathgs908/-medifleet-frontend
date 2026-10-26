// src/components/InAppPhone.jsx
//
// The in-app phone (see lib/inAppPhone.js): runs while the user is On call
// duty with "Ring in app" chosen, and draws
//   - the full-screen incoming-call screen: masked caller, the trip or lead
//     it matches, big Answer / Reject (the SDK plays the ring tone), and
//   - the in-call bar: who, how long, mute, hang up.
// Also exports useInAppPhone() for the header's status chip.
import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import * as phone from '../lib/inAppPhone';

export function useInAppPhone() {
  const [s, setS] = useState(phone.getState());
  useEffect(() => phone.subscribe(setS), []);
  return s;
}

const describe = (log) => {
  if (!log) return { who: 'Customer', about: 'Incoming call' };
  const about = log.trip?.tripNumber
    ? `Trip ${log.trip.tripNumber}${log.trip.patientName ? ` · ${log.trip.patientName}` : ''}`
    : log.lead?.patientName ? `Lead · ${log.lead.patientName}` : 'New caller';
  return { who: log.customerMasked || 'Unknown number', about };
};

function Elapsed({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="font-mono">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

export default function InAppPhone({ active }) {
  const s = useInAppPhone();

  // Started and stopped with duty + "ring in app". Turning it on is a user
  // tap, which is what lets the browser show the microphone prompt.
  useEffect(() => {
    if (active) phone.start(); else phone.stop();
  }, [active]);
  useEffect(() => () => phone.stop(), []);

  if (s.incoming) {
    const { who, about } = describe(s.incoming.log);
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-6"
        style={{ background: 'rgba(5,8,18,.96)', backdropFilter: 'blur(8px)' }}>
        <div className="text-xs uppercase tracking-widest mb-3 pulse-dot" style={{ color: 'var(--accent)' }}>
          Incoming call · 918065591088
        </div>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
          style={{ background: 'rgba(0,212,170,.15)', border: '2px solid rgba(0,212,170,.4)' }}>
          <Phone size={34} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="text-3xl font-bold font-mono mb-1">{who}</div>
        <div className="text-sm mb-12" style={{ color: 'var(--text2)' }}>{about}</div>
        <div className="flex gap-10">
          <button onClick={phone.reject} aria-label="Reject"
            className="w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1 text-xs font-semibold"
            style={{ background: 'var(--red)', color: '#fff' }}>
            <PhoneOff size={28} /> Reject
          </button>
          <button onClick={phone.answer} aria-label="Answer"
            className="w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1 text-xs font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
            <Phone size={28} /> Answer
          </button>
        </div>
        <div className="text-[11px] mt-8 text-center max-w-xs" style={{ color: 'var(--text3)' }}>
          Others on call duty are ringing too — the first to answer takes the call. Rejecting leaves it ringing for them.
        </div>
      </div>
    );
  }

  if (s.inCall) {
    const { who, about } = describe(s.inCall.log);
    return (
      <div className="fixed left-3 right-3 bottom-20 md:bottom-4 md:left-auto md:right-4 md:w-96 z-[250] rounded-2xl p-4 shadow-xl"
        style={{ background: 'var(--surface)', border: '1px solid rgba(0,212,170,.4)' }}>
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full pulse-dot" style={{ background: 'var(--accent)' }} />
          <div className="min-w-0 flex-1">
            <div className="font-bold font-mono truncate">{who}</div>
            <div className="text-xs truncate" style={{ color: 'var(--text3)' }}>{about} · <Elapsed since={s.inCall.startedAt} /> · recorded</div>
          </div>
          <button onClick={phone.toggleMute} aria-label={s.inCall.muted ? 'Unmute' : 'Mute'}
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'var(--surface2)', color: s.inCall.muted ? 'var(--amber)' : 'var(--text2)' }}>
            {s.inCall.muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button onClick={phone.hangup} aria-label="Hang up"
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'var(--red)', color: '#fff' }}>
            <PhoneOff size={18} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
