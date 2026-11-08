// src/utils/whatsappLeadPrefill.js
//
// "Book" for a WhatsApp lead that shared its pickup (medifleet-backend
// services/waWelcomeLocation.js: the customer tapped "📍 Send Location" on
// the welcome template). The lead from GET /api/whatsapp-leads, and its
// ringing alert, carry pickup { label, lat, lng, ... }. Book opens
// /dispatch?whatsappLead=<lead id> — the same URL-param pre-fill as
// ?captureCall=<call log id> — and Dispatch fills ONLY the pickup.
// Drop, patient, service and fare stay for the telecaller.

export const WHATSAPP_LEAD_PARAM = 'whatsappLead';

// The pickup as the booking form's place ({ label, lat, lng }), or null
// when the lead has none usable (no coordinates = nothing to pre-fill).
export function pickupFromLead(lead) {
  const p = lead?.pickup;
  if (!p) return null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (p.lat == null || p.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { label: String(p.label || '').trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
}

// Whether the customer replied Yes to "is this the pickup point?".
// The lead says pickup.confirmedAt; its alert says pickup.confirmed.
export const pickupConfirmed = (lead) => !!(lead?.pickup?.confirmedAt || lead?.pickup?.confirmed);

// Where Book goes, or null when the lead has no pickup (no Book button).
// Takes a lead (_id) or an alert (id).
export function dispatchLinkForLead(lead) {
  const id = lead?._id || lead?.id;
  if (!id || !pickupFromLead(lead)) return null;
  return `/dispatch?${WHATSAPP_LEAD_PARAM}=${encodeURIComponent(id)}`;
}

// The lead for a ?whatsappLead= id, from the leads list (all statuses).
export const findLead = (leads, id) => (leads || []).find((l) => String(l._id) === String(id)) || null;
