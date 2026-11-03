// src/lib/gstInvoiceDoc.js
//
// The printable GST invoice / bill of supply — one standalone page, used
// for the on-screen preview, printing and "Save as PDF" alike. Built only
// from what the server returns for the invoice (GET /invoicing/invoices/:id:
// the invoice, and `print` — issuer, the party as frozen at issue, place of
// supply, amount in words, bank, terms). Nothing is recalculated here.
//
// Contents follow Rule 46 (tax invoice) / Rule 49 (bill of supply):
// supplier name, address, GSTIN; number and date; recipient name, address,
// GSTIN and state; place of supply with state code; SAC/HSN, description,
// quantity, unit, rate, discount, taxable value, rate and tax per line; the
// tax breakup; reverse-charge statement; total in words; signatory.
import { esc, rs } from './customerDocs';

const day = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
};
const qty = (milli) => (milli / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const TAX_LABEL = { exempt: 'Exempt', nil: 'Nil rated', non_gst: 'Non-GST' };

const STYLE = `*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:24px;font-size:12px}
.head{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #111;padding-bottom:10px}
.head h1{font-size:20px;margin:0 0 4px}.muted{color:#444;line-height:1.5}
.title{text-align:center;font-size:16px;font-weight:700;margin:12px 0}
.cancel{color:#b00020;border:2px solid #b00020;display:inline-block;padding:2px 10px;font-weight:700;margin-left:8px}
.three{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:16px;margin-bottom:12px}
.three h3{font-size:12px;margin:0 0 4px}.right{text-align:right}
table{border-collapse:collapse;width:100%}th,td{padding:6px;border-bottom:1px solid #ddd;vertical-align:top}
thead th{background:#e8462a;color:#fff;text-align:left;font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr.tot td{font-weight:700;border-top:2px solid #111}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}
.box h4{background:#e8462a;color:#fff;margin:8px 0 4px;padding:4px 6px;font-size:12px}
.sign{text-align:right;margin-top:40px}.small{font-size:11px;color:#555}
@media print{body{margin:10mm}}`;

function addressLines(a) {
  if (!a) return '';
  return [a.line1, a.line2, [a.city, a.pincode].filter(Boolean).join(' - ')].filter(Boolean).map(esc).join('<br>');
}

export function gstInvoiceHtml({ invoice: inv, print: p }) {
  const isBos = inv.docType === 'bill_of_supply';
  const intra = inv.supplyType === 'intra';
  const party = p.party || {};
  const anyDiscount = inv.lines.some((l) => l.discountPaise > 0);

  const lines = inv.lines.map((l, i) => `<tr>
    <td>${i + 1}</td>
    <td><strong>${esc(l.name)}</strong>${l.description ? `<div class="small">${esc(l.description)}</div>` : ''}</td>
    <td>${esc(l.code || '')}</td>
    <td class="n">${qty(l.qtyMilli)} ${esc(l.unit || '')}</td>
    <td class="n">${rs(l.ratePaise)}</td>
    ${anyDiscount ? `<td class="n">${l.discountPaise ? rs(l.discountPaise) : '—'}</td>` : ''}
    <td class="n">${rs(l.taxablePaise)}</td>
    ${isBos ? '' : `<td class="n">${l.taxType === 'taxable' ? `${rs(l.taxPaise)}<div class="small">(${l.gstRate}%)</div>` : esc(TAX_LABEL[l.taxType] || '—')}</td>`}
    <td class="n">${rs(l.totalPaise)}</td></tr>`).join('');

  const t = inv.totals;
  const breakup = isBos || !inv.taxSummary?.length ? '' : `
    <table style="margin-top:12px"><thead><tr><th>Tax type</th><th class="n">Taxable amount</th><th class="n">Rate</th><th class="n">Tax amount</th></tr></thead><tbody>
    ${inv.taxSummary.map((r) => (intra
    ? `<tr><td>SGST</td><td class="n">${rs(r.taxablePaise)}</td><td class="n">${r.gstRate / 2}%</td><td class="n">${rs(r.sgstPaise)}</td></tr>
         <tr><td>CGST</td><td class="n">${rs(r.taxablePaise)}</td><td class="n">${r.gstRate / 2}%</td><td class="n">${rs(r.cgstPaise)}</td></tr>`
    : `<tr><td>IGST</td><td class="n">${rs(r.taxablePaise)}</td><td class="n">${r.gstRate}%</td><td class="n">${rs(r.igstPaise)}</td></tr>`)).join('')}
    </tbody></table>`;

  const amounts = [
    ['Taxable value', rs(t.taxablePaise)],
    ...(isBos ? [] : intra ? [['CGST', rs(t.cgstPaise)], ['SGST', rs(t.sgstPaise)]] : [['IGST', rs(t.igstPaise)]]),
    ...(t.roundOffPaise ? [['Round off', `${t.roundOffPaise > 0 ? '+' : '−'}${rs(Math.abs(t.roundOffPaise))}`]] : []),
  ];
  const received = inv.receivedPaise || 0;
  const bank = p.bank || {};
  const transport = inv.transport && Object.values(inv.transport).some(Boolean) ? inv.transport : null;

  const body = `
  <div class="head">
    <div><h1>${esc(p.issuer?.name)}</h1><div class="muted">${esc(p.issuer?.address || '')}<br>
      ${[p.issuer?.phone && `Phone: ${esc(p.issuer.phone)}`, p.issuer?.email && `Email: ${esc(p.issuer.email)}`].filter(Boolean).join(' · ')}<br>
      GSTIN: <strong>${esc(p.issuer?.gstin)}</strong>, State: ${esc(p.issuer?.stateCode)}-${esc(p.issuer?.stateName)}</div></div>
  </div>
  <div class="title">${esc(p.title)}${inv.status === 'cancelled' ? '<span class="cancel">CANCELLED</span>' : ''}${inv.status === 'draft' ? '<span class="cancel" style="color:#555;border-color:#555">DRAFT — NOT ISSUED</span>' : ''}</div>
  <div class="three">
    <div><h3>Bill To</h3><strong>${esc(party.name)}</strong><div class="muted">${addressLines(party.address)}
      ${party.phone ? `<br>Contact No.: ${esc(party.phone)}` : ''}
      ${party.gstin ? `<br>GSTIN: <strong>${esc(party.gstin)}</strong>` : ''}
      <br>State: ${esc(party.stateCode)}-${esc(party.stateName || '')}</div></div>
    <div>${transport ? `<h3>Transportation Details</h3><div class="muted">
      ${transport.driverName ? `Driver Name: ${esc(transport.driverName)}<br>` : ''}
      ${transport.vehicleNumber ? `Vehicle Number: ${esc(transport.vehicleNumber)}<br>` : ''}
      ${transport.pickup ? `Pickup: ${esc(transport.pickup)}<br>` : ''}
      ${transport.drop ? `Drop: ${esc(transport.drop)}` : ''}</div>` : ''}</div>
    <div class="right"><h3>${isBos ? 'Bill' : 'Invoice'} Details</h3><div class="muted">
      ${isBos ? 'Bill' : 'Invoice'} No.: <strong>${esc(inv.number || 'Draft')}</strong><br>
      Date: ${day(inv.date)}<br>
      Place of supply: ${esc(inv.placeOfSupply)}-${esc(p.placeOfSupplyName || '')}<br>
      Tax payable on reverse charge: <strong>${inv.reverseCharge ? 'Yes' : 'No'}</strong></div></div>
  </div>
  <table><thead><tr><th>#</th><th>Item name</th><th>HSN/SAC</th><th class="n">Quantity</th><th class="n">Price/Unit</th>${anyDiscount ? '<th class="n">Discount</th>' : ''}<th class="n">Taxable value</th>${isBos ? '' : '<th class="n">GST</th>'}<th class="n">Amount</th></tr></thead>
  <tbody>${lines}</tbody></table>
  ${breakup}
  <div class="two">
    <div>
      <div class="box"><h4>${isBos ? 'Bill' : 'Invoice'} Amount In Words</h4>${esc(p.amountInWords)}</div>
      <div class="box"><h4>Payment mode</h4>${inv.paymentMode === 'cash' ? 'Cash' : 'Credit'}</div>
      ${inv.description ? `<div class="box"><h4>Description</h4>${esc(inv.description)}</div>` : ''}
      ${isBos ? '<div class="box"><h4>Note</h4>Bill of supply — supply exempt from GST; no tax is charged.</div>' : ''}
      ${inv.reverseCharge ? '<div class="box"><h4>Reverse charge</h4>GST on this supply is payable by the recipient under reverse charge and is not included in the amount due.</div>' : ''}
      ${p.terms ? `<div class="box"><h4>Terms and Conditions</h4>${esc(p.terms).replace(/\n/g, '<br>')}</div>` : ''}
    </div>
    <div>
      <table><tbody>
        ${amounts.map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="n">${rs(t.grandTotalPaise)}</td></tr>
        <tr><td>Received</td><td class="n">${rs(received)}</td></tr>
        <tr><td>Balance</td><td class="n">${rs(t.grandTotalPaise - received)}</td></tr>
      </tbody></table>
      ${bank.accountNo || p.upiId ? `<div class="box"><h4>Bank Details</h4><div class="muted">
        ${bank.name ? `Name: ${esc(bank.name)}<br>` : ''}${bank.accountNo ? `Account No.: ${esc(bank.accountNo)}<br>` : ''}
        ${bank.ifsc ? `IFSC code: ${esc(bank.ifsc)}<br>` : ''}${bank.holder ? `Account holder's name: ${esc(bank.holder)}<br>` : ''}
        ${p.upiId ? `UPI: ${esc(p.upiId)}` : ''}</div></div>` : ''}
      <div class="sign">For: ${esc(p.signatory)}<br><br><br>Authorized Signatory</div>
    </div>
  </div>
  <div class="small" style="margin-top:16px">This is a computer generated ${isBos ? 'bill' : 'invoice'}.</div>`;

  const title = `${p.title} ${inv.number || 'draft'}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}
