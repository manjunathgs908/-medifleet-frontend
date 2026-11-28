// src/pages/MyProfilePage.jsx
//
// "My profile" — how I introduce myself to customers on WhatsApp: a
// professional photo, the name to show, the languages I speak, and my
// consent to share photo and name with customers. Owner and telecallers,
// each for themselves only (consent cannot be given on someone's behalf).
// The introduction card can be sent from WhatsApp Chats only while consent
// is on and the profile is complete. The photo is never published: it is
// shown here from a signed-in request and sent to WhatsApp by the server.
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { staffProfileApi } from '../api/client';
import { PageHeader, Spinner, Btn } from '../components/ui';
import { IntroCardPreview, usePhotoUrl } from '../components/WaTeamBar';

const GAP_LABEL = {
  consent: 'Agree to share your photo and name with customers',
  photo: 'Add a professional photo',
  name: 'Set your display name',
  languages: 'Pick the languages you speak',
};
const LANG_ORDER = ['kn', 'hi', 'en', 'ta', 'te', 'ml', 'mr'];

// A photo from the device -> a JPEG data URL, at most 640 px on its longest
// side and under ~380 KB (the server accepts up to 400 KB).
async function toSmallJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i); i.onerror = () => reject(new Error('That file is not a photo we can read.'));
      i.src = url;
    });
    const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // transparent PNG -> white, not black
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length * 0.75 < 380 * 1024) return d;
    }
    throw new Error('That photo is too large even after shrinking — choose another.');
  } finally { URL.revokeObjectURL(url); }
}

