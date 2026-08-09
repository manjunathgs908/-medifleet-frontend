// src/pages/WhatsappConversationsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { whatsappConversationsApi } from '../api/client';
import { PageHeader, Spinner, Empty } from '../components/ui';
import { AlertTriangle, Phone } from 'lucide-react';

const POLL_MS = 30000;

const DAY_OPTIONS = [
  { key: 1,  label: '1 day' },
  { key: 7,  label: '7 days' },
  { key: 30, label: '30 days' },
];

// The count chips ("Total/Live/Dropped/Completed") filter the already-fetched
// list client-side rather than triggering a refetch per tap -- the API's
// `status` param only knows all/dropped/completed (see
// routes/whatsappRoutes.js's /conversations), it has no server-side concept
// of "live" at all, so every chip (including Dropped/Completed) is applied
// here uniformly against the one status=all fetch instead of mixing
// server-filtered and client-filtered chips.
const CHIPS = [
  { key: 'total',     label: 'Total' },
  { key: 'live',      label: 'Live' },
  { key: 'dropped',   label: 'Dropped' },
  { key: 'completed', label: 'Completed' },
];

// Mutually exclusive: every conversation is exactly one of live/dropped/
// completed (Total is the whole set, not a fourth partition) -- a
// still-live conversation must never also count as dropped just because
// it hasn't completed yet.
function matchesChip(row, chip) {
  if (chip === 'live')      return row.isLive;
  if (chip === 'dropped')   return !row.completed && !row.isLive;
  if (chip === 'completed') return row.completed;
  return true; // total
}

// "4 min ago" / "2 hrs ago" -- the API already computes minutesSince as a
// plain number (routes/whatsappRoutes.js's /conversations), not an ISO
// date, so this formats that number directly rather than the "Xm ago"
// re-derived-from-a-date shape WhatsappLeadsPage/SosAlertsPage's elapsed()
// helpers use.
function friendlyMinutes(mins) {
  if (mins == null) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
}

// green while the session is still live regardless of completed (a phone
// can complete a booking and immediately start a fresh conversation within
// the same window) -- grey only once it's both done AND no longer live,
// amber for everything else (mid-flow, session gone -- abandoned).
function StatusDot({ row }) {
  const color = row.isLive ? 'var(--accent)' : row.completed ? 'var(--text3)' : 'var(--amber)';
  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />;
}

export default function WhatsappConversationsPage() {
  const [conversations, setConversations] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [loadedOnce,   setLoadedOnce]   = useState(false);
  const [days,         setDays]         = useState(7);
  const [chip,         setChip]         = useState('total');
  const intervalRef = useRef();

  // Re-runs on day-range change: fetches immediately (non-silent, so
  // switching the range shows a spinner), then resumes background polling
  // on the new range. Same silent/loadedOnce/error handling as
  // WhatsappLeadsPage/SosAlertsPage. Chip taps do NOT re-run this --
  // they're a pure client-side filter over what's already loaded.
  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [days]);

  const load = async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await whatsappConversationsApi.getAll({ days, status: 'all' });
      // Counts are derived client-side from this same array (see the
      // `counts` useMemo below) rather than read from data.counts -- the
      // API's counts.dropped still uses "not completed" (includes live
      // conversations), which doesn't match the mutually-exclusive
      // live/dropped/completed split this page needs.
      setConversations(data.conversations || []);
      setError(null);
      setLoadedOnce(true);
    } catch (e) {
      // Deliberately does NOT clear conversations here -- a failed
      // fetch must never be indistinguishable from "no conversations".
      // Last-known-good data (if any) stays on screen under the error banner.
      setError(e.response?.data?.message || e.message || 'Could not load WhatsApp conversations.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const filtered = useMemo(
    () => conversations.filter((c) => matchesChip(c, chip)),
    [conversations, chip]
  );

  // Same three checks as matchesChip, applied once per conversation instead
  // of re-filtering the array four times. Total + live + dropped +
  // completed won't reconcile as a simple sum -- Total is the whole set,
  // the other three partition it.
  const counts = useMemo(() => {
    const result = { total: conversations.length, live: 0, dropped: 0, completed: 0 };
    for (const c of conversations) {
      if (c.isLive) result.live += 1;
      if (!c.completed && !c.isLive) result.dropped += 1;
      if (c.completed) result.completed += 1;
    }
    return result;
  }, [conversations]);

  const chipLabel = CHIPS.find((c) => c.key === chip)?.label.toLowerCase();
  const dayLabel = `${days} day${days === 1 ? '' : 's'}`;
  const emptyMessage = chip === 'total'
    ? `No WhatsApp conversations in the last ${dayLabel}`
    : `No ${chipLabel} conversations in the last ${dayLabel}`;

  return (
    <div className="page-enter">
      <PageHeader title="WhatsApp Chats" subtitle="Every customer conversation with the WhatsApp booking bot -- live, dropped off, or completed" />

      {error && (
        <div className="card mb-4" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--red)' }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        </div>
      )}

      {/* Count chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChip(c.key)}
            className="card-sm text-left transition-all"
            style={{
              borderColor: chip === c.key ? 'var(--accent)' : 'var(--border)',
              background : chip === c.key ? 'rgba(0,212,170,.08)' : 'var(--surface)',
            }}
          >
            <div className="text-xs font-semibold tracking-widest" style={{ color: 'var(--text3)' }}>
              {c.label.toUpperCase()}
            </div>
            <div className="text-xl font-bold font-mono mt-0.5"
              style={{ color: chip === c.key ? 'var(--accent)' : 'var(--text)' }}>
              {counts[c.key] ?? 0}
            </div>
          </button>
        ))}
      </div>

      {/* Day range */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'var(--surface)', width: 'fit-content' }}>
        {DAY_OPTIONS.map((d) => (
          <button key={d.key}
            onClick={() => setDays(d.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${days === d.key
                ? 'text-[var(--text)] bg-[var(--surface2)]'
                : 'text-[var(--text3)] hover:text-[var(--text2)]'
              }`}>
            {d.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {loadedOnce && filtered.length === 0 && !error && (
            <Empty icon="💬" message={emptyMessage} />
          )}

          {filtered.length > 0 && (
            <div className="flex flex-col gap-3">
              {filtered.map((c) => (
                <div key={c.phone} className="card">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-2"><StatusDot row={c} /></div>
                      <div className="min-w-0">
                        <div className="text-xl font-bold font-mono truncate">{c.phone}</div>
                        <div className="text-sm mt-1" style={{ color: 'var(--text2)' }}>{c.lastStepLabel}</div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {c.serviceLabel && (
                            <span className="text-xs inline-flex items-center px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(59,158,255,.12)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.3)' }}>
                              {c.serviceLabel}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: 'var(--text3)' }}>
                            {friendlyMinutes(c.minutesSince)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <a href={`tel:${c.phone}`}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-bold flex-shrink-0 w-full sm:w-auto"
                      style={{ background: 'rgba(0,212,170,.14)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,.35)' }}>
                      <Phone size={16} /> Call
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
