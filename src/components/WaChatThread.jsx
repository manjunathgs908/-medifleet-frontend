// src/components/WaChatThread.jsx
//
// Two-way WhatsApp chat with one customer, full screen, on the ONE SaveLife
// number: the customer's real messages on the left; SaveLife — the bot,
// automation, and staff — on the right, with times and delivery ticks.
// Staff reply with text or an ambulance photo (preset gallery or upload).
//
// The server decides every rule (medifleet-backend services/waChat.js) and
// sends each button's state in `chat.actions`; disabled controls show WHY
// in visible text (outside WhatsApp's 24-hour window, or not your chat).
// "Bot is handling / You are handling": while a staff member handles the
// chat the bot does not reply to this customer at all, until handed back.
//
// No customer number is ever shown to a telecaller: the server masks it in
// fields and inside message text; this only addresses the chat by its ref.
// Message history exists only from when this feature went live.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Send, Camera, Bot, UserRound, Hand, RotateCcw, Upload, Check, CheckCheck, AlertCircle, Clock, ImageOff } from 'lucide-react';
import { waChatsApi } from '../api/client';
import { Btn, Spinner, custPhone, fmtDateTime } from './ui';

const POLL_MS = 8000;

// A photo fetched with the session (never public) as a blob URL.
function useBlob(fetcher, key) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!key) { setUrl(null); return undefined; }
    let alive = true; let made = null;
    fetcher().then(({ data }) => { if (alive) { made = URL.createObjectURL(data); setUrl(made); } }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

// A photo from the device -> JPEG data URL, ≤1280 px, under ~900 KB (server: 1 MB).
async function toSendableJpeg(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i); i.onerror = () => reject(new Error('That file is not a photo we can read.'));
      i.src = src;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length * 0.75 < 900 * 1024) return d;
    }
    throw new Error('That photo is too large even after shrinking — choose another.');
  } finally { URL.revokeObjectURL(src); }
}

