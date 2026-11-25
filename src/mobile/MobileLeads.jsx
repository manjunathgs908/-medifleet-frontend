// src/mobile/MobileLeads.jsx — "/m/leads?status=new | ?view=due_today|overdue|mine".
//
// The existing GET /api/leads, as cards. The filter lives in the URL so a
// Home card opens exactly the list its number counts. Tap a card for the
// lead's details; Call is the existing masked call.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Target, RefreshCw, Clock, User, Plus } from 'lucide-react';
import { leadsApi } from '../api/client';
import { LEAD_FILTERS, leadListQuery, shownPhone, dueLabel } from './logic.mjs';
import { Skeleton, ErrorState, EmptyState, MCallButton, StatusPill } from './ui';
import './mobile.css';

const PAGE_SIZE = 25;

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
  const [pageInfo, setPageInfo] = useState(null); // { page, total, hasMore }
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState(null);
  const seq = useRef(0);

  // Server-side filter, then pages of 25 with the true total (nothing hidden
  // behind the old 500 cap). "Load more" appends the next page.
  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    setLeads(null);
    setMoreError(null);
    try {
      const { data } = await leadsApi.page({ ...filter.params, page: 1, limit: PAGE_SIZE });
      if (n !== seq.current) return;
      setLeads(data.leads || []);
      setPageInfo(data.page || null);
      setError(null);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e?.response?.data?.message || e?.message || 'Could not load leads.');
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [filter.key]);

  const loadMore = async () => {
    if (!pageInfo?.hasMore) return;
    const n = seq.current;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const { data } = await leadsApi.page({ ...filter.params, page: pageInfo.page + 1, limit: PAGE_SIZE });
      if (n !== seq.current) return;
      setLeads((prev) => {
        const have = new Set((prev || []).map((l) => l._id));
        return [...(prev || []), ...(data.leads || []).filter((l) => !have.has(l._id))];
      });
      setPageInfo(data.page || null);
    } catch (e) {
      if (n === seq.current) setMoreError(e?.response?.data?.message || 'Could not load more.');
    } finally {
      if (n === seq.current) setMoreBusy(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  const pick = (f) => navigate(`/m/leads?${new URLSearchParams(f.params).toString()}`, { replace: true });

  return (
    <div className="m-ui m-screen">
      <div className="flex items-center mb-3">
        <h1 className="m-title">Leads</h1>
        <button type="button" onClick={() => navigate('/m/leads/new')} className="m-btn m-btn-primary m-tap ml-auto !min-h-[40px] !px-3 !text-[14px]">
          <Plus size={16} aria-hidden="true" /> New
        </button>
        <button type="button" onClick={load} className="m-tap w-12 flex items-center justify-center -mr-2" aria-label="Refresh">
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
      {!loading && !error && leads?.length > 0 && pageInfo && (
        <div className="mt-4 text-center">
          <div className="m-sub mb-2">Showing {leads.length} of {pageInfo.total}</div>
          {moreError && <div className="text-[14px] mb-2" role="alert" style={{ color: 'var(--m-red)' }}>{moreError}</div>}
          {pageInfo.hasMore && (
            <button type="button" className="m-btn m-tap w-full" onClick={loadMore} disabled={moreBusy}>
              {moreBusy ? 'Loading…' : moreError ? 'Try again' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
