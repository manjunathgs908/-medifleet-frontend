// src/mobile/work.js — loading "My Work" from the server-filtered, paged APIs.
//
// Every request is filtered on the server BEFORE paging (assignee, due), so
// nothing is hidden behind a list cap: each source reports its true total,
// and when a source has more than was loaded the screen offers "View all".
//
//   telecaller  mine:       leads overdue/due_today assignedTo=<me>, callbacks assignee=me
//               unassigned: leads ... assignedTo=none,               callbacks assignee=unassigned
//   owner       everyone's: leads overdue/due_today (all),           callbacks assignee=all
//               (buildMyWork splits out the unassigned ones)
// Due = overdue or later today, India day, the same rules the badge counts use.
import { leadsApi, callbacksApi } from '../api/client';
import { buildMyWork } from './logic.mjs';

export async function loadMyWork({ role, userId, limit = 25 }) {
  const owner = role === 'owner';
  const L = (view, assignedTo) => leadsApi.page({ view, page: 1, limit, ...(assignedTo ? { assignedTo } : {}) });
  const C = (assignee) => callbacksApi.page({ assignee, due: 'due', page: 1, limit });

  const leadReqs = owner
    ? [L('overdue'), L('due_today')]
    : [L('overdue', userId), L('due_today', userId), L('overdue', 'none'), L('due_today', 'none')];
  const cbReqs = owner ? [C('all')] : [C('me'), C('unassigned')];

  // Leads must load; callbacks may fail on their own (the screen says so).
  const leads = await Promise.all(leadReqs);
  const cbs = await Promise.all(cbReqs.map((p) => p.catch(() => null)));
  const callbacksFailed = cbs.some((r) => r === null);

  const overdueLeads = [leads[0], leads[2]].filter(Boolean).flatMap((r) => r.data.leads || []);
  const todayLeads = [leads[1], leads[3]].filter(Boolean).flatMap((r) => r.data.leads || []);
  const callbacks = cbs.filter(Boolean).flatMap((r) => r.data.tasks || []);
  const items = buildMyWork({ overdueLeads, todayLeads, callbacks, role, userId });

  const total = (rs) => rs.filter(Boolean).reduce((s, r) => s + (r.data.page?.total || 0), 0);
  const more = (rs) => rs.filter(Boolean).some((r) => r.data.page?.hasMore);
  return {
    items,
    callbacksFailed,
    // Totals from the server, independent of how many were loaded.
    totals: owner
      ? { all: total(leads) + total(cbs) }
      : { mine: total([leads[0], leads[1], cbs[0]]), unassigned: total([leads[2], leads[3], cbs[1]]) },
    hasMore: {
      leads: more(leads),
      callbacks: more(cbs),
      mine: owner ? more([...leads, ...cbs]) : more([leads[0], leads[1], cbs[0]]),
      unassigned: owner ? false : more([leads[2], leads[3], cbs[1]]),
    },
  };
}
