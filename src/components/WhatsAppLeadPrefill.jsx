// src/components/WhatsAppLeadPrefill.jsx
//
// The panel on the booking form opened from a WhatsApp lead's "Book"
// (/dispatch?whatsappLead=<lead id>) — the WhatsApp counterpart of
// LiveCallCapture. It finds the lead (GET /api/whatsapp-leads, all
// statuses) and hands it to the form (onLead), which fills ONLY the pickup
// the customer shared on WhatsApp. Drop, patient, service and fare are for
// the telecaller; nothing is booked until they press Book.
import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, CheckCircle } from 'lucide-react';
import { whatsappLeadsApi } from '../api/client';
import { custPhone } from './ui';
import { findLead, pickupFromLead, pickupConfirmed } from '../utils/whatsappLeadPrefill';

export default function WhatsAppLeadPrefill({ leadId, onLead, onClose }) {
  const [lead, setLead] = useState(null);
  const [note, setNote] = useState('Loading the WhatsApp lead…');
  const onLeadRef = useRef(onLead);
  onLeadRef.current = onLead;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await whatsappLeadsApi.getAll({});
        if (cancelled) return;
        const found = findLead(data.leads, leadId);
        if (!found) { setNote('This WhatsApp lead was not found — fill the form as usual.'); return; }
        setLead(found);
        if (!pickupFromLead(found)) { setNote('This lead has no shared pickup — fill the form as usual.'); return; }
        setNote('');
        onLeadRef.current?.(found);
      } catch (e) {
        if (!cancelled) setNote(`Could not load the WhatsApp lead${e.response?.data?.message ? ` — ${e.response.data.message}` : ''}. Fill the form as usual.`);
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const pickup = pickupFromLead(lead);

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface2)', border: '1px solid rgba(0,212,170,.35)' }}>
      <div className="flex items-center gap-2">
        <MessageCircle size={15} style={{ color: 'var(--accent)' }} />
        <span className="font-semibold text-sm">WhatsApp lead</span>
        {lead && (
          <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>· {custPhone(lead.phone, lead.phoneMasked)}</span>
        )}
        <button type="button" onClick={onClose} className="ml-auto p-1" aria-label="Close WhatsApp lead" style={{ color: 'var(--text3)' }}><X size={15} /></button>
      </div>

      {note && <div className="text-xs" style={{ color: 'var(--text3)' }}>{note}</div>}

      {pickup && (
        <div className="text-xs flex items-start gap-1.5" style={{ color: 'var(--accent)' }}>
          <span>📍 Pickup shared by the customer on WhatsApp: {pickup.label}</span>
          {pickupConfirmed(lead)
            ? <span className="flex items-center gap-0.5 whitespace-nowrap" style={{ color: 'var(--green, #16a34a)' }}><CheckCircle size={12} /> confirmed</span>
            : <span className="whitespace-nowrap" style={{ color: 'var(--amber)' }}>· not confirmed yet</span>}
        </div>
      )}

      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
        Only the pickup is filled — call the customer for the drop, patient details and service. Changing the pickup is fine. Nothing is booked until you press Book.
      </div>
    </div>
  );
}
