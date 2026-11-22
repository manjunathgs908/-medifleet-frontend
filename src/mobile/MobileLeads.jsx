// src/mobile/MobileLeads.jsx — "/m/leads?status=new | ?view=due_today|overdue|mine".
//
// The existing GET /api/leads, as cards. The filter lives in the URL so a
// Home card opens exactly the list its number counts. Tap a card for the
// lead's details; Call is the existing masked call.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Target, RefreshCw, Clock, User } from 'lucide-react';
import { leadsApi } from '../api/client';
import { LEAD_FILTERS, leadListQuery, shownPhone, dueLabel } from './logic.mjs';
import { Skeleton, ErrorState, EmptyState, MCallButton, StatusPill } from './ui';
import './mobile.css';

const EMPTY = {
  new: 'No new leads right now.',
  due_today: 'Nothing else due today.',
  overdue: 'No overdue follow-ups.',
  mine: 'No active leads assigned to you.',
  contacted: 'No contacted leads.',
};

export default function MobileLeads() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const filter = leadListQuery(search);
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    setLeads(null);
    try {
      const { data } = await leadsApi.getAll(filter.params);
      if (n !== seq.current) return;
      const rows = data.leads || [];
      setLeads(filter.params.status ? rows.filter((l) => (l.status || 'new') === filter.params.status) : rows);
      setError(null);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e?.response?.data?.message || e?.message || 'Could not load leads.');
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [filter.key]);

  useEffect(() => { load(); }, [load]);

  const pick = (f) => navigate(`/m/leads?${new URLSearchParams(f.params).toString()}`, { replace: true });

  return (
    <div className="m-ui m-screen">
      <div className="flex items-center mb-3">
        <h1 className="m-title">Leads</h1>
        <button type="button" onClick={load} className="m-tap ml-auto w-12 flex items-center justify-center -mr-2" aria-label="Refresh">
          <RefreshCw size={20} style={{ color: 'var(--m-text2)' }} />
        </button>
      </div>

      <div className="m-scroll-x mb-4" role="group" aria-label="Filter leads">
        {LEAD_FILTERS.map((f) => (
          <button key={f.key} type="button" className="m-chip m-tap" aria-pressed={f.key === filter.key} onClick={() => pick(f)}>{f.label}</button>
        ))}
      </div>

      {loading ? <Skeleton rows={5} height={118} />
        : error ? <ErrorState message={error} onRetry={load} />
          : !leads?.length ? <EmptyState icon={<Target size={20} />} title={EMPTY[filter.key]} />
            : (
              <ul className="space-y-3" aria-label={`${filter.label} leads`}>
                {leads.map((l) => {
                  const due = l.nextFollowUpAt ? new Date(l.nextFollowUpAt).getTime() : NaN;
                  return (
                    <li key={l._id} className="m-card p-4" style={l.followUp === 'overdue' ? { borderColor: '#f3b4b4', boxShadow: 'inset 4px 0 0 var(--m-red)' } : undefined}>
                      <button type="button" className="w-full text-left m-tap -my-1"
                        onClick={() => navigate(`/m/leads/${l._id}`, { state: { lead: l } })}>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[16px] font-semibold truncate">{l.patientName || 'Unknown'}</div>
                            <div className="font-mono text-[14px] mt-0.5" style={{ color: 'var(--m-text2)' }}>{shownPhone(l.phone, l.phoneMasked)}</div>
                          </div>
                          <StatusPill status={l.status} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[13px]" style={{ color: 'var(--m-text2)' }}>
                          <span className="inline-flex items-center gap-1 min-w-0"><User size={14} aria-hidden="true" /><span className="truncate">{l.assignedToName || (l.assignedTo ? 'Staff member' : 'Unassigned')}</span></span>
                          {Number.isFinite(due) && (
                            <span className="inline-flex items-center gap-1" style={l.followUp === 'overdue' ? { color: 'var(--m-red)', fontWeight: 600 } : undefined}>
                              <Clock size={14} aria-hidden="true" />{l.followUp === 'overdue' ? 'Overdue · ' : ''}{dueLabel(due)}
                            </span>
                          )}
                        </div>
                      </button>
                      {l.phoneMasked && <MCallButton target={{ leadId: l._id }} variant="secondary" className="w-full mt-3" />}
                    </li>
                  );
                })}
              </ul>
            )}
    </div>
  );
}
