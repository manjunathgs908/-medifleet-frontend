// src/components/WaTeamBar.jsx
//
// Team inbox strip on a WhatsApp Chats card (one SaveLife number, shared by
// the team): who owns the chat, assign / "Assign to me", and the optional
// introduction card / handover message. Nothing here ever blocks helping
// the customer — calling, outcomes and booking stay exactly as they are.
//
// The server decides every rule (medifleet-backend services/waIntro.js) and
// sends the buttons' state with each row (`actions`); this only shows it.
// Disabled buttons say WHY in visible text (phones have no hover), e.g.
// outside WhatsApp's 24-hour window. No customer number is ever shown here.
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserCheck, Send, CheckCircle2, Clock, ArrowRightLeft } from 'lucide-react';
import { waChatsApi, staffProfileApi } from '../api/client';
import { Btn, Modal, fmtDateTime } from './ui';

// The staff photo as a blob URL (it is never public; fetched with the session).
export function usePhotoUrl(userId, version) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!userId) { setUrl(null); return undefined; }
    let alive = true; let made = null;
    staffProfileApi.photo(userId)
      .then(({ data }) => { if (alive) { made = URL.createObjectURL(data); setUrl(made); } })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [userId, version]);
  return url;
}

// A WhatsApp-style image bubble: what the customer receives.
export function IntroCardPreview({ photoUrl, caption }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: '#e5ddd5' }} data-intro-card>
      <div className="ml-auto rounded-xl overflow-hidden shadow-sm" style={{ background: '#dcf8c6', maxWidth: 300 }}>
        <div className="w-full flex items-center justify-center" style={{ aspectRatio: '1 / 1', background: '#cfd8dc' }}>
          {photoUrl ? <img src={photoUrl} alt="Introduction photo" className="w-full h-full object-cover" /> : <span className="text-xs" style={{ color: '#455a64' }}>Your photo</span>}
        </div>
        <div className="px-3 py-2 text-[13px] whitespace-pre-wrap" style={{ color: '#111b21', fontFamily: 'system-ui, sans-serif' }}>{caption}</div>
        <div className="px-3 pb-1.5 text-[10px] text-right" style={{ color: '#667781' }}>SaveLife · now</div>
      </div>
    </div>
  );
}

const Reason = ({ children, id }) => (children ? <div id={id} className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--text3)' }}>{children}</div> : null);

/**
 * row      a /whatsapp/conversations row (or a /whatsapp-chats chat):
 *          { customerRef, assignee, rev, intro, window, actions }
 * meId     the signed-in user's id ("Assign to me")
 * onChat   called with the server's fresh chat state after any change
 */
