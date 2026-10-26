// src/pages/CallLogsPage.jsx
//
// Every masked, recorded call through the company number — drivers,
// partners and the desk calling customers, and customers calling in — with
// the recording to play back. Numbers are masked; "Call back" redials the
// same customer through the masked call, so a missed incoming call can be
// returned without anyone seeing the number.
import React, { useEffect, useRef, useState } from 'react';
import { callsApi } from '../api/client';
import { PageHeader, Spinner, Tabs, fmtDateTime } from '../components/ui';
import CallLogList from '../components/CallLogList';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const POLL_MS = 30000;

const DIRECTIONS = [
  { key: 'all',      label: 'All calls' },
  { key: 'inbound',  label: 'Incoming' },
  { key: 'outbound', label: 'Outgoing' },
];

// Whether Plivo is actually reaching us. "Never hit" on the incoming row
// means Plivo is not sending incoming calls to this server at all; a
// rejection carries the server's reason. Counted since the last deploy.
const WEBHOOK_ROWS = [
  ['incoming', 'Incoming call (answer URL)'],
  ['events',   'Hang-up / dial events'],
  ['answer',   'Outgoing: agent answered'],
  ['recording','Recordings'],
];

function WebhookStatus({ config }) {
  const [open, setOpen] = useState(false);
  const inc = config.webhooks.incoming || {};
  const problem = !inc.lastAcceptedAt;
  return (
    <div className="card-sm mb-4 text-xs" style={{ color: 'var(--text2)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left flex items-center gap-2">
        <span style={{ color: problem ? 'var(--amber)' : 'var(--accent)' }}>{problem ? '⚠️' : '✅'}</span>
        <span>
          Plivo webhooks · incoming calls {inc.lastAcceptedAt
            ? <>last reached us {fmtDateTime(inc.lastAcceptedAt)}</>
            : inc.lastRejectedAt ? 'are being REJECTED' : 'have not reached this server'} since {fmtDateTime(config.serverStartedAt)}
        </span>
        <span className="ml-auto" style={{ color: 'var(--text3)' }}>{open ? 'Hide' : 'Details'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <div style={{ color: 'var(--text3)' }}>
            In the Plivo console, the number {config.callerId || ''} must be linked to an application whose
            Answer URL is <span className="font-mono">{config.incomingAnswerUrl}</span> and Hangup URL is{' '}
            <span className="font-mono">{config.hangupUrl}</span> (both POST).
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Webhook</th><th>Hits</th><th>Accepted</th><th>Rejected</th><th>Last accepted</th><th>Last rejection</th></tr></thead>
              <tbody>
                {WEBHOOK_ROWS.map(([key, label]) => {
                  const w = config.webhooks[key] || {};
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className="font-mono">{w.hits ?? 0}</td>
                      <td className="font-mono">{w.accepted ?? 0}</td>
                      <td className="font-mono" style={{ color: w.rejected ? 'var(--red)' : undefined }}>{w.rejected ?? 0}</td>
                      <td className="font-mono">{w.lastAcceptedAt ? fmtDateTime(w.lastAcceptedAt) : '—'}</td>
                      <td style={{ color: 'var(--red)', whiteSpace: 'normal' }}>
                        {w.lastRejectedAt ? <>{fmtDateTime(w.lastRejectedAt)} — {w.lastRejectReason}</> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// What Plivo has live on the account right now. Every ringing or connected
// phone leg counts toward its simultaneous-call limit; a leg here that no
// call log knows about, or one far older than any real call, is stuck and
// can be hung up — one at a time, after a confirm.
function LivePlivoCalls() {
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId,  setBusyId]  = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await callsApi.liveCalls();
      setData(d);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not read live calls from Plivo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const hangup = async (c) => {
    if (!window.confirm(`Hang up this Plivo call (${c.direction || 'call'} · ${c.from || '?'} → ${c.to || '?'})?`)) return;
    setBusyId(c.callUuid);
    try { await callsApi.hangupLive(c.callUuid); await load(); } catch { /* toast from client */ }
    finally { setBusyId(null); }
  };

  const ageText = (s) => (s == null ? '—' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);

  return (
    <div className="card-sm mb-4 text-xs" style={{ color: 'var(--text2)' }}>
      <div className="flex items-center gap-2">
        <span>
          Live Plivo calls: <b className="font-mono">{data ? data.total : '…'}</b>
          <span style={{ color: 'var(--text3)' }}> · each ringing or connected phone leg counts toward Plivo's simultaneous-call limit</span>
        </span>
        <button onClick={load} disabled={loading} className="ml-auto p-1.5 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && <div className="mt-2" style={{ color: 'var(--red)' }}>{error}</div>}
      {data?.calls?.length > 0 && (
        <div className="overflow-x-auto mt-2">
          <table className="tbl">
            <thead><tr><th>Direction</th><th>From → To</th><th>Status</th><th>Age</th><th>Our call log</th><th></th></tr></thead>
            <tbody>
              {data.calls.map((c) => (
                <tr key={c.callUuid}>
                  <td>{c.direction || '—'}</td>
                  <td className="font-mono">{c.from || '?'} → {c.to || '?'}</td>
                  <td>{c.status || '—'}</td>
                  <td className="font-mono" style={{ color: c.ageSec > 3600 ? 'var(--red)' : undefined }}>{ageText(c.ageSec)}</td>
                  <td>{c.callLog ? `${c.callLog.direction} · ${c.callLog.status}` : <span style={{ color: 'var(--amber)' }}>none</span>}</td>
                  <td>
                    <button onClick={() => hangup(c)} disabled={busyId === c.callUuid}
                      className="px-2 py-1 rounded-lg font-semibold"
                      style={{ background: 'rgba(255,77,109,.1)', color: 'var(--red)', border: '1px solid rgba(255,77,109,.25)' }}>
                      {busyId === c.callUuid ? '…' : 'Hang up'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// TEMPORARY: the signed-in user's in-app devices (each has its own Plivo
// endpoint) and which are checking in now — plus how many browser
// sessions reported in the last few minutes.
function MyInAppDevices() {
  const [data, setData] = useState(null);
  const load = () => callsApi.debugSessions().then(({ data: d }) => setData(d)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!data) return null;
  const recent = (data.sessions || []).filter((s) => Date.now() - new Date(s.lastAt).getTime() < 5 * 60 * 1000);
  const devices = data.devices || [];
  return (
    <div className="card-sm mb-4 text-xs" style={{ color: 'var(--text2)' }}>
      <div className="flex items-center gap-2">
        <span>
          Your in-app devices: <b>{devices.filter((d) => d.online).length}</b> online of {devices.length}
          <span style={{ color: 'var(--text3)' }}> · {recent.length} CRM session(s) active in the last 5 min</span>
        </span>
        <button onClick={load} className="ml-auto p-1.5 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
          <RefreshCw size={12} />
        </button>
      </div>
      {devices.length > 0 && (
        <div className="mt-1.5 font-mono space-y-0.5">
          {devices.map((d) => (
            <div key={d.deviceKey}>
              <span style={{ color: d.online ? 'var(--accent)' : 'var(--text3)' }}>{d.online ? '● online' : '○ offline'}</span>
              {' '}{d.device || 'device'} [{String(d.deviceKey).slice(0, 8)}]
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CallLogsPage() {
  const [direction, setDirection] = useState('all');
  const [logs,      setLogs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [config,    setConfig]    = useState(null);
  const intervalRef = useRef();

  useEffect(() => {
    callsApi.config().then(({ data }) => setConfig(data)).catch(() => {});
  }, []);

  const load = async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    // Refresh the webhook counters with the list, so a test call's arrival
    // shows up without reloading the page.
    callsApi.config().then(({ data }) => setConfig(data)).catch(() => {});
    try {
      const { data } = await callsApi.logs({ direction: direction === 'all' ? undefined : direction, limit: 100 });
      setLogs(data.logs || []);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Could not load call logs.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [direction]);

  return (
    <div className="page-enter">
      <PageHeader
        title="Call Logs"
        subtitle="Masked calls through 918065591088 · recordings · call back"
        action={
          <button onClick={() => load()} className="p-2 rounded-lg" style={{ color: 'var(--text3)', background: 'var(--surface2)' }}>
            <RefreshCw size={14} />
          </button>
        }
      />

      {/* What is actually live on the server, not what we expect. */}
      {config && (
        <div className="card-sm mb-4 text-xs flex flex-wrap items-center gap-2"
          style={config.provider === 'plivo'
            ? { borderColor: 'rgba(0,212,170,.3)', color: 'var(--text2)' }
            : { borderColor: 'rgba(255,77,109,.35)', color: 'var(--red)' }}>
          {config.provider === 'plivo'
            ? <>✅ Calls go through <b>Plivo</b> · customers see <span className="font-mono">{config.callerId}</span></>
            : <>⚠️ Plivo is not configured on the server — masked calls are switched off.</>}
        </div>
      )}

      {config?.webhooks && <WebhookStatus config={config} />}
      {config?.provider === 'plivo' && <LivePlivoCalls />}
      {config?.provider === 'plivo' && <MyInAppDevices />}

      <Tabs tabs={DIRECTIONS} active={direction} onChange={setDirection} />

      {error && (
        <div className="card mb-4" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--red)' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        </div>
      )}

      {loading ? <Spinner /> : <CallLogList logs={logs} emptyText="No calls yet." />}
    </div>
  );
}
