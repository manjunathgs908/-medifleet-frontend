// src/pages/SosAlertsPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { sosApi } from '../api/client';
import { PageHeader, Btn, Spinner, Empty } from '../components/ui';
import { AlertTriangle, Phone, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

const POLL_MS = 30000;

// Same "Xm ago" / "Xh Ym ago" shape as DispatchPage.jsx's elapsed() helper,
// kept local here since no shared time-formatting util exists yet.
const elapsed = (iso) => {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
};

export default function SosAlertsPage() {
  const [alerts,    setAlerts]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const intervalRef = useRef();

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, []);

  // silent:true is used for the background poll — it must never flip the
  // page back to the full-screen spinner, only refresh data in place.
  const load = async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await sosApi.getAll();
      setAlerts(data.alerts || []);
      setError(null);
      setLoadedOnce(true);
    } catch (e) {
      // Deliberately does NOT clear `alerts` here — a failed fetch must
      // never be indistinguishable from "no active alerts". Last-known-good
      // data (if any) stays on screen under the error banner.
      setError(e.response?.data?.message || e.message || 'Could not load SOS alerts.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const resolve = async (alert) => {
    setResolvingId(alert._id);
    try {
      await sosApi.resolve(alert._id);
      toast.success('Alert marked resolved');
      setAlerts((prev) => prev.filter((a) => a._id !== alert._id));
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not resolve this alert');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader title="SOS Alerts" subtitle="Emergency alerts triggered by drivers — resolve once handled" />

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
          {loadedOnce && alerts.length === 0 && !error && (
            <Empty icon="✅" message="No active SOS alerts" />
          )}

          {alerts.length > 0 && (
            <div className="flex flex-col gap-3">
              {alerts.map((a) => (
                <div key={a._id} className="card" style={{ borderColor: 'rgba(255,77,109,.25)' }}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={15} style={{ color: 'var(--red)' }} />
                        <span className="font-bold font-display">{a.driver?.name || 'Unknown driver'}</span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                        {elapsed(a.createdAt)}
                        {a.trip?.tripNumber && <> · Trip {a.trip.tripNumber}</>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {a.driver?.phone && (
                        <a href={`tel:${a.driver.phone}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: 'rgba(59,158,255,.12)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.3)' }}>
                          <Phone size={13} /> {a.driver.phone}
                        </a>
                      )}
                      {a.lat != null && a.lng != null && (
                        <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid rgba(255,255,255,.08)' }}>
                          <MapPin size={13} /> View on map
                        </a>
                      )}
                      <Btn size="sm" onClick={() => resolve(a)} disabled={resolvingId === a._id}>
                        {resolvingId === a._id ? 'Resolving...' : 'Mark Resolved'}
                      </Btn>
                    </div>
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
