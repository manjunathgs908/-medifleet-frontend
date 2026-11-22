// src/mobile/logic.mjs
//
// The mobile CRM's decisions, kept free of React and the network so they can
// be unit-tested with Node's own test runner (src/mobile/__tests__):
//
//   dashboardCards  which Home cards show, with which count and list. A card
//                   whose count has no backend source is left OUT — never a
//                   fake zero, never a dead button.
//   moreItems       the "More" sheet, gated by role (owner: everything;
//                   telecaller: lead / call / booking work only)
//   quickActions    Home's quick-action row — only actions with an existing flow
//   buildMyWork     overdue first, then today's follow-ups and callbacks;
//                   a telecaller sees only work assigned to them
//   notifications   bell items derived from existing counts (no new system)
//   leadListQuery   the Leads list filter from the URL, whitelisted
//   shownPhone      what number a card may show: the full number only when
//                   the backend sent one (it does only for the owner),
//                   otherwise the masked one
//
// India time throughout ("today" is the IST calendar day), matching the
// backend's utils/leadFollowUp.js.

import { navItemsFor } from '../lib/navAccess.mjs';

export const MOBILE_MAX_WIDTH = 430;

// When the phone layout is used (CSS media query; 430px is INCLUDED):
//   1. any device <= 430px wide — every phone in portrait up to the largest
//      iPhones (430), and a desktop window dragged that narrow;
//   2. touch devices up to 600px wide — Android phones set to a small
//      display size report 432-480px, foldable cover screens likewise; they
//      should not flip to the tablet layout;
//   3. touch devices in landscape (<= 500px tall, <= 950px wide) — a phone
//      turned sideways, which would otherwise get the desktop sidebar in a
//      390px-tall window.
// Everything else — desktop mouse/trackpad above 430px, tablets — keeps the
// existing layout unchanged.
export const MOBILE_QUERY = [
  `(max-width: ${MOBILE_MAX_WIDTH}px)`,
  '(pointer: coarse) and (max-width: 600px)',
  '(pointer: coarse) and (max-height: 500px) and (max-width: 950px)',
].join(', ');

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// End (exclusive) of the India calendar day containing `now`.
export function istDayEnd(now = Date.now()) {
  const t = new Date(now).getTime();
  return Math.floor((t + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS + DAY_MS;
}

const isCount = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/**
 * Home's 2x2 cards. `summary` holds each source's own state —
 * { status: 'loading' | 'ready' | 'error', data } — for:
 *   leads     GET /api/leads/summary  -> counts   { new, dueToday, overdue, ... }
 *   callbacks GET /api/callbacks/summary         { open, overdue }
 *   live      GET /api/trips/live     -> counts   { active, ... }
 *
 * Each card gets a `state`:
 *   loading      its request has not answered yet  -> label + placeholder
 *   error        its request FAILED                -> label + "Couldn't load" + Retry
 *                (never a number: not a false zero, not a stale count)
 *   ready        a real count                      -> the count
 * A card is left out only when its request SUCCEEDED but the response has
 * no such field — the backend does not support that count (e.g. an older
 * backend without counts.new). Unsupported is not the same as failed.
 */
const CARDS = [
  { key: 'new',       label: 'New leads',          source: 'leads',     field: 'new',      to: '/m/leads?status=new',     tone: 'blue' },
  { key: 'followups', label: "Today's follow-ups", source: 'leads',     field: 'dueToday', to: '/m/leads?view=due_today', tone: 'amber' },
  { key: 'callbacks', label: 'Pending callbacks',  source: 'callbacks', field: 'open',     to: '/callbacks',              tone: 'red' },
  { key: 'bookings',  label: 'Active bookings',    source: 'live',      field: 'active',   to: '/dispatch',               tone: 'green' },
];
export function dashboardCards(summary = {}) {
  const out = [];
  for (const c of CARDS) {
    const src = summary[c.source] || { status: 'loading' };
    const { source, field, ...card } = c;
    if (src.status === 'error') { out.push({ ...card, source, state: 'error', count: null }); continue; }
    if (src.status !== 'ready') { out.push({ ...card, source, state: 'loading', count: null }); continue; }
    const n = src.data?.[field];
    if (!isCount(n)) continue; // answered, but this count is not supported
    out.push({ ...card, source, state: 'ready', count: n });
  }
  return out;
}

// The "More" sheet: SOS first (it must be one tap away), then EVERY page
// the role is shown in the desktop sidebar — the same list
// (lib/navAccess.mjs), so phone and desktop navigation never disagree and
// no page a role is authorized for disappears on a phone. Call Logs is
// left out only because it IS the Calls tab. Nothing here grants access:
// App.jsx's routes and the backend still decide.
const IN_TAB_BAR = new Set(['/call-logs']);
export function moreItems(role) {
  const items = navItemsFor(role).filter((i) => !IN_TAB_BAR.has(i.to));
  const sos = items.find((i) => i.to === '/sos');
  return [
    ...(sos ? [{ ...sos, key: 'sos', urgent: true }] : []),
    ...items.filter((i) => i.to !== '/sos').map((i) => ({
      ...i,
      key: i.to.replace(/^\//, '') || 'dashboard',
      // The Leads tab opens the phone list; this is the full desktop page.
      label: i.to === '/leads' ? 'Leads (full page)' : i.to === '/' ? 'Dashboard (desktop)' : i.label,
    })),
  ];
}

// Home's quick actions, each an existing flow. "New lead" is deliberately
// absent: the CRM has no create-lead form or endpoint, and a button that
// goes nowhere is worse than none.
const QUICK = [
  { key: 'call',     label: 'Call',           to: '/call-logs' },
  { key: 'whatsapp', label: 'WhatsApp chats', to: '/whatsapp-conversations' },
  { key: 'book',     label: 'Book ambulance', to: '/dispatch' },
];
export const quickActions = (role) => (['owner', 'telecaller'].includes(role) ? QUICK : []);

/** Full number only if the backend sent it (owner); else the masked one. */
export function shownPhone(full, masked, fallback = 'No number') {
  if (full) return String(full).replace(/^(\d{5})(\d{5})$/, '$1 $2');
  return masked || fallback;
}

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// The existing endpoints' caps: GET /api/leads?view=… returns at most 500
// leads per view; GET /api/callbacks?state=open at most 300 tasks, newest
// missed call first (so past the cap the OLDEST open tasks are the ones cut).
export const LEAD_VIEW_LIMIT = 500;
export const CALLBACK_OPEN_LIMIT = 300;
export const workLimitsHit = ({ overdueLeads = [], todayLeads = [], callbacks = [] } = {}) => ({
  leads    : overdueLeads.length >= LEAD_VIEW_LIMIT || todayLeads.length >= LEAD_VIEW_LIMIT,
  callbacks: callbacks.length >= CALLBACK_OPEN_LIMIT,
});

/**
 * "My Work": lead follow-ups (overdue + due today, from GET /api/leads?view=…)
 * and open missed-call callbacks (GET /api/callbacks) that are overdue or
 * due today (India day). Resolved/withdrawn callbacks and inactive leads
 * never appear. Sorted overdue first (oldest first), then today's (soonest).
 *
 * Each item gets a `bucket`:
 *   mine        assigned to this user
 *   unassigned  nobody's yet — shown to EVERY operator (owner and
 *               telecallers) in its own section with "Assign to me", so
 *               unowned work is never invisible
 *   team        assigned to someone else — shown to the owner only
 * A telecaller never sees another person's assigned items.
 */
export function buildMyWork({ overdueLeads = [], todayLeads = [], callbacks = [], role, userId, now = Date.now() } = {}) {
  const owner = role === 'owner';
  const end = istDayEnd(now);
  const items = [];
  const seen = new Set();
  const bucketOf = (assignedTo) => (!assignedTo ? 'unassigned' : sameId(assignedTo, userId) ? 'mine' : 'team');

  for (const l of [...overdueLeads, ...todayLeads]) {
    if (!l?._id || seen.has(`lead:${l._id}`)) continue;
    const bucket = bucketOf(l.assignedTo);
    if (bucket === 'team' && !owner) continue;
    const dueAt = l.nextFollowUpAt ? new Date(l.nextFollowUpAt).getTime() : NaN;
    if (Number.isNaN(dueAt) || dueAt >= end) continue;
    seen.add(`lead:${l._id}`);
    items.push({
      kind    : 'lead',
      id      : l._id,
      rev     : l.rev ?? 0,
      bucket,
      name    : l.patientName || 'Unknown',
      phone   : shownPhone(l.phone, l.phoneMasked),
      assignee: l.assignedToName || (l.assignedTo ? 'Staff member' : 'Unassigned'),
      dueAt,
      overdue : l.followUp === 'overdue' || dueAt < now,
      action  : { label: 'Call', target: { leadId: l._id } },
      to      : `/m/leads/${l._id}`,
    });
  }

  for (const c of callbacks) {
    if (!c?._id || (c.state && c.state !== 'open')) continue;
    const bucket = bucketOf(c.assignedTo);
    if (bucket === 'team' && !owner) continue;
    const dueAt = c.due?.dueAt ? new Date(c.due.dueAt).getTime() : NaN;
    if (Number.isNaN(dueAt) || dueAt >= end) continue;
    items.push({
      kind    : 'callback',
      id      : c._id,
      rev     : c.rev ?? 0,
      bucket,
      name    : c.trip?.patientName || c.lead?.patientName || 'Missed call',
      phone   : shownPhone(c.customerPhone, c.customerMasked, 'Unknown number'),
      assignee: c.assignedToName || (c.assignedTo ? 'Staff member' : 'Unassigned'),
      dueAt,
      overdue : !!c.due?.overdue || dueAt < now,
      action  : { label: 'Call back', target: { callbackTaskId: c._id } },
      to      : '/callbacks',
    });
  }

  return items.sort((a, b) => (a.overdue === b.overdue ? a.dueAt - b.dueAt : a.overdue ? -1 : 1));
}

/**
 * Bell items from counts the CRM already has. Pass `data` only from a
 * source whose latest request succeeded (see hooks.js readyData), so a
 * failed refresh never leaves an old number in the bell.
 */
export function notifications({ leads, callbacks } = {}) {
  const items = [];
  // These counts are team-wide (the endpoints have no per-person count), so
  // they say so and open the list that shows exactly that number.
  if (isCount(leads?.overdue) && leads.overdue > 0) items.push({ key: 'overdue', tone: 'red', text: `${leads.overdue} lead follow-up${leads.overdue === 1 ? '' : 's'} overdue across the team`, to: '/m/leads?view=overdue' });
  if (isCount(callbacks?.overdue) && callbacks.overdue > 0) items.push({ key: 'callbacks', tone: 'red', text: `${callbacks.overdue} callback${callbacks.overdue === 1 ? '' : 's'} overdue across the team`, to: '/callbacks' });
  if (isCount(leads?.new) && leads.new > 0) items.push({ key: 'new', tone: 'blue', text: `${leads.new} new lead${leads.new === 1 ? '' : 's'} waiting`, to: '/m/leads?status=new' });
  return { items, count: items.length };
}

// The Leads list's filters. Anything else in the URL is ignored.
export const LEAD_FILTERS = [
  { key: 'new',       label: 'New',       params: { status: 'new' } },
  { key: 'due_today', label: 'Due today', params: { view: 'due_today' } },
  { key: 'overdue',   label: 'Overdue',   params: { view: 'overdue' } },
  { key: 'mine',      label: 'Mine',      params: { view: 'mine' } },
  { key: 'contacted', label: 'Contacted', params: { status: 'contacted' } },
];
export function leadListQuery(search = '') {
  const q = new URLSearchParams(search);
  const view = q.get('view');
  const status = q.get('status');
  return LEAD_FILTERS.find((f) => (f.params.view && f.params.view === view) || (f.params.status && f.params.status === status))
    || LEAD_FILTERS[0];
}

// A lead's notes and history, newest first (same events the desktop Leads
// page shows).
const WA_OUTCOME = { booked: 'Booked', followup: 'Follow up', not_interested: 'Not interested', no_answer: 'No answer' };
function historyText(e, fmt) {
  const d = e.detail || {};
  switch (e.type) {
    case 'assigned'         : return `Assigned to ${d.to}${d.from ? ` (was ${d.from})` : ''}`;
    case 'unassigned'       : return `Unassigned${d.from ? ` (was ${d.from})` : ''}`;
    case 'follow_up_set'    : return `Follow-up set for ${fmt(d.at)}`;
    case 'follow_up_cleared': return 'Follow-up cleared';
    case 'status'           : return [`Status ${d.from || 'new'} → ${d.to}`, d.reason && `reason: “${d.reason}”`].filter(Boolean).join(' · ');
    case 'whatsapp_outcome' : return `WhatsApp call outcome: ${WA_OUTCOME[d.outcome] || d.outcome}`;
    default                 : return e.type || 'Update';
  }
}
export function leadHistoryRows(lead, fmt = (v) => String(v)) {
  if (!lead) return [];
  return [
    ...(lead.followUpNotes || []).map((n) => ({ at: n.at, note: true, text: n.text, by: n.byName })),
    ...(lead.history || []).map((e) => ({ at: e.at, note: false, text: historyText(e, fmt), by: e.byName })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
}

// "YYYY-MM-DDTHH:mm" in India time, for <input type="datetime-local">; the
// server reads a time without a zone as India time.
export const istInput = (v) => new Date(new Date(v).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);

// "10:30 am", or "Yesterday 10:30 am" / "12 Nov, 10:30 am" — India time.
export function dueLabel(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return '—';
  const time = new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
  const end = istDayEnd(now);
  if (ts >= end - DAY_MS && ts < end) return time;
  if (ts >= end - 2 * DAY_MS && ts < end - DAY_MS) return `Yesterday ${time}`;
  const day = new Date(ts).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
  return `${day}, ${time}`;
}