const newClientId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
const time = (v) => new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
const dayKey = (v) => new Date(v).toDateString();
const dayLabel = (v) => {
  const d = new Date(v); const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const WA = { bg: '#efeae2', in: '#ffffff', out: '#d9fdd3', text: '#111b21', meta: '#667781', note: '#fff3c4' };

function Ticks({ m }) {
  if (m.direction !== 'outbound') return null;
  if (m.status === 'failed') return <AlertCircle size={12} style={{ color: '#d93025' }} aria-label="Not delivered" />;
  if (m.status === 'sending') return <Clock size={11} aria-label="Sending" />;
  if (m.status === 'read') return <CheckCheck size={13} style={{ color: '#53bdeb' }} aria-label="Read" />;
  if (m.status === 'delivered') return <CheckCheck size={13} aria-label="Delivered" />;
  return <Check size={13} aria-label="Sent" />;
}

function senderLabel(m) {
  if (m.direction === 'inbound') return null;
  if (m.sender === 'staff') return m.kind === 'intro' ? `${m.senderName} · introduction card` : m.kind === 'handover' ? `${m.senderName} · handover message` : m.senderName;
  if (m.sender === 'system') return 'SaveLife · automated';
  return 'SaveLife bot';
}

function ChatImage({ chatRef, m }) {
  const key = m.media?.kind === 'gallery' ? `g:${m.media.galleryId}` : m.media?.kind === 'upload' ? `u:${m.media.uploadId}` : null;
  const url = useBlob(() => (m.media.kind === 'gallery' ? waChatsApi.galleryPhoto(m.media.galleryId) : waChatsApi.media(chatRef, m.media.uploadId)), key);
  if (!key) return null;
  return url
    ? <img src={url} alt={m.media.label ? `${m.media.label} photo` : 'Photo sent'} className="w-full rounded-md mb-1 object-cover" style={{ maxHeight: 220 }} />
    : <div className="w-full rounded-md mb-1 flex items-center justify-center text-[11px]" style={{ height: 120, background: '#cfd8dc', color: WA.meta }}><ImageOff size={16} /></div>;
}

function MessageBody({ m, chatRef }) {
  const kindLabel = {
    image: m.direction === 'inbound' ? '📷 Photo from the customer' : `📷 Photo${m.media?.label ? ` · ${m.media.label}` : m.kind === 'intro' ? ' · introduction' : ''}`,
    audio: '🎤 Voice message', video: '🎬 Video', document: '📄 Document', sticker: 'Sticker', contacts: '📇 Contact shared', reaction: 'Reaction',
  }[m.type];
  return (
    <>
      {m.type === 'image' && <ChatImage chatRef={chatRef} m={m} />}
      {m.type === 'location' ? (
        <div>
          <div className="font-semibold">📍 Location</div>
          {(m.location?.name || m.location?.address) && <div>{[m.location.name, m.location.address].filter(Boolean).join(' — ')}</div>}
          {m.location?.lat != null && m.location?.lng != null && (
            <a className="underline text-[12px]" style={{ color: '#027eb5' }} target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps?q=${m.location.lat},${m.location.lng}`}>Open in Maps</a>
          )}
        </div>
      ) : m.type === 'template' ? (
        <div className="italic">📨 Template message{m.template ? ` · ${m.template}` : ''}</div>
      ) : (
        <>
          {kindLabel && <div className="font-semibold text-[12px] mb-0.5">{kindLabel}</div>}
          {m.type === 'interactive' && m.direction === 'inbound'
            ? <div>↩︎ Tapped: <b>{m.body || '(button)'}</b></div>
            : m.body ? <div className="whitespace-pre-wrap break-words">{m.body}</div> : null}
          {m.options?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {m.options.map((o, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full" style={{ border: '1px solid #9fc5a8', color: '#1f6f43' }}>{o}</span>)}
            </div>
          )}
        </>
      )}
      {m.status === 'failed' && <div className="text-[11px] mt-1" style={{ color: '#d93025' }}>Not delivered: {m.error}</div>}
    </>
  );
}

function eventText(e) {
  switch (e.type) {
    case 'takeover': return `${e.byName} took over from the bot${e.via === 'reply' ? ' (by replying)' : ''}`;
    case 'handback': return e.via === 'unassigned' ? 'Chat unassigned — the bot is handling it again' : `${e.byName} handed the chat back to the bot`;
    case 'assigned': return `${e.byName} assigned the chat to ${e.to}`;
    case 'claimed': return `${e.to || e.byName} took this chat (Assign to me)`;
    case 'unassigned': return `${e.byName} unassigned the chat`;
    case 'intro': return `${e.byName} sent their introduction card`;
    case 'handover': return `${e.byName} sent the handover message`;
    default: return null;
  }
}

/**
 * row      the /whatsapp/conversations row (customerRef, phoneMasked, status summary …)
 * meName   the signed-in user's name ("You are handling")
 * onChat   called with the server's fresh chat state after any change
 */
export default function WaChatThread({ row, meName, onClose, onChat }) {
  const ref = row.customerRef;
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [chat, setChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(null); // 'text' | 'image' | 'mode' | 'older'
  const [galleryOpen, setGalleryOpen] = useState(false);
  const scrollRef = useRef(null);
  const atBottom = useRef(true);
  const textId = useRef(newClientId());

  const applyChat = useCallback((c) => { if (c) { setChat(c); onChat?.(c); } }, [onChat]);

  // Newest page; keeps older pages already loaded.
  const load = useCallback(async ({ silent } = {}) => {
    try {
      const { data } = await waChatsApi.messages(ref);
      setMessages((prev) => {
        const fresh = new Map(data.messages.map((m) => [m.id, m]));
        const firstFresh = data.messages[0]?.at;
        const older = firstFresh ? prev.filter((m) => !fresh.has(m.id) && new Date(m.at) <= new Date(firstFresh)) : [];
        return [...older, ...data.messages];
      });
      setHasMore((h) => (silent ? h || data.hasMore : data.hasMore));
      setEvents(data.events || []);
      setChat(data.chat);
      setError(null);
    } catch (e) {
      if (!silent) setError(e?.response?.data?.message || 'Could not load this chat.');
    } finally { setLoading(false); }
  }, [ref]);

  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), POLL_MS);
    document.body.style.overflow = 'hidden';
    return () => { clearInterval(t); document.body.style.overflow = ''; };
  }, [load]);

  // Stay at the bottom when new messages arrive, unless reading older ones.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    if (!messages.length) return;
    setBusy('older');
    const el = scrollRef.current; const before = el ? el.scrollHeight : 0;
    try {
      const { data } = await waChatsApi.messages(ref, messages[0].id);
      setMessages((prev) => [...data.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(data.hasMore);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
    } catch (e) { toast.error(e?.response?.data?.message || 'Could not load older messages.'); }
    finally { setBusy(null); }
  };

  const failed = (e, fallback) => {
    const d = e?.response?.data;
    if (d?.chat) applyChat(d.chat);
    toast.error(d?.message || fallback);
  };

  const sendText = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy('text');
    try {
      const { data } = await waChatsApi.sendText(ref, { text: body, clientMsgId: textId.current });
      setText(''); textId.current = newClientId();
      atBottom.current = true;
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      applyChat(data.chat);
      load({ silent: true });
    } catch (e) { failed(e, 'Could not send the message.'); }
    finally { setBusy(null); }
  };

  const sendImage = async (payload) => {
    setBusy('image');
    try {
      const { data } = await waChatsApi.sendImage(ref, { ...payload, clientMsgId: newClientId() });
      atBottom.current = true;
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      applyChat(data.chat);
      setGalleryOpen(false);
      toast.success('Photo sent');
      load({ silent: true });
      return true;
    } catch (e) { failed(e, 'Could not send the photo.'); return false; }
    finally { setBusy(null); }
  };

  const setMode = async (to) => {
    setBusy('mode');
    try {
      const { data } = await (to === 'human' ? waChatsApi.takeover(ref) : waChatsApi.handback(ref));
      applyChat(data.chat);
      toast.success(to === 'human' ? 'You are handling this chat — the bot will not reply' : 'Handed back — the bot will reply again');
      load({ silent: true });
    } catch (e) { failed(e, 'Could not change who is handling this chat.'); }
    finally { setBusy(null); }
  };

  const a = chat?.actions || {};
  const mode = chat?.mode?.value || row.mode?.value || 'bot';
  const mine = !!a.mine;
  const reply = a.reply || { enabled: false, reason: null };
  const win = chat?.window || row.window || {};

  // Messages and events on one timeline (events older than the loaded page wait for "older").
  const oldestShown = !hasMore || !messages.length ? null : new Date(messages[0].at);
  const timeline = [
    ...messages.map((m) => ({ t: new Date(m.at), m })),
    ...events.filter((e) => eventText(e) && (!oldestShown || new Date(e.at) >= oldestShown)).map((e) => ({ t: new Date(e.at), e })),
  ].sort((x, y) => x.t - y.t);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: 'var(--ink)' }} data-chat-thread role="dialog" aria-label="WhatsApp chat">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={onClose} className="p-2 rounded-lg flex-shrink-0" style={{ background: 'var(--surface2)', color: 'var(--text2)' }} aria-label="Close chat"><X size={18} /></button>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold font-mono truncate" data-chat-phone>{custPhone(row.phone, row.phoneMasked)}</div>
          <div className="text-[11px] truncate" style={{ color: 'var(--text3)' }}>
            {row.lastStepLabel}{row.serviceLabel ? ` · ${row.serviceLabel}` : ''}{chat?.assignee ? ` · ${mine ? 'Your chat' : `Assigned to ${chat.assignee.name}`}` : ' · Unassigned'}
          </div>
        </div>
      </div>

      {/* Who is handling: bot or a person */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 flex-shrink-0" data-mode-bar data-mode={mode}
        style={{ background: mode === 'human' ? 'rgba(59,158,255,.10)' : 'rgba(0,168,120,.08)', borderBottom: '1px solid var(--border)' }}>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: mode === 'human' ? 'var(--blue)' : 'var(--accent)' }} data-mode-label>
          {mode === 'human' ? <UserRound size={16} /> : <Bot size={16} />}
          {mode === 'human'
            ? (mine || (meName && chat?.mode?.byName === meName) ? 'You are handling' : `${chat?.mode?.byName || 'Staff'} is handling`)
            : 'Bot is handling'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text3)' }}>
          {mode === 'human' ? 'The bot will not reply to this customer until handed back.' : 'The booking bot replies automatically.'}
        </span>
        <div className="ml-auto">
          {mode === 'bot' ? (
            <Btn size="sm" type="button" variant="blue" onClick={() => setMode('human')} disabled={!a.takeover?.enabled || !!busy} data-takeover><Hand size={13} /> Take over from bot</Btn>
          ) : (
            <Btn size="sm" type="button" variant="ghost" onClick={() => setMode('bot')} disabled={!a.handback?.enabled || !!busy} data-handback><RotateCcw size={13} /> Hand back to bot</Btn>
          )}
        </div>
        {((mode === 'bot' && a.takeover && !a.takeover.enabled && a.takeover.reason) || (mode === 'human' && a.handback && !a.handback.enabled && a.handback.reason)) && (
          <div className="w-full text-[11px]" style={{ color: 'var(--text3)' }}>{mode === 'bot' ? a.takeover.reason : a.handback.reason}</div>
        )}
      </div>

      {/* Thread */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3" style={{ background: WA.bg }} data-thread>
        {loading ? <Spinner /> : error ? (
          <div className="text-sm text-center mt-6" style={{ color: '#d93025' }}>{error} <button className="underline ml-1" onClick={() => load()}>Retry</button></div>
        ) : (
          <div className="max-w-3xl mx-auto flex flex-col gap-1.5">
            {hasMore ? (
              <button className="self-center text-[12px] px-3 py-1 rounded-full mb-2" style={{ background: '#fff', color: WA.meta }} onClick={loadOlder} disabled={busy === 'older'}>
                {busy === 'older' ? 'Loading…' : 'Load older messages'}
              </button>
            ) : (
              <div className="self-center text-center text-[12px] px-3 py-2 rounded-lg mb-2 max-w-md" style={{ background: WA.note, color: '#54656f' }} data-history-note>
                Full message history starts from when this feature went live. Earlier messages were not stored.
                {messages.length === 0 && (
                  <div className="mt-2 text-left rounded-md px-2.5 py-2" style={{ background: 'rgba(255,255,255,.7)' }} data-status-summary>
                    <div><b>Status:</b> {row.lastStepLabel || '—'}</div>
                    {row.serviceLabel && <div><b>Service:</b> {row.serviceLabel}</div>}
                    <div><b>Last activity:</b> {fmtDateTime(row.lastSeenAt)}</div>
                    <div><b>Booking:</b> {row.completed ? 'Completed in the bot' : row.isLive ? 'In progress in the bot' : 'Not completed'}</div>
                  </div>
                )}
              </div>
            )}

            {timeline.map((item, i) => {
              const prev = timeline[i - 1];
              const showDay = !prev || dayKey(prev.t) !== dayKey(item.t);
              const day = showDay ? <div key={`d${i}`} className="self-center text-[11px] px-2.5 py-0.5 rounded-md my-1" style={{ background: '#fff', color: WA.meta }}>{dayLabel(item.t)}</div> : null;
              if (item.e) {
                return (
                  <React.Fragment key={`e${i}`}>
                    {day}
                    <div className="self-center text-[11px] px-2.5 py-1 rounded-md text-center" style={{ background: '#e1f3fb', color: '#3b4a54' }} data-event>
                      {eventText(item.e)} · {time(item.e.at)}
                    </div>
                  </React.Fragment>
                );
              }
              const m = item.m;
              const out = m.direction === 'outbound';
              const who = senderLabel(m);
              return (
                <React.Fragment key={m.id}>
                  {day}
                  <div className={`flex ${out ? 'justify-end' : 'justify-start'}`} data-msg={m.direction} data-sender={m.sender} data-kind={m.kind || ''}>
                    <div className="rounded-lg px-2.5 py-1.5 text-[13.5px] shadow-sm" style={{ background: out ? WA.out : WA.in, color: WA.text, maxWidth: 'min(85%, 420px)', fontFamily: 'system-ui, sans-serif' }}>
                      {who && (
                        <div className="text-[11px] font-semibold mb-0.5 inline-flex items-center gap-1" style={{ color: m.sender === 'staff' ? '#1f6fb2' : '#0a7c5c' }}>
                          {m.sender === 'staff' ? <UserRound size={11} /> : <Bot size={11} />} {who}
                        </div>
                      )}
                      <MessageBody m={m} chatRef={ref} />
                      <div className="flex items-center justify-end gap-1 text-[10.5px] mt-0.5" style={{ color: WA.meta }}>
                        {time(m.at)} <Ticks m={m} />
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply box */}
      <div className="flex-shrink-0 px-3 pt-2 pb-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--ink2)' }} data-reply-box>
        {!reply.enabled && reply.reason && (
          <div className="text-[12px] mb-2 rounded-lg px-3 py-2 flex items-start gap-1.5" style={{ background: 'rgba(217,119,6,.10)', color: 'var(--amber)', border: '1px solid rgba(217,119,6,.3)' }} data-reply-reason>
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{reply.reason}</span>
          </div>
        )}
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <button type="button" className="p-2.5 rounded-xl flex-shrink-0 disabled:opacity-40" style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
            onClick={() => setGalleryOpen(true)} disabled={!reply.enabled || !!busy} aria-label="Send ambulance photo" title="Send ambulance photo" data-open-gallery>
            <Camera size={18} />
          </button>
          <textarea className="inp flex-1 resize-none" rows={1} style={{ minHeight: 42, maxHeight: 120 }} maxLength={4096}
            placeholder={reply.enabled ? (mode === 'bot' ? 'Type a reply — sending takes over from the bot' : 'Type a reply') : 'Replies are turned off for this chat'}
            value={text} onChange={(e) => setText(e.target.value)} disabled={!reply.enabled || busy === 'text'} aria-label="Reply"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendText(); } }} data-reply-input />
          <Btn type="button" onClick={sendText} disabled={!reply.enabled || !text.trim() || !!busy} aria-label="Send" data-send><Send size={15} /><span className="hidden sm:inline">{busy === 'text' ? 'Sending…' : 'Send'}</span></Btn>
        </div>
        <div className="text-[10.5px] mt-1.5 max-w-3xl mx-auto inline-flex items-center gap-1 w-full" style={{ color: win.open ? 'var(--text3)' : 'var(--amber)' }}>
          <Clock size={10} /> {win.open ? `WhatsApp reply window open until ${fmtDateTime(win.closesAt)}` : 'WhatsApp reply window closed (no customer message in 24 h)'}
        </div>
      </div>

      {galleryOpen && <GalleryPicker onClose={() => setGalleryOpen(false)} onSend={sendImage} sending={busy === 'image'} />}
    </div>
  );
}

function GalleryTile({ p, selected, onPick, canEdit, version, onChanged }) {
  const url = useBlob(() => waChatsApi.galleryPhoto(p.id), p.hasPhoto ? `${p.id}:${version}:${p.updatedAt}` : null);
  const fileRef = useRef(null);
  const setPhoto = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { await waChatsApi.setGalleryPhoto(p.id, await toSendableJpeg(file)); toast.success(`${p.label} photo saved`); onChanged(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message || 'Could not save the photo.'); }
  };
  return (
    <div className="rounded-xl overflow-hidden flex flex-col" data-gallery-tile={p.id}
      style={{ border: selected ? '2px solid var(--accent)' : '1px solid var(--border)', background: 'var(--surface2)' }}>
      <button type="button" className="w-full flex items-center justify-center disabled:cursor-not-allowed" style={{ aspectRatio: '4 / 3', background: '#cfd8dc' }}
        onClick={() => onPick(p)} disabled={!p.hasPhoto} aria-label={`${p.label}${p.hasPhoto ? '' : ' (no photo yet)'}`}>
        {url ? <img src={url} alt={`${p.label} ambulance`} className="w-full h-full object-cover" /> : <span className="text-[11px] px-2 text-center" style={{ color: '#455a64' }}>{p.hasPhoto ? '…' : 'No photo yet'}</span>}
      </button>
      <div className="px-2 py-1.5 flex items-center gap-1">
        <span className="text-xs font-semibold truncate flex-1">{p.label}</span>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={setPhoto} aria-label={`Set ${p.label} photo`} />
            <button type="button" className="text-[10px] underline flex-shrink-0" style={{ color: 'var(--text3)' }} onClick={() => fileRef.current?.click()}>{p.hasPhoto ? 'Change' : 'Add photo'}</button>
          </>
        )}
      </div>
    </div>
  );
}

function GalleryPicker({ onClose, onSend, sending }) {
  const [data, setData] = useState(null);
  const [version, setVersion] = useState(0);
  const [pick, setPick] = useState(null);         // a preset
  const [upload, setUpload] = useState(null);     // data URL
  const [caption, setCaption] = useState('');
  const fileRef = useRef(null);
  const loadGallery = () => waChatsApi.gallery().then(({ data: d }) => setData(d)).catch((e) => toast.error(e?.response?.data?.message || 'Could not load the gallery.'));
  useEffect(() => { loadGallery(); }, []);

  const choose = (p) => { setPick(p); setUpload(null); setCaption(p.caption); };
  const chooseFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { setUpload(await toSendableJpeg(file)); setPick(null); setCaption(''); }
    catch (err) { toast.error(err.message); }
  };
  const send = () => onSend(pick ? { galleryId: pick.id, caption } : { dataUrl: upload, caption });

  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()} data-gallery>
      <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl p-4 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--ink2)', border: '1px solid var(--border2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">Send ambulance photo</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text3)' }} aria-label="Close"><X size={17} /></button>
        </div>
        {!data ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.photos.map((p) => <GalleryTile key={p.id} p={p} selected={pick?.id === p.id} onPick={choose} canEdit={data.canEdit} version={version} onChanged={() => { setVersion((v) => v + 1); loadGallery(); }} />)}
              <button type="button" className="rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-semibold" data-upload-tile
                style={{ border: upload ? '2px solid var(--accent)' : '1px dashed var(--border2)', background: 'var(--surface2)', color: 'var(--text2)', minHeight: 120 }}
                onClick={() => fileRef.current?.click()}>
                <Upload size={18} /> Upload a photo
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={chooseFile} aria-label="Upload a photo" />
            </div>
            {data.photos.some((p) => !p.hasPhoto) && (
              <div className="text-[11px] mt-2" style={{ color: 'var(--text3)' }}>
                {data.canEdit ? 'Add a photo to each ambulance type once — staff can then send it.' : 'Types marked “No photo yet” can be sent once the owner adds their photo.'}
              </div>
            )}
            {(pick || upload) && (
              <div className="sticky -bottom-4 mt-4 -mx-4 -mb-4 p-4" style={{ background: 'var(--ink2)', borderTop: '1px solid var(--border2)', boxShadow: '0 -6px 16px rgba(0,0,0,.12)' }} data-gallery-confirm>
                <div className="flex gap-3 items-start">
                  {upload && <img src={upload} alt="Photo to send" className="w-20 h-20 object-cover rounded-lg flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold mb-1">{pick ? pick.label : 'Your photo'} — caption (optional)</div>
                    <input className="inp" value={caption} maxLength={1024} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" placeholder="e.g. SaveLife ambulance" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <Btn variant="ghost" type="button" onClick={onClose}>Cancel</Btn>
                  <Btn type="button" onClick={send} disabled={sending} data-gallery-send><Send size={14} /> {sending ? 'Sending…' : 'Send photo'}</Btn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
