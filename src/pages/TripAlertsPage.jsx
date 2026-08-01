// src/pages/TripAlertsPage.jsx
import React, { useEffect, useState } from 'react';
import { tripCallEventsApi, authApi } from '../api/client';
import { PageHeader, Badge, Spinner, Empty, Select } from '../components/ui';
import { AlertTriangle, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

const POLL_MS = 30000;

const todayStr = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD, local page's own "today"

const EVENT_MAP = {
  PUSH_SENT   : { color: 'blue',  label: 'Sent' },
  ACCEPTED    : { color: 'green', label: 'Accepted' },
  REJECTED    : { color: 'red',   label: 'Rejected' },
  NO_RESPONSE : { color: 'red',   label: 'No Response' },
};

// Same dd/mm/yyyy hh:mm shape as TripsPage's fmt() in AllPages.jsx.
const fmt = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

export default function TripAlertsPage() {
  const [events,     setEvents]     = useState([]);
  const [drivers,    setDrivers]    = useState({}); // driverId -> user doc
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [date,       setDate]       = useState(todayStr());
  const [driverId,   setDriverId]   = useState('');

  // Drivers list is unfiltered/unpaginated (routes/auth.js) — safe to
  // fetch once, not per-poll. tripId is deliberately NOT joined against
  // GET /api/trips here: that endpoint's date filter is on createdAt
  // (booking time) while these events are dispatch/response time — a
  // trip booked one day and dispatched the next would silently vanish
  // from the join. Raw tripId (last 6 chars) is shown instead.
  useEffect(() => {
    authApi.getUsers({ role: 'driver' }).then(({ data }) => {
      const map = {};
      (data.users || []).forEach((u) => { map[u._id] = u; });
      setDrivers(map);
    }).catch(() => { /* driver names just show as "Unknown driver" */ });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, driverId]);

  const load = async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { driverId: driverId || undefined };
      // Backend does `new Date(to)` directly — without an explicit
      // end-of-day time, to=date would mean midnight, excluding almost
      // the entire selected day.
      params.from = `${date}T00:00:00.000`;
      params.to   = `${date}T23:59:59.999`;

      const { data } = await tripCallEventsApi.getAll(params);
      let list = data.events || [];

      // NO_RESPONSE is a live "stuck right now" snapshot (see backend
      // getEvents) — it ignores from/to entirely. Showing it while
      // browsing a past date would misleadingly suggest something is
      // stuck right now when the driver may have responded hours ago.
      if (date !== todayStr()) {
        list = list.filter((e) => e.type !== 'NO_RESPONSE');
      }

      // NO_RESPONSE rows always float to the top regardless of timestamp
      // — those are the ones that need attention right now. Everything
      // else stays newest-first (already the order the API returns).
      list = [...list].sort((a, b) => {
        const aNr = a.type === 'NO_RESPONSE', bNr = b.type === 'NO_RESPONSE';
        if (aNr !== bNr) return aNr ? -1 : 1;
        return new Date(b.at) - new Date(a.at);
      });

      setEvents(list);
      setError(null);
      setLoadedOnce(true);
    } catch (e) {
      // Same convention as SosAlertsPage — a failed poll must never wipe
      // last-known-good data off the screen.
      setError(e.response?.data?.message || e.message || 'Could not load trip alerts.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const copyTripId = (tripId) => {
    navigator.clipboard?.writeText(tripId).then(
      () => toast.success('Trip ID copied'),
      () => toast.error('Could not copy trip ID'),
    );
  };

  const driverList = Object.values(drivers).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const sentCount    = events.filter((e) => e.type === 'PUSH_SENT').length;
  const acceptedCount = events.filter((e) => e.type === 'ACCEPTED').length;
  const noResponseCount = events.filter((e) => e.type === 'NO_RESPONSE').length;
  const dayLabel = date === todayStr() ? 'Today' : date;

  return (
    <div className="page-enter">
      <PageHeader title="Trip Alerts" subtitle="Push delivery -> driver response, straight from the phone's own Telecom call state" />

      <div className="card mb-4">
        <div className="text-sm font-medium">
          {dayLabel}: <span style={{ color: 'var(--blue)' }}>{sentCount} dispatched</span>
          {' · '}
          <span style={{ color: 'var(--accent)' }}>{acceptedCount} accepted</span>
          {' · '}
          <span style={{ color: 'var(--red)' }}>{noResponseCount} no response</span>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-end mb-5">
        <div>
          <label className="block text-xs font-semibold mb-1 tracking-wide uppercase" style={{ color: 'var(--text2)' }}>Date</label>
          <input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Select label="Driver" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">All drivers</option>
          {driverList.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="card mb-4" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--red)' }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {loadedOnce && events.length === 0 && !error && (
            <Empty icon="✅" message="No trip alerts for this selection" />
          )}

          {events.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  <th>Trip</th><th>Driver</th><th>Event</th><th>Time</th>
                </tr></thead>
                <tbody>
                  {events.map((e, i) => {
                    const isNoResponse = e.type === 'NO_RESPONSE';
                    const em = EVENT_MAP[e.type] || { color: 'gray', label: e.type };
                    return (
                      <tr key={`${e.tripId}-${e.type}-${e.at}-${i}`}
                        style={isNoResponse ? { background: 'rgba(255,77,109,.06)' } : undefined}>
                        <td>
                          <button
                            onClick={() => copyTripId(e.tripId)}
                            className="inline-flex items-center gap-1.5 font-mono text-xs"
                            style={{ color: 'var(--text2)' }}
                            title="Copy full trip ID — there's no trip detail page in the CRM yet"
                          >
                            {String(e.tripId).slice(-6)}
                            <Copy size={11} />
                          </button>
                        </td>
                        <td className="text-sm">{drivers[e.driverId]?.name || 'Unknown driver'}</td>
                        <td><Badge color={em.color}>{em.label}</Badge></td>
                        <td className="text-xs font-mono" style={{ color: 'var(--text3)' }}>
                          {isNoResponse
                            ? `dispatched ${fmt(e.at)} — still no response`
                            : fmt(e.at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
