// src/pages/BillingPage.jsx
//
// Billing & payments (medifleet-backend /api/billing), owner only.
//   Trip bills — total, received, outstanding for each bill; record a cash /
//     UPI / bank payment against it; every receipt, printable.
//   Advances — money taken for a booking before it is billed; counted into
//     the bill once, when the trip completes.
//   Hospital invoices — unchanged.
// Recording a payment notes money already received: nothing here collects
// money, refunds, or sends anything to the customer. Bills whose earlier
// records don't add up say "needs reconciliation" instead of guessing.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, FileStack, Printer, Download, AlertTriangle, ShieldCheck, UserCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingApi, hospitalsApi } from '../api/client';
import { PageHeader, StatusBadge, Btn, Modal, Tabs, Spinner, Empty, Badge, rupee } from '../components/ui';
// Money, India time and the customer-facing document layout.
import { esc, rs, fmtIst, issuerHeader, row, page, printHtml, downloadHtml } from '../lib/customerDocs';
// "YYYY-MM-DDTHH:mm" in India time; the server reads it as India time.
const istInput = (v) => new Date(new Date(v).getTime() + 330 * 60000).toISOString().slice(0, 16);
const newKey = () => (window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const STATE = {
  unpaid   : ['Unpaid', 'red'],
  part_paid: ['Part-paid', 'amber'],
  paid     : ['Paid', 'green'],
  waived   : ['Waived', 'gray'],
};
const RECONCILE = {
  no_total            : 'the bill has no valid total',
  negative_paid       : 'the recorded paid amount is negative',
  overpaid            : 'more has been received than the bill total (refund or adjustment decision needed)',
  receipts_exceed_paid: 'receipts add up to more than the bill\'s paid amount',
  marked_paid_short   : 'it is marked paid, but the paid amount is less than the total',
  status_behind       : 'its status does not match the amount received',
  advance_on_cancelled_trip: 'an advance was taken for a trip that was cancelled (refund or keep — a person decides)',
  advance_not_on_bill : 'an advance is not on the trip\'s bill',
  advance_above_estimate: 'advances are more than the fare estimate',
  paid_and_invoiced   : 'money was received from the customer, and the bill is also on a hospital invoice (one of the two must be undone)',
};
const METHOD_LABEL = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank transfer', online: 'Online (Razorpay)' };

function StateBadge({ balance }) {
  if (!balance) return null;
  const [label, color] = STATE[balance.state] || [balance.state, 'gray'];
  return <Badge color={color}>{label}</Badge>;
}

function ReconcileNote({ reasons }) {
  if (!reasons?.length) return null;
  return (
    <div className="rounded-lg p-2.5 text-xs flex gap-2" role="note" style={{ background: 'rgba(255,184,48,.1)', color: 'var(--amber)', border: '1px solid rgba(255,184,48,.25)' }}>
      <AlertTriangle size={14} className="flex-shrink-0 mt-px" aria-hidden="true" />
      <span>Needs reconciliation: {reasons.map((r) => RECONCILE[r] || r).join('; ')}. No more payments can be recorded on it until this is sorted out — nothing has been changed automatically.</span>
    </div>
  );
}

function VerifiedBadge({ p }) {
  return p.verification === 'provider_verified'
    ? <span className="badge badge-green inline-flex items-center gap-1"><ShieldCheck size={10} aria-hidden="true" />Verified by Razorpay</span>
    : <span className="badge badge-gray inline-flex items-center gap-1"><UserCheck size={10} aria-hidden="true" />Staff-recorded</span>;
}

// ── Recording a payment / advance ────────────────────────────────
function PaymentForm({ tripId, kind, maxPaise, onDone, onCancel }) {
  const [amount, setAmount] = useState(maxPaise ? (maxPaise / 100).toFixed(maxPaise % 100 ? 2 : 0) : '');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [when, setWhen] = useState(istInput(Date.now()));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // One key per payment: a double click or a retry after a network error
  // sends the same key, and the server answers with the same receipt.
  const key = useRef(newKey());
  // Set synchronously: a second click in the same instant (before the
  // button re-renders disabled) doesn't send a second request.
  const inFlight = useRef(false);
  const needsRef = method === 'bank_transfer';
  const id = `pay-${tripId}`;

  const submit = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const { data } = await billingApi.recordPayment({
        tripId, amount: amount.trim(), method, reference: method === 'cash' ? undefined : reference.trim() || undefined,
        receivedAt: when, note: note.trim() || undefined, requestId: key.current,
      });
      toast.success(data.message);
      key.current = newKey();
      onDone(data.payment);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reach the server — check the connection and press Record again (it will not be recorded twice).');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl p-3 space-y-3" style={{ background: 'var(--surface2)' }} aria-label={kind === 'advance' ? 'Record an advance' : 'Record a payment'}>
      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
        Record money already received. Nothing is collected or sent to the customer.
        {maxPaise ? ` Up to ${rs(maxPaise)} ${kind === 'advance' ? '(the fare estimate not yet covered)' : '(the outstanding balance)'}.` : ''}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-amount`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Amount (₹)</label>
          <input id={`${id}-amount`} className="inp" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
        </div>
        <div>
          <label htmlFor={`${id}-when`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Received at (India time, IST)</label>
          <input id={`${id}-when`} type="datetime-local" className="inp" value={when} max={istInput(Date.now() + 5 * 60000)} onChange={(e) => setWhen(e.target.value)} required />
        </div>
      </div>
      <fieldset>
        <legend className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Method</legend>
        <div className="flex flex-wrap gap-2">
          {['cash', 'upi', 'bank_transfer'].map((m) => (
            <label key={m} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border focus-within:ring-2 focus-within:ring-[var(--accent)] ${method === m ? 'text-[var(--text)]' : 'text-[var(--text3)]'}`}
              style={{ background: method === m ? 'var(--surface3, var(--surface))' : 'var(--surface)', borderColor: method === m ? 'var(--accent)' : 'rgba(255,255,255,.06)' }}>
              <input type="radio" name={`${id}-method`} value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
              {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
      </fieldset>
      {method !== 'cash' && (
        <div>
          <label htmlFor={`${id}-ref`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>
            {method === 'upi' ? 'UPI reference (recommended)' : 'Bank UTR / reference (required)'}
          </label>
          <input id={`${id}-ref`} className="inp" autoComplete="off" maxLength={48} value={reference} onChange={(e) => setReference(e.target.value)} required={needsRef} placeholder={method === 'upi' ? 'e.g. 412398765432' : 'e.g. HDFCR52026110112345'} />
        </div>
      )}
      <div>
        <label htmlFor={`${id}-note`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Note (optional)</label>
        <input id={`${id}-note`} className="inp" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Collected by driver at drop" />
      </div>
      {error && <div role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{error}</div>}
      <div className="flex gap-2">
        <Btn type="submit" size="sm" disabled={busy || !amount.trim() || (needsRef && !reference.trim())}>{busy ? 'Recording…' : kind === 'advance' ? 'Record advance' : 'Record payment'}</Btn>
        <Btn type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
      </div>
    </form>
  );
}

// ── Receipt: preview, print or download (one layout for all three) ─
// Customer-facing: the business header (name, GSTIN, address, contact)
// and no staff name — who recorded it stays in the CRM's receipt list.
// Reversal status is shown (number and date) — never the owner's reason or
// any staff name.
const signed = (paise) => (paise < 0 ? `−${rs(-paise)}` : rs(paise));
function receiptHtml(r) {
  const p = r.payment;
  if (p.kind === 'reversal') return correctionHtml(r);
  if (p.kind === 'refund') return refundHtml(r);
  const reversed = p.reversedBy;
  return page(p.receiptNumber, `${issuerHeader(r.issuer)}
<h2>Payment receipt ${esc(p.receiptNumber)}</h2>
${reversed ? `<div style="display:inline-block;border:2px solid #b91c1c;color:#b91c1c;font-weight:700;padding:2px 10px;margin:4px 0 8px;letter-spacing:.08em">REVERSED</div>` : ''}
<div class="amt"${reversed ? ' style="text-decoration:line-through;color:#666"' : ''}>${esc(rs(p.amountPaise))}</div><table>
${reversed ? row('Status', `Reversed on ${fmtIst(reversed.at)} — accounting correction ${reversed.receiptNumber}`) : ''}
${row('Received on', fmtIst(p.receivedAt))}${row('Method', METHOD_LABEL[p.method] || p.method)}${p.reference ? row('Reference', p.reference) : ''}
${row('For', p.kind === 'advance' && !p.bill ? `Advance for trip ${p.trip?.tripNumber}` : `Trip ${p.trip?.tripNumber}${p.bill ? ` · Bill ${p.bill.billNumber}` : ''}`)}
${row('Patient', p.trip?.patientName)}
${r.balance ? row('Bill total', rs(r.balance.totalPaise)) + row('Received to date', rs(r.balance.paidPaise)) + row('Balance outstanding', `${rs(r.balance.outstandingPaise)} (as of ${fmtIst(new Date())})`) : ''}
${row('Confirmation', p.verification === 'provider_verified' ? 'Verified by Razorpay' : `Recorded by our staff on ${fmtIst(p.recordedAt)}`)}
${p.note ? row('Note', p.note) : ''}</table>
<div class="foot">${reversed ? 'This receipt was reversed as an accounting correction and no longer counts as money received. No money was refunded by this correction.' : 'This receipt confirms money received.'}</div>`);
}

function refundHtml(r) {
  const p = r.payment;
  return page(p.receiptNumber, `${issuerHeader(r.issuer)}
<h2>Refund note ${esc(p.receiptNumber)}</h2>
<div class="amt">${esc(rs(-p.amountPaise))}</div><table>
${row('Refunded on', fmtIst(p.receivedAt))}${row('Paid back by', METHOD_LABEL[p.method] || p.method)}${p.payoutReference ? row('Reference', p.payoutReference) : ''}
${row('For', `Trip ${p.trip?.tripNumber}${p.bill ? ` · Bill ${p.bill.billNumber}` : ' (advance)'}`)}
${row('Patient', p.trip?.patientName)}
${r.balance ? row('Bill total', rs(r.balance.totalPaise)) + row('Received to date (after refunds)', rs(r.balance.paidPaise)) : ''}</table>
<div class="foot">This note records money paid back to you.</div>`);
}

function correctionHtml(r) {
  const p = r.payment;
  const o = p.reversesReceipt || {};
  return page(p.receiptNumber, `${issuerHeader(r.issuer)}
<h2>Accounting correction ${esc(p.receiptNumber)}</h2>
<div class="amt">${esc(signed(p.amountPaise))}</div><table>
${row('Reverses receipt', o.receiptNumber || '—')}${row('Original amount', o.amountPaise ? rs(o.amountPaise) : '—')}${row('Originally received on', fmtIst(o.receivedAt))}
${row('Corrected on', fmtIst(p.receivedAt))}
${row('For', `Trip ${p.trip?.tripNumber}${p.bill ? ` · Bill ${p.bill.billNumber}` : ' (advance)'}`)}
${row('Patient', p.trip?.patientName)}
${r.balance ? row('Bill total', rs(r.balance.totalPaise)) + row('Received to date', rs(r.balance.paidPaise)) + row('Balance outstanding', `${rs(r.balance.outstandingPaise)} (as of ${fmtIst(new Date())})`) : ''}</table>
<div class="foot">This corrects an accounting record: the receipt above was entered by mistake. It is not a refund — no money was refunded or transferred.</div>`);
}

function ReceiptModal({ paymentId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!paymentId) return;
    setData(null); setError(null);
    billingApi.getReceipt(paymentId).then(({ data: d }) => setData(d)).catch((e) => setError(e.response?.data?.message || 'Could not load the receipt.'));
  }, [paymentId]);
  const html = useMemo(() => (data ? receiptHtml(data) : ''), [data]);
  const print = () => printHtml(html);
  const download = () => downloadHtml(html, `${data.payment.receiptNumber.replace(/\//g, '-')}.html`);
  return (
    <Modal open={!!paymentId} onClose={onClose} title="Receipt" width="max-w-xl">
      {error ? <div role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{error}</div> : !data ? <Spinner /> : (
        <div className="space-y-4">
          <iframe title={`Receipt ${data.payment.receiptNumber}`} srcDoc={html} className="w-full rounded-lg" style={{ height: 460, background: '#fff', border: '1px solid var(--border2)' }} />
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" onClick={print}><Printer size={14} aria-hidden="true" /> Print</Btn>
            <Btn size="sm" variant="ghost" onClick={download}><Download size={14} aria-hidden="true" /> Download</Btn>
            <span className="text-[11px] self-center" style={{ color: 'var(--text3)' }}>Not sent to anyone — share it yourself if needed.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Recording a refund already paid back (owner only; record only) ─
const REFUND_NOTICE = 'Records a refund you have already paid outside the CRM — nothing is sent and no money moves here.';
function RefundForm({ tripId, maxPaise, onBill, onDone, onCancel }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');
  const [when, setWhen] = useState(istInput(Date.now()));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const key = useRef(newKey());
  const inFlight = useRef(false);
  const clean = reason.trim().replace(/\s+/g, ' ');
  const needsRef = method === 'bank_transfer';
  const id = `rfd-${tripId}`;
  const submit = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const { data } = await billingApi.recordRefund({
        tripId, amount: amount.trim(), method, payoutReference: method === 'cash' ? undefined : reference.trim() || undefined,
        paidOutAt: when, reason: clean, requestId: key.current,
      });
      toast.success(data.message);
      key.current = newKey();
      onDone(data.refund);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reach the server — press Record again (it will not be recorded twice).');
    } finally { inFlight.current = false; setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="rounded-xl p-3 space-y-3" style={{ background: 'var(--surface2)', border: '1px solid rgba(167,139,250,.35)' }} aria-label="Record a refund">
      <div role="note" className="rounded-md px-2.5 py-2 text-xs font-semibold" style={{ background: 'rgba(167,139,250,.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,.3)' }}>{REFUND_NOTICE}</div>
      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
        Up to {rs(maxPaise)} (what was received{onBill ? ' on this bill' : ' as advance'}).{onBill ? ' The refunded amount stops counting as received, so the bill shows it as outstanding again.' : ''}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-amount`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Refund amount (₹)</label>
          <input id={`${id}-amount`} className="inp" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
        </div>
        <div>
          <label htmlFor={`${id}-when`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Paid back at (India time, IST)</label>
          <input id={`${id}-when`} type="datetime-local" className="inp" value={when} max={istInput(Date.now() + 5 * 60000)} onChange={(e) => setWhen(e.target.value)} required />
        </div>
      </div>
      <fieldset>
        <legend className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Paid back by</legend>
        <div className="flex flex-wrap gap-2">
          {['cash', 'upi', 'bank_transfer'].map((m) => (
            <label key={m} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border focus-within:ring-2 focus-within:ring-[var(--accent)] ${method === m ? 'text-[var(--text)]' : 'text-[var(--text3)]'}`}
              style={{ background: 'var(--surface)', borderColor: method === m ? 'var(--accent)' : 'rgba(255,255,255,.06)' }}>
              <input type="radio" name={`${id}-method`} value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
              {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
      </fieldset>
      {method !== 'cash' && (
        <div>
          <label htmlFor={`${id}-ref`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>{method === 'upi' ? 'UPI reference of the refund (recommended)' : 'Bank UTR of the refund (required)'}</label>
          <input id={`${id}-ref`} className="inp" autoComplete="off" maxLength={48} value={reference} onChange={(e) => setReference(e.target.value)} required={needsRef} />
        </div>
      )}
      <div>
        <label htmlFor={`${id}-reason`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Why was it refunded? (required, at least 10 characters — kept internal)</label>
        <textarea id={`${id}-reason`} className="inp text-xs" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Booking cancelled, advance returned" />
      </div>
      {error && <div role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{error}</div>}
      <div className="flex gap-2">
        <Btn type="submit" size="sm" disabled={busy || !amount.trim() || clean.length < 10 || (needsRef && !reference.trim())}>{busy ? 'Recording…' : 'Record refund'}</Btn>
        <Btn type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
      </div>
    </form>
  );
}

// ── Reversing a mistaken receipt (owner only; the server checks) ─
const REVERSE_WARNING = 'Correct accounting record only — no money will be refunded.';
function ReverseForm({ p, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const key = useRef(newKey());
  const inFlight = useRef(false);
  const clean = reason.trim().replace(/\s+/g, ' ');
  const id = `rev-${p._id}`;
  const submit = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const { data } = await billingApi.reversePayment(p._id, clean, key.current);
      toast.success(data.message);
      onDone(data.reversal);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reach the server — press Reverse again (it will not be reversed twice).');
    } finally {
      inFlight.current = false; setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="basis-full rounded-lg p-3 mt-1 space-y-2" style={{ background: 'var(--surface)', border: '1px solid rgba(255,77,109,.35)' }} aria-label={`Reverse receipt ${p.receiptNumber}`}>
      <div className="text-xs" style={{ color: 'var(--text2)' }}>
        Reverse receipt <strong className="font-mono">{p.receiptNumber}</strong> — {rs(p.amountPaise)} {METHOD_LABEL[p.method] || p.method}, received {fmtIst(p.receivedAt)}.
        The receipt stays on record, marked reversed, and a linked correction is added.
      </div>
      <div role="note" className="rounded-md px-2.5 py-2 text-xs font-semibold" style={{ background: 'rgba(255,184,48,.12)', color: 'var(--amber)', border: '1px solid rgba(255,184,48,.3)' }}>
        {REVERSE_WARNING}
      </div>
      <div>
        <label htmlFor={`${id}-reason`} className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Why is this receipt a mistake? (required, at least 10 characters — kept internal)</label>
        <textarea id={`${id}-reason`} className="inp text-xs" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} required
          placeholder="e.g. Cash was counted twice at the desk" aria-describedby={`${id}-count`} />
        <div id={`${id}-count`} className="text-[10px] mt-0.5" style={{ color: clean.length >= 10 ? 'var(--text3)' : 'var(--amber)' }}>{clean.length}/300{clean.length < 10 ? ` — ${10 - clean.length} more needed` : ''}</div>
      </div>
      {error && <div role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{error}</div>}
      <div className="flex flex-wrap gap-2">
        <Btn type="submit" size="sm" variant="danger" disabled={busy || clean.length < 10}>{busy ? 'Reversing…' : 'Reverse receipt'}</Btn>
        <Btn type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
      </div>
    </form>
  );
}

// Internal receipt history: every receipt and every correction, with who
// and why (staff only — customer documents show neither).
function ReceiptRows({ list, onOpen, onChanged }) {
  const [reversing, setReversing] = useState(null);
  if (!list?.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Receipts">
      {list.map((p) => {
        const isRev = p.kind === 'reversal';
        const isRefund = p.kind === 'refund';
        return (
          <li key={p._id} className="rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-receipt={p.receiptNumber}
            style={{ background: 'var(--surface2)', ...(isRev ? { borderLeft: '3px solid var(--red)' } : isRefund ? { borderLeft: '3px solid #a78bfa' } : {}) }}>
            <span className="font-mono font-bold" style={{ color: isRev ? 'var(--red)' : isRefund ? '#a78bfa' : p.reversedBy ? 'var(--text3)' : 'var(--accent)', textDecoration: p.reversedBy ? 'line-through' : undefined }}>{signed(p.amountPaise)}</span>
            {isRefund
              ? <span>Refund paid out · {METHOD_LABEL[p.method] || p.method}{p.payoutReference ? ` · ${p.payoutReference}` : ''}</span>
              : isRev
              ? <span>Reversal of <span className="font-mono">{p.reversesReceipt?.receiptNumber || '—'}</span></span>
              : <span>{METHOD_LABEL[p.method] || p.method}{p.reference ? ` · ${p.reference}` : ''}</span>}
            {p.kind === 'advance' && <Badge color="blue">Advance</Badge>}
            {isRefund ? <span className="badge" style={{ background: 'rgba(167,139,250,.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,.3)' }}>Refund</span> : isRev ? <Badge color="red">Accounting correction</Badge> : <VerifiedBadge p={p} />}
            {p.reversedBy && <Badge color="red">Reversed · {p.reversedBy.receiptNumber}</Badge>}
            <span className="basis-full sm:basis-auto" style={{ color: 'var(--text3)' }}>
              {isRev ? 'Reversed' : isRefund ? 'Paid back' : 'Received'} {fmtIst(p.receivedAt)}{p.recordedByName ? ` · by ${p.recordedByName}` : ''}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {p.canReverse && onChanged && reversing !== p._id && (
                <button type="button" onClick={() => setReversing(p._id)} className="font-semibold rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ color: 'var(--red)' }}>Reverse…</button>
              )}
              <button type="button" onClick={() => onOpen(p._id)} className="font-mono underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded" style={{ color: 'var(--blue)' }}>
                {p.receiptNumber}
              </button>
            </span>
            {(isRev || isRefund) && p.reason && <div className="basis-full italic" style={{ color: 'var(--text2)' }}>Reason (internal): “{p.reason}”</div>}
            {!isRev && !isRefund && !p.canReverse && !p.reversedBy && p.verification === 'staff_recorded' && p.reverseBlockedWhy && (
              <div className="basis-full text-[11px]" style={{ color: 'var(--text3)' }}>Can't be reversed here: {p.reverseBlockedWhy}</div>
            )}
            {reversing === p._id && <ReverseForm p={p} onCancel={() => setReversing(null)} onDone={() => { setReversing(null); onChanged(); }} />}
          </li>
        );
      })}
    </ul>
  );
}

// ── One bill ─────────────────────────────────────────────────────
function BillModal({ billId, onClose, onChanged, openReceipt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const load = () => billingApi.getBill(billId).then(({ data: d }) => { setData(d); setError(null); }).catch((e) => setError(e.response?.data?.message || 'Could not load this bill.'));
  useEffect(() => { if (billId) { setData(null); setForm(false); setRefunding(false); load(); } }, [billId]);
  const bill = data?.bill;
  const bal = bill?.balance;
  const canRecord = bal && bal.outstandingPaise > 0 && !bal.reconcile.length && !bal.onHospitalInvoice && bal.state !== 'waived';
  return (
    <Modal open={!!billId} onClose={onClose} title={bill ? `Bill ${bill.billNumber}` : 'Bill'} width="max-w-2xl">
      {error ? <div role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{error} <button className="underline" onClick={load}>Retry</button></div> : !bill ? <Spinner /> : (
        <div className="space-y-4">
          <div className="text-xs" style={{ color: 'var(--text2)' }}>
            {bill.patient || bill.trip?.patientName} · Trip {bill.trip?.tripNumber} · billed {fmtIst(bill.createdAt)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['Total', bal.totalPaise, 'var(--text)'], ['Received', bal.paidPaise, 'var(--accent)'], ['Outstanding', bal.outstandingPaise, bal.outstandingPaise ? 'var(--red)' : 'var(--text3)']].map(([k, v, c]) => (
              <div key={k} className="rounded-lg p-2.5 text-center" style={{ background: 'var(--surface2)' }}>
                <div className="text-[10px] font-semibold tracking-widest" style={{ color: 'var(--text3)' }}>{k.toUpperCase()}</div>
                <div className="font-mono font-bold text-sm sm:text-base" style={{ color: c }}>{rs(v)}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center"><StateBadge balance={bal} />{bal.onHospitalInvoice && <Badge color="blue">On hospital invoice</Badge>}</div>
          <ReconcileNote reasons={bal.reconcile} />
          {bal.onHospitalInvoice && (
            <div className="text-xs" style={{ color: 'var(--text3)' }}>
              This bill is on a hospital invoice{bal.hospitalInvoice?.billingPeriod ? ` (${bal.hospitalInvoice.billingPeriod.month}/${bal.hospitalInvoice.billingPeriod.year}, ${bal.hospitalInvoice.status})` : ''} — it is collected from the hospital, so it is not in customer outstanding and no customer payment can be recorded here.
            </div>
          )}
          {bal.notItemisedPaise > 0 && (
            <div className="text-xs rounded-lg p-2.5" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
              <strong>Collection timing unverified:</strong> {rs(bal.notItemisedPaise)} was recorded as received before itemised receipts existed. It reduces this bill's balance, but there is no receipt, method or date behind it, so it is not counted in any month's collections.
            </div>
          )}
          <div>
            <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Payments received</h3>
            {data.payments.length ? <ReceiptRows list={data.payments} onOpen={openReceipt} onChanged={() => { load(); onChanged(); }} />
              : <div className="text-xs" style={{ color: 'var(--text3)' }}>No itemised payments yet.</div>}
          </div>
          {canRecord && (form
            ? <PaymentForm tripId={bill.trip?._id} kind="payment" maxPaise={bal.outstandingPaise} onCancel={() => setForm(false)} onDone={() => { setForm(false); load(); onChanged(); }} />
            : <Btn size="sm" onClick={() => setForm(true)}>Record payment</Btn>)}
          {bal.paidPaise > 0 && !form && (refunding
            ? <RefundForm tripId={bill.trip?._id} maxPaise={bal.paidPaise} onBill onCancel={() => setRefunding(false)} onDone={() => { setRefunding(false); load(); onChanged(); }} />
            : <Btn size="sm" variant="ghost" onClick={() => setRefunding(true)}>Record refund…</Btn>)}
          <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
            Receipts are never edited or deleted. The owner can reverse a mistaken staff-recorded receipt — an accounting correction only; no money is refunded.
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Trip bills tab ───────────────────────────────────────────────
const FILTERS = [
  ['outstanding', 'Outstanding'],
  ['part_paid', 'Part-paid'],
  ['paid', 'Paid'],
  ['reconcile', 'Needs reconciliation'],
  ['hospital_invoice', 'On hospital invoice'],
  ['all', 'All'],
];
// Online payments Razorpay took that could not simply be recorded — money
// may have been received, so they are listed until a person deals with them.
const ISSUE_OUTCOMES = [
  ['matched_to_bill', 'Matched to a bill (record it separately)'],
  ['refunded_at_razorpay', 'Refunded at Razorpay'],
  ['not_ours', 'Not ours / test payment'],
  ['duplicate_notice', 'Duplicate notice'],
  ['other', 'Other'],
];
const ISSUE_WHY = {
  unknown_order: 'its order matches no bill', currency: 'it was not in rupees', bad_amount: 'its amount was unreadable',
  amount_differs_from_order: 'the amount captured differs from the order', amount_differs_from_recorded: 'the amount captured differs from the receipt recorded',
};
const issueLine = (i) => `Razorpay ${i.paymentId}${i.amount ? ` · ${i.currency === 'INR' || !i.currency ? rs(i.amount) : `${i.amount} ${i.currency} (minor units)`}` : ''}${i.bill?.billNumber ? ` · bill ${i.bill.billNumber}` : ''} — ${ISSUE_WHY[i.reason] || i.reason}`;

function ResolveIssueForm({ issue, onDone, onCancel }) {
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const clean = note.trim().replace(/\s+/g, ' ');
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { data } = await billingApi.resolveProviderIssue(issue._id, outcome, clean, issue.rev || 0);
      toast.success(data.message);
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reach the server — try again.');
    } finally { setBusy(false); }
  };
  const id = `iss-${issue._id}`;
  return (
    <form onSubmit={submit} className="mt-2 rounded-lg p-2.5 space-y-2" style={{ background: 'var(--surface)', color: 'var(--text2)' }} aria-label={`Resolve ${issue.paymentId}`}>
      <div>
        <label htmlFor={`${id}-o`} className="block text-[11px] font-semibold mb-1">What did you find?</label>
        <select id={`${id}-o`} className="inp !py-1.5 text-xs" value={outcome} onChange={(e) => setOutcome(e.target.value)} required>
          <option value="" disabled>Pick one…</option>
          {ISSUE_OUTCOMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-n`} className="block text-[11px] font-semibold mb-1">Note (required, at least 10 characters)</label>
        <textarea id={`${id}-n`} className="inp !py-1.5 text-xs" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} required placeholder="e.g. Checked the Razorpay dashboard — test payment" />
      </div>
      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Records your decision only — no receipt is created and no money record changes.</div>
      {error && <div role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{error}</div>}
      <div className="flex gap-2">
        <Btn type="submit" size="sm" disabled={busy || !outcome || clean.length < 10}>{busy ? 'Saving…' : 'Mark resolved'}</Btn>
        <Btn type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
      </div>
    </form>
  );
}

// Online payments Razorpay took that could not simply be recorded — money
// may have been received, so they stay listed until the owner resolves them.
function ProviderIssues() {
  const [open, setOpen] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState(null);
  const load = () => {
    billingApi.getProviderIssues().then(({ data }) => setOpen(data.issues || [])).catch(() => {});
    billingApi.getProviderIssues('resolved').then(({ data }) => setResolved(data.issues || [])).catch(() => {});
  };
  useEffect(load, []);
  if (!open.length && !resolved.length) return null;
  const label = Object.fromEntries(ISSUE_OUTCOMES);
  return (
    <div className="card-sm mb-3 text-xs" role={open.length ? 'alert' : undefined} style={open.length ? { borderColor: 'rgba(255,184,48,.45)', color: 'var(--amber)' } : { color: 'var(--text3)' }} data-testid="provider-issues">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {open.length > 0 && (
          <button type="button" onClick={() => setExpanded((o) => !o)} aria-expanded={expanded} className="font-semibold inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded">
            <AlertTriangle size={13} aria-hidden="true" /> {open.length} online payment{open.length === 1 ? ' needs' : 's need'} review
          </button>
        )}
        {resolved.length > 0 && (
          <button type="button" onClick={() => setShowResolved((o) => !o)} aria-expanded={showResolved} className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded" style={{ color: 'var(--text3)' }}>
            Resolved ({resolved.length})
          </button>
        )}
      </div>
      {expanded && open.length > 0 && (
        <ul className="mt-2 space-y-2" style={{ color: 'var(--text2)' }}>
          {open.map((i) => (
            <li key={i._id} data-issue={i.paymentId}>
              <div className="flex flex-wrap items-center gap-2">
                <span>{issueLine(i)}. {fmtIst(i.createdAt)}</span>
                {resolving !== i._id && <button type="button" onClick={() => setResolving(i._id)} className="font-semibold rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ color: 'var(--blue)' }}>Mark resolved…</button>}
              </div>
              {resolving === i._id && <ResolveIssueForm issue={i} onCancel={() => setResolving(null)} onDone={() => { setResolving(null); load(); }} />}
            </li>
          ))}
          <li style={{ color: 'var(--text3)' }}>Check each in the Razorpay dashboard. Nothing is refunded or changed automatically.</li>
        </ul>
      )}
      {showResolved && (
        <ul className="mt-2 space-y-1" style={{ color: 'var(--text2)' }} aria-label="Resolved online payment reviews">
          {resolved.map((i) => (
            <li key={i._id} data-resolved={i.paymentId}>{issueLine(i)} — <strong>{label[i.resolution?.outcome] || i.resolution?.outcome}</strong>: “{i.resolution?.note}” · {i.resolution?.byName}, {fmtIst(i.resolvedAt)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BillsTab({ openReceipt }) {
  const [filter, setFilter] = useState('outstanding');
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const seq = useRef(0);

  const load = async (p = 1) => {
    const s = ++seq.current;
    setLoading(true);
    try {
      const { data: d } = await billingApi.getBills({ balance: filter, page: p, limit: 30 });
      if (s !== seq.current) return;
      setData(d); setRows((prev) => (p === 1 ? d.bills : [...prev, ...d.bills])); setPage(p); setError(null);
    } catch (e) {
      if (s !== seq.current) return;
      setError(e.response?.data?.message || 'Could not load bills.');
    } finally {
      if (s === seq.current) setLoading(false);
    }
  };
  useEffect(() => { setRows([]); load(1); }, [filter]);

  const t = data?.totals;
  const empty = {
    outstanding: 'Nothing outstanding — every bill is paid.', part_paid: 'No part-paid bills.', paid: 'No paid bills yet.',
    reconcile: 'No bills need reconciliation.', hospital_invoice: 'No bills are on a hospital invoice.', all: 'No bills yet.',
  }[filter];

  return (
    <div>
      <ProviderIssues />
      <div role="group" aria-label="Filter bills" className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map(([k, label]) => {
          const n = k === 'all' ? null : data?.counts?.[k];
          return (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ background: filter === k ? 'var(--surface2)' : 'var(--surface)', color: filter === k ? 'var(--text)' : 'var(--text2)', borderColor: filter === k ? 'var(--accent)' : 'rgba(255,255,255,.06)' }}>
              {label}{n != null && <span className={`badge ${k === 'reconcile' && n ? 'badge-amber' : 'badge-gray'}`} style={{ padding: '0 6px' }}>{n}</span>}
            </button>
          );
        })}
      </div>

      {t && (
        <div className="card-sm mb-3 text-xs flex flex-wrap gap-x-5 gap-y-1" style={{ color: 'var(--text2)' }} aria-live="polite">
          <span>Billed <strong className="font-mono" style={{ color: 'var(--text)' }}>{rs(t.billedPaise)}</strong></span>
          <span>Received <strong className="font-mono" style={{ color: 'var(--accent)' }}>{rs(t.receivedPaise)}</strong></span>
          <span>Outstanding <strong className="font-mono" style={{ color: t.outstandingPaise ? 'var(--red)' : 'var(--text3)' }}>{rs(t.outstandingPaise)}</strong></span>
          {t.timingUnverifiedPaise > 0 && <span style={{ color: 'var(--text3)' }}>incl. {rs(t.timingUnverifiedPaise)} collection timing unverified</span>}
          {t.onHospitalInvoicePaise > 0 && <span style={{ color: 'var(--text3)' }}>{rs(t.onHospitalInvoicePaise)} billed to hospitals (not customer outstanding)</span>}
          <span style={{ color: 'var(--text3)' }}>{data.total} bill{data.total === 1 ? '' : 's'} in this view</span>
        </div>
      )}

      {error ? (
        <div className="card" role="alert" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
          <div className="text-sm mb-2" style={{ color: 'var(--red)' }}>Error: {error}</div>
          <Btn size="sm" variant="ghost" onClick={() => load(1)}><RefreshCw size={12} aria-hidden="true" /> Retry</Btn>
        </div>
      ) : loading && !rows.length ? <Spinner /> : !rows.length ? (
        <div className="card"><Empty icon={<Receipt size={36} />} message={empty} /></div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((b) => (
            <div key={b._id} className="card-sm" data-bill={b.billNumber} style={b.balance.reconcile.length ? { borderColor: 'rgba(255,184,48,.45)' } : undefined}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{b.billNumber}</span>
                    <span className="truncate">{b.patient || b.trip?.patientName || '—'}</span>
                    <StateBadge balance={b.balance} />
                    {b.balance.reconcile.length > 0 && <Badge color="amber">Needs reconciliation</Badge>}
                    {b.balance.onHospitalInvoice && <Badge color="blue">Hospital invoice</Badge>}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                    Trip {b.trip?.tripNumber || '—'}{b.hospital?.name ? ` · ${b.hospital.name}` : ''} · {fmtIst(b.createdAt)}
                  </div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => setOpen(b._id)}>{b.balance.outstandingPaise > 0 && !b.balance.reconcile.length && !b.balance.onHospitalInvoice ? 'Payments / record' : 'Payments'}</Btn>
              </div>
              <dl className="grid grid-cols-3 gap-2 mt-2 text-xs">
                {[['Total', b.balance.totalPaise, 'var(--text)'], ['Received', b.balance.paidPaise, 'var(--accent)'], ['Outstanding', b.balance.outstandingPaise, b.balance.outstandingPaise ? 'var(--red)' : 'var(--text3)']].map(([k, v, c]) => (
                  <div key={k}><dt style={{ color: 'var(--text3)' }}>{k}</dt><dd className="font-mono font-bold" style={{ color: c }}>{rs(v)}</dd></div>
                ))}
              </dl>
            </div>
          ))}
          {data && rows.length < data.total && (
            <Btn size="sm" variant="ghost" disabled={loading} onClick={() => load(page + 1)}>{loading ? 'Loading…' : `Show more (${data.total - rows.length} more)`}</Btn>
          )}
        </div>
      )}
      <BillModal billId={open} onClose={() => setOpen(null)} onChanged={() => load(1)} openReceipt={openReceipt} />
    </div>
  );
}

// ── Advances tab ─────────────────────────────────────────────────
function AdvancesTab({ openReceipt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [formFor, setFormFor] = useState(null);
  const [refundFor, setRefundFor] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const load = () => billingApi.getAdvances().then(({ data: d }) => { setData(d); setError(null); }).catch((e) => setError(e.response?.data?.message || 'Could not load advances.'));
  useEffect(() => { load(); }, []);
  if (error) return <div className="card" role="alert"><div className="text-sm mb-2" style={{ color: 'var(--red)' }}>Error: {error}</div><Btn size="sm" variant="ghost" onClick={load}>Retry</Btn></div>;
  if (!data) return <Spinner />;
  const list = showAll ? data.trips : data.trips.filter((t) => t.advancePaise || t.reconcile.length || formFor === t._id);
  return (
    <div>
      <div className="card-sm mb-3 text-xs flex flex-wrap gap-x-5 gap-y-1 items-center" style={{ color: 'var(--text2)' }}>
        <span>Advances held (not yet on a bill) <strong className="font-mono" style={{ color: 'var(--accent)' }}>{rs(data.totals.heldPaise)}</strong></span>
        <span style={{ color: 'var(--text3)' }}>Counted into the trip's bill once, when the trip completes.</span>
        <label className="ml-auto inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all open bookings ({data.trips.length})
        </label>
      </div>
      {!list.length ? <div className="card"><Empty icon="💳" message={showAll ? 'No open bookings.' : 'No advances held. Tick "Show all open bookings" to record one.'} /></div> : (
        <div className="flex flex-col gap-2">
          {list.map((t) => (
            <div key={t._id} className="card-sm" data-trip={t.tripNumber}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{t.patientName}</span>
                    <span className="font-mono text-xs font-normal" style={{ color: 'var(--text3)' }}>{t.tripNumber}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text2)' }}>
                    Estimate {t.estimatePaise ? rs(t.estimatePaise) : '—'} · Advance received <strong>{rs(t.advancePaise)}</strong>
                    {t.coverRemainingPaise != null && t.canTakeAdvance ? ` · up to ${rs(t.coverRemainingPaise)} more` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.canTakeAdvance && formFor !== t._id && <Btn size="sm" variant="blue" onClick={() => setFormFor(t._id)}>Record advance</Btn>}
                  {t.advancePaise > 0 && refundFor !== t._id && <Btn size="sm" variant="ghost" onClick={() => setRefundFor(t._id)}>Record refund…</Btn>}
                </div>
              </div>
              {t.reconcile.length > 0 && <div className="mt-2"><ReconcileNote reasons={t.reconcile} /></div>}
              {!t.estimatePaise && t.status !== 'cancelled' && <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>No fare estimate on this booking, so an advance can't be checked against it.</div>}
              {t.payments.length > 0 && <div className="mt-2"><ReceiptRows list={t.payments} onOpen={openReceipt} onChanged={load} /></div>}
              {refundFor === t._id && (
                <div className="mt-2">
                  <RefundForm tripId={t._id} maxPaise={t.advancePaise} onCancel={() => setRefundFor(null)} onDone={() => { setRefundFor(null); load(); }} />
                </div>
              )}
              {formFor === t._id && (
                <div className="mt-2">
                  <PaymentForm tripId={t._id} kind="advance" maxPaise={t.coverRemainingPaise} onCancel={() => setFormFor(null)} onDone={() => { setFormFor(null); load(); }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hospital invoices tab (unchanged) ────────────────────────────
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function InvoicesTab() {
  const [invoices, setInvoices] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invForm, setInvForm] = useState({ hospitalId: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const loadAll = async () => {
    setLoading(true);
    try {
      const [i, h] = await Promise.all([billingApi.getInvoices(), hospitalsApi.getAll()]);
      setInvoices(i.data.invoices);
      setHospitals(h.data.hospitals);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  const genInvoice = async () => {
    if (!invForm.hospitalId) { toast.error('Select a hospital'); return; }
    await billingApi.generateInvoice(invForm);
    toast.success('Invoice generated!');
    loadAll();
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="card">
        <h3 className="font-bold font-display mb-4">Generate Invoice</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Hospital</label>
            <select className="inp" value={invForm.hospitalId} onChange={(e) => setInvForm((f) => ({ ...f, hospitalId: e.target.value }))}>
              <option value="">-- Select --</option>
              {hospitals.filter((h) => h.tieUp?.isActive).map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Month</label>
              <select className="inp" value={invForm.month} onChange={(e) => setInvForm((f) => ({ ...f, month: Number(e.target.value) }))}>
                {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Year</label>
              <input className="inp" type="number" value={invForm.year} onChange={(e) => setInvForm((f) => ({ ...f, year: Number(e.target.value) }))} />
            </div>
          </div>
          <Btn className="w-full" onClick={genInvoice}>Generate Invoice</Btn>
        </div>
      </div>
      <div className="md:col-span-2 card overflow-x-auto">
        <h3 className="font-bold font-display mb-4">Invoice History</h3>
        {loading ? <Spinner /> : invoices.length === 0 ? <Empty icon={<FileStack size={36} />} message="No invoices yet" /> : (
          <table className="tbl">
            <thead><tr><th>Invoice</th><th>Hospital</th><th>Period</th><th>Trips</th><th>Net Payable</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i._id}>
                  <td className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{i._id.slice(-8).toUpperCase()}</td>
                  <td className="text-sm font-medium">{i.hospital?.name}</td>
                  <td className="text-xs font-mono" style={{ color: 'var(--text3)' }}>{MONTHS[i.billingPeriod?.month]} {i.billingPeriod?.year}</td>
                  <td className="text-center">{i.totalTrips}</td>
                  <td className="font-bold font-mono" style={{ color: 'var(--accent)' }}>{rupee(i.netPayable)}</td>
                  <td><StatusBadge status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Bills to send (customer's bill on WhatsApp) ──────────────────
// Every completed trip's bill waits here until the owner taps Send (unless
// auto-send is on and it has no warnings). Sent once, as the trip_bill
// WhatsApp message with a link to view and pay. Numbers are masked.
const CB_VIEWS = [['to_send', 'To send'], ['sent', 'Sent'], ['dismissed', "Didn't send"]];
const CB_WARNING = {
  drop_wait_review : 'Drop waiting charged ₹0 — round trip without a "Starting Return" tap. Check the waiting time.',
  no_distance      : 'No distance recorded for this trip.',
  no_total         : 'The bill total is ₹0 or missing.',
  far_from_estimate: 'More than 25% away from the fare estimated at booking.',
  billed_elsewhere : 'Billed to a hospital or insurance, or on a hospital invoice.',
};
const CB_STATE = {
  pending_review: ['Waiting for you', 'var(--blue)'],
  sending       : ['Sending…', 'var(--text3)'],
  sent          : ['Sent', 'var(--accent)'],
  failed        : ['Not sent', 'var(--red)'],
  no_phone      : ['No mobile', 'var(--amber)'],
  dismissed     : ["Didn't send", 'var(--text3)'],
};

function CustomerBillCard({ b, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const warned = b.warnings.length > 0;
  const canAct = ['pending_review', 'failed', 'no_phone'].includes(b.state);

  const send = async () => {
    setBusy(true);
    try {
      await billingApi.sendCustomerBill(b.billId, warned && ack);
      toast.success(`Bill sent to ${b.phoneMasked || 'the customer'} on WhatsApp.`);
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'The bill could not be sent.');
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async () => {
    setBusy(true);
    try {
      await billingApi.dismissCustomerBill(b.billId);
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update this bill.');
    } finally {
      setBusy(false);
    }
  };

  const [label, color] = CB_STATE[b.state] || [b.state, 'var(--text3)'];
  const line = (k, v) => <div className="flex justify-between gap-3"><span style={{ color: 'var(--text3)' }}>{k}</span><span className="font-mono">{v}</span></div>;
  return (
    <div className="card-sm" data-customer-bill={b.billId} style={warned && canAct ? { borderColor: 'rgba(255,184,48,.45)' } : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{b.patient || 'Customer'} · <span className="font-mono">{b.tripNumber}</span></div>
          <div className="text-xs" style={{ color: 'var(--text3)' }}>
            {b.billNumber} · {b.phoneMasked || 'no mobile'} · completed {b.completedAt ? fmtIst(b.completedAt) : '—'}
          </div>
        </div>
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
      </div>

      <div className="text-xs mt-3 space-y-0.5 max-w-xs">
        {line('Fare', rupee(b.baseFare))}
        {line('Waiting', rupee(b.waitCharge))}
        {line('Extras', rupee(b.additionalCharges))}
        {line('GST', rupee(b.gstAmount))}
        <div className="flex justify-between gap-3 font-semibold pt-1" style={{ borderTop: '1px solid var(--border)' }}><span>Total</span><span className="font-mono">{rupee(b.grandTotal)}</span></div>
        {line('Paid', rupee(b.paidPaise / 100))}
        {line('Balance due', rupee(b.balancePaise / 100))}
        {b.estimatedFare > 0 && line('Estimated at booking', rupee(b.estimatedFare))}
      </div>

      {warned && (
        <ul className="text-xs mt-3 space-y-1" role={canAct ? 'alert' : undefined} style={{ color: 'var(--amber)' }}>
          {b.warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />{CB_WARNING[w] || w}</li>)}
        </ul>
      )}
      {b.error && b.state !== 'sent' && <div className="text-xs mt-2" style={{ color: 'var(--red)' }}>{b.error}</div>}
      {b.state === 'sent' && <div className="text-xs mt-2" style={{ color: 'var(--text3)' }}>Sent {fmtIst(b.sentAt)}{b.auto ? ' automatically' : b.byName ? ` by ${b.byName}` : ''}.</div>}
      {b.state === 'dismissed' && b.byName && <div className="text-xs mt-2" style={{ color: 'var(--text3)' }}>Marked "don't send" by {b.byName}.</div>}

      {canAct && (
        <div className="mt-3 space-y-2">
          {warned && (
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
              <span>I have checked the warnings above — this bill is correct.</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" onClick={send} disabled={busy || (warned && !ack)}>
              {busy ? 'Sending…' : b.state === 'failed' ? 'Try again' : 'Send on WhatsApp'}
            </Btn>
            {!confirmDismiss
              ? <Btn size="sm" variant="ghost" onClick={() => setConfirmDismiss(true)} disabled={busy}>Don't send</Btn>
              : <Btn size="sm" variant="danger" onClick={dismiss} disabled={busy}>Confirm: don't send</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerBillsTab() {
  const [view, setView] = useState('to_send');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => {
    billingApi.customerBills(view)
      .then(({ data: d }) => { setData(d); setError(''); })
      .catch((err) => setError(err?.response?.data?.message || 'Could not load the bills.'));
  };
  useEffect(() => { setData(null); load(); }, [view]);

  return (
    <div>
      <div className="card-sm mb-3 text-xs flex items-start gap-2" style={{ color: 'var(--text2)' }}>
        <ShieldCheck size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} aria-hidden="true" />
        <span>
          Each completed trip's bill goes to the customer on WhatsApp with a link to view and pay — {data?.autoSend
            ? <>automatically when it has no warnings (<strong>auto-send is on</strong>); bills with warnings wait here.</>
            : <>only when you tap <strong>Send</strong>. Auto-send is off.</>} Each bill is sent once.
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Which bills">
        {CB_VIEWS.map(([k, l]) => (
          <Btn key={k} size="sm" variant={view === k ? 'blue' : 'ghost'} onClick={() => setView(k)} aria-pressed={view === k}>{l}</Btn>
        ))}
        <Btn size="sm" variant="ghost" onClick={load} aria-label="Refresh"><RefreshCw size={13} /></Btn>
      </div>
      {error && <div role="alert" className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</div>}
      {!data && !error && <Spinner />}
      {data && !data.bills.length && <div className="card"><Empty icon={<Receipt size={36} />} message={view === 'to_send' ? 'No bills waiting to be sent.' : 'Nothing here yet.'} /></div>}
      {data && data.bills.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.bills.map((b) => <CustomerBillCard key={b.billId} b={b} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [tab, setTab] = useState('bills');
  const [receipt, setReceipt] = useState(null);
  return (
    <div className="page-enter">
      <PageHeader title="Billing & Payments" subtitle="Trip bills · payments received · advances · hospital invoices — amounts in ₹, times in India time (IST)" />
      <Tabs tabs={[{ key: 'bills', label: 'Trip Bills' }, { key: 'customer', label: 'Bills to send' }, { key: 'advances', label: 'Advances' }, { key: 'invoices', label: 'Hospital Invoices' }]} active={tab} onChange={setTab} />
      {tab === 'bills' && <BillsTab openReceipt={setReceipt} />}
      {tab === 'customer' && <CustomerBillsTab />}
      {tab === 'advances' && <AdvancesTab openReceipt={setReceipt} />}
      {tab === 'invoices' && <InvoicesTab />}
      <ReceiptModal paymentId={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
