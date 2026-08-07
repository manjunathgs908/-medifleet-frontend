// src/pages/WhatsappLeadsPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { whatsappLeadsApi } from '../api/client';
import { PageHeader, Btn, Spinner, Empty, StatusBadge, Tabs } from '../components/ui';
import { AlertTriangle, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

const POLL_MS = 30000;

// Same "Xm ago" / "Xh Ym ago" shape as SosAlertsPage.jsx's elapsed() helper,
// kept local here since no shared time-formatting util exists yet.
const elapsed = (iso) => {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
};

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'new',       label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'closed',    label: 'Closed' },
];

export default function WhatsappLeadsPage() {
  const [leads,      setLeads]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [filter,     setFilter]     = useState('new');
  const [updatingId, setUpdatingId] = useState(null);
  const intervalRef = useRef();

  // Re-runs on every filter change: fetches immediately (non-silent, so
  // switching tabs shows a spinner), then resumes background polling on
  // the new filter. Same silent/loadedOnce/error handling as SosAlertsPage.
  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [filter]);

  const load = async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await whatsappLeadsApi.getAll(filter !== 'all' ? { status: filter } : {});
      setLeads(data.leads || []);
      setError(null);
      setLoadedOnce(true);
    } catch (e) {
      // Deliberately does NOT clear `leads` here -- a failed fetch must
      // never be indistinguishable from "no leads". Last-known-good data
      // (if any) stays on screen under the error banner.
      setError(e.response?.data?.message || e.message || 'Could not load WhatsApp leads.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const advance = async (lead, nextStatus) => {
    setUpdatingId(lead._id);
    try {
      await whatsappLeadsApi.updateStatus(lead._id, nextStatus);
      toast.success(`Lead marked ${nextStatus}`);
      // Currently-filtered view may no longer include this lead (e.g.
      // filter='new' and it just moved to 'contacted') -- refetch rather
      // than patch it in place, same as SosAlertsPage's filter-out on resolve.
      if (filter === 'all') {
        setLeads((prev) => prev.map((l) => (l._id === lead._id ? { ...l, status: nextStatus } : l)));
      } else {
        setLeads((prev) => prev.filter((l) => l._id !== lead._id));
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not update this lead');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader title="WhatsApp Leads" subtitle="Customers who asked for a service via the WhatsApp bot with no automated booking available -- call them back" />

      <Tabs tabs={FILTERS} active={filter} onChange={setFilter} />

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
          {loadedOnce && leads.length === 0 && !error && (
            <Empty icon="💬" message="No WhatsApp leads found" />
          )}

          {leads.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Phone</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Received</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l._id} style={l.status === 'new' ? { background: 'rgba(59,158,255,.05)' } : undefined}>
                      <td>
                        <a href={`tel:${l.phone}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: 'rgba(59,158,255,.12)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.3)' }}>
                          <Phone size={13} /> {l.phone}
                        </a>
                      </td>
                      <td className="text-sm">{l.service}</td>
                      <td><StatusBadge status={l.status} /></td>
                      <td className="text-xs" style={{ color: 'var(--text3)' }}>{elapsed(l.createdAt)}</td>
                      <td>
                        <div className="flex gap-1">
                          {l.status === 'new' && (
                            <Btn size="sm" variant="blue" onClick={() => advance(l, 'contacted')} disabled={updatingId === l._id}>
                              {updatingId === l._id ? 'Updating...' : 'Mark Contacted'}
                            </Btn>
                          )}
                          {l.status === 'contacted' && (
                            <Btn size="sm" variant="ghost" onClick={() => advance(l, 'closed')} disabled={updatingId === l._id}>
                              {updatingId === l._id ? 'Updating...' : 'Mark Closed'}
                            </Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
