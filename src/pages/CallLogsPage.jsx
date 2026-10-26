// src/pages/CallLogsPage.jsx
//
// Every masked, recorded call through the company number — drivers,
// partners and the desk calling customers, and customers calling in — with
// the recording to play back. Numbers are masked; "Call back" redials the
// same customer through the masked call, so a missed incoming call can be
// returned without anyone seeing the number.
import React, { useEffect, useRef, useState } from 'react';
import { callsApi } from '../api/client';
import { PageHeader, Spinner, Tabs } from '../components/ui';
import CallLogList from '../components/CallLogList';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const POLL_MS = 30000;

const DIRECTIONS = [
  { key: 'all',      label: 'All calls' },
  { key: 'inbound',  label: 'Incoming' },
  { key: 'outbound', label: 'Outgoing' },
];

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
