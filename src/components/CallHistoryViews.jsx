// src/components/CallHistoryViews.jsx
//
// Call Logs → "All call events" and "By customer" (read-only).
//   All call events  every call RECORD, newest first, as the existing call
//                    cards (CallLogList: recording player, Call back, View
//                    customer), paged with Load more — GET /api/calls/history.
//                    Totals state records AND calls; a record that is one of
//                    several for the same call (a replayed Plivo report) says
//                    so, with the call's outcome — it is counted once.
//   By customer      one row per customer number with its call counts, last
//                    call and last conversation; "View customer" opens the
//                    existing customer overview — GET /api/calls/customers.
// Search, date, staff, direction and outcome filters all run on the server,
// and the totals cover everything that matches (not just the loaded page).
// The outcome filter is the CALL's outcome (a replayed "missed" record of an
// answered call is not listed under Missed). A name search covers every
// enquiry and booking; the server says how many numbers it matched.
// Numbers are masked unless the server sent them in full (owner only); the
// paging cursor is opaque and never carries a number.
// Broad views open on the last 30 days (All time stays available — it
// groups every call and can take several seconds). The selected period is
// always shown, in India dates; loading, errors (with Retry) are shown; a
// reply for an older filter never overwrites a newer one.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { callsApi } from '../api/client';
import { Spinner, fmtDateTime } from './ui';
import CallLogList from './CallLogList';
import { periodLabel } from './callPeriod.mjs';

