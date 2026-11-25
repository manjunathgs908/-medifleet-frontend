// src/mobile/MobileNewLead.jsx — "/m/leads/new": add a lead by hand.
//
// POST /api/leads (owner + telecaller): same lead model, statuses and
// masking as every other lead; the server records the source, who added it
// and when. If the number is already on a lead, the server answers 409
// DUPLICATE with the existing lead(s), masked — shown here to open instead;
// "Add as a new lead anyway" sends it again with confirmDuplicate. Nothing
// is merged, and nothing is created silently.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { leadsApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { shownPhone, dueLabel } from './logic.mjs';
import { StatusPill } from './ui';
import './mobile.css';

const SOURCES = [
  ['manual', 'Added by staff'],
  ['inbound_call', 'Phone call to us'],
  ['walk_in', 'Walk-in'],
  ['referral', 'Referral'],
];

export default function MobileNewLead() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ patientName: '', phone: '', source: 'manual', message: '', assignToMe: user?.role !== 'owner' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);            // { field?, message }
  const [duplicates, setDuplicates] = useState(null);  // existing leads on this number
  const formRef = useRef(null);
  const dupRef = useRef(null);
  // The duplicates panel replaces the Save bar and is brought into view.
  useEffect(() => { if (duplicates) dupRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [duplicates]);
  const set = (k) => (e) => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setForm((f) => ({ ...f, [k]: v })); setError(null); if (k === 'phone') setDuplicates(null); };

  const save = async (confirmDuplicate = false) => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await leadsApi.create({ ...form, confirmDuplicate });
      toast.success('Lead added');
      window.dispatchEvent(new Event('leads:changed'));
      navigate(`/m/leads/${data.lead._id}`, { replace: true, state: { lead: data.lead } });
    } catch (e) {
      const d = e?.response?.data;
      if (e?.response?.status === 409 && d?.code === 'DUPLICATE') setDuplicates(d.duplicates || []);
      else setError({
        field: { NAME_REQUIRED: 'patientName', PHONE_INVALID: 'phone', SOURCE_INVALID: 'source' }[d?.code],
        message: d?.message || (e?.response ? 'Could not add the lead.' : 'No connection — try again.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const fieldErr = (k) => (error?.field === k ? error.message : null);
  return (
    <div className="m-ui m-screen">
      <button type="button" onClick={() => navigate(-1)} className="m-tap -ml-2 mb-2 px-2 inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--m-text2)' }}>
        <ArrowLeft size={20} aria-hidden="true" /> Back
      </button>
      <h1 className="m-title mb-4">New lead</h1>

      <form ref={formRef} className="m-card p-4 space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); save(false); }}>
        <div>
          <label htmlFor="nl-name" className="block font-semibold mb-1">Customer name *</label>
          <input id="nl-name" className="m-input" value={form.patientName} onChange={set('patientName')} maxLength={100} autoComplete="off"
            aria-invalid={!!fieldErr('patientName')} aria-describedby={fieldErr('patientName') ? 'nl-name-err' : undefined} />
          {fieldErr('patientName') && <div id="nl-name-err" className="mt-1 text-[14px]" style={{ color: 'var(--m-red)' }}>{fieldErr('patientName')}</div>}
        </div>
        <div>
          <label htmlFor="nl-phone" className="block font-semibold mb-1">Mobile number *</label>
          <input id="nl-phone" className="m-input font-mono" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="off" placeholder="10-digit mobile"
            aria-invalid={!!fieldErr('phone')} aria-describedby={fieldErr('phone') ? 'nl-phone-err' : undefined} />
          {fieldErr('phone') && <div id="nl-phone-err" className="mt-1 text-[14px]" style={{ color: 'var(--m-red)' }}>{fieldErr('phone')}</div>}
        </div>
        <div>
          <label htmlFor="nl-source" className="block font-semibold mb-1">Where did this lead come from?</label>
          <select id="nl-source" className="m-input" value={form.source} onChange={set('source')}>
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="nl-msg" className="block font-semibold mb-1">What do they need? <span className="m-sub">(optional)</span></label>
          <textarea id="nl-msg" className="m-input" rows={3} maxLength={1000} value={form.message} onChange={set('message')} placeholder="e.g. ICU ambulance to Narayana Health on Friday" />
        </div>
        <label className="flex items-center gap-3 m-tap">
          <input type="checkbox" checked={form.assignToMe} onChange={set('assignToMe')} className="w-5 h-5" />
          <span className="font-semibold">Assign to me</span>
        </label>

        {error && !error.field && <div className="text-[14px]" role="alert" style={{ color: 'var(--m-red)' }}>{error.message}</div>}

        {duplicates && (
          <section ref={dupRef} className="rounded-xl p-3 scroll-mt-20" role="alert" style={{ background: 'var(--m-amber-bg)' }} aria-labelledby="nl-dup">
            <h2 id="nl-dup" className="font-bold">This number already has {duplicates.length === 1 ? 'a lead' : `${duplicates.length} leads`}</h2>
            <p className="m-sub mt-1">Open it instead, or add a separate lead if this is a new enquiry.</p>
            <ul className="mt-3 space-y-2">
              {duplicates.map((d) => (
                <li key={d._id} className="m-card p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{d.patientName || 'Unknown'}</div>
                    <div className="m-sub font-mono">{shownPhone(d.phone, d.phoneMasked)}{(d.receivedAt || d.createdAt) ? ` · ${dueLabel(new Date(d.receivedAt || d.createdAt).getTime())}` : ''}</div>
                  </div>
                  <StatusPill status={d.status} />
                  <button type="button" className="m-btn m-tap !min-h-[44px]" onClick={() => navigate(`/m/leads/${d._id}`)}>Open</button>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-1 gap-2 mt-3">
              <button type="button" className="m-btn m-tap w-full" disabled={saving} onClick={() => save(true)}>
                {saving ? 'Saving…' : 'Add as a new lead anyway'}
              </button>
              <button type="button" className="m-btn m-tap w-full" onClick={() => { setDuplicates(null); document.getElementById('nl-phone')?.focus(); }}>
                Change the number
              </button>
            </div>
          </section>
        )}

        {!duplicates && (
          <div className="m-savebar">
            <button type="button" className="m-btn m-tap flex-1" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className="m-btn m-btn-primary m-tap flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save lead'}</button>
          </div>
        )}
      </form>
    </div>
  );
}
