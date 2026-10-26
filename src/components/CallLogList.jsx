// src/components/CallLogList.jsx
//
// Masked, recorded calls (medifleet-backend's CallLog), shared by the Call
// Logs page and the WhatsApp customer history. Numbers arrive masked; a
// recording plays through the backend (RecordingPlayer), never from a
// Plivo URL. "Call back" re-dials the same customer through the masked
// call, by the log's id.
import React from 'react';
import { PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { Badge, fmtDateTime } from './ui';
import CallButton from './CallButton';
import RecordingPlayer from './RecordingPlayer';

// Backend status -> what the desk reads.
const STATUS = {
  completed      : { color: 'green', label: 'Connected' },
  initiated      : { color: 'blue',  label: 'Ringing agent' },
  agent_answered : { color: 'blue',  label: 'Dialling customer' },
  ringing        : { color: 'blue',  label: 'Ringing' },
  agent_missed   : { color: 'amber', label: 'Agent didn\'t answer' },
  agent_busy     : { color: 'amber', label: 'Agent busy' },
  customer_missed: { color: 'amber', label: 'Customer didn\'t answer' },
  customer_busy  : { color: 'amber', label: 'Customer busy' },
  customer_failed: { color: 'red',   label: 'Couldn\'t reach customer' },
  missed         : { color: 'red',   label: 'Missed' },
  no_agents      : { color: 'red',   label: 'Nobody on duty' },
  failed         : { color: 'red',   label: 'Failed' },
  cancelled      : { color: 'gray',  label: 'Cancelled' },
};

const AGENT_TYPE = { driver: 'Driver', staff: 'Desk', fleet_owner: 'Partner' };

const fmtSec = (s) => {
  if (s === null || s === undefined || !Number.isFinite(Number(s))) return null;
  const n = Math.round(Number(s));
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`;
};

export default function CallLogList({ logs, emptyText = 'No recorded calls yet.', showCallBack = true }) {
  if (!logs?.length) return <div className="text-sm" style={{ color: 'var(--text3)' }}>{emptyText}</div>;

  return (
    <div className="flex flex-col gap-2">
      {logs.map((log) => {
        const st = STATUS[log.status] || { color: 'gray', label: log.status };
        const inbound = log.direction === 'inbound';
        const about = log.trip?.tripNumber
          ? `Trip ${log.trip.tripNumber}${log.trip.patientName ? ` · ${log.trip.patientName}` : ''}`
          : log.lead?.patientName ? `Lead · ${log.lead.patientName}` : null;
        return (
          <div key={log._id} className="card-sm">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {inbound
                    ? <PhoneIncoming size={14} style={{ color: 'var(--blue)' }} />
                    : <PhoneOutgoing size={14} style={{ color: 'var(--accent)' }} />}
                  <span className="font-mono">{log.customerMasked || 'Unknown number'}</span>
                  <Badge color={st.color}>{st.label}</Badge>
                </div>
                <div className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text3)' }}>
                  {fmtDateTime(log.startedAt || log.createdAt)}
                  {fmtSec(log.talkSec) && <> · talk {fmtSec(log.talkSec)}</>}
                  {/* Which provider placed it and the number the customer
                      saw, as recorded on the call itself. */}
                  {log.provider && <> · via {log.provider === 'plivo' ? 'Plivo' : 'Exotel'}</>}
                  {log.callerId && <> · caller ID {log.callerId}</>}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                  {[
                    inbound ? 'Incoming' : log.agentName ? `${AGENT_TYPE[log.agentType] || 'Agent'}: ${log.agentName}` : null,
                    about,
                  ].filter(Boolean).join(' · ')}
                </div>
                {log.error && <div className="text-[11px] mt-0.5" style={{ color: 'var(--red)' }}>{log.error}</div>}
              </div>
              {showCallBack && log.customerMasked && <CallButton target={{ callLogId: log._id }} label="Call back" />}
            </div>
            {/* Streamed through the backend; the Plivo URL is never sent here. */}
            {log.hasRecording && <RecordingPlayer callLogId={log._id} />}
          </div>
        );
      })}
    </div>
  );
}
