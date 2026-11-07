// src/components/AiStyleExamples.jsx
//
// AI Telecaller page -> "Style examples" (owner only). Real SaveLife calls
// the assistant copies the talking style of: medifleet-backend
// /api/ai-caller/style-examples. Add one from a recent captured call
// (live call capture transcripts) or paste one, edit it (take out names),
// switch it on or off. The server puts the first few active ones into each
// call's instructions, phone numbers masked; "Show what the AI is told"
// previews exactly that.
import React, { useEffect, useState } from 'react';
import { aiCallerApi } from '../api/client';
import { Btn, Badge, Empty, fmtDateTime } from './ui';
import toast from 'react-hot-toast';
import { MessageSquareQuote, Plus, Trash2, Eye, Pencil } from 'lucide-react';

const ROLE = { operator: 'SaveLife', customer: 'Caller' };

// "SaveLife: …" / "Caller: …" lines <-> transcript turns.
const toText = (turns) => (turns || []).map((t) => `${ROLE[t.role] || t.role}: ${t.text}`).join('\n');
const fromText = (text) => String(text || '').split('\n').map((line) => {
  const m = /^\s*(SaveLife|Operator|Caller|Customer)\s*:\s*(.+)$/i.exec(line);
  if (!m) return null;
  return { role: /^(savelife|operator)$/i.test(m[1]) ? 'operator' : 'customer', text: m[2].trim() };
}).filter(Boolean);

