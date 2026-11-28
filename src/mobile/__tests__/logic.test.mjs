// src/mobile/__tests__/logic.test.mjs — run with `npm run test:mobile`
// (Node's built-in test runner; no extra dependencies, no network).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dashboardCards, moreItems, quickActions, buildMyWork, notifications, workLimitsHit,
  leadListQuery, shownPhone, istDayEnd, leadHistoryRows, dueLabel, MOBILE_QUERY,
  LEAD_VIEW_LIMIT, CALLBACK_OPEN_LIMIT, myWorkBadge, unassignedOverdue, callsSummary, istDayStart,
} from '../logic.mjs';
import { NAV_ACCESS, navItemsFor } from '../../lib/navAccess.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// 22 Nov 2026, 10:00 IST
const NOW = Date.parse('2026-11-22T04:30:00Z');
const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const ok = (data) => ({ status: 'ready', data });

describe('dashboardCards: label always, count only when real', () => {
  const ALL = { leads: ok({ new: 7, dueToday: 3, overdue: 2 }), callbacks: ok({ open: 4 }), live: ok({ active: 5 }) };

  test('all answered: four cards with real counts, each opening its own list', () => {
    assert.deepEqual(dashboardCards(ALL).map((c) => [c.key, c.state, c.count, c.to]), [
      ['new', 'ready', 7, '/m/leads?status=new'],
      ['followups', 'ready', 3, '/m/leads?view=due_today'],
      ['callbacks', 'ready', 4, '/callbacks'],
      ['bookings', 'ready', 5, '/dispatch'],
    ]);
  });

  test('a real zero is shown (it is a count, not a guess)', () => {
    assert.equal(dashboardCards({ ...ALL, callbacks: ok({ open: 0 }) })[2].count, 0);
  });

  test('a FAILED request keeps its cards, labelled, state error, no number', () => {
    const cards = dashboardCards({ ...ALL, leads: { status: 'error', data: undefined } });
    assert.deepEqual(cards.map((c) => [c.key, c.state, c.count]), [
      ['new', 'error', null], ['followups', 'error', null], ['callbacks', 'ready', 4], ['bookings', 'ready', 5],
    ]);
    assert.equal(cards[0].label, 'New leads');
    assert.equal(cards[0].source, 'leads'); // so Retry reloads just that source
  });

  test('a failed request never shows a stale number, even if data lingers', () => {
    const c = dashboardCards({ ...ALL, live: { status: 'error', data: { active: 9 } } }).find((x) => x.key === 'bookings');
    assert.equal(c.state, 'error');
    assert.equal(c.count, null);
  });

  test('still loading: cards present with a placeholder, no number', () => {
    const cards = dashboardCards({});
    assert.equal(cards.length, 4);
    assert.ok(cards.every((c) => c.state === 'loading' && c.count === null));
  });

  test('UNSUPPORTED (answered, field missing — older backend) is hidden; failed is not', () => {
    const cards = dashboardCards({ ...ALL, leads: ok({ dueToday: 1 }) });
    assert.deepEqual(cards.map((c) => c.key), ['followups', 'callbacks', 'bookings']);
    assert.deepEqual(dashboardCards({ ...ALL, leads: ok({ new: null, dueToday: 'x' }) }).map((c) => c.key), ['callbacks', 'bookings']);
  });
});

