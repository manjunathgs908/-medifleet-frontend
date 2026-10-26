// src/components/CallButton.jsx
//
// The CRM's one way to phone a customer. It never has the customer's
// number: `target` names who to call ({ tripId } / { leadId } / { quoteId }
// / { whatsappLeadId } / { callLogId } / { customerRef }) and the backend
// places a masked, recorded call through Plivo — your own phone rings
// first, then connects to the customer, who sees only the company number.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Phone, Loader2 } from 'lucide-react';
import { callsApi } from '../api/client';

export default function CallButton({ target, label = 'Call', size = 'sm', className = '', onPlaced }) {
  const [placing, setPlacing] = useState(false);

  const call = async () => {
    setPlacing(true);
    try {
      const { data } = await callsApi.clickToCall(target);
      toast.success(data.message || 'Your phone will ring now — answer it to connect.', { duration: 6000 });
      onPlaced?.(data);
    } catch { /* the API client shows the backend's message */ }
    finally { setPlacing(false); }
  };

  const pad = size === 'lg' ? 'px-5 py-3 text-sm' : 'px-3 py-1.5 text-xs';
  return (
    <button
      type="button"
      onClick={call}
      disabled={placing}
      title="Masked call — your phone rings first, the customer sees the company number"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all disabled:opacity-60 ${pad} ${className}`}
      style={{ background: 'rgba(0,212,170,.12)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,.3)' }}
    >
      {placing ? <Loader2 size={size === 'lg' ? 16 : 12} className="animate-spin" /> : <Phone size={size === 'lg' ? 16 : 12} />}
      {placing ? 'Calling…' : label}
    </button>
  );
}
