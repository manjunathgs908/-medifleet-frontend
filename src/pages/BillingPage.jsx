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
function receiptHtml(r) {
  const p = r.payment;
  return page(p.receiptNumber, `${issuerHeader(r.issuer)}
<h2>Payment receipt ${esc(p.receiptNumber)}</h2>
<div class="amt">${esc(rs(p.amountPaise))}</div><table>
${row('Received on', fmtIst(p.receivedAt))}${row('Method', METHOD_LABEL[p.method] || p.method)}${p.reference ? row('Reference', p.reference) : ''}
${row('For', p.kind === 'advance' && !p.bill ? `Advance for trip ${p.trip?.tripNumber}` : `Trip ${p.trip?.tripNumber}${p.bill ? ` · Bill ${p.bill.billNumber}` : ''}`)}
${row('Patient', p.trip?.patientName)}
${r.balance ? row('Bill total', rs(r.balance.totalPaise)) + row('Received to date', rs(r.balance.paidPaise)) + row('Balance outstanding', `${rs(r.balance.outstandingPaise)} (as of ${fmtIst(new Date())})`) : ''}
${row('Confirmation', p.verification === 'provider_verified' ? 'Verified by Razorpay' : `Recorded by our staff on ${fmtIst(p.recordedAt)}`)}
${p.note ? row('Note', p.note) : ''}</table>
<div class="foot">This receipt confirms money received.</div>`);
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

function ReceiptRows({ list, onOpen }) {
  if (!list?.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Receipts">
      {list.map((p) => (
        <li key={p._id} className="rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ background: 'var(--surface2)' }} data-receipt={p.receiptNumber}>
          <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>{rs(p.amountPaise)}</span>
          <span>{METHOD_LABEL[p.method] || p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
          {p.kind === 'advance' && <Badge color="blue">Advance</Badge>}
          <VerifiedBadge p={p} />
          <span className="basis-full sm:basis-auto" style={{ color: 'var(--text3)' }}>
            Received {fmtIst(p.receivedAt)}{p.recordedByName ? ` · by ${p.recordedByName}` : ''}
          </span>
          <button type="button" onClick={() => onOpen(p._id)} className="ml-auto font-mono underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded" style={{ color: 'var(--blue)' }}>
            {p.receiptNumber}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── One bill ─────────────────────────────────────────────────────
function BillModal({ billId, onClose, onChanged, openReceipt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(false);
  const load = () => billingApi.getBill(billId).then(({ data: d }) => { setData(d); setError(null); }).catch((e) => setError(e.response?.data?.message || 'Could not load this bill.'));
  useEffect(() => { if (billId) { setData(null); setForm(false); load(); } }, [billId]);
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
            {data.payments.length ? <ReceiptRows list={data.payments} onOpen={openReceipt} />
              : <div className="text-xs" style={{ color: 'var(--text3)' }}>No itemised payments yet.</div>}
          </div>
          {canRecord && (form
            ? <PaymentForm tripId={bill.trip?._id} kind="payment" maxPaise={bal.outstandingPaise} onCancel={() => setForm(false)} onDone={() => { setForm(false); load(); onChanged(); }} />
            : <Btn size="sm" onClick={() => setForm(true)}>Record payment</Btn>)}
          <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
            Receipts can't be edited or deleted here. To correct one, note it and contact the account owner — corrections aren't part of this version.
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
function ProviderIssues() {
  const [issues, setIssues] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { billingApi.getProviderIssues().then(({ data }) => setIssues(data.issues || [])).catch(() => {}); }, []);
  if (!issues.length) return null;
  const WHY = {
    unknown_order: 'its order matches no bill', currency: 'it was not in rupees', bad_amount: 'its amount was unreadable',
    amount_differs_from_order: 'the amount captured differs from the order', amount_differs_from_recorded: 'the amount captured differs from the receipt recorded',
  };
  return (
    <div className="card-sm mb-3 text-xs" role="alert" style={{ borderColor: 'rgba(255,184,48,.45)', color: 'var(--amber)' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="font-semibold inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded">
        <AlertTriangle size={13} aria-hidden="true" /> {issues.length} online payment{issues.length === 1 ? ' needs' : 's need'} review
      </button>
      {open && (
        <ul className="mt-2 space-y-1" style={{ color: 'var(--text2)' }}>
          {issues.map((i) => (
            <li key={i._id}>Razorpay {i.paymentId}{i.amount ? ` · ${i.currency === 'INR' || !i.currency ? rs(i.amount) : `${i.amount} ${i.currency} (minor units)`}` : ''}{i.bill?.billNumber ? ` · bill ${i.bill.billNumber}` : ''} — {WHY[i.reason] || i.reason}. {fmtIst(i.createdAt)}</li>
          ))}
          <li style={{ color: 'var(--text3)' }}>Check each in the Razorpay dashboard. Nothing is refunded or changed automatically.</li>
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
                {t.canTakeAdvance && formFor !== t._id && <Btn size="sm" variant="blue" onClick={() => setFormFor(t._id)}>Record advance</Btn>}
              </div>
              {t.reconcile.length > 0 && <div className="mt-2"><ReconcileNote reasons={t.reconcile} /></div>}
              {!t.estimatePaise && t.status !== 'cancelled' && <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>No fare estimate on this booking, so an advance can't be checked against it.</div>}
              {t.payments.length > 0 && <div className="mt-2"><ReceiptRows list={t.payments} onOpen={openReceipt} /></div>}
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

export default function BillingPage() {
  const [tab, setTab] = useState('bills');
  const [receipt, setReceipt] = useState(null);
  return (
    <div className="page-enter">
      <PageHeader title="Billing & Payments" subtitle="Trip bills · payments received · advances · hospital invoices — amounts in ₹, times in India time (IST)" />
      <Tabs tabs={[{ key: 'bills', label: 'Trip Bills' }, { key: 'advances', label: 'Advances' }, { key: 'invoices', label: 'Hospital Invoices' }]} active={tab} onChange={setTab} />
      {tab === 'bills' && <BillsTab openReceipt={setReceipt} />}
      {tab === 'advances' && <AdvancesTab openReceipt={setReceipt} />}
      {tab === 'invoices' && <InvoicesTab />}
      <ReceiptModal paymentId={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