export default function MyProfilePage() {
  const [state, setState] = useState({ loading: true, error: null, profile: null, languages: {}, consentText: '' });
  const [form, setForm] = useState({ displayName: '', title: 'sahayaki', languages: [] });
  const [saving, setSaving] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const fileRef = useRef(null);
  const p = state.profile;
  const photoUrl = usePhotoUrl(p?.hasPhoto ? 'me' : null, p?.photoUpdatedAt);

  const apply = (profile, extra = {}) => {
    setState((s) => ({ ...s, loading: false, error: null, profile, ...extra }));
    setForm({ displayName: profile.displayName || '', title: profile.title || 'sahayaki', languages: profile.languages || [] });
  };
  const load = () => staffProfileApi.me()
    .then(({ data }) => apply(data.profile, { languages: data.languages, consentText: data.consentText }))
    .catch((e) => setState((s) => ({ ...s, loading: false, error: e?.response?.data?.message || 'Could not load your profile.' })));
  useEffect(() => { load(); }, []);

  const dirty = p && (form.displayName !== (p.displayName || '') || form.title !== p.title || form.languages.join() !== (p.languages || []).join());
  const save = async () => {
    setSaving(true);
    try { const { data } = await staffProfileApi.update(form); apply(data.profile); toast.success('Profile saved'); }
    catch (e) { toast.error(e?.response?.data?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };
  const setConsent = async (given) => {
    try { const { data } = await staffProfileApi.update({ consent: given }); apply(data.profile); toast.success(given ? 'Consent recorded' : 'Consent withdrawn — your introduction will not be sent'); }
    catch (e) { toast.error(e?.response?.data?.message || 'Could not save.'); }
  };
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusyPhoto(true);
    try { const dataUrl = await toSmallJpeg(file); const { data } = await staffProfileApi.setPhoto(dataUrl); apply(data.profile); toast.success('Photo saved'); }
    catch (err) { toast.error(err?.response?.data?.message || err.message || 'Could not save the photo.'); }
    finally { setBusyPhoto(false); }
  };
  const removePhoto = async () => {
    try { const { data } = await staffProfileApi.deletePhoto(); apply(data.profile); toast.success('Photo removed'); }
    catch (e) { toast.error(e?.response?.data?.message || 'Could not remove the photo.'); }
  };
  const toggleLang = (code) => setForm((f) => ({ ...f, languages: f.languages.includes(code) ? f.languages.filter((c) => c !== code) : [...f.languages, code] }));

  if (state.loading) return <div className="page-enter"><PageHeader title="My profile" /><Spinner /></div>;
  if (state.error) return <div className="page-enter"><PageHeader title="My profile" /><div className="card text-sm" style={{ color: 'var(--red)' }}>{state.error} <button className="underline ml-2" onClick={load}>Retry</button></div></div>;

  return (
    <div className="page-enter" data-my-profile>
      <PageHeader title="My profile" subtitle="How you introduce yourself to customers on WhatsApp — optional, never needed to help a customer" />

      <div className={`card mb-4 flex items-start gap-2 text-sm`} data-profile-status
        style={{ borderColor: p.ready ? 'rgba(0,168,120,.4)' : 'rgba(217,119,6,.45)' }}>
        {p.ready ? <CheckCircle2 size={18} style={{ color: 'var(--accent)' }} /> : <AlertCircle size={18} style={{ color: 'var(--amber)' }} />}
        <div>
          {p.ready
            ? <b>Ready — you can send your introduction from WhatsApp Chats.</b>
            : <><b>Not ready to introduce yourself yet.</b><ul className="list-disc ml-5 mt-1" style={{ color: 'var(--text2)' }}>{p.gaps.map((g) => <li key={g}>{GAP_LABEL[g]}</li>)}</ul></>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-28 h-28 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              {photoUrl ? <img src={photoUrl} alt="Your introduction photo" className="w-full h-full object-cover" data-profile-photo /> : <Camera size={28} style={{ color: 'var(--text3)' }} />}
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-semibold mb-1">Professional photo</div>
              <div className="text-xs mb-3" style={{ color: 'var(--text3)' }}>A clear, recent photo of your face, like an ID photo. Customers see it only when you send your introduction.</div>
              <div className="flex gap-2 flex-wrap">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={pickPhoto} aria-label="Choose a photo" />
                <Btn size="sm" type="button" onClick={() => fileRef.current?.click()} disabled={busyPhoto}><Camera size={14} /> {busyPhoto ? 'Saving…' : p.hasPhoto ? 'Change photo' : 'Add photo'}</Btn>
                {p.hasPhoto && <Btn size="sm" type="button" variant="ghost" onClick={removePhoto}><Trash2 size={14} /> Remove</Btn>}
              </div>
            </div>
          </div>

          <label className="block mt-5">
            <span className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Display name</span>
            <input className="inp" value={form.displayName} maxLength={40} placeholder={p.user.name}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} aria-label="Display name" />
            <span className="block text-[11px] mt-1" style={{ color: 'var(--text3)' }}>The name customers see, e.g. “Asha”. No phone numbers.</span>
          </label>

          <div className="mt-4">
            <span className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Introduced as</span>
            <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Introduced as">
              {[['sahayaki', 'ಸಹಾಯಕಿ (assistant, female)'], ['sahayaka', 'ಸಹಾಯಕ (assistant, male)']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: form.title === k ? 'var(--surface2)' : 'transparent', border: '1px solid var(--border)' }}>
                  <input type="radio" name="title" checked={form.title === k} onChange={() => setForm((f) => ({ ...f, title: k }))} /> {l}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <span className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Languages you speak</span>
            <div className="flex gap-2 flex-wrap">
              {LANG_ORDER.map((code) => (
                <label key={code} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: form.languages.includes(code) ? 'var(--surface2)' : 'transparent', border: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={form.languages.includes(code)} onChange={() => toggleLang(code)} aria-label={state.languages[code]} /> {state.languages[code]}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <Btn type="button" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </div>

          <label className="mt-6 flex items-start gap-2 text-sm p-3 rounded-xl cursor-pointer" data-consent
            style={{ background: p.consent.given ? 'rgba(0,168,120,.08)' : 'var(--surface2)', border: '1px solid var(--border)' }}>
            <input type="checkbox" className="mt-0.5" checked={p.consent.given} onChange={(e) => setConsent(e.target.checked)} aria-label={state.consentText} />
            <span>
              <b>{state.consentText}</b>
              <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                Only you can tick this. Untick it any time — your photo and name are then never sent.
                {p.consent.at ? ` Last changed ${new Date(p.consent.at).toLocaleString('en-IN')}.` : ''}
              </span>
            </span>
          </label>
        </div>

        <div className="card" data-intro-preview-panel>
          <div className="text-sm font-semibold mb-1">What the customer receives</div>
          <div className="text-xs mb-3" style={{ color: 'var(--text3)' }}>One image message in the chat. The chat itself still shows SaveLife's logo as the sender. Sent once per chat, only when you choose to, and only within 24 hours of the customer's last message.</div>
          <IntroCardPreview photoUrl={photoUrl} caption={p.preview.caption} />
          {!p.consent.given && <div className="text-xs mt-3" style={{ color: 'var(--amber)' }}>Preview only — nothing is sent while consent is off.</div>}
        </div>
      </div>
    </div>
  );
}