describe('role access: navigation, routes and More agree', () => {
  const appSrc = fs.readFileSync(path.join(here, '../../App.jsx'), 'utf8');
  const block = (start, end) => appSrc.slice(appSrc.indexOf(start), appSrc.indexOf(end, appSrc.indexOf(start)));
  const paths = (src) => new Set([...src.matchAll(/path="([^"*]+)"/g)].map((m) => `/${m[1]}`));
  const telecallerRoutes = paths(block("user?.role === 'telecaller' && (", '{/* Admin shell'));
  const ownerRoutes = paths(block('{/* Admin shell', 'export default') + '').add('/');

  test('every page in a role’s navigation is routed for that role (no dead links)', () => {
    for (const i of navItemsFor('telecaller')) assert.ok(telecallerRoutes.has(i.to), `telecaller nav ${i.to} not routed`);
    for (const i of navItemsFor('owner')) assert.ok(ownerRoutes.has(i.to), `owner nav ${i.to} not routed`);
  });

  test('every telecaller route except the phone screens is in telecaller navigation (nothing authorized is hidden)', () => {
    const nav = new Set(navItemsFor('telecaller').map((i) => i.to));
    for (const r of telecallerRoutes) if (!r.startsWith('/m')) assert.ok(nav.has(r), `telecaller route ${r} missing from navigation`);
  });

  test('owner-only pages are neither routed nor shown for a telecaller', () => {
    const ownerOnly = ['/', '/billing', '/invoicing', '/finance', '/salary', '/advances', '/staff', '/owners', '/compliance', '/seo-studio', '/ai-telecaller'];
    const nav = new Set(navItemsFor('telecaller').map((i) => i.to));
    for (const p of ownerOnly) {
      assert.ok(!nav.has(p), `${p} in telecaller nav`);
      assert.ok(!telecallerRoutes.has(p), `${p} routed for telecaller`);
    }
  });

  test('Fleet and Hospitals are authorized for telecallers on main — and stay reachable in More', () => {
    const keys = moreItems('telecaller').map((m) => m.to);
    assert.ok(keys.includes('/fleet') && keys.includes('/hospitals'));
  });

  test('More = SOS first, then every navigation page except Call Logs (the Calls tab)', () => {
    for (const role of ['owner', 'telecaller']) {
      const more = moreItems(role).map((m) => m.to);
      assert.equal(more[0], '/sos');
      const expected = navItemsFor(role).map((i) => i.to).filter((t) => t !== '/call-logs');
      assert.deepEqual([...more].sort(), [...expected].sort(), role);
    }
    assert.ok(moreItems('owner').some((m) => m.to === '/finance'));
    assert.ok(!moreItems('telecaller').some((m) => ['/finance', '/billing', '/staff'].includes(m.to)));
  });

  test('a driver or unknown role gets nothing', () => {
    assert.deepEqual(moreItems('driver'), []);
    assert.deepEqual(moreItems(undefined), []);
    assert.deepEqual(quickActions('driver'), []);
  });

  test('NAV_ACCESS still has the exact groups of main’s sidebar', () => {
    assert.deepEqual(NAV_ACCESS.map((g) => g.id), ['overview', 'operations', 'customers', 'finance', 'management', 'marketing']);
    // 23 on main + "My profile" (WhatsApp introduction, owner + telecaller).
    assert.equal(NAV_ACCESS.flatMap((g) => g.items).length, 24);
    assert.deepEqual(NAV_ACCESS.find((g) => g.id === 'management').items.find((i) => i.to === '/profile'), { label: 'My profile', to: '/profile', roles: ['owner', 'telecaller'] });
  });

  test('quick actions: each a working flow, New lead included now that it exists', () => {
    assert.deepEqual(quickActions('telecaller').map((q) => [q.key, q.label, q.to]), [
      ['call', 'Call', '/call-logs'], ['whatsapp', 'WhatsApp chats', '/whatsapp-conversations'],
      ['newLead', 'New lead', '/m/leads/new'], ['book', 'Book ambulance', '/dispatch'],
    ]);
  });
});

describe('personal My Work badge', () => {
  const leads = { overdue: 9, mineOverdue: 2, unassignedOverdue: 4 };
  const cbs = { overdue: 5, mineOverdue: 1, unassignedOverdue: 3 };
  test('telecaller: only their OWN overdue (leads + callbacks); unassigned kept apart', () => {
    assert.equal(myWorkBadge('telecaller', leads, cbs), 3);
    assert.equal(unassignedOverdue(leads, cbs), 7);
  });
  test('owner: the team overdue, which is what the owner’s My Work lists', () => {
    assert.equal(myWorkBadge('owner', leads, cbs), 14);
  });
  test('a count not loaded (or an older backend without mineOverdue): no badge, never a half number', () => {
    assert.equal(myWorkBadge('telecaller', leads, undefined), 0);
    assert.equal(myWorkBadge('telecaller', { overdue: 3 }, { overdue: 1 }), 0);
    assert.equal(unassignedOverdue(leads, {}), null);
  });
});

describe('Today’s calls (server classification, labelled scope)', () => {
  const perf = {
    team: { incoming: 12, answered: 9, missed: 3 },
    people: [{ user: 'u1', answered: 4, placed: 6, connected: 3 }, { user: 'u2', answered: 5, placed: 2, connected: 1 }],
  };
  test('owner: team figures throughout', () => {
    assert.deepEqual(callsSummary(perf, 'owner', 'o1'), { incoming: 12, missed: 3, outgoing: 8, connected: 9 + 4, scope: 'team' });
  });
  test('telecaller: company-line incoming/missed, and their OWN outgoing / connected', () => {
    assert.deepEqual(callsSummary(perf, 'telecaller', 'u1'), { incoming: 12, missed: 3, outgoing: 6, connected: 4 + 3, scope: 'you' });
  });
  test('no data: null (the screen shows its error state, not zeros)', () => {
    assert.equal(callsSummary(null, 'owner'), null);
    assert.equal(callsSummary({}, 'owner'), null);
  });
  test('the India day starts at 00:00 IST', () => {
    assert.equal(istDayStart(Date.parse('2026-11-22T04:30:00Z')), '2026-11-21T18:30:00.000Z');
  });
});

describe('breakpoint', () => {
  test('430px is included; touch phones to 600px; touch landscape to 950x500', () => {
    assert.match(MOBILE_QUERY, /\(max-width: 430px\)/);
    assert.match(MOBILE_QUERY, /\(pointer: coarse\) and \(max-width: 600px\)/);
    assert.match(MOBILE_QUERY, /\(pointer: coarse\) and \(max-height: 500px\) and \(max-width: 950px\)/);
  });
});

describe('masking: only what the backend sent', () => {
  test('telecaller payload (no full number): the masked one', () => assert.equal(shownPhone(undefined, '••••••4442'), '••••••4442'));
  test('owner payload: formatted full number', () => assert.equal(shownPhone('9986844442', '••••••4442'), '99868 44442'));
  test('neither: a fallback, never "undefined"', () => assert.equal(shownPhone(undefined, undefined), 'No number'));
});

describe('buildMyWork', () => {
  const me = 'u1';
  const lead = (id, dueMs, over = {}) => ({
    _id: id, patientName: `Lead ${id}`, phoneMasked: '••••••0001', assignedTo: me, assignedToName: 'Asha', rev: 3,
    nextFollowUpAt: iso(dueMs), followUp: dueMs < NOW ? 'overdue' : 'today', status: 'contacted', ...over,
  });
  const cb = (id, dueMs, over = {}) => ({
    _id: id, state: 'open', customerMasked: '••••••0002', assignedTo: me, assignedToName: 'Asha', rev: 1,
    due: { dueAt: iso(dueMs), overdue: dueMs < NOW }, lead: { patientName: `Caller ${id}` }, ...over,
  });

  test('overdue first (oldest first), then today (soonest first), leads and callbacks mixed', () => {
    const items = buildMyWork({
      overdueLeads: [lead('L1', NOW - H), lead('L2', NOW - 5 * H)], todayLeads: [lead('L3', NOW + 3 * H)],
      callbacks: [cb('C1', NOW - 2 * H), cb('C2', NOW + H)], role: 'telecaller', userId: me, now: NOW,
    });
    assert.deepEqual(items.map((i) => `${i.id}:${i.overdue ? 'over' : 'today'}`), ['L2:over', 'C1:over', 'L1:over', 'C2:today', 'L3:today']);
  });

  test('each card: masked number, assignee, due time, masked-call target, rev for Assign', () => {
    const [l, c] = buildMyWork({ overdueLeads: [lead('L1', NOW - H)], callbacks: [cb('C1', NOW + H)], role: 'telecaller', userId: me, now: NOW });
    assert.equal(l.phone, '••••••0001');
    assert.deepEqual(l.action, { label: 'Call', target: { leadId: 'L1' } });
    assert.deepEqual(c.action, { label: 'Call back', target: { callbackTaskId: 'C1' } });
    assert.equal(l.rev, 3);
    assert.equal(c.rev, 1);
  });

  test('buckets: telecaller sees mine + unassigned, never another person’s; owner sees all three', () => {
    const input = {
      overdueLeads: [lead('L1', NOW - H), lead('L2', NOW - H, { assignedTo: 'u2', assignedToName: 'Ravi' }), lead('L3', NOW - H, { assignedTo: null, assignedToName: null })],
      callbacks: [cb('C1', NOW - H, { assignedTo: 'u2' }), cb('C2', NOW - H, { assignedTo: null })],
      now: NOW,
    };
    const tc = buildMyWork({ ...input, role: 'telecaller', userId: me });
    assert.deepEqual(tc.map((i) => `${i.id}:${i.bucket}`).sort(), ['C2:unassigned', 'L1:mine', 'L3:unassigned']);
    const own = buildMyWork({ ...input, role: 'owner', userId: 'o1' });
    assert.deepEqual(own.map((i) => `${i.id}:${i.bucket}`).sort(), ['C1:team', 'C2:unassigned', 'L1:team', 'L2:team', 'L3:unassigned']);
  });

  test('tomorrow (IST), resolved / withdrawn callbacks and duplicates are left out', () => {
    const tomorrow = istDayEnd(NOW) + H;
    const items = buildMyWork({
      overdueLeads: [lead('L1', NOW - H)], todayLeads: [lead('L1', NOW - H), lead('L9', tomorrow)],
      callbacks: [cb('C1', NOW - H, { state: 'resolved' }), cb('C3', NOW - H, { state: 'withdrawn' }), cb('C2', tomorrow)],
      role: 'owner', userId: 'o', now: NOW,
    });
    assert.deepEqual(items.map((i) => i.id), ['L1']);
  });

  test('a scheduled callback (nextCallbackAt -> due.dueAt later today) is "today", not overdue', () => {
    const [c] = buildMyWork({ callbacks: [cb('C1', NOW + 2 * H)], role: 'telecaller', userId: me, now: NOW });
    assert.equal(c.overdue, false);
  });

  test('IST day edges: 23:50 IST counts 23:55 as today and 00:05 as tomorrow; just after midnight resets', () => {
    const lateIst = Date.parse('2026-11-22T18:20:00Z'); // 23:50 IST
    const items = buildMyWork({
      todayLeads: [lead('A', lateIst + 5 * 60e3, { followUp: 'today' }), lead('B', lateIst + 15 * 60e3, { followUp: 'upcoming' })],
      role: 'owner', userId: 'o', now: lateIst,
    });
    assert.deepEqual(items.map((i) => i.id), ['A']);
    const earlyIst = Date.parse('2026-11-22T18:35:00Z'); // 00:05 IST, 23 Nov
    assert.equal(new Date(istDayEnd(earlyIst)).toISOString(), '2026-11-23T18:30:00.000Z');
  });

  test('endpoint caps are detected so the screen can say the list may be incomplete', () => {
    const many = (n) => Array.from({ length: n }, (_, i) => ({ _id: `x${i}` }));
    assert.deepEqual(workLimitsHit({ overdueLeads: many(LEAD_VIEW_LIMIT), callbacks: many(10) }), { leads: true, callbacks: false });
    assert.deepEqual(workLimitsHit({ callbacks: many(CALLBACK_OPEN_LIMIT) }), { leads: false, callbacks: true });
    assert.deepEqual(workLimitsHit({}), { leads: false, callbacks: false });
  });

  test('empty input: empty list', () => assert.deepEqual(buildMyWork({ role: 'owner', now: NOW }), []));

  test('a callback returned by two section queries appears once', () => {
    const items = buildMyWork({ callbacks: [cb('C1', NOW - H, { assignedTo: null }), cb('C1', NOW - H, { assignedTo: null })], role: 'owner', userId: 'o', now: NOW });
    assert.deepEqual(items.map((i) => i.id), ['C1']);
  });
});

describe('notifications (derived, no new system)', () => {
  test('overdue follow-ups, overdue callbacks, new leads — each linking to its list', () => {
    const n = notifications({ leads: { overdue: 2, new: 1 }, callbacks: { overdue: 3 } });
    assert.deepEqual(n.items.map((i) => [i.key, i.to]), [['overdue', '/m/leads?view=overdue'], ['callbacks', '/callbacks'], ['new', '/m/leads?status=new']]);
    assert.match(n.items[0].text, /across the team$/); // team-wide count, opening the list with exactly that number
  });
  test('nothing due, or nothing loaded: no items', () => {
    assert.equal(notifications({ leads: { overdue: 0, new: 0 }, callbacks: { overdue: 0 } }).count, 0);
    assert.equal(notifications({}).count, 0);
  });
});

describe('leadListQuery', () => {
  test('URL filter is whitelisted; anything else falls back to New', () => {
    assert.equal(leadListQuery('?view=due_today').key, 'due_today');
    assert.equal(leadListQuery('?status=new').key, 'new');
    assert.equal(leadListQuery('?view=%24ne').key, 'new');
    assert.equal(leadListQuery('').key, 'new');
  });
});

describe('time helpers (India time)', () => {
  test('istDayEnd is the next IST midnight', () => assert.equal(new Date(istDayEnd(NOW)).toISOString(), '2026-11-22T18:30:00.000Z'));
  test('dueLabel: today shows only the time, yesterday says so', () => {
    assert.match(dueLabel(NOW + H, NOW), /^11:00\s?am$/i);
    assert.match(dueLabel(NOW - 20 * H, NOW), /^Yesterday /);
    assert.equal(dueLabel(NaN, NOW), '—');
  });
});

describe('leadHistoryRows', () => {
  test('notes and history merged, newest first', () => {
    const rows = leadHistoryRows({
      followUpNotes: [{ at: iso(NOW - 3 * H), text: 'Call after 6', byName: 'Asha' }],
      history: [{ at: iso(NOW - H), type: 'status', byName: 'Ravi', detail: { from: 'new', to: 'contacted' } }],
    });
    assert.deepEqual(rows.map((r) => [r.text, r.by, r.note]), [['Status new → contacted', 'Ravi', false], ['Call after 6', 'Asha', true]]);
    assert.deepEqual(leadHistoryRows(null), []);
    assert.equal(leadHistoryRows({ history: [{ at: iso(NOW), type: 'created', byName: 'Asha', detail: { source: 'walk_in' } }] })[0].text, 'Lead added by hand (walk in)');
  });
});