const PERIODS = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time'], ['custom', 'Dates…']];
const DIRECTIONS = [['', 'All directions'], ['incoming', 'Incoming'], ['outgoing', 'Outgoing'], ['driver', 'Driver ↔ customer']];
const OUTCOMES = {
  '': [['', 'Any outcome'], ['answered', 'Answered (incoming)'], ['missed', 'Missed (incoming)'], ['unconfirmed', 'Status unconfirmed (incoming)'], ['in_progress', 'In progress (incoming)'], ['connected', 'Connected (outgoing)'], ['not_connected', 'Not connected (outgoing)']],
  incoming: [['', 'Any outcome'], ['answered', 'Answered'], ['missed', 'Missed'], ['unconfirmed', 'Status unconfirmed'], ['in_progress', 'In progress']],
  outgoing: [['', 'Any outcome'], ['connected', 'Connected'], ['not_connected', 'Not connected']],
  driver: [['', 'Any outcome']],
};
const OUTCOME_LABEL = { answered: 'Answered', missed: 'Missed', unconfirmed: 'Status unconfirmed', in_progress: 'In progress', connected: 'Connected', not_connected: 'Not connected' };
const PERIOD_NOTE = { today: 'today (India time)', '7d': 'in the last 7 days (India time)', '30d': 'in the last 30 days (India time)', all: 'all time' };

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function CallFilters({ f, setF, isOwner, people, user }) {
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value, ...(k === 'direction' ? { outcome: '' } : {}) }));
  return (
    <div className="card-sm mb-4 flex flex-wrap items-end gap-2" data-call-filters>
      <label className="flex-1 min-w-[180px]">
        <span className="block text-[11px] mb-1" style={{ color: 'var(--text3)' }}>Search</span>
        <span className="relative block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} aria-hidden="true" />
          <input className="inp py-1.5 text-sm w-full" style={{ paddingLeft: 30 }} placeholder="Name, or last digits of the number"
            value={f.q} onChange={set('q')} aria-label="Search by name or number" />
        </span>
      </label>
      <label>
        <span className="block text-[11px] mb-1" style={{ color: 'var(--text3)' }}>Period</span>
        <select className="inp py-1.5 text-sm" value={f.period} onChange={set('period')} aria-label="Period">
          {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {f.period === 'custom' && (
        <>
          <label><span className="block text-[11px] mb-1" style={{ color: 'var(--text3)' }}>From</span>
            <input type="date" className="inp py-1.5 text-sm" value={f.from} onChange={set('from')} aria-label="From date" /></label>
          <label><span className="block text-[11px] mb-1" style={{ color: 'var(--text3)' }}>To</span>
            <input type="date" className="inp py-1.5 text-sm" value={f.to} onChange={set('to')} aria-label="To date" /></label>
        </>
      )}
      <label>
        <span className="block text-[11px] mb-1" style={{ color: 'var(--text3)' }}>Staff</span>
        {isOwner ? (
          <select className="inp py-1.5 text-sm" value={f.staff} onChange={set('staff')} aria-label="Staff">
            <option value="">All staff</option>
            {people.map((p) => <option key={p.user} value={p.user}>{p.name}</option>)}
          </select>
        ) : (
          <span className="flex items-center gap-1.5 text-sm py-1.5" style={{ color: 'var(--text2)' }}>
            <input type="checkbox" checked={!!f.staff} onChange={(e) => setF((p) => ({ ...p, staff: e.target.checked ? String(user?._id || user?.id || '') : '' }))} />
            Only my calls
          </span>
        )}
      </label>
      <label>
        <span className="block text-[11px] mb-1" style={{ color: 'var(--text3)' }}>Direction</span>
        <select className="inp py-1.5 text-sm" value={f.direction} onChange={set('direction')} aria-label="Direction">
          {DIRECTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>
        <span className="block text-[11px] mb-1" style={{ color: 'var(--text3)' }}>Outcome</span>
        <select className="inp py-1.5 text-sm" value={f.outcome} onChange={set('outcome')} aria-label="Outcome" disabled={f.direction === 'driver'}>
          {OUTCOMES[f.direction].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
    </div>
  );
}

// Filter state -> API params (only what is set).
function paramsOf(f) {
  const p = {};
  const q = f.q.trim();
  if (q) p.q = q;
  if (f.period === 'custom') { if (f.from) p.from = f.from; if (f.to) p.to = f.to; } else if (f.period !== 'all') p.period = f.period;
  if (f.staff) p.staff = f.staff;
  if (f.direction) p.direction = f.direction;
  if (f.outcome) p.outcome = f.outcome;
  return p;
}
const searchTooShort = (f) => { const q = f.q.trim(); return q && q.replace(/\D/g, '').length < 3 && q.length < 2; };

// Loads page 1 when the filters change, more on demand. Every request gets a
// sequence number; a reply is applied only if no newer request (another
// filter, a retry) has started since — so a slow All-time reply can never
// overwrite the 7-days result asked for after it.
function usePaged(fetcher, f) {
  const [st, setSt] = useState({ status: 'loading', items: [], sameCall: {}, next: null, meta: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const debouncedQ = useDebounced(f.q, 400);
  const key = JSON.stringify(paramsOf({ ...f, q: debouncedQ }));
  useEffect(() => {
    if (searchTooShort({ ...f, q: debouncedQ })) {
      seq.current += 1; // drop any reply still on its way
      setSt({ status: 'ready', items: [], sameCall: {}, next: null, meta: null, error: 'Type at least 2 letters or 3 digits.', retryable: false });
      return;
    }
    const id = ++seq.current;
    setSt((s) => ({ ...s, status: 'loading', error: null }));
    fetcher(JSON.parse(key))
      .then(({ items, sameCall, next, meta }) => { if (id === seq.current) setSt({ status: 'ready', items, sameCall: sameCall || {}, next, meta, error: null }); })
      .catch((e) => { if (id === seq.current) setSt({ status: 'ready', items: [], sameCall: {}, next: null, meta: null, error: e?.response?.data?.message || 'Could not load the calls.', retryable: true }); });
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = async () => {
    if (!st.next) return;
    const id = seq.current;
    setSt((s) => ({ ...s, status: 'more' }));
    try {
      const r = await fetcher({ ...JSON.parse(key), cursor: st.next });
      if (id === seq.current) setSt((s) => ({ ...s, status: 'ready', items: [...s.items, ...r.items], sameCall: { ...s.sameCall, ...(r.sameCall || {}) }, next: r.next }));
    } catch (e) {
      if (id === seq.current) setSt((s) => ({ ...s, status: 'ready', error: e?.response?.data?.message || 'Could not load more.', retryable: 'more' }));
    }
  };
  // Retry: page 1 again, or the failed "Load more" (keeping what is shown).
  const retry = () => (st.retryable === 'more' ? more() : setAttempt((n) => n + 1));
  return [st, more, retry];
}

// The selected period, always visible (also while loading).
function PeriodLine({ f }) {
  const p = periodLabel(f);
  return (
    <div className="text-xs mb-2" data-period-line style={{ color: 'var(--text2)' }}>
      Period: <b>{p.name}</b> <span style={{ color: 'var(--text3)' }}>· {p.range}</span>
    </div>
  );
}

// Loading, or an error with Retry.
function LoadState({ st, f, retry, what }) {
  if (st.status === 'loading') {
    return (
      <div className="card-sm mb-3 text-sm flex items-center gap-3" data-loading style={{ color: 'var(--text2)' }}>
        <Spinner />
        <span>Loading {what} for {periodLabel(f).name.toLowerCase()}…{f.period === 'all' ? ' All time counts every call on record and can take several seconds.' : ''}</span>
      </div>
    );
  }
  if (!st.error) return null;
  return (
    <div className="card-sm mb-3 text-sm flex flex-wrap items-center gap-3" data-load-error style={{ color: 'var(--red)' }}>
      <span>{st.error}</span>
      {st.retryable && (
        <button type="button" onClick={retry} className="px-3 py-1 rounded-lg text-xs font-semibold" data-retry
          style={{ background: 'var(--surface2)', color: 'var(--text)' }}>Retry</button>
      )}
    </div>
  );
}

const fetchEvents = async (params) => {
  const { data } = await callsApi.history({ ...params, limit: 50 });
  return { items: data.logs || [], sameCall: data.sameCall || {}, next: data.nextCursor || null, meta: data.total != null ? { total: data.total, logicalCalls: data.logicalCalls, counts: data.counts, search: data.search || null } : null };
};
const fetchCustomers = async (params) => {
  const { data } = await callsApi.customers({ ...params, limit: 30 });
  return { items: data.customers || [], next: data.nextCursor || null, meta: { total: data.total, search: data.search || null } };
};

// "Matched N customer numbers": a name search is complete, and says so.
function SearchNote({ search }) {
  if (search?.by !== 'name') return null;
  return <span style={{ color: 'var(--text3)' }}> · name matched {search.numbers} customer number{search.numbers === 1 ? '' : 's'} (every enquiry and booking searched)</span>;
}

// One record that is one of several for the same call (a replayed report).
function SameCallNote({ m }) {
  return (
    <div className="text-[11px] mb-1 px-2 py-1 rounded-lg" data-same-call style={{ background: 'rgba(255,184,0,.1)', color: 'var(--text2)' }}>
      Record of a call Plivo reported {m.records} times — counted once{OUTCOME_LABEL[m.outcome] ? <>, as <b>{OUTCOME_LABEL[m.outcome]}</b></> : null}
    </div>
  );
}

function MoreButton({ st, onMore, label }) {
  if (!st.next) return null;
  return (
    <div className="text-center mt-3">
      <button type="button" onClick={onMore} disabled={st.status === 'more'} className="px-4 py-2 rounded-xl text-sm font-semibold"
        style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
        {st.status === 'more' ? 'Loading…' : label}
      </button>
    </div>
  );
}

export function AllCallEvents({ f }) {
  const [st, more, retry] = usePaged(fetchEvents, f);
  // This filter's totals only (kept while more pages load; cleared on a new
  // filter or an error — never an older filter's numbers).
  const m = st.status === 'loading' ? null : st.meta;
  const c = m?.counts;
  return (
    <div data-view="all-events">
      <PeriodLine f={f} />
      {m && (
        <div className="text-xs mb-3" style={{ color: 'var(--text2)' }} data-events-summary>
          <b>{m.total}</b> call record{m.total === 1 ? '' : 's'} {PERIOD_NOTE[f.period] || 'in the chosen dates'}
          {c && <> · {m.logicalCalls} call{m.logicalCalls === 1 ? '' : 's'}: incoming {c.incoming.total} ({c.incoming.answered} answered, {c.incoming.missed} missed{c.incoming.unconfirmed ? `, ${c.incoming.unconfirmed} unconfirmed` : ''}) · outgoing {c.outgoing.attempts} ({c.outgoing.connected} connected){c.driverCalls ? ` · driver ↔ customer ${c.driverCalls}` : ''}</>}
          {st.items.length < m.total && <span style={{ color: 'var(--text3)' }}> · showing {st.items.length}</span>}
          <SearchNote search={m.search} />
          <div style={{ color: 'var(--text3)' }} data-records-note>
            Each row is one call record.{m.total > m.logicalCalls ? ` ${m.total - m.logicalCalls} record${m.total - m.logicalCalls === 1 ? ' is a repeat' : 's are repeats'} of a call already listed (Plivo reported it twice) — counted once in the calls and customer totals.` : ''}
            {f.outcome ? ' Outcome is the call’s final outcome.' : ''}
          </div>
        </div>
      )}
      <LoadState st={st} f={f} retry={retry} what="call records" />
      {st.status === 'loading' ? null
        : !st.items.length ? (st.error ? null : <CallLogList logs={[]} emptyText="No calls match these filters." />)
          : (
            <div className="flex flex-col gap-2">
              {st.items.map((log) => (
                <div key={log._id}>
                  {st.sameCall[log._id] && <SameCallNote m={st.sameCall[log._id]} />}
                  <CallLogList logs={[log]} />
                </div>
              ))}
            </div>
          )}
      <MoreButton st={st} onMore={more} label="Load more call records" />
    </div>
  );
}

export function CallsByCustomer({ f }) {
  const [st, more, retry] = usePaged(fetchCustomers, f);
  return (
    <div data-view="by-customer">
      <PeriodLine f={f} />
      {st.meta && st.status !== 'loading' && (
        <div className="text-xs mb-3" style={{ color: 'var(--text2)' }}>
          <b>{st.meta.total}</b> customer{st.meta.total === 1 ? '' : 's'} with calls {PERIOD_NOTE[f.period] || 'in the chosen dates'}
          {st.items.length < st.meta.total && <span style={{ color: 'var(--text3)' }}> · showing {st.items.length}</span>}
          <span style={{ color: 'var(--text3)' }}> · grouped by number, never merged by name · counts are calls, each counted once</span>
          <SearchNote search={st.meta.search} />
        </div>
      )}
      <LoadState st={st} f={f} retry={retry} what="customers" />
      {st.status === 'loading' ? null : st.items.length === 0 ? (
        st.error ? null : <div className="card text-sm" style={{ color: 'var(--text3)' }}>No customers match these filters.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Calls</th><th>Customer called</th><th>We called</th><th>Last call</th><th>Last spoke</th><th /></tr></thead>
            <tbody>
              {st.items.map((r) => (
                <tr key={r.customerRef} data-customer-row>
                  <td>
                    <div className="font-medium text-sm">{r.names.length ? r.names.join(' / ') : <span style={{ color: 'var(--text3)' }}>No name on record</span>}</div>
                    <div className="text-xs font-mono" style={{ color: 'var(--text3)' }}>{r.customerPhone || r.customerMasked}</div>
                    {r.sharedNumber && <span className="badge badge-amber text-[10px]">Shared number</span>}
                  </td>
                  <td className="font-bold">{r.calls}{r.driverCalls ? <span className="block text-[11px] font-normal" style={{ color: 'var(--text3)' }}>incl. {r.driverCalls} driver</span> : null}</td>
                  <td className="text-sm">{r.incoming.total}<span className="block text-[11px]" style={{ color: 'var(--text3)' }}>{r.incoming.answered} answered · <span style={r.incoming.missed ? { color: 'var(--red)' } : undefined}>{r.incoming.missed} missed</span></span></td>
                  <td className="text-sm">{r.outgoing.attempts}<span className="block text-[11px]" style={{ color: 'var(--text3)' }}>{r.outgoing.connected} connected</span></td>
                  <td className="text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text2)' }}>{fmtDateTime(r.lastCallAt)}</td>
                  <td className="text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text2)' }}>{r.lastConnectedAt ? fmtDateTime(r.lastConnectedAt) : '—'}</td>
                  <td><Link to={`/customer/${encodeURIComponent(r.customerRef)}`} className="text-xs font-semibold underline whitespace-nowrap" style={{ color: 'var(--accent)' }}>View customer</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MoreButton st={st} onMore={more} label="Load more customers" />
    </div>
  );
}

export const EMPTY_FILTERS = { q: '', period: '30d', from: '', to: '', staff: '', direction: '', outcome: '' };
