// src/lib/gstInvoiceDoc.js
//
// The printable GST invoice / bill of supply — one standalone page, used
// for the on-screen preview, printing and "Save as PDF" alike. Built only
// from what the server returns for the invoice (GET /invoicing/invoices/:id:
// the invoice, and `print` — issuer, the party as frozen at issue, place of
// supply, amount in words, bank, terms). Nothing is recalculated here: every
// figure printed is a figure the server computed.
//
// Contents follow Rule 46 (tax invoice) / Rule 49 (bill of supply):
// supplier name, address, GSTIN; number and date; recipient name, address,
// GSTIN and state with code; place of supply with state code; SAC/HSN,
// description, quantity, unit, rate, discount, taxable value, rate and tax
// per line; the CGST/SGST or IGST breakup; reverse-charge statement; total in
// words; signature.
//
// Look: the SaveLife letterhead used on quotations and proforma invoices —
// the website's logo (savelife-web public/savelife-mark-512.png) and brand
// blue, the signature from those documents. The images are ordinary built
// assets (cached by the PWA); printHtml waits for them to load before it
// opens the print dialog, so a printed or saved PDF always has them.
//
// Unlike trip bills and receipts (lib/customerDocs.js), a GST invoice is
// signed by the proprietor by name, as on the quotations.
import { esc, rs } from './customerDocs';
import logoUrl from '../assets/invoice/savelife-logo.png';
import signatureUrl from '../assets/invoice/signature.png';

const BRAND = {
  navy: '#1E4FA3',      // website "Save" / wordmark blue
  blue: '#1677E8',      // website primary brand blue
  tint: '#EEF4FC',      // label cells and boxes
  line: '#C9D8EE',
  tagline: '24x7 Private Ambulance & Medical Transport',
};
const SIGNATORY = { name: 'G. S. Manjunath', title: 'Proprietor & Authorised Signatory' };

