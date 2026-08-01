// src/pages/PostingAlertsPage.jsx
import React, { useEffect, useState } from 'react';
import { geofenceEventsApi, authApi } from '../api/client';
import { PageHeader, Badge, Spinner, Empty, Select } from '../components/ui';
import { AlertTriangle } from 'lucide-react';

const POLL_MS = 30000;

const todayStr = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD, local page's own "today"

const EVENT_MAP = {
  LEFT_POSTING       : { color: 'red',   label: 'Left Posting' },
  RETURNED_TO_POSTING: { color: 'green', label: 'Returned' },
};

// Same dd/mm/yyyy hh:mm shape as TripAlertsPage's fmt().
const fmt = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

export default function PostingAlertsPage() {
  const [events,     setEvents]     = useState([]);
  const [drivers,    setDrivers]    = useState({}); // driverId -> user doc
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [date,       setDate]       = useState(todayStr());
  const [driverId,   setDriverId]   = useState('');

  // Same pattern as TripAlertsPage — drivers list is unfiltered/
  // unpaginated (routes/auth.js), safe to fetch once, not per-poll.
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

      const { data } = await geofenceEventsApi.getAll(params);
      setEvents(data.events || []);
      setError(null);
      setLoadedOnce(true);
    } catch (e) {
      // Same convention as TripAlertsPage/SosAlertsPage — a failed poll
      // must never wipe last-known-good data off the screen.
      setError(e.response?.data?.message || e.message || 'Could not load posting alerts.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const driverList = Object.values(drivers).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="page-enter">
      <PageHeader title="Posting Alerts" subtitle="Fixed-posting geofence crossings — recording only, no salary or notification tied to these yet" />

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
            <Empty icon="✅" message="No posting alerts for this selection" />
          )}

          {events.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  <th>Driver</th><th>Event</th><th>Time</th><th>Distance</th>
                </tr></thead>
                <tbody>
                  {events.map((e, i) => {
                    const em = EVENT_MAP[e.type] || { color: 'gray', label: e.type };
                    const distance = e.meta?.distanceMeters;
                    return (
                      <tr key={`${e.driverId}-${e.type}-${e.at}-${i}`}>
                        <td className="text-sm">{drivers[e.driverId]?.name || 'Unknown driver'}</td>
                        <td><Badge color={em.color}>{em.label}</Badge></td>
                        <td className="text-xs font-mono" style={{ color: 'var(--text3)' }}>{fmt(e.at)}</td>
                        <td className="text-xs font-mono" style={{ color: 'var(--text2)' }}>
                          {distance != null ? `${distance}m` : '—'}
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