export default function WaTeamBar({ row, isOwner, meId, staff = [], myProfile, onChat }) {
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null); // 'intro' | 'handover' | null
  const photoUrl = usePhotoUrl(preview === 'intro' && myProfile?.hasPhoto ? 'me' : null, myProfile?.photoUpdatedAt);
  const a = row.actions || {};
  const ref = row.customerRef;
  const rid = String(ref).slice(-8);

  const run = async (key, fn, ok) => {
    setBusy(key);
    try {
      const { data } = await fn();
      onChat?.(data.chat);
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      const d = e?.response?.data;
      if (d?.chat) onChat?.(d.chat);
      toast.error(d?.message || 'Could not do that — try again.');
      return false;
    } finally { setBusy(null); }
  };
  const assignTo = (userId) => run('assign', () => waChatsApi.assign(ref, { userId: userId || null, rev: row.rev || 0 }),
    userId ? `Assigned to ${staff.find((s) => String(s._id) === String(userId))?.name || 'you'}` : 'Unassigned');
  const claim = () => run('claim', () => waChatsApi.assign(ref, { userId: String(meId || ''), rev: row.rev || 0 }), 'This chat is now yours');
  const sendIntro = async () => { if (await run('intro', () => waChatsApi.intro(ref), 'Introduction sent')) setPreview(null); };
  const sendHandover = async () => { if (await run('handover', () => waChatsApi.handover(ref), 'Handover message sent')) setPreview(null); };

  const win = row.window || {};
  return (
    <div className="mt-3 rounded-xl px-3 py-2.5" data-team-bar data-assignee={row.assignee?.name || ''}
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" data-assignee-label
          style={{ color: row.assignee ? 'var(--text)' : 'var(--text3)' }}>
          <UserCheck size={14} />
          {row.assignee ? <>Assigned to {a.mine ? <b>you</b> : <b>{row.assignee.name}</b>}</> : 'Unassigned'}
        </span>

        {isOwner && (
          <select className="inp py-1 text-xs ml-auto" style={{ maxWidth: 190 }} aria-label="Assign this chat"
            value={row.assignee?._id ? String(row.assignee._id) : ''} disabled={busy === 'assign'}
            onChange={(e) => assignTo(e.target.value)}>
            <option value="">{row.assignee ? 'Unassign' : 'Assign to…'}</option>
            {staff.map((s) => <option key={s._id} value={s._id}>{s.name}{s.role === 'owner' ? ' (owner)' : ''}</option>)}
          </select>
        )}
        {!isOwner && !row.assignee && (
          <Btn size="sm" type="button" className="ml-auto" onClick={claim} disabled={busy === 'claim'} data-claim>
            {busy === 'claim' ? 'Assigning…' : 'Assign to me'}
          </Btn>
        )}
      </div>

      {a.mine && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            {row.intro?.sent ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)' }} data-intro-sent>
                <CheckCircle2 size={14} /> Introduction already sent{row.intro.byName ? ` · ${row.intro.byName}` : ''}{row.intro.at ? ` · ${fmtDateTime(row.intro.at)}` : ''}
              </div>
            ) : (
              <>
                <span title={a.intro?.enabled ? '' : a.intro?.reason || ''} className="inline-block">
                  <Btn size="sm" type="button" variant="blue" disabled={!a.intro?.enabled || !!busy} onClick={() => setPreview('intro')}
                    aria-describedby={`intro-why-${rid}`} data-intro-button>
                    <Send size={13} /> Send my introduction
                  </Btn>
                </span>
                {!a.intro?.enabled && <Reason id={`intro-why-${rid}`}>{a.intro?.reason}</Reason>}
              </>
            )}
          </div>
          {a.handover && a.handover.state !== 'none' && (
            <div>
              {a.handover.state === 'sent' ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                  <CheckCircle2 size={14} /> Handover message sent
                </div>
              ) : (
                <>
                  <span title={a.handover.enabled ? '' : a.handover.reason || ''} className="inline-block">
                    <Btn size="sm" type="button" variant="ghost" disabled={!a.handover.enabled || !!busy} onClick={() => setPreview('handover')} data-handover-button>
                      <ArrowRightLeft size={13} /> Send handover message
                    </Btn>
                  </span>
                  {!a.handover.enabled && <Reason>{a.handover.reason}</Reason>}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {row.assignee && !a.mine && row.intro?.sent && (
        <div className="mt-1.5 text-[11px]" style={{ color: 'var(--text3)' }}>Introduction sent by {row.intro.byName}{row.intro.at ? ` · ${fmtDateTime(row.intro.at)}` : ''}</div>
      )}
      <div className="mt-1.5 text-[11px] inline-flex items-center gap-1" style={{ color: win.open ? 'var(--text3)' : 'var(--amber)' }} data-window>
        <Clock size={11} />
        {win.open ? `WhatsApp reply window open until ${fmtDateTime(win.closesAt)}` : 'WhatsApp reply window closed (no customer message in 24 h)'}
      </div>

      <Modal open={preview === 'intro'} onClose={() => setPreview(null)} title="Send your introduction?">
        <div data-intro-modal>
          <p className="text-xs mb-3" style={{ color: 'var(--text2)' }}>The customer receives this once, as an image message in the chat (the chat still shows SaveLife's logo). It is optional — if the customer needs urgent help, help first.</p>
          <IntroCardPreview photoUrl={photoUrl} caption={myProfile?.preview?.caption} />
          <div className="flex gap-2 justify-end mt-4">
            <Btn variant="ghost" type="button" onClick={() => setPreview(null)}>Cancel</Btn>
            <Btn type="button" onClick={sendIntro} disabled={busy === 'intro'} data-intro-confirm>{busy === 'intro' ? 'Sending…' : 'Send introduction'}</Btn>
          </div>
        </div>
      </Modal>
      <Modal open={preview === 'handover'} onClose={() => setPreview(null)} title="Send the handover message?">
        <div data-handover-modal>
          <p className="text-xs mb-3" style={{ color: 'var(--text2)' }}>This chat was with {a.handover?.fromName || 'a colleague'}. The customer receives this short message (no photo):</p>
          <div className="rounded-xl p-3 text-[13px] whitespace-pre-wrap" style={{ background: '#dcf8c6', color: '#111b21' }}>{myProfile?.preview?.handoverText}</div>
          <div className="flex gap-2 justify-end mt-4">
            <Btn variant="ghost" type="button" onClick={() => setPreview(null)}>Cancel</Btn>
            <Btn type="button" onClick={sendHandover} disabled={busy === 'handover'} data-handover-confirm>{busy === 'handover' ? 'Sending…' : 'Send message'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
