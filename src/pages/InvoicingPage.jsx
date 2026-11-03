// src/pages/InvoicingPage.jsx
//
// GST invoicing (owner only) — Phase 1 of replacing Vyapar:
//   Invoices  — tax invoices and bills of supply: draft → issue (number
//               given) → print / Save as PDF; money received; cancel.
//   Parties   — companies (GSTIN), unregistered businesses, consumers, with
//               their running balance.
//   Services  — the catalog: SAC/HSN, unit, rate, tax type, GST rate.
//   Settings  — bank, UPI, terms, and where each number series starts.
// Every tax figure comes from the server (POST /invoicing/invoices/calculate
// for the live preview); this page never works out GST itself.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Printer, Pencil, Trash2, Send, Ban, IndianRupee, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { invoicingApi } from '../api/client';
import { PageHeader, Btn, Modal, Tabs, Spinner, Empty, Badge, Input, Select } from '../components/ui';
import { rs, printHtml } from '../lib/customerDocs';
import { gstInvoiceHtml } from '../lib/gstInvoiceDoc';

const errMsg = (err, fallback) => err?.response?.data?.message || fallback;
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const dayOf = (v) => (v ? new Date(new Date(v).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10) : '');
const showDay = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const rupeesText = (paise) => (paise == null ? '' : String(paise / 100));

const KIND_LABEL = { registered: 'Registered business', unregistered: 'Unregistered business', consumer: 'Consumer' };
const TAX_LABEL = { taxable: 'Taxable', exempt: 'Exempt', nil: 'Nil rated', non_gst: 'Non-GST' };
const PAY_BADGE = { paid: ['green', 'Paid'], partial: ['amber', 'Partly paid'], unpaid: ['red', 'Unpaid'] };
const STATUS_BADGE = { draft: ['gray', 'Draft'], cancelled: ['gray', 'Cancelled'] };
const PAY_MODES = [['bank_transfer', 'Bank transfer'], ['upi', 'UPI'], ['cash', 'Cash'], ['cheque', 'Cheque'], ['card', 'Card'], ['other', 'Other']];

function useLookups() {
  const [data, setData] = useState({ parties: [], items: [], states: [], rates: [], supplierState: '29' });
  const load = () => Promise.all([invoicingApi.parties(), invoicingApi.items(), invoicingApi.settings()])
    .then(([p, i, s]) => setData({ parties: p.data.parties, items: i.data.items, rates: i.data.rates, states: s.data.states, supplierState: s.data.supplierState }))
    .catch(() => {});
  useEffect(() => { load(); }, []);
  return [data, load];
}

function Problems({ list }) {
  if (!list?.length) return null;
  return (
    <ul role="alert" className="text-xs space-y-1 mt-2" style={{ color: 'var(--amber)' }}>
      {list.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />{p}</li>)}
    </ul>
  );
}

// ── Invoice editor (drafts) ─────────────────────────────────────
const blankLine = () => ({ item: '', name: '', code: '', unit: 'Nos', qty: '1', rate: '', discount: '', taxType: 'taxable', gstRate: '18', reverseCharge: false });

