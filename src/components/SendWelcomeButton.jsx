// src/components/SendWelcomeButton.jsx
//
// "📲 Send WhatsApp" on a call card (CallLogList), under Call back: sends
// the savelife_welcome WhatsApp template (with its "📍 Send Location"
// button) to this call's customer — POST /api/calls/:id/send-welcome. The
// backend finds the real number from the call; this never has it and never
// shows it. Once per number per India day (the backend's rule): after
// "sent" / "already sent today" the button stays off. The result is shown
// inline (utils/welcomeResult), not as a toast.
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { callsApi } from '../api/client';
import { welcomeResult, TONE_COLOR } from '../utils/welcomeResult';

export default function SendWelcomeButton({ callLogId }) {
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null);

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await callsApi.sendWelcome(callLogId);
      setResult(welcomeResult({ status: res.status, data: res.data }));
    } catch (error) {
      setResult(welcomeResult({ error }));
    } finally {
      setSending(false);
    }
  };

  const done = !!result?.done;
  return (
    <div className="flex flex-col items-end gap-1 max-w-[220px]">
      <button
        type="button"
        onClick={send}
        disabled={sending || done}
        title="WhatsApp this caller the SaveLife welcome with a one-tap “Send Location” button — the number stays masked"
        className="inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all disabled:opacity-60 px-3 py-1.5 text-xs whitespace-nowrap"
        style={{ background: 'rgba(37,211,102,.12)', color: '#25d366', border: '1px solid rgba(37,211,102,.3)' }}
      >
        {sending ? <Loader2 size={12} className="animate-spin" /> : <span aria-hidden="true">📲</span>}
        {sending ? 'Sending…' : 'Send WhatsApp'}
      </button>
      {result && (
        <div role="status" className="text-[11px] text-right leading-snug" style={{ color: TONE_COLOR[result.tone] }}>
          {result.text}
        </div>
      )}
    </div>
  );
}
