// src/utils/serviceTypes.js
//
// Bookable services and their display labels, shared by the Dispatch
// booking form and the customer's public quote page (/q/:token) so both
// list exactly the same services under exactly the same names.

// ── Website booking options ──
// selectedType arrives in whatever case the sending client used: savelife-web
// posts lowercase ('bls', 'als_tempo'), while the backend's own catalog in
// utils/ambulanceServiceTypes.js is uppercase. Normalising to uppercase lets
// one map serve both. An id not listed here degrades to a readable
// "Als Tempo" rather than leaking the raw token onto the dispatch board.
const AMBULANCE_TYPE_LABELS = {
  BLS             : 'BLS Ambulance — Maruti Eeco',
  BLS_TEMPO       : 'BLS Ambulance — Tempo Traveller',
  ALS_TEMPO       : 'ALS Ambulance — Tempo Traveller',
  ACLS_TEMPO      : 'ACLS Ambulance — Tempo Traveller',
  NICU_TEMPO      : 'NICU Ambulance — Tempo Traveller',
  BODY_TEMPO      : 'Body Shifting Ambulance — Tempo Traveller',
  BODY_MINI       : 'Body Shifting Mini — Maruti Eeco',
  HEARSE          : 'Hearse',
  HEARSE_BASIC    : 'Hearse — Basic',
  HEARSE_STANDARD : 'Hearse — Standard',
  HEARSE_LUXURY   : 'Hearse — Luxury',
  FREEZER_BOX     : 'Freezer Box',
};

const titleCase = (v) => String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const ambulanceTypeLabel = (v) =>
  v ? (AMBULANCE_TYPE_LABELS[String(v).trim().toUpperCase()] || titleCase(v)) : '';

// The service list is whatever the Pricing collection currently offers. A
// service with no active Pricing doc is not bookable — showing it would
// only let someone reach "No active pricing found" at submit time.
export const servicesFromPricing = (pricing) => (pricing || [])
  .filter(p => p.active !== false && p.serviceType)
  .map(p => ({
    id     : String(p.serviceType).toLowerCase(), // same ids savelife-web posts
    label  : ambulanceTypeLabel(p.serviceType),
    acPerKm: Number(p.acPerKm) || 0,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const fmtDuration = (sec) => {
  if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return null;
  const m = Math.round(Number(sec) / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