const day = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
};
const qty = (milli) => (milli / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const TAX_LABEL = { exempt: 'Exempt', nil: 'Nil rated', non_gst: 'Non-GST' };
const webHost = (url) => String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

const STYLE = `
/* One A4 page. margin:0 leaves the browser no margin to draw its URL /
   date / page-number header and footer in; the sheet's own padding is the
   white space instead. */
@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:#fff}
body{font-family:"Segoe UI",system-ui,Arial,sans-serif;color:#1f2937;font-size:11px;line-height:1.35}
/* The page itself: exactly A4 wide, ~10mm inside. Scaled to fit one page
   by the script at the end when the content runs a little long. */
.sheet{width:210mm;padding:9mm 10mm 8mm;margin:0 auto;background:#fff}
@media screen{body{background:#f3f4f6}.sheet{box-shadow:0 1px 4px rgba(0,0,0,.12);margin:12px auto}}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
.brand{display:flex;align-items:center;gap:10px}
.logo{width:40px;height:54px;overflow:hidden;position:relative;flex:none}
.logo img{position:absolute;width:75px;height:75px;left:-17.5px;top:-10.5px}
.name{font-size:22px;font-weight:700;color:${BRAND.navy};letter-spacing:-.2px;line-height:1.1}
.tagline{color:${BRAND.blue};font-weight:600;font-size:11px;margin-top:2px}
.doc{text-align:right;min-width:190px}
.doc .title{font-size:16px;font-weight:800;color:${BRAND.navy};letter-spacing:.6px}
.doc table{margin-left:auto;margin-top:2px;border-collapse:collapse}
.doc td{padding:0 0 0 8px;font-size:11px;line-height:1.45}
.doc td.k{color:#6b7280;text-align:right}.doc td.v{font-weight:600;text-align:right}
.issuer{margin-top:6px;color:#4b5563;font-size:10.5px;line-height:1.4}
.issuer strong{color:#1f2937}
.rule{height:3px;background:${BRAND.navy};margin:8px 0 10px;border-radius:2px}
.stamp{display:inline-block;margin-top:4px;padding:1px 8px;border:2px solid;font-weight:800;font-size:11px;letter-spacing:1px}
.stamp.cancel{color:#b42318;border-color:#b42318}.stamp.draft{color:#6b7280;border-color:#6b7280}
.parties{display:grid;grid-template-columns:1.25fr 1fr;gap:10px;margin-bottom:10px}
.parties.three{grid-template-columns:1.15fr 1fr .95fr;gap:8px}
.card{border:1px solid ${BRAND.line};border-radius:5px;overflow:hidden;break-inside:avoid}
.card h3{margin:0;background:${BRAND.tint};color:${BRAND.navy};font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;padding:4px 8px}
.card .body{padding:5px 8px}
.card .pname{font-weight:700;font-size:11.5px;color:#111827}
.kv{display:grid;grid-template-columns:auto 1fr;gap:1px 8px}.kv .k{color:#6b7280}
table.items,table.tax{border-collapse:collapse;width:100%}
table.items th,table.tax th{background:${BRAND.navy};color:#fff;font-weight:600;text-align:left;padding:5px 7px;font-size:10.5px}
table.items td,table.tax td{padding:4px 7px;border-bottom:1px solid ${BRAND.line};vertical-align:top}
table.items tr,table.tax tr{break-inside:avoid}
table.items tr:nth-child(even) td{background:#fafcff}
.n,table.items th.n,table.tax th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.small{font-size:9.5px;color:#6b7280}
.section-title{font-size:9.5px;font-weight:700;color:${BRAND.navy};text-transform:uppercase;letter-spacing:.6px;margin:8px 0 3px}
.lower{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;margin-top:9px;align-items:start}
.totals{border:1px solid ${BRAND.line};border-radius:5px;overflow:hidden;break-inside:avoid}
.totals table{width:100%;border-collapse:collapse}
.totals td{padding:4px 8px;border-bottom:1px solid ${BRAND.line}}
.totals tr.grand td{background:${BRAND.navy};color:#fff;font-weight:700;font-size:12.5px;border-bottom:0}
.totals tr.due td{font-weight:700;color:${BRAND.navy}}
.words{background:${BRAND.tint};border-left:3px solid ${BRAND.navy};padding:5px 8px;border-radius:4px}
.notes{font-size:10px;line-height:1.35}
.notes p{margin:0 0 3px}
.bank{background:${BRAND.tint};border:1px solid ${BRAND.line};border-radius:5px;padding:5px 8px;margin-top:7px;break-inside:avoid}
.bank .section-title{margin:0 0 2px}
.sign{margin-top:8px;break-inside:avoid}
.sign img{height:38px;display:block;margin:2px 0 1px}
.sign .who{font-weight:700;color:#111827}
.footer{margin-top:10px;background:${BRAND.navy};color:#fff;text-align:center;padding:6px 10px;border-radius:4px;font-size:10.5px;break-inside:avoid}
.gen{text-align:center;color:#9ca3af;font-size:9.5px;margin-top:3px}
`;

// Keeps the invoice on one A4 page: when the sheet is taller than a page
// (more lines, a long address), it is scaled down just enough — never below
// 75% — and widened to match, so it still fills the page width. The sheet
// has a fixed width, so this measures correctly even in the hidden print
// frame. Runs as the page loads and again just before printing.
const FIT_ONE_PAGE = `(function(){
  var s=document.querySelector('.sheet'); if(!s) return;
  function fit(){
    s.style.zoom=''; s.style.width='';
    var page=297*96/25.4-2, h=s.getBoundingClientRect().height;
    if(h>page){ var z=Math.max(0.75,page/h); s.style.zoom=z; s.style.width=(210/z)+'mm';
      var h2=s.getBoundingClientRect().height*z; if(h2>page&&z>0.75){ z=Math.max(0.75,z*page/h2); s.style.zoom=z; s.style.width=(210/z)+'mm'; } }
  }
  fit(); window.addEventListener('beforeprint',fit);
})();`;

function addressLines(a) {
  if (!a) return '';
  return [a.line1, a.line2, [a.city, a.pincode].filter(Boolean).join(' - ')].filter(Boolean).map(esc).join('<br>');
}

export function gstInvoiceHtml({ invoice: inv, print: p }) {
  const isBos = inv.docType === 'bill_of_supply';
  const intra = inv.supplyType === 'intra';
  const party = p.party || {};
  const issuer = p.issuer || {};
  const anyDiscount = inv.lines.some((l) => l.discountPaise > 0);
  const docWord = isBos ? 'Bill' : 'Invoice';

  // ── Lines ────────────────────────────────────────────────
  const lines = inv.lines.map((l, i) => `<tr>
    <td>${i + 1}</td>
    <td><strong>${esc(l.name)}</strong>${l.description ? `<div class="small">${esc(l.description)}</div>` : ''}</td>
    <td>${esc(l.code || '')}</td>
    <td class="n">${qty(l.qtyMilli)} ${esc(l.unit || '')}</td>
    <td class="n">${rs(l.ratePaise)}</td>
    ${anyDiscount ? `<td class="n">${l.discountPaise ? rs(l.discountPaise) : '—'}</td>` : ''}
    <td class="n">${rs(l.taxablePaise)}</td>
    ${isBos ? '' : `<td class="n">${l.taxType === 'taxable' ? `${rs(l.taxPaise)}<div class="small">${l.gstRate}%</div>` : esc(TAX_LABEL[l.taxType] || '—')}</td>`}
    <td class="n"><strong>${rs(l.totalPaise)}</strong></td></tr>`).join('');

  // ── GST breakup, one row per rate ────────────────────────
  const t = inv.totals;
  const breakup = isBos || !inv.taxSummary?.length ? '' : `
    <div class="section-title">GST breakup</div>
    <table class="tax"><thead><tr>
      <th>GST rate</th><th class="n">Taxable value</th>
      ${intra ? '<th class="n">CGST rate</th><th class="n">CGST amount</th><th class="n">SGST rate</th><th class="n">SGST amount</th>'
    : '<th class="n">IGST rate</th><th class="n">IGST amount</th>'}
      <th class="n">Total tax</th></tr></thead><tbody>
    ${inv.taxSummary.map((r) => `<tr><td>${r.gstRate}%</td><td class="n">${rs(r.taxablePaise)}</td>
      ${intra ? `<td class="n">${r.gstRate / 2}%</td><td class="n">${rs(r.cgstPaise)}</td><td class="n">${r.gstRate / 2}%</td><td class="n">${rs(r.sgstPaise)}</td>`
    : `<td class="n">${r.gstRate}%</td><td class="n">${rs(r.igstPaise)}</td>`}
      <td class="n">${rs(r.cgstPaise + r.sgstPaise + r.igstPaise)}</td></tr>`).join('')}
    </tbody></table>`;

  // ── Totals ───────────────────────────────────────────────
  const received = inv.receivedPaise || 0;
  const totals = [
    ['Taxable value', rs(t.taxablePaise)],
    ...(isBos ? [] : intra ? [['CGST', rs(t.cgstPaise)], ['SGST', rs(t.sgstPaise)]] : [['IGST', rs(t.igstPaise)]]),
    ...(t.roundOffPaise ? [['Round off', `${t.roundOffPaise > 0 ? '+' : '−'}${rs(Math.abs(t.roundOffPaise))}`]] : []),
  ];

  const bank = p.bank || {};
  const transport = inv.transport && Object.values(inv.transport).some(Boolean) ? inv.transport : null;
  // The site this invoice is for (one invoice per site for multi-site clients).
  const site = inv.serviceLocation?.siteName ? inv.serviceLocation : null;

  // ── Notes ────────────────────────────────────────────────
  const notes = [
    inv.description ? `<p><strong>Description:</strong> ${esc(inv.description)}</p>` : '',
    isBos ? '<p>Bill of supply — this supply is exempt from GST; no tax is charged.</p>' : '',
    inv.reverseCharge ? '<p><strong>Reverse charge:</strong> GST on this supply is payable by the recipient under reverse charge and is not included in the amount due.</p>' : '',
    p.terms ? `<p><strong>Terms &amp; conditions</strong><br>${esc(p.terms).replace(/\n/g, '<br>')}</p>` : '',
  ].filter(Boolean).join('');

  const contacts = [
    issuer.phone && `Call ${esc(issuer.phone)}`,
    issuer.whatsapp && `WhatsApp ${esc(issuer.whatsapp)}`,
    issuer.email && esc(issuer.email),
    issuer.website && esc(webHost(issuer.website)),
  ].filter(Boolean).join('&nbsp; | &nbsp;');

  const body = `
  <div class="top">
    <div>
      <div class="brand">
        <div class="logo"><img src="${logoUrl}" alt="SaveLife"></div>
        <div><div class="name">${esc(issuer.name)}</div><div class="tagline">${esc(BRAND.tagline)}</div></div>
      </div>
      <div class="issuer">
        ${esc(issuer.address || '')}<br>
        ${[issuer.phone && `Call: ${esc(issuer.phone)}`, issuer.whatsapp && `WhatsApp: ${esc(issuer.whatsapp)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}<br>
        ${[issuer.email && `Email: ${esc(issuer.email)}`, issuer.website && `Web: ${esc(webHost(issuer.website))}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}<br>
        <strong>GSTIN: ${esc(issuer.gstin)}</strong> &nbsp;|&nbsp; State: ${esc(issuer.stateCode)}-${esc(issuer.stateName)}${issuer.udyam ? ` &nbsp;|&nbsp; Udyam: ${esc(issuer.udyam)}` : ''}
      </div>
    </div>
    <div class="doc">
      <div class="title">${esc(String(p.title || '').toUpperCase())}</div>
      <table>
        <tr><td class="k">${docWord} No:</td><td class="v">${esc(inv.number || 'Draft')}</td></tr>
        <tr><td class="k">Date:</td><td class="v">${day(inv.date)}</td></tr>
        <tr><td class="k">Place of supply:</td><td class="v">${esc(inv.placeOfSupply)}-${esc(p.placeOfSupplyName || '')}</td></tr>
        <tr><td class="k">Reverse charge:</td><td class="v">${inv.reverseCharge ? 'Yes' : 'No'}</td></tr>
        <tr><td class="k">Payment:</td><td class="v">${inv.paymentMode === 'cash' ? 'Cash' : 'Credit'}</td></tr>
      </table>
      ${inv.status === 'cancelled' ? '<div class="stamp cancel">CANCELLED</div>' : ''}
      ${inv.status === 'draft' ? '<div class="stamp draft">DRAFT — NOT ISSUED</div>' : ''}
    </div>
  </div>
  <div class="rule"></div>

  <div class="parties${site ? ' three' : ''}">
    <div class="card"><h3>Bill to</h3><div class="body">
      <div class="pname">${esc(party.name)}</div>
      ${party.address ? `<div>${addressLines(party.address)}</div>` : ''}
      <div class="kv" style="margin-top:4px">
        ${party.phone ? `<span class="k">Contact</span><span>${esc(party.phone)}</span>` : ''}
        <span class="k">GSTIN</span><span>${party.gstin ? `<strong>${esc(party.gstin)}</strong>` : 'Unregistered'}</span>
        <span class="k">State</span><span>${esc(party.stateCode)}-${esc(party.stateName || '')}</span>
      </div>
    </div></div>
    ${site ? `<div class="card"><h3>Service location</h3><div class="body">
      <div class="pname">${esc(site.siteName)}</div>
      ${site.address ? `<div>${esc(site.address).replace(/\n/g, '<br>')}</div>` : ''}
      ${site.attention ? `<div style="margin-top:4px"><span class="k" style="color:#6b7280">Kind attn:</span> <strong>${esc(site.attention)}</strong></div>` : ''}
    </div></div>` : ''}
    <div class="card"><h3>${transport ? 'Transportation details' : 'Supply details'}</h3><div class="body"><div class="kv">
      ${transport?.driverName ? `<span class="k">Driver</span><span>${esc(transport.driverName)}</span>` : ''}
      ${transport?.vehicleNumber ? `<span class="k">Vehicle</span><span>${esc(transport.vehicleNumber)}</span>` : ''}
      ${transport?.pickup ? `<span class="k">Pickup</span><span>${esc(transport.pickup)}</span>` : ''}
      ${transport?.drop ? `<span class="k">Drop</span><span>${esc(transport.drop)}</span>` : ''}
      <span class="k">Supply</span><span>${intra ? 'Intra-state' : 'Inter-state'}${isBos ? '' : intra ? ' (CGST + SGST)' : ' (IGST)'}</span>
      <span class="k">Document</span><span>${isBos ? 'Bill of supply (exempt)' : 'Tax invoice'}</span>
    </div></div></div>
  </div>

  <table class="items"><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="n">Qty</th><th class="n">Rate</th>${anyDiscount ? '<th class="n">Discount</th>' : ''}<th class="n">Taxable value</th>${isBos ? '' : '<th class="n">GST</th>'}<th class="n">Amount</th></tr></thead>
  <tbody>${lines}</tbody></table>
  ${breakup}

  <div class="lower">
    <div>
      <div class="words"><strong>Amount in words:</strong> ${esc(p.amountInWords)}</div>
      ${notes ? `<div class="section-title">Notes</div><div class="notes">${notes}</div>` : ''}
      <div class="bank">
        <div class="section-title" style="margin-top:0">Bank details</div>
        <div class="kv">
          ${bank.holder ? `<span class="k">Account name</span><span>${esc(bank.holder)}</span>` : ''}
          ${bank.name ? `<span class="k">Bank</span><span>${esc(bank.name)}</span>` : ''}
          ${bank.accountNo ? `<span class="k">Account no.</span><span><strong>${esc(bank.accountNo)}</strong></span>` : ''}
          ${bank.ifsc ? `<span class="k">IFSC</span><span>${esc(bank.ifsc)}</span>` : ''}
          ${p.upiId ? `<span class="k">UPI</span><span>${esc(p.upiId)}</span>` : ''}
          ${!bank.accountNo && !p.upiId ? '<span class="k">—</span><span>Add bank details in GST Invoicing → Settings.</span>' : ''}
        </div>
      </div>
    </div>
    <div>
      <div class="totals"><table>
        ${totals.map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('')}
        <tr class="grand"><td>Total</td><td class="n">${rs(t.grandTotalPaise)}</td></tr>
        <tr><td>Received</td><td class="n">${rs(received)}</td></tr>
        <tr class="due"><td>Balance due</td><td class="n">${rs(t.grandTotalPaise - received)}</td></tr>
      </table></div>
      <div class="sign">
        For <strong>${esc(p.signatory || issuer.name)}</strong>
        <img src="${signatureUrl}" alt="Signature">
        <div class="who">${esc(SIGNATORY.name)}</div>
        <div class="small">${esc(SIGNATORY.title)}</div>
      </div>
    </div>
  </div>

  <div class="footer">${contacts}</div>
  <div class="gen">This is a computer generated ${docWord.toLowerCase()}.</div>`;

  const title = `${p.title} ${inv.number || 'draft'}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body><div class="sheet">${body}</div><script>${FIT_ONE_PAGE}</script></body></html>`;
}
