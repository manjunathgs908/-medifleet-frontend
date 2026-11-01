// src/components/CallLogList.jsx
//
// Masked, recorded calls (medifleet-backend's CallLog), shared by the Call
// Logs page and the WhatsApp customer history. Numbers arrive masked; a
// recording plays through the backend (RecordingPlayer), never from a
// Plivo URL. "Call back" re-dials the same customer through the masked
// call, by the log's id.
//
// Each card shows what the desk acts on — who, which way, when, the
// outcome, who answered, Call back, the recording, and any problem worth
// acting on. Provider codes, phone/app legs, the routing trail and the
// in-app delivery diagnostics sit under a collapsed "Technical details".
// Nothing is inferred: a name, a staff member or a talk time shows only when
// the call log has it.
import React, { useState } from 'react';
import { PhoneIncoming, PhoneOutgoing, ChevronDown } from 'lucide-react';
import { Badge, fmtDateTime, custPhone } from './ui';
import CallButton from './CallButton';
import RecordingPlayer from './RecordingPlayer';
import DeliveryTrail from './DeliveryTrail';

// Backend status -> what the desk reads (also used by the callback queue).
export const STATUS = {
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
  // Callback queue only: answered, transferred, and nobody took the transfer.
  transfer_unanswered: { color: 'amber', label: 'Transfer not taken' },
};

// Why a call still stored as ringing is known to be over (backend liveState).
const UNCONFIRMED_WHY = {
  hangup_received  : 'Plivo reported the hang-up',
  not_live_on_plivo: 'Plivo no longer has this call live',
  too_old          : 'This call is older than any call can last',
};

const AGENT_TYPE = { driver: 'Driver', staff: 'Desk', fleet_owner: 'Partner' };

// A live transfer's outcome (backend CallLog.transfers[].outcome).
const TRANSFER_OUTCOME = {
  ringing       : { color: 'var(--blue)',   text: 'ringing telecallers…' },
  answered      : { color: 'var(--accent)', text: 'taken' },
  rang_back     : { color: 'var(--accent)', text: 'nobody took it — rang back' },
  not_answered  : { color: 'var(--red)',    text: 'nobody answered, ring-back included — caller heard the sorry message' },
  caller_hung_up: { color: 'var(--amber)',  text: 'caller hung up while on hold' },
  failed        : { color: 'var(--amber)',  text: 'did not go through — the caller stayed connected' },
};