export default function AiStyleExamples() {
  const [examples, setExamples] = useState([]);
  const [maxInPrompt, setMaxInPrompt] = useState(3);
  const [candidates, setCandidates] = useState(null); // null = not loaded
  const [editing, setEditing] = useState(null);       // { id?, title, text }
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await aiCallerApi.styleExamples();
      setExamples(data.examples || []);
      setMaxInPrompt(data.maxInPrompt ?? 3);
    } catch { /* toast from the client */ }
  };
  useEffect(() => { load(); }, []);

  const loadCandidates = async () => {
    try { setCandidates((await aiCallerApi.styleCandidates()).data.calls || []); } catch { setCandidates([]); }
  };

  const save = async () => {
    const transcript = fromText(editing.text);
    if (!transcript.length) { toast.error('Write each line as "SaveLife: …" or "Caller: …"'); return; }
    setBusy(true);
    try {
      if (editing.id) await aiCallerApi.updateStyle(editing.id, { title: editing.title, transcript });
      else await aiCallerApi.addStyle({ title: editing.title, transcript });
      toast.success('Style example saved');
      setEditing(null);
      await load();
    } catch { /* toast from the client */ } finally { setBusy(false); }
  };

  const addFromCall = async (c) => {
    setBusy(true);
    try {
      const { data } = await aiCallerApi.addStyle({ callLogId: c._id, title: c.summary?.slice(0, 120) || '' });
      toast.success('Added — check it and take out names');
      await Promise.all([load(), loadCandidates()]);
      setEditing({ id: data.example._id, title: data.example.title || '', text: toText(data.example.transcript) });
    } catch { /* toast from the client */ } finally { setBusy(false); }
  };

  const toggle = async (ex) => {
    try { await aiCallerApi.updateStyle(ex._id, { active: !ex.active }); await load(); } catch { /* toast */ }
  };
  const remove = async (ex) => {
    if (!window.confirm(`Delete the style example "${ex.title || 'untitled'}"?`)) return;
    try { await aiCallerApi.removeStyle(ex._id); await load(); } catch { /* toast */ }
  };
  const showPreview = async () => {
    try { setPreview((await aiCallerApi.promptPreview()).data); } catch { /* toast */ }
  };

  const activeCount = examples.filter((e) => e.active).length;

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold font-display flex items-center gap-2"><MessageSquareQuote size={16} /> Style examples (real calls)</h2>
        <span className="text-xs" style={{ color: 'var(--text3)' }}>
          {activeCount} active · the first {maxInPrompt} go into every call
        </span>
        <div className="ml-auto flex gap-2">
          <Btn size="sm" variant="ghost" onClick={showPreview}><Eye size={13} /> Show what the AI is told</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setEditing({ title: '', text: 'SaveLife: \nCaller: ' })}><Plus size={13} /> Paste one</Btn>
          <Btn size="sm" onClick={loadCandidates}><Plus size={13} /> From a recent call</Btn>
        </div>
      </div>
      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
        The assistant copies how our operators talk — phrasing, question order, warmth, brevity — from these. Pick short, good calls.
        Phone numbers are masked automatically; take out names before saving.
      </div>

      {editing && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface2)', border: '1px solid var(--accent)' }}>
          <input className="inp" placeholder="Title (e.g. Urgent caller, pickup first)" value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          <textarea className="inp font-mono text-xs" rows={10} value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
          <div className="text-[11px]" style={{ color: 'var(--text3)' }}>One line per turn: “SaveLife: …” or “Caller: …”.</div>
          <div className="flex gap-2">
            <Btn size="sm" onClick={save} disabled={busy}>Save</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
          </div>
        </div>
      )}

      {candidates && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface2)' }}>
          <div className="flex items-center">
            <span className="text-sm font-semibold">Recent captured calls (last 60 days)</span>
            <button className="ml-auto text-xs" style={{ color: 'var(--text3)' }} onClick={() => setCandidates(null)}>Close</button>
          </div>
          {candidates.length === 0
            ? <div className="text-xs" style={{ color: 'var(--text3)' }}>No captured calls with a transcript yet — they come from live call capture.</div>
            : candidates.map((c) => (
              <details key={c._id} className="rounded-lg p-2 text-sm" style={{ background: 'var(--surface)' }}>
                <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text3)' }}>{fmtDateTime(c.createdAt)}</span>
                  {c.agentName && <span className="text-xs">{c.agentName}</span>}
                  <span className="text-xs" style={{ color: 'var(--text3)' }}>{c.turns} turns</span>
                  <span className="truncate">{c.summary}</span>
                  {c.used && <Badge color="green">Added</Badge>}
                </summary>
                <div className="mt-2 space-y-1 text-xs max-h-60 overflow-y-auto">
                  {c.transcript.map((t, i) => <div key={i}><b>{ROLE[t.role] || t.role}:</b> {t.text}</div>)}
                </div>
                {!c.used && <Btn size="sm" className="mt-2" onClick={() => addFromCall(c)} disabled={busy}>Use as style example</Btn>}
              </details>
            ))}
        </div>
      )}

      {examples.length === 0 ? <Empty icon="💬" message="No style examples yet — the assistant uses its own wording" /> : (
        <div className="space-y-2">
          {examples.map((ex) => (
            <details key={ex._id} className="rounded-xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', opacity: ex.active ? 1 : 0.6 }}>
              <summary className="cursor-pointer flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{ex.title || 'Untitled'}</span>
                <Badge color={ex.active ? 'green' : 'gray'}>{ex.active ? 'Active' : 'Off'}</Badge>
                <span className="text-xs" style={{ color: 'var(--text3)' }}>{(ex.transcript || []).length} turns</span>
              </summary>
              <div className="mt-2 space-y-1 text-xs">
                {(ex.transcript || []).map((t, i) => <div key={i}><b>{ROLE[t.role] || t.role}:</b> {t.text}</div>)}
              </div>
              <div className="mt-2 flex gap-2">
                <Btn size="sm" variant="ghost" onClick={() => setEditing({ id: ex._id, title: ex.title || '', text: toText(ex.transcript) })}><Pencil size={13} /> Edit</Btn>
                <Btn size="sm" variant="ghost" onClick={() => toggle(ex)}>{ex.active ? 'Switch off' : 'Switch on'}</Btn>
                <Btn size="sm" variant="ghost" onClick={() => remove(ex)}><Trash2 size={13} /> Delete</Btn>
              </div>
            </details>
          ))}
        </div>
      )}

      {preview && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--ink2)' }}>
          <div className="flex items-center text-sm">
            <span className="font-semibold">What a call made now is told ({preview.styleExamples} style example{preview.styleExamples === 1 ? '' : 's'})</span>
            <button className="ml-auto text-xs" style={{ color: 'var(--text3)' }} onClick={() => setPreview(null)}>Close</button>
          </div>
          <pre className="text-[11px] whitespace-pre-wrap max-h-96 overflow-y-auto">{preview.instructions}</pre>
        </div>
      )}
    </div>
  );
}
