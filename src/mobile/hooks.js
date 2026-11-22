// src/mobile/hooks.js
//
// useIsMobile    whether the phone layout is used (logic.mjs MOBILE_QUERY:
//                <= 430px inclusive, touch phones up to 600px, and touch
//                phones in landscape). Everything else keeps the existing
//                layout.
// useMobileSummary  the three EXISTING count endpoints the mobile Home and
//                bell read, polled once for every screen that asks:
//                  GET /api/leads/summary      counts { new, dueToday, overdue, ... }
//                  GET /api/callbacks/summary  { open, overdue }
//                  GET /api/trips/live         counts { active, ... }
//                Each source is tracked on its own ({ status, data, error }):
//                one failing marks only its own cards "Couldn't load".
//
// The counts belong to the signed-in user. The store is keyed to that
// user's id: signing out, or another user signing in on the same device,
// clears it at once, and any answer still in flight for the previous user
// is thrown away (generation check). A failed request clears that source's
// number — it is never shown stale.
import { useEffect, useState, useSyncExternalStore } from 'react';
import api, { leadsApi, callbacksApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { MOBILE_QUERY } from './logic.mjs';

export function useIsMobile() {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches;
  const [mobile, setMobile] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return undefined;
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return mobile;
}

// ── One shared poller, owned by one user at a time ─────────────
const POLL_MS = 60 * 1000;
const KEYS = ['leads', 'callbacks', 'live'];
const loading = () => ({ status: 'loading', data: undefined, error: null });
const fresh = (userId) => ({ userId, leads: loading(), callbacks: loading(), live: loading() });
let state = fresh(null);
let generation = 0;
const listeners = new Set();
let timer = null;
const inflight = {};

const emit = () => listeners.forEach((l) => l());
const set = (key, value) => { state = { ...state, [key]: value }; emit(); };

const SOURCES = {
  leads    : () => leadsApi.summary().then(({ data }) => data.counts),
  callbacks: () => callbacksApi.summary().then(({ data }) => ({ open: data.open, overdue: data.overdue })),
  // Same endpoint as tripsApi.getLive, without its error toast: this polls,
  // and the Home card shows its own "Couldn't load" instead.
  live     : () => api.get('/trips/live', { skipErrorToast: true }).then(({ data }) => data.counts),
};

function load(key) {
  if (inflight[key]) return inflight[key];
  const gen = generation;
  // A retry after a failure shows loading; a background poll of a good
  // number keeps it on screen until the new one arrives.
  if (state[key].status === 'error') set(key, loading());
  inflight[key] = SOURCES[key]()
    .then((data) => { if (gen === generation) set(key, { status: 'ready', data, error: null }); })
    .catch((e) => {
      if (gen === generation) set(key, { status: 'error', data: undefined, error: e?.response?.data?.message || e?.message || 'Could not load' });
    })
    .finally(() => { delete inflight[key]; });
  return inflight[key];
}

/** Refresh one source (`key`) or all of them. */
export function refreshMobileSummary(key) {
  if (!state.userId) return Promise.resolve();
  return Promise.all((key ? [key] : KEYS).map(load));
}

// Switch the store to `userId` (null = signed out): drop everything the
// previous user's session loaded or is still loading.
function ownStore(userId) {
  if (state.userId === userId) return;
  generation += 1;
  KEYS.forEach((k) => { delete inflight[k]; });
  state = fresh(userId);
  emit();
  if (userId && listeners.size) refreshMobileSummary();
}

const onChanged = () => refreshMobileSummary();
function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    refreshMobileSummary();
    timer = setInterval(() => refreshMobileSummary(), POLL_MS);
    // The desktop pages already announce changes; follow them.
    window.addEventListener('leads:changed', onChanged);
    window.addEventListener('callbacks:changed', onChanged);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = null;
      window.removeEventListener('leads:changed', onChanged);
      window.removeEventListener('callbacks:changed', onChanged);
    }
  };
}

export function useMobileSummary() {
  const { user } = useAuth() || {};
  const userId = user ? String(user.id || user._id || '') || null : null;
  useEffect(() => { ownStore(userId); }, [userId]);
  const snap = useSyncExternalStore(subscribe, () => state);
  // Never hand out another user's numbers, even for one frame.
  return snap.userId === userId ? snap : fresh(userId);
}

/** A source's numbers only while its latest request succeeded. */
export const readyData = (src) => (src?.status === 'ready' ? src.data : undefined);
