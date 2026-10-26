// src/components/CallLogList.jsx
//
// Masked, recorded calls (medifleet-backend's CallLog), shared by the Call
// Logs page and the WhatsApp customer history. Numbers arrive masked; a
// recording plays through the backend (RecordingPlayer), never from a
// Plivo URL. "Call back" re-dials the same customer through the masked
// call, by the log's id.
import React from 'react';
import { PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { Badge, fmtDateTime, custPhone } from './ui';
import CallButton from './CallButton';
import RecordingPlayer from './RecordingPlayer';
import DeliveryTrail from './DeliveryTrail';

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
  // Plivo told us about the hang-up, but our incoming webhook never ran for
  // it, so the CRM did not route it (see Call Logs' webhook status).
  not_routed     : { color: 'amber', label: 'Not routed by CRM' },
};

const AGENT_TYPE = { driver: 'Driver', staff: 'Desk', fleet_owner: 'Partner' };

const fmtSec = (s) => {
  if (s === null || s === undefined || !Number.isFinite(Number(s))) return null;
  const n = Math.round(Number(s));
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`;
};

// TEMPORARY: the phone <Dial> of an incoming call — did the phone ring
// (Plivo's DialRingStatus), Plivo's exact cause, the backend's plain-words
// verdict, and whether anything of ours was already on that number.
const VERDICT_COLOR = { answered: 'var(--accent)', busy_no_ring: 'var(--amber)', busy_overlap: 'var(--red)' };

function PhoneLegLine({ log }) {
  const leg = log.phoneLeg;
  const ov = log.overlap;
  const v = log.phoneVerdict;
  if (!leg && !ov && !log.routing?.callerIsRingPhone && !log.routing?.skippedCaller) return null;
  const rang = String(leg?.DialRingStatus ?? '');
  const others = (ov?.ourCalls?.length || 0) + (ov?.liveLegs?.length || 0);
  return (
    <div className="text-[11px] mt-1 space-y-0.5" style={{ color: 'var(--text3)' }}>
      {leg && (
        <div className="font-mono">
          Phone {leg.DialBLegTo || (ov?.phones || []).join(', ')}: rang <b>{rang === 'true' ? 'yes' : rang === 'false' ? 'NO' : '?'}</b>
          {' '}· {leg.DialStatus || '—'}
          {(leg.DialHangupCause || leg.DialBLegHangupCause) && <> · cause {leg.DialHangupCause || leg.DialBLegHangupCause}</>}
          {v?.afterSec != null && <> · after {v.afterSec}s</>}
        </div>
      )}
      {v && v.code !== 'answered' && <div style={{ color: VERDICT_COLOR[v.code] || 'var(--text2)' }}>{v.text}</div>}
      {v?.advice && <div style={{ color: 'var(--text2)' }}>→ {v.advice}</div>}
      {ov && (
        <div>
          At dial: {others
            ? <span style={{ color: 'var(--red)' }}>{others} other leg(s) of ours already on this number
                {ov.liveLegs?.length > 0 && <> ({ov.liveLegs.map((l) => `${l.status || '?'} ${l.ageSec ?? '?'}s`).join(', ')})</>}</span>
            : 'no other call of ours on this number'}
          {ov.liveCheck && <> · live check {ov.liveCheck}</>}
          {ov.autoHungUp?.length > 0 && <> · hung up {ov.autoHungUp.length} stuck leg(s)</>}
          {ov.releasedAtHangup?.length > 0 && <> · released {ov.releasedAtHangup.length} leg(s) left after the call</>}
        </div>
      )}
      {log.routing?.skippedCaller?.message
        ? <div className="font-semibold" style={{ color: 'var(--amber)' }}>{log.routing.skippedCaller.message}</div>
        : (ov?.callerIsRingPhone || log.routing?.callerIsRingPhone) && (
          <div style={{ color: 'var(--amber)' }}>The caller is one of the ring numbers — that phone was left out of this call.</div>
        )}
    </div>
  );
}

export default function CallLogList({ logs, emptyText = 'No recorded calls yet.', showCallBack = true }) {
  if (!logs?.length) return <div className="text-sm" style={{ color: 'var(--text3)' }}>{emptyText}</div>;

  return (
    <div className="flex flex-col gap-2">
      {logs.map((log) => {
        const st = log.routing?.skippedCaller?.leftNobody && ['no_agents', 'missed'].includes(log.status)
          ? { color: 'amber', label: 'Not rung — called from the ring phone' }
          : STATUS[log.status] || { color: 'gray', label: log.status };
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
                  {log.context === 'test_ring'
                    ? <span>Test ring to {log.agentName ? `${log.agentName}'s` : 'your'} phone</span>
                    : <span className="font-mono">{custPhone(log.customerPhone, log.customerMasked, 'Unknown number')}</span>}
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
                {/* Plivo's own reason the call ended, e.g. Busy Line or code
                    5030 (its simultaneous-call limit). */}
                {(log.hangup?.HangupCauseName || log.hangupCause) && log.status !== 'completed' && (
                  <div className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--text3)' }}>
                    Plivo: {log.hangup?.HangupCauseName || log.hangupCause}
                    {log.hangup?.HangupCauseCode && <> ({log.hangup.HangupCauseCode})</>}
                    {log.hangup?.HangupSource && <> · ended by {log.hangup.HangupSource}</>}
                  </div>
                )}
                {inbound && <PhoneLegLine log={log} />}
                {/* TEMPORARY: how an incoming call reached (or missed) the app. */}
                {inbound && <DeliveryTrail log={log} />}
              </div>
              {showCallBack && log.customerMasked && <CallButton target={{ callLogId: log._id }} label="Call back" />}
            </div>
            {/* Streamed through the backend; the Plivo URL is never sent here.
                Only answered calls are recorded, so a missed one just says so
                — no Play button, no error. */}
            {log.hasRecording && <RecordingPlayer callLogId={log._id} />}
            {!log.hasRecording && log.recordingState === 'not_answered' && !['ringing', 'initiated', 'agent_answered'].includes(log.status) && (
              <div className="text-[11px] mt-1.5" style={{ color: 'var(--text3)' }}>No recording — call not answered</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
