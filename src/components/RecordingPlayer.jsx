// src/components/RecordingPlayer.jsx
//
// Plays one call recording. Nothing is fetched until "Play recording" is
// tapped: the audio comes through GET /api/calls/:id/recording, which checks
// the CRM login and pulls the file from Plivo with our credentials, so it
// keeps working with Plivo's "Basic Auth For Recording URLs" switched on.
// The page never sees Plivo's URL — only an in-memory copy of the audio,
// released when the player goes away.
import React, { useEffect, useRef, useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { callsApi } from '../api/client';

// The error body of a blob request is itself a blob; read the backend's
// message out of it.
async function messageFrom(err) {
  try {
    const text = await err?.response?.data?.text?.();
    return JSON.parse(text).message;
  } catch {
    return null;
  }
}

export default function RecordingPlayer({ callLogId }) {
  const [src,     setSrc]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const urlRef = useRef(null);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await callsApi.recording(callLogId);
      const blob = data.type ? data : new Blob([data], { type: 'audio/mpeg' });
      urlRef.current = URL.createObjectURL(blob);
      setSrc(urlRef.current);
    } catch (err) {
      setError((await messageFrom(err)) || 'Could not load this recording.');
    } finally {
      setLoading(false);
    }
  };

  if (src) {
    return <audio controls autoPlay src={src} className="w-full mt-2" style={{ height: 36 }} />;
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
        style={{ background: 'rgba(59,158,255,.12)', color: 'var(--blue)', border: '1px solid rgba(59,158,255,.3)' }}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {loading ? 'Loading recording…' : 'Play recording'}
      </button>
      {error && <div className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>{error}</div>}
    </div>
  );
}