function InvoiceEditor({ open, draft, lookups, onClose, onSaved }) {
  const { parties, items, states, rates } = lookups;
  const [f, setF] = useState(null);
  const [calc, setCalc] = useState(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (draft) {
      setF({
        party: String(draft.party), date: dayOf(draft.date), placeOfSupply: draft.placeOfSupply, paymentMode: draft.paymentMode,
        roundOff: draft.roundOff !== false, description: draft.description || '', terms: draft.terms || '',
        transport: { driverName: '', vehicleNumber: '', pickup: '', drop: '', ...(draft.transport || {}) },
        serviceLocation: { siteName: '', address: '', attention: '', ...(draft.serviceLocation || {}) },
        lines: draft.lines.map((l) => ({
          item: l.item ? String(l.item) : '', name: l.name, code: l.code || '', unit: l.unit || 'Nos', qty: String(l.qtyMilli / 1000),
          rate: rupeesText(l.ratePaise), discount: l.discountPercent == null && l.discountPaise ? rupeesText(l.discountPaise) : '',
          discountPercent: l.discountPercent ?? '', taxType: l.taxType, gstRate: String(l.gstRate || 0), reverseCharge: !!l.reverseCharge,
        })),
        rev: draft.rev,
      });
    } else {
      setF({ party: '', date: today(), placeOfSupply: '', paymentMode: 'credit', roundOff: true, description: '', terms: '', transport: { driverName: '', vehicleNumber: '', pickup: '', drop: '' }, serviceLocation: { siteName: '', address: '', attention: '' }, lines: [blankLine()] });
    }
    setCalc(null);
  }, [open, draft]);

  const body = useMemo(() => f && ({
    party: f.party, date: f.date, placeOfSupply: f.placeOfSupply || undefined, paymentMode: f.paymentMode, roundOff: f.roundOff,
    description: f.description, terms: f.terms, transport: f.transport, serviceLocation: f.serviceLocation,
    lines: f.lines.map((l) => ({
      item: l.item || undefined, name: l.name, code: l.code, unit: l.unit, qty: l.qty, rate: l.rate,
      discount: l.discountPercent === '' || l.discountPercent == null ? l.discount : undefined,
      discountPercent: l.discountPercent === '' || l.discountPercent == null ? undefined : Number(l.discountPercent),
      taxType: l.taxType, gstRate: Number(l.gstRate), reverseCharge: l.reverseCharge,
    })),
  }), [f]);

  // Live preview, worked out by the server.
  useEffect(() => {
    if (!body?.party) { setCalc(null); return undefined; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      invoicingApi.calculate(body).then(({ data }) => setCalc(data)).catch((err) => setCalc({ problems: [errMsg(err, 'Could not work out the totals.')] }));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [body]);

  if (!f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setLine = (i, patch) => setF((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const pickItem = (i, id) => {
    const it = items.find((x) => String(x._id) === id);
    if (!it) return setLine(i, { item: '' });
    return setLine(i, { item: id, name: it.name, code: it.code, unit: it.unit, rate: rupeesText(it.ratePaise), taxType: it.taxType, gstRate: String(it.gstRate || 0), reverseCharge: !!it.reverseCharge });
  };
  const party = parties.find((p) => String(p._id) === f.party);
  const inv = calc?.invoice;

  // An issued invoice keeps its number. With money already received, the
  // server asks before amounts, GST or the party change; the owner confirms.
  const issued = draft?.status === 'issued';
  const save = async () => {
    setSaving(true);
    try {
      let data;
      if (!draft) ({ data } = await invoicingApi.createInvoice(body));
      else {
        try {
          ({ data } = await invoicingApi.updateInvoice(draft._id, { ...body, rev: f.rev }));
        } catch (err) {
          const d = err?.response?.data;
          if (d?.reason !== 'financial_change_needs_confirm' || !window.confirm(d.message)) throw err;
          ({ data } = await invoicingApi.updateInvoice(draft._id, { ...body, rev: f.rev, confirmFinancialChange: true }));
        }
      }
      toast.success(issued ? `Saved ${draft.number}.` : 'Draft saved.');
      onSaved(data.invoice._id);
    } catch (err) {
      if (err?.response?.data?.reason !== 'financial_change_needs_confirm') toast.error(errMsg(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={issued ? `Edit ${draft.docType === 'bill_of_supply' ? 'bill' : 'invoice'} ${draft.number}` : draft ? 'Edit draft invoice' : 'New invoice'} width="max-w-5xl">
      {issued && (
        <div className="card-sm mb-3 text-xs" style={draft.receivedPaise > 0 ? { borderColor: 'rgba(255,184,48,.45)', color: 'var(--amber)' } : { color: 'var(--text2)' }}>
          The number {draft.number} stays the same. Totals and GST are worked out again when you save.
          {draft.receivedPaise > 0 && <> {rs(draft.receivedPaise)} has been received: driver, vehicle, description, site and terms can be changed freely; changing amounts, GST or the party asks you to confirm first.</>}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        <Select label="Party" value={f.party} onChange={(e) => { const p = parties.find((x) => String(x._id) === e.target.value); setF((x) => ({ ...x, party: e.target.value, placeOfSupply: p?.stateCode || '' })); }}>
          <option value="">Choose…</option>
          {parties.map((p) => <option key={p._id} value={p._id}>{p.name}{p.gstin ? ` (${p.gstin})` : ''}</option>)}
        </Select>
        <Input label="Invoice date" type="date" value={f.date} max={today()} onChange={(e) => set('date', e.target.value)} />
        <Select label="Place of supply" value={f.placeOfSupply} onChange={(e) => set('placeOfSupply', e.target.value)}>
          <option value="">{party ? 'Party\'s state' : 'Choose…'}</option>
          {states.map((s) => <option key={s.code} value={s.code}>{s.code}-{s.name}</option>)}
        </Select>
        <Select label="Payment" value={f.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}>
          <option value="credit">Credit</option><option value="cash">Cash (paid now)</option>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-3 mt-3">
        <Input label="Service location — site name (optional)" placeholder="e.g. Kalpataru — Hebbal metro site" value={f.serviceLocation.siteName} onChange={(e) => set('serviceLocation', { ...f.serviceLocation, siteName: e.target.value })} />
        <Input label="Site address" value={f.serviceLocation.address} onChange={(e) => set('serviceLocation', { ...f.serviceLocation, address: e.target.value })} />
        <Input label="Kind attn: (contact at the site)" value={f.serviceLocation.attention} onChange={(e) => set('serviceLocation', { ...f.serviceLocation, attention: e.target.value })} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 900 }}>
          <thead><tr style={{ color: 'var(--text3)' }} className="text-left">
            <th className="p-1">Service</th><th className="p-1">Name on invoice</th><th className="p-1 w-20">SAC/HSN</th><th className="p-1 w-16">Qty</th><th className="p-1 w-16">Unit</th>
            <th className="p-1 w-24">Rate ₹</th><th className="p-1 w-20">Disc ₹</th><th className="p-1 w-24">Tax</th><th className="p-1 w-16">GST %</th><th className="p-1 w-24 text-right">Amount</th><th />
          </tr></thead>
          <tbody>
            {f.lines.map((l, i) => (
              <tr key={i}>
                <td className="p-1"><select className="inp" value={l.item} onChange={(e) => pickItem(i, e.target.value)} aria-label={`Line ${i + 1} service`}>
                  <option value="">—</option>{items.map((it) => <option key={it._id} value={it._id}>{it.name}</option>)}
                </select></td>
                <td className="p-1"><input className="inp" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} aria-label={`Line ${i + 1} name`} /></td>
                <td className="p-1"><input className="inp font-mono" value={l.code} onChange={(e) => setLine(i, { code: e.target.value })} aria-label={`Line ${i + 1} SAC or HSN`} /></td>
                <td className="p-1"><input className="inp" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label={`Line ${i + 1} quantity`} /></td>
                <td className="p-1"><input className="inp" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} aria-label={`Line ${i + 1} unit`} /></td>
                <td className="p-1"><input className="inp" inputMode="decimal" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} aria-label={`Line ${i + 1} rate`} /></td>
                <td className="p-1"><input className="inp" inputMode="decimal" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value, discountPercent: '' })} aria-label={`Line ${i + 1} discount`} /></td>
                <td className="p-1"><select className="inp" value={l.taxType} onChange={(e) => setLine(i, { taxType: e.target.value })} aria-label={`Line ${i + 1} tax type`}>
                  {Object.entries(TAX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></td>
                <td className="p-1"><select className="inp" value={l.gstRate} disabled={l.taxType !== 'taxable'} onChange={(e) => setLine(i, { gstRate: e.target.value })} aria-label={`Line ${i + 1} GST rate`}>
                  {rates.map((r) => <option key={r} value={String(r)}>{r}%</option>)}
                </select></td>
                <td className="p-1 text-right font-mono">{inv?.lines?.[i] ? rs(inv.lines[i].totalPaise) : '—'}</td>
                <td className="p-1">{f.lines.length > 1 && <button type="button" onClick={() => set('lines', f.lines.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Btn size="sm" variant="ghost" className="mt-2" onClick={() => set('lines', [...f.lines, blankLine()])}><Plus size={13} /> Add line</Btn>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <div className="space-y-3">
          <Input label="Description (printed, e.g. MONTH OF NOVEMBER)" value={f.description} onChange={(e) => set('description', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Driver name" value={f.transport.driverName} onChange={(e) => set('transport', { ...f.transport, driverName: e.target.value })} />
            <Input label="Vehicle number" value={f.transport.vehicleNumber} onChange={(e) => set('transport', { ...f.transport, vehicleNumber: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 tracking-wide uppercase" style={{ color: 'var(--text2)' }}>Terms for this invoice only (leave blank to print the default terms from Settings)</label>
            <textarea className="inp" rows={3} value={f.terms} onChange={(e) => set('terms', e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.roundOff} onChange={(e) => set('roundOff', e.target.checked)} /> Round off the total to the rupee</label>
        </div>
        <div className="card-sm text-sm">
          {!inv && <div style={{ color: 'var(--text3)' }}>{f.party ? 'Working out…' : 'Choose a party to see the totals.'}</div>}
          {inv && (
            <div className="space-y-1">
              <div className="text-xs mb-2" style={{ color: 'var(--text3)' }}>
                {inv.docType === 'bill_of_supply' ? 'Bill of supply (exempt — no GST)' : 'Tax invoice'} · {inv.supplyType === 'intra' ? 'CGST + SGST' : 'IGST'} · place of supply {inv.placeOfSupply}-{inv.placeOfSupplyName}{inv.reverseCharge ? ' · reverse charge' : ''}
              </div>
              <Row k="Taxable value" v={rs(inv.totals.taxablePaise)} />
              {inv.supplyType === 'intra' ? <><Row k="CGST" v={rs(inv.totals.cgstPaise)} /><Row k="SGST" v={rs(inv.totals.sgstPaise)} /></> : <Row k="IGST" v={rs(inv.totals.igstPaise)} />}
              {inv.totals.roundOffPaise !== 0 && <Row k="Round off" v={`${inv.totals.roundOffPaise > 0 ? '+' : '−'}${rs(Math.abs(inv.totals.roundOffPaise))}`} />}
              <div className="flex justify-between font-bold pt-1" style={{ borderTop: '1px solid var(--border)' }}><span>Total</span><span className="font-mono">{rs(inv.totals.grandTotalPaise)}</span></div>
              <div className="text-xs" style={{ color: 'var(--text3)' }}>{calc.amountInWords}</div>
            </div>
          )}
          <Problems list={calc?.problems} />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        <Btn onClick={save} disabled={saving || !f.party}>{saving ? 'Saving…' : issued ? 'Save changes' : 'Save draft'}</Btn>
      </div>
    </Modal>
  );
}
const Row = ({ k, v }) => <div className="flex justify-between"><span style={{ color: 'var(--text3)' }}>{k}</span><span className="font-mono">{v}</span></div>;

// ── Invoice view: preview, issue, print, payment, cancel ─────────
function InvoiceView({ id, onClose, onChanged, onEdit }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // 'pay' | 'cancel' | 'delete'
  const [pay, setPay] = useState({ amount: '', receivedOn: today(), mode: 'bank_transfer', reference: '' });
  const [reason, setReason] = useState('');
  // Permanently deleting a cancelled tax invoice: the server's preview, then
  // the typed confirmation word.
  const [delPreview, setDelPreview] = useState(null);
  const [delWord, setDelWord] = useState('');
  const load = () => invoicingApi.invoice(id).then(({ data: d }) => setData(d)).catch((err) => toast.error(errMsg(err, 'Could not load the invoice.')));
  useEffect(() => { if (id) { setData(null); setMode(null); setDelPreview(null); setDelWord(''); load(); } }, [id]);
  const openDelete = () => {
    setMode('delete'); setDelPreview(null); setDelWord('');
    invoicingApi.previewDeleteCancelled(id).then(({ data: d }) => setDelPreview(d)).catch((err) => toast.error(errMsg(err, 'Could not check.')));
  };
  const deletePermanently = async () => {
    setBusy(true);
    try {
      const { data: d } = await invoicingApi.deleteCancelled(id, delWord);
      toast.success(d.message);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Nothing was deleted.'));
      openDelete();
    } finally { setBusy(false); }
  };
  if (!id) return null;
  const inv = data?.invoice;
  const html = data ? gstInvoiceHtml(data) : '';

  const act = async (fn, okText) => {
    setBusy(true);
    try {
      const { data: d } = await fn();
      toast.success(d?.message || okText);
      setMode(null);
      await load();
      onChanged();
    } catch (err) {
      const d = err?.response?.data;
      toast.error(d?.message || 'That did not go through.');
      if (d?.problems) setData((x) => ({ ...x, problems: d.problems }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!id} onClose={onClose} title={inv ? `${data.print.title} ${inv.number || '(draft)'}` : 'Invoice'} width="max-w-5xl">
      {!data && <Spinner />}
      {data && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {inv.status === 'draft' && <>
              <Btn size="sm" onClick={() => act(() => invoicingApi.issue(inv._id, inv.rev), 'Issued.')} disabled={busy || data.problems?.length > 0}><Send size={13} /> Issue</Btn>
              <Btn size="sm" variant="ghost" onClick={() => onEdit(inv)}><Pencil size={13} /> Edit</Btn>
              <Btn size="sm" variant="danger" disabled={busy} onClick={async () => {
                if (!window.confirm('Delete this draft? It has no number, so nothing else changes.')) return;
                try { await invoicingApi.deleteDraft(inv._id); toast.success('Draft deleted.'); onChanged(); onClose(); } catch (err) { toast.error(errMsg(err, 'Could not delete it.')); }
              }}><Trash2 size={13} /> Delete draft</Btn>
            </>}
            <Btn size="sm" variant="ghost" onClick={() => printHtml(html)}><Printer size={13} /> Print / Save as PDF</Btn>
            {inv.status === 'issued' && <Btn size="sm" variant="ghost" onClick={() => onEdit(inv)}><Pencil size={13} /> Edit</Btn>}
            {inv.status === 'issued' && inv.balancePaise > 0 && <Btn size="sm" variant="blue" onClick={() => setMode('pay')}><IndianRupee size={13} /> Record money received</Btn>}
            {inv.status === 'issued' && !(inv.receivedPaise > 0) && <Btn size="sm" variant="danger" onClick={() => setMode('cancel')}><Ban size={13} /> Cancel invoice</Btn>}
            {inv.status === 'cancelled' && inv.docType === 'tax_invoice' && !(inv.receivedPaise > 0) && <Btn size="sm" variant="danger" onClick={openDelete}><Trash2 size={13} /> Delete permanently</Btn>}
          </div>
          {mode === 'delete' && (
            <div className="card-sm mb-3 space-y-2" style={{ borderColor: 'rgba(255,77,109,.45)' }}>
              <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--red)' }}><AlertTriangle size={15} aria-hidden="true" /> Delete {inv.number} permanently</div>
              <div className="text-xs" style={{ color: 'var(--text2)' }}>
                Only for a bill issued in error that was <strong>never sent to the customer and not reported in GSTR-1</strong>. The invoice is removed from the CRM for good; this cannot be undone.
              </div>
              {!delPreview && <Spinner />}
              {delPreview && (delPreview.canDelete
                ? (
                  <>
                    <div className="text-xs" style={delPreview.numberReused ? { color: 'var(--accent)' } : { color: 'var(--amber)' }}>
                      {delPreview.numberReused ? '' : <AlertTriangle size={13} className="inline mr-1" aria-hidden="true" />}{delPreview.message}
                    </div>
                    <div className="flex flex-wrap gap-2 items-end">
                      <Input label={`Type ${delPreview.confirmWord} to confirm`} value={delWord} onChange={(e) => setDelWord(e.target.value)} />
                      <Btn size="sm" variant="danger" onClick={deletePermanently} disabled={busy || delWord.trim() !== delPreview.confirmWord}>{busy ? 'Deleting…' : 'Delete permanently'}</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setMode(null)}>Keep it</Btn>
                    </div>
                  </>
                )
                : <Problems list={delPreview.problems} />)}
            </div>
          )}
          {inv.status === 'draft' && (data.problems?.length
            ? <div className="card-sm mb-3"><div className="text-xs font-semibold">Fix these before issuing:</div><Problems list={data.problems} /></div>
            : <div className="text-xs mb-3" style={{ color: 'var(--text3)' }}>Issuing gives it the next number and freezes it. After that it can only be cancelled.</div>)}

          {mode === 'pay' && (
            <div className="card-sm mb-3 grid gap-2 md:grid-cols-5 items-end">
              <Input label={`Amount ₹ (due ${rs(inv.balancePaise)})`} inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <Input label="Received on" type="date" max={today()} value={pay.receivedOn} onChange={(e) => setPay({ ...pay, receivedOn: e.target.value })} />
              <Select label="How" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{PAY_MODES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              <Input label="Reference (UTR / cheque)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              <div className="flex gap-2"><Btn size="sm" onClick={() => act(() => invoicingApi.recordPayment(inv._id, pay), 'Recorded.')} disabled={busy}>Save</Btn><Btn size="sm" variant="ghost" onClick={() => setMode(null)}>Close</Btn></div>
            </div>
          )}
          {mode === 'cancel' && (
            <div className="card-sm mb-3 space-y-2">
              <div className="text-xs">Cancelling keeps the number {inv.number} as used and marks it cancelled. It is reported as cancelled in GSTR-1.</div>
              <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2"><Btn size="sm" variant="danger" onClick={() => act(() => invoicingApi.cancel(inv._id, reason), 'Cancelled.')} disabled={busy || reason.trim().length < 5}>Confirm cancel</Btn><Btn size="sm" variant="ghost" onClick={() => setMode(null)}>Keep it</Btn></div>
            </div>
          )}
          {inv.payments?.length > 0 && (
            <div className="text-xs mb-3" style={{ color: 'var(--text2)' }}>
              Received: {inv.payments.map((p) => `${rs(p.amountPaise)} on ${showDay(p.receivedOn)} (${(PAY_MODES.find(([k]) => k === p.mode) || [])[1] || p.mode}${p.reference ? `, ${p.reference}` : ''})`).join(' · ')}
            </div>
          )}
          <iframe title="Invoice preview" srcDoc={html} className="w-full rounded-lg" style={{ height: '70vh', background: '#fff', border: '1px solid var(--border)' }} />
        </>
      )}
    </Modal>
  );
}

// ── Invoices tab ────────────────────────────────────────────────
function InvoicesTab({ lookups, reloadLookups }) {
  const [filter, setFilter] = useState({ status: '', payment: '' });
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // {} new | draft
  const [viewing, setViewing] = useState(null);
  const load = () => invoicingApi.invoices({ status: filter.status || undefined, payment: filter.payment || undefined }).then(({ data }) => setList(data.invoices)).catch(() => setList([]));
  useEffect(() => { load(); }, [filter]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <Btn onClick={() => setEditing({})} disabled={!lookups.parties.length}><Plus size={14} /> New invoice</Btn>
        <Select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="Status">
          <option value="">All</option><option value="draft">Drafts</option><option value="issued">Issued</option><option value="cancelled">Cancelled</option>
        </Select>
        <Select value={filter.payment} onChange={(e) => setFilter({ ...filter, payment: e.target.value })} aria-label="Payment">
          <option value="">Any payment</option><option value="unpaid">Unpaid</option><option value="partial">Partly paid</option><option value="paid">Paid</option>
        </Select>
        <Btn size="sm" variant="ghost" onClick={load} aria-label="Refresh"><RefreshCw size={13} /></Btn>
      </div>
      {!lookups.parties.length && <div className="text-xs mb-3" style={{ color: 'var(--text3)' }}>Add a party and a service first (Parties and Services tabs).</div>}
      {!list && <Spinner />}
      {list && !list.length && <div className="card"><Empty message="No invoices yet." /></div>}
      {list?.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs" style={{ color: 'var(--text3)' }}><th className="p-3">Number</th><th className="p-3">Date</th><th className="p-3">Party</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Balance</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {list.map((i) => {
                const [c, l] = i.status === 'issued' ? PAY_BADGE[i.paymentState] : STATUS_BADGE[i.status];
                return (
                  <tr key={i._id} onClick={() => setViewing(i._id)} className="cursor-pointer hover:bg-[var(--surface2)]" style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="p-3 font-mono">{i.number || '—'}{i.docType === 'bill_of_supply' && <span className="text-xs ml-1" style={{ color: 'var(--text3)' }}>BoS</span>}</td>
                    <td className="p-3">{showDay(i.date)}</td>
                    <td className="p-3">{i.partyName}{i.serviceLocation?.siteName && <div className="text-xs" style={{ color: 'var(--text3)' }}>{i.serviceLocation.siteName}</div>}</td>
                    <td className="p-3 text-right font-mono">{rs(i.totals?.grandTotalPaise || 0)}</td>
                    <td className="p-3 text-right font-mono">{i.balancePaise == null ? '—' : rs(i.balancePaise)}</td>
                    <td className="p-3"><Badge color={c}>{l}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <InvoiceEditor open={!!editing} draft={editing?._id ? editing : null} lookups={lookups} onClose={() => setEditing(null)}
        onSaved={(id) => { setEditing(null); load(); reloadLookups(); setViewing(id); }} />
      <InvoiceView id={viewing} onClose={() => setViewing(null)} onChanged={() => { load(); reloadLookups(); }}
        onEdit={(draft) => { setViewing(null); setEditing(draft); }} />
    </div>
  );
}

// ── Parties tab ─────────────────────────────────────────────────
function PartyForm({ party, states, onDone, onCancel }) {
  const [f, setF] = useState(() => ({
    name: party?.name || '', kind: party?.kind || 'registered', gstin: party?.gstin || '', stateCode: party?.stateCode || '29',
    address: { line1: '', line2: '', city: '', pincode: '', ...(party?.address || {}) }, phone: party?.phone || '', email: party?.email || '',
    creditDays: String(party?.creditDays ?? 30), openingBalance: rupeesText(party?.openingBalancePaise || 0),
    openingBalanceAsOf: party?.openingBalanceAsOf ? dayOf(party.openingBalanceAsOf) : '2026-11-30',
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, creditDays: Number(f.creditDays), gstin: f.kind === 'registered' ? f.gstin : '' };
      if (party) await invoicingApi.updateParty(party._id, body); else await invoicingApi.createParty(body);
      toast.success('Saved.');
      onDone();
    } catch (err) {
      toast.error(errMsg(err, 'Could not save the party.'));
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <Select label="Type" value={f.kind} onChange={(e) => set('kind', e.target.value)}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        {f.kind === 'registered'
          ? <Input label="GSTIN (state is taken from it)" value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} />
          : <Select label="State" value={f.stateCode} onChange={(e) => set('stateCode', e.target.value)}>{states.map((s) => <option key={s.code} value={s.code}>{s.code}-{s.name}</option>)}</Select>}
        <Input label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input label="Address line 1" value={f.address.line1} onChange={(e) => set('address', { ...f.address, line1: e.target.value })} />
        <Input label="Address line 2" value={f.address.line2} onChange={(e) => set('address', { ...f.address, line2: e.target.value })} />
        <Input label="City" value={f.address.city} onChange={(e) => set('address', { ...f.address, city: e.target.value })} />
        <Input label="PIN code" inputMode="numeric" value={f.address.pincode} onChange={(e) => set('address', { ...f.address, pincode: e.target.value })} />
        <Input label="Email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Credit days" inputMode="numeric" value={f.creditDays} onChange={(e) => set('creditDays', e.target.value)} />
        <Input label="Opening balance ₹ (owed at cutover)" inputMode="decimal" value={f.openingBalance} onChange={(e) => set('openingBalance', e.target.value)} />
        <Input label="Opening balance as of" type="date" value={f.openingBalanceAsOf} onChange={(e) => set('openingBalanceAsOf', e.target.value)} />
      </div>
      <div className="flex justify-end gap-2"><Btn variant="ghost" onClick={onCancel}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></div>
    </div>
  );
}

function PartiesTab({ lookups, reload }) {
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <Btn className="mb-3" onClick={() => setEditing({})}><Plus size={14} /> Add party</Btn>
      {!lookups.parties.length ? <div className="card"><Empty message="No parties yet — add NCC, Kalpataru, Udayaravi and the rest." /></div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs" style={{ color: 'var(--text3)' }}><th className="p-3">Party</th><th className="p-3">GSTIN / state</th><th className="p-3 text-right">Invoices</th><th className="p-3 text-right">Balance</th><th className="p-3" /></tr></thead>
            <tbody>{lookups.parties.map((p) => (
              <tr key={p._id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="p-3"><div className="font-semibold">{p.name}</div><div className="text-xs" style={{ color: 'var(--text3)' }}>{KIND_LABEL[p.kind]}{p.creditDays ? ` · ${p.creditDays} days credit` : ''}</div></td>
                <td className="p-3 text-xs"><div className="font-mono">{p.gstin || '—'}</div>{p.stateCode}-{p.stateName}</td>
                <td className="p-3 text-right">{p.invoiceCount}</td>
                <td className="p-3 text-right font-mono">{rs(p.balancePaise)}{p.openingBalancePaise > 0 && <div className="text-xs" style={{ color: 'var(--text3)' }}>incl. opening {rs(p.openingBalancePaise)}</div>}</td>
                <td className="p-3"><Btn size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil size={13} /></Btn></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?._id ? 'Edit party' : 'Add party'} width="max-w-2xl">
        {editing && <PartyForm party={editing._id ? editing : null} states={lookups.states} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
    </div>
  );
}

// ── Services tab ────────────────────────────────────────────────
function ItemForm({ item, rates, onDone, onCancel }) {
  const [f, setF] = useState(() => ({
    name: item?.name || '', kind: item?.kind || 'service', code: item?.code || '', unit: item?.unit || 'Nos',
    rate: rupeesText(item?.ratePaise || 0), taxType: item?.taxType || 'taxable', gstRate: String(item?.gstRate || 18), reverseCharge: !!item?.reverseCharge,
    description: item?.description || '', active: item?.active !== false,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, gstRate: Number(f.gstRate) };
      if (item) await invoicingApi.updateItem(item._id, body); else await invoicingApi.createItem(body);
      toast.success('Saved.');
      onDone();
    } catch (err) {
      toast.error(errMsg(err, 'Could not save the service.'));
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <Select label="Kind" value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="service">Service (SAC)</option><option value="goods">Goods (HSN)</option></Select>
        <Input label={f.kind === 'service' ? 'SAC code (6 digits, e.g. 999315)' : 'HSN code'} value={f.code} onChange={(e) => set('code', e.target.value)} />
        <Input label="Unit (Month, Trip, Km…)" value={f.unit} onChange={(e) => set('unit', e.target.value)} />
        <Input label="Default rate ₹ (before tax)" inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} />
        <Select label="Tax type" value={f.taxType} onChange={(e) => set('taxType', e.target.value)}>{Object.entries(TAX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        {f.taxType === 'taxable' && <Select label="GST rate" value={f.gstRate} onChange={(e) => set('gstRate', e.target.value)}>{rates.map((r) => <option key={r} value={String(r)}>{r}%</option>)}</Select>}
        {f.taxType === 'taxable' && <label className="flex items-center gap-2 text-xs mt-6"><input type="checkbox" checked={f.reverseCharge} onChange={(e) => set('reverseCharge', e.target.checked)} /> Reverse charge (the recipient pays the GST)</label>}
      </div>
      {item && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> In use (untick to hide from new invoices)</label>}
      <div className="text-xs" style={{ color: 'var(--amber)' }}>The SAC, tax type and rate decide the GST on every invoice. Confirm them with your GST practitioner.</div>
      <div className="flex justify-end gap-2"><Btn variant="ghost" onClick={onCancel}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></div>
    </div>
  );
}

function ItemsTab({ lookups, reload }) {
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <Btn className="mb-3" onClick={() => setEditing({})}><Plus size={14} /> Add service</Btn>
      {!lookups.items.length ? <div className="card"><Empty message="No services yet — e.g. Hiring for BLS Eeco Ambulance, 999315, Month, 18%." /></div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs" style={{ color: 'var(--text3)' }}><th className="p-3">Service</th><th className="p-3">SAC/HSN</th><th className="p-3">Unit</th><th className="p-3 text-right">Rate</th><th className="p-3">GST</th><th className="p-3" /></tr></thead>
            <tbody>{lookups.items.map((i) => (
              <tr key={i._id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="p-3 font-semibold">{i.name}</td><td className="p-3 font-mono">{i.code}</td><td className="p-3">{i.unit}</td>
                <td className="p-3 text-right font-mono">{rs(i.ratePaise)}</td>
                <td className="p-3">{i.taxType === 'taxable' ? `${i.gstRate}%${i.reverseCharge ? ' (RCM)' : ''}` : TAX_LABEL[i.taxType]}</td>
                <td className="p-3"><Btn size="sm" variant="ghost" onClick={() => setEditing(i)}><Pencil size={13} /></Btn></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?._id ? 'Edit service' : 'Add service'} width="max-w-2xl">
        {editing && <ItemForm item={editing._id ? editing : null} rates={lookups.rates} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
    </div>
  );
}

// ── Settings tab ────────────────────────────────────────────────
function SettingsTab() {
  const [data, setData] = useState(null);
  const [f, setF] = useState(null);
  const [starts, setStarts] = useState({});
  const load = () => invoicingApi.settings().then(({ data: d }) => {
    setData(d);
    const s = d.settings || {};
    setF({ bank: { name: '', accountNo: '', ifsc: '', holder: '', ...(s.bank || {}) }, upiId: s.upiId || '', terms: s.terms || '', signatory: s.signatory || '' });
  }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!f) return <Spinner />;
  const save = () => invoicingApi.saveSettings(f).then(() => toast.success('Saved.')).catch((err) => toast.error(errMsg(err, 'Could not save.')));
  const setStart = (s) => {
    const next = Number(starts[s.key]);
    if (!window.confirm(`The next ${s.docType === 'bill_of_supply' ? 'bill of supply' : 'tax invoice'} will be numbered ${s.nextNumber.replace(/\d+$/, String(next))}. This cannot be changed once a number is used. Continue?`)) return;
    invoicingApi.setSeriesStart({ docType: s.docType, fy: s.fy, next }).then(() => { toast.success('Set.'); load(); }).catch((err) => toast.error(errMsg(err, 'Could not set it.')));
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-3">
        <div className="font-semibold">Printed on every invoice</div>
        <div className="text-xs" style={{ color: 'var(--text3)' }}>Business name, address and GSTIN: {data.issuer.name} · {data.issuer.gstin}</div>
        <div className="grid gap-2 grid-cols-2">
          <Input label="Bank name" value={f.bank.name} onChange={(e) => setF({ ...f, bank: { ...f.bank, name: e.target.value } })} />
          <Input label="Account number" value={f.bank.accountNo} onChange={(e) => setF({ ...f, bank: { ...f.bank, accountNo: e.target.value } })} />
          <Input label="IFSC" value={f.bank.ifsc} onChange={(e) => setF({ ...f, bank: { ...f.bank, ifsc: e.target.value.toUpperCase() } })} />
          <Input label="Account holder" value={f.bank.holder} onChange={(e) => setF({ ...f, bank: { ...f.bank, holder: e.target.value } })} />
          <Input label="UPI ID" value={f.upiId} onChange={(e) => setF({ ...f, upiId: e.target.value })} />
          <Input label="Signatory (For: …)" value={f.signatory} onChange={(e) => setF({ ...f, signatory: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 tracking-wide uppercase" style={{ color: 'var(--text2)' }}>Default terms and conditions</label>
          <textarea className="inp" rows={7} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs" style={{ color: 'var(--text3)' }}>
            <span>Printed on every tax invoice and bill of supply, unless an invoice has its own terms. Left blank, the standard terms are printed.</span>
            {f.terms !== data.defaultTerms && <button type="button" className="underline" style={{ color: 'var(--blue)' }} onClick={() => setF({ ...f, terms: data.defaultTerms })}>Use the standard terms</button>}
          </div>
        </div>
        <Btn onClick={save}>Save</Btn>
      </div>
      <div className="card space-y-3">
        <div className="font-semibold">Invoice numbers ({data.series[0]?.fy})</div>
        {data.series.map((s) => (
          <div key={s.key} className="card-sm space-y-2">
            <div className="text-sm">{s.docType === 'bill_of_supply' ? 'Bills of supply' : 'Tax invoices'}: next number <strong className="font-mono">{s.nextNumber}</strong></div>
            {s.started
              ? <div className="text-xs" style={{ color: 'var(--text3)' }}>Numbering has started in the CRM; it can no longer be changed.</div>
              : (
                <div className="flex gap-2 items-end">
                  <Input label="Start at (e.g. Vyapar's last + 1)" inputMode="numeric" value={starts[s.key] || ''} onChange={(e) => setStarts({ ...starts, [s.key]: e.target.value })} />
                  <Btn size="sm" onClick={() => setStart(s)} disabled={!/^\d+$/.test(starts[s.key] || '')}>Set</Btn>
                </div>
              )}
          </div>
        ))}
      </div>
      <RestartSeries onDone={load} />
    </div>
  );
}

// ── Danger: continue the tax-invoice series from a number ────────
// For when the CRM's numbering started at 1 although Vyapar had already
// used those numbers: deletes the CRM's own unpaid tax invoices numbered
// below the number entered and continues the series from it. The server
// refuses if any tax invoice has a payment, and re-checks everything when it
// runs; the preview shows exactly what would go.
function RestartSeries({ onDone }) {
  const [next, setNext] = useState('');
  const [preview, setPreview] = useState(null);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const check = () => invoicingApi.previewSeriesRestart(next).then(({ data }) => { setPreview(data); setWord(''); }).catch((err) => toast.error(errMsg(err, 'Could not check.')));
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await invoicingApi.restartSeries(Number(next), word);
      toast.success(data.message);
      setPreview(null); setNext(''); setWord('');
      onDone();
    } catch (err) {
      toast.error(errMsg(err, 'Nothing was changed.'));
      check();
    } finally { setBusy(false); }
  };
  const plan = preview?.plan;
  const ready = plan && !plan.problems.length && word.trim() === preview.confirmWord;
  return (
    <div className="card space-y-3 md:col-span-2" style={{ borderColor: 'rgba(255,77,109,.45)' }}>
      <div className="font-semibold flex items-center gap-2" style={{ color: 'var(--red)' }}><AlertTriangle size={16} aria-hidden="true" /> Danger: continue the tax-invoice series from a number</div>
      <div className="text-xs space-y-1" style={{ color: 'var(--text2)' }}>
        <p>Use this only if the CRM started tax-invoice numbers at 1 although those numbers were already used in Vyapar this year.</p>
        <p><strong style={{ color: 'var(--red)' }}>It permanently deletes the CRM's tax invoices numbered below the number you enter</strong> — only use it for test invoices that were never sent to the customer or filed in GSTR-1. The deletion cannot be undone.</p>
        <p>It is refused if any tax invoice has money recorded against it, so it cannot touch real, paid invoices. Bills of supply and drafts are never touched.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <Input label="Continue from (next tax invoice number)" inputMode="numeric" value={next} onChange={(e) => { setNext(e.target.value); setPreview(null); }} />
        <Btn size="sm" variant="ghost" onClick={check} disabled={!/^\d+$/.test(next)}>Check what it would do</Btn>
      </div>
      {preview && plan && (
        <div className="card-sm text-sm space-y-2">
          <div>Now: next tax invoice is <strong className="font-mono">{preview.nextNumber}</strong>. After: <strong className="font-mono">{plan.nextNumber}</strong>.</div>
          {plan.willDelete.length > 0
            ? (
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--red)' }}>Will be deleted permanently:</div>
                <ul className="text-xs mt-1 space-y-0.5">
                  {plan.willDelete.map((i) => <li key={i.number} className="font-mono">{i.number} · {i.status} · {showDay(i.date)} · {i.party} · {rs(i.totalPaise)} · received {rs(i.receivedPaise)}</li>)}
                </ul>
              </div>
            )
            : <div className="text-xs" style={{ color: 'var(--text3)' }}>No invoice will be deleted.</div>}
          <Problems list={plan.problems} />
          {!plan.problems.length && (
            <div className="flex flex-wrap gap-2 items-end">
              <Input label={`Type ${preview.confirmWord} to confirm`} value={word} onChange={(e) => setWord(e.target.value)} />
              <Btn size="sm" variant="danger" onClick={run} disabled={busy || !ready}>{busy ? 'Working…' : `Delete and continue from ${plan.nextNumber}`}</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InvoicingPage() {
  const [tab, setTab] = useState('invoices');
  const [lookups, reload] = useLookups();
  return (
    <div className="page-enter">
      <PageHeader title="GST Invoicing" subtitle="Tax invoices and bills of supply with SAC/HSN and GST — amounts in ₹, dates in India time" />
      <Tabs tabs={[{ key: 'invoices', label: 'Invoices' }, { key: 'parties', label: 'Parties' }, { key: 'items', label: 'Services' }, { key: 'settings', label: 'Settings' }]} active={tab} onChange={setTab} />
      {tab === 'invoices' && <InvoicesTab lookups={lookups} reloadLookups={reload} />}
      {tab === 'parties' && <PartiesTab lookups={lookups} reload={reload} />}
      {tab === 'items' && <ItemsTab lookups={lookups} reload={reload} />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
