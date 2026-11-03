// src/lib/customerDocs.js
//
// Customer-facing documents (trip bill, payment receipt): one standalone
// page each, used for the on-screen preview, printing and download alike,
// so all three always show the same thing. The header is the business as
// the server's customer issuer gives it (medifleet-backend
// utils/customerIssuer.js): business name, GSTIN, registered address and
// contact details. No staff, proprietor or other personal name is printed —
// staff names stay in the CRM.

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const rs = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const fmtIst = (v) => {
  const d = v ? new Date(v) : null;
  return !d || Number.isNaN(d.getTime()) ? '—'
    : `${d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} IST`;
};

const STYLE = `body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0}
h2{font-size:14px;color:#555;margin:16px 0 20px;font-weight:600}.who{font-size:12px;color:#444;margin:4px 0 0;line-height:1.5}
.amt{font-size:28px;font-weight:700;margin:12px 0}table{border-collapse:collapse;width:100%;max-width:560px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px;vertical-align:top}th{width:40%;color:#555;font-weight:600}
td.num{text-align:right;font-variant-numeric:tabular-nums}tr.total th,tr.total td{font-weight:700;color:#111;border-top:2px solid #111}
.foot{margin-top:24px;font-size:11px;color:#666;max-width:560px}`;

// Business header: name, GSTIN, registered address, contact line.
export function issuerHeader(issuer) {
  const contact = [issuer?.phone, issuer?.email, issuer?.website].filter(Boolean).join(' · ');
  return `<h1>${esc(issuer?.name)}</h1><div class="who">${[
    issuer?.gstin ? `GSTIN ${issuer.gstin}` : '',
    issuer?.address || '',
    contact,
  ].filter(Boolean).map(esc).join('<br>')}</div>`;
}

export const row = (k, v, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><th>${esc(k)}</th><td${cls.includes('num') ? ' class="num"' : ''}>${esc(v)}</td></tr>`;

export const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;

// Prints just this document (a hidden frame) — never the CRM screen around it.
// A document with images (the GST invoice's logo and signature) is printed
// once they have loaded, so they are never missing from the PDF; at most
// 5 seconds, then it prints anyway.
export function printHtml(html) {
  const f = document.createElement('iframe');
  f.style.position = 'fixed'; f.style.width = '0'; f.style.height = '0'; f.style.border = '0';
  f.setAttribute('aria-hidden', 'true');
  document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  const pending = [...f.contentDocument.images].filter((img) => !img.complete)
    .map((img) => new Promise((done) => { img.onload = done; img.onerror = done; }));
  const timeout = new Promise((done) => setTimeout(done, 5000));
  Promise.race([Promise.all(pending), timeout]).then(() => {
    f.contentWindow.focus(); f.contentWindow.print();
    setTimeout(() => f.remove(), 1000);
  });
}

export function downloadHtml(html, filename) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The trip bill as stored (amounts are rupees on the Bill; nothing is
// recalculated here — tax included exactly as billed).
export function billHtml(bill, issuer) {
  const p = (r) => rs(Math.round(Number(r || 0) * 100));
  const lines = [
    ['Base fare', bill.baseFare],
    ...(Number(bill.additionalCharges) ? [['Additional charges', bill.additionalCharges]] : []),
    ...(bill.subTotal != null ? [['Subtotal', bill.subTotal]] : []),
    [`GST${bill.gstRate != null ? ` @ ${bill.gstRate}%` : ''}`, bill.gstAmount],
    ...(Number(bill.waitCharge) ? [['Waiting charges', bill.waitCharge]] : []),
  ];
  return page(`Bill ${bill.billNumber}`, `${issuerHeader(issuer)}
<h2>Bill ${esc(bill.billNumber)}</h2><table>
${row('Date', fmtIst(bill.createdAt))}${row('Patient', bill.patient || bill.trip?.patientName || '—')}
${bill.distanceKm != null ? row('Distance', `${bill.distanceKm} km`) : ''}
${lines.map(([k, v]) => row(k, p(v), 'num')).join('')}
${row('Total', p(bill.grandTotal), 'total num')}</table>`);
}