// One line per transfer: who handed it on, and who took it.
function TransferHistory({ transfers }) {
  if (!transfers?.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {transfers.map((t, i) => {
        const o = TRANSFER_OUTCOME[t.outcome] || { color: 'var(--text3)', text: t.outcome };
        return (
          <div key={i} className="text-[11px]" style={{ color: 'var(--text2)' }}>
            Transferred by {t.byName || 'staff'}{t.at && <> at {fmtDateTime(t.at)}</>}
            {' → '}
            {t.answeredByName && ['answered', 'rang_back'].includes(t.outcome)
              ? <span style={{ color: o.color }}>{t.outcome === 'rang_back' ? 'rang back, ' : ''}taken by {t.answeredByName}{t.answeredIn === 'phone' ? ' (phone)' : ''}{fmtSec(t.talkSec) && <> · talk {fmtSec(t.talkSec)}</>}</span>
              : <span style={{ color: o.color }}>{o.text}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Phone-leg verdicts worth acting on, shown on the card itself.
const ACTIONABLE_VERDICTS = ['busy_no_ring', 'busy_no_ring_unchecked', 'busy_overlap', 'not_reached'];

export const fmtSec = (s) => {
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
    <div className="space-y-0.5">
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
      {!log.routing?.skippedCaller?.message && (ov?.callerIsRingPhone || log.routing?.callerIsRingPhone) && (
        <div style={{ color: 'var(--amber)' }}>The caller is one of the ring numbers — that phone was left out of this call.</div>
      )}
    </div>
  );
}

// Everything the desk does not need at a glance. Opening it only shows what
// the card already holds — no call, no recording, no request (the in-app
// delivery trail inside loads only on its own button).
function TechnicalDetails({ log, inbound }) {
  const [open, setOpen] = useState(false);
  const panelId = `call-tech-${log._id}`;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 text-[11px] font-semibold rounded px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{ color: 'var(--text3)' }}
      >
        <ChevronDown size={12} aria-hidden="true" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }} />
        Technical details
      </button>
      {open && (
        <div id={panelId} className="mt-1.5 rounded-lg p-2.5 space-y-1.5 text-[11px] break-words" style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
          {/* Which provider placed it and the number the customer saw, as
              recorded on the call itself. */}
          <div className="font-mono">
            {log.provider ? `via ${log.provider === 'plivo' ? 'Plivo' : 'Exotel'}` : 'Provider not recorded'}
            {log.callerId && <> · caller ID {log.callerId}</>}
            {log.agentName && <> · {AGENT_TYPE[log.agentType] || 'Agent'}: {log.agentName}</>}
          </div>
          {/* Plivo's own reason the call ended, e.g. Busy Line or code 5030
              (its simultaneous-call limit). */}
          {(log.hangup?.HangupCauseName || log.hangupCause) && log.status !== 'completed' && (
            <div className="font-mono">
              Plivo: {log.hangup?.HangupCauseName || log.hangupCause}
              {log.hangup?.HangupCauseCode && <> ({log.hangup.HangupCauseCode})</>}
              {log.hangup?.HangupSource && <> · ended by {log.hangup.HangupSource}</>}
            </div>
          )}
          {log.statusUnconfirmed && (
            <div>Why unconfirmed: {UNCONFIRMED_WHY[log.statusUnconfirmedReason] || 'the call has ended'}; stored status “{log.status}”.</div>
          )}
          {inbound && <PhoneLegLine log={log} />}
          {/* TEMPORARY: how an incoming call reached (or missed) the app. */}
          {inbound && <DeliveryTrail log={log} />}
        </div>
      )}
    </div>
  );
}

export default function CallLogList({ logs, emptyText = 'No recorded calls yet.', showCallBack = true }) {
  if (!logs?.length) return <div className="text-sm" style={{ color: 'var(--text3)' }}>{emptyText}</div>;

  return (
    <div className="flex flex-col gap-2">
      {logs.map((log) => {
        const st = log.statusUnconfirmed
          ? { color: 'gray', label: 'Status unconfirmed' }
          : log.liveState === 'in_call'
            ? { color: 'blue', label: 'In call' }
            : log.routing?.skippedCaller?.leftNobody && ['no_agents', 'missed'].includes(log.status)
              ? { color: 'amber', label: 'Not rung — called from the ring phone' }
              : STATUS[log.status] || { color: 'gray', label: log.status };
        const inbound = log.direction === 'inbound';
        const testRing = log.context === 'test_ring';
        // The name only when a linked trip or lead has one — never guessed.
        const name = log.trip?.patientName || log.lead?.patientName || null;
        const phone = custPhone(log.customerPhone, log.customerMasked, 'Unknown number');
        const about = log.trip?.tripNumber ? `Trip ${log.trip.tripNumber}` : log.lead ? 'Lead' : null;
        // Staff only when recorded: who answered an incoming call (it was
        // answered), or who placed an outgoing one.
        const staff = log.agentName
          ? (inbound
              ? ((log.status === 'completed' || log.liveState === 'in_call') ? `Answered by ${log.agentName}` : null)
              : `${AGENT_TYPE[log.agentType] || 'Agent'}: ${log.agentName}`)
          : null;
        const verdict = inbound && ACTIONABLE_VERDICTS.includes(log.phoneVerdict?.code) ? log.phoneVerdict.text : null;
        const meta = [
          inbound ? 'Incoming' : 'Outgoing',
          fmtDateTime(log.startedAt || log.createdAt),
          fmtSec(log.talkSec) && `talk ${fmtSec(log.talkSec)}`,
          staff,
          about,
        ].filter(Boolean);

        return (
          <div key={log._id} className="card-sm" data-call-id={log._id}>
            <div className="flex items-start justify-between gap-x-3 gap-y-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap text-sm font-semibold">
                  {inbound
                    ? <PhoneIncoming size={14} className="flex-shrink-0" style={{ color: 'var(--blue)' }} aria-label="Incoming call" />
                    : <PhoneOutgoing size={14} className="flex-shrink-0" style={{ color: 'var(--accent)' }} aria-label="Outgoing call" />}
                  {testRing
                    ? <span>Test ring to {log.agentName ? `${log.agentName}'s` : 'your'} phone</span>
                    : name
                      ? <><span className="truncate">{name}</span><span className="font-mono text-xs font-normal" style={{ color: 'var(--text3)' }}>{phone}</span></>
                      : <span className="font-mono">{phone}</span>}
                  <Badge color={st.color}>{st.label}</Badge>
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>{meta.join(' · ')}</div>

                {/* Problems worth acting on stay on the card. */}
                {log.error && <div className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>{log.error}</div>}
                {log.statusUnconfirmed && (
                  <div className="text-[11px] mt-1" style={{ color: 'var(--amber)' }}>
                    The call has ended, but its final outcome never reached the CRM — whether it was answered is not known.
                  </div>
                )}
                {log.routing?.skippedCaller?.message && (
                  <div className="text-[11px] mt-1 font-semibold" style={{ color: 'var(--amber)' }}>{log.routing.skippedCaller.message}</div>
                )}
                {verdict && <div className="text-[11px] mt-1" style={{ color: 'var(--amber)' }}>{verdict}</div>}
                <TransferHistory transfers={log.transfers} />
              </div>
              {showCallBack && log.customerMasked && <CallButton target={{ callLogId: log._id }} label="Call back" />}
            </div>
            {/* Streamed through the backend; the Plivo URL is never sent here.
                Only answered calls are recorded, so a missed one just says so
                — no Play button, no error. */}
            {log.hasRecording && <RecordingPlayer callLogId={log._id} label={log.recordings?.length ? 'Play recording · before transfer' : undefined} />}
            {/* One more recording per transfer that someone took — same call. */}
            {(log.recordings || []).map((r) => (
              <RecordingPlayer key={r.part} callLogId={log._id} part={r.part}
                label={`Play recording · after transfer${log.transfers?.[r.part]?.answeredByName ? ` (${log.transfers[r.part].answeredByName})` : ''}`} />
            ))}
            {!log.hasRecording && log.recordingState === 'not_answered' && !['ringing', 'initiated', 'agent_answered'].includes(log.status) && (
              <div className="text-[11px] mt-1.5" style={{ color: 'var(--text3)' }}>No recording — call not answered</div>
            )}
            <TechnicalDetails log={log} inbound={inbound} />
          </div>
        );
      })}
    </div>
  );
}
