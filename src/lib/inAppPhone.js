// src/lib/inAppPhone.js
//
// In-app calling: this CRM tab takes incoming customer calls itself, over
// WebRTC, through Plivo's Browser SDK — no phone line. One instance per tab,
// started by components/InAppPhone.jsx while the user is On call duty with
// "Ring in app" chosen.
//
// How a call reaches us: the backend's /api/calls/incoming tells Plivo to
// ring this user's own endpoint alongside everyone else on duty; first to
// answer takes it. The call-log id arrives as the X-PH-logId SIP header and
// is all we use to show the caller — masked, from GET /api/calls/:id.
//
// The backend rings this tab only while it keeps checking in (every 30s,
// and only while the SDK is really registered), and only for 15 seconds:
// if the app does not answer, the backend rings the user's phone. Hiding
// the tab does not log out; only going off duty or closing the page does.
import { callsApi } from '../api/client';

const HEARTBEAT_MS = 30 * 1000;
const RELOGIN_DELAY_MS = 3 * 1000;

const initial = {
  status  : 'off',  // off | starting | ready | mic_blocked | unsupported | error
  error   : '',
  incoming: null,   // { callUUID, logId, log }
  inCall  : null,   // { callUUID, logId, log, startedAt, muted }
};

let state = { ...initial };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l(state)); };

export const subscribe = (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); };
export const getState = () => state;

// ── TEMPORARY: registration diagnostics ─────────────────────────────────
// Every event the Plivo SDK emits, plus our own login/logout calls and
// changes in its registration state, go into window.__plivoDebug and, in
// batches, to POST /api/calls/webrtc/debug (read back with GET). Each
// page load is its own session, so two devices on one endpoint show up
// as two sessions. Tokens never leave the browser in these records.
const SESSION_ID = (window.crypto?.randomUUID?.() || `s${Date.now()}${Math.random().toString(36).slice(2)}`);
const DEVICE = [
  window.matchMedia?.('(display-mode: standalone)').matches ? 'installed-app' : 'browser-tab',
  navigator.userAgent,
].join(' · ');
window.__plivoDebug = window.__plivoDebug || [];

let debugQueue = [];
let debugTimer = null;

const compact = (v, depth = 0) => {
  if (v == null || depth > 3) return v;
  if (typeof v === 'string') return v.length > 300 || /^eyJ[\w-]+\./.test(v) ? `[${v.length} chars]` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 10).map((x) => compact(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v).slice(0, 20)) {
      if (typeof x === 'function') continue;
      out[k] = /token|password|jwt|secret/i.test(k) ? '[redacted]' : compact(x, depth + 1);
    }
    return out;
  }
  return String(v);
};

function record(event, args = []) {
  const [first, ...rest] = args;
  const entry = {
    event,
    reason   : typeof first === 'string' ? first : undefined,
    detail   : compact(typeof first === 'string' ? rest : args),
    at       : new Date().toISOString(),
    sessionId: SESSION_ID,
    device   : DEVICE,
  };
  window.__plivoDebug.push(entry);
  if (window.__plivoDebug.length > 300) window.__plivoDebug.splice(0, window.__plivoDebug.length - 300);
  debugQueue.push(entry);
  clearTimeout(debugTimer);
  debugTimer = setTimeout(flushDebug, 1500);
}

function flushDebug() {
  if (!debugQueue.length) return;
  const batch = debugQueue.splice(0, 50);
  callsApi.debug(batch).catch(() => {});
  if (debugQueue.length) debugTimer = setTimeout(flushDebug, 1500);
}

let lastStateKey = '';
let lastStateAt = 0;
function recordState(why) {
  if (!client) return;
  let snap;
  try {
    snap = {
      isLoggedIn  : !!client.isLoggedIn,
      isRegistered: !!client.isRegistered?.(),
      isConnected : !!client.isConnected?.(),
      visibility  : document.visibilityState,
      why,
    };
  } catch (e) { snap = { error: String(e), why }; }
  const key = `${snap.isLoggedIn}${snap.isRegistered}${snap.isConnected}`;
  // On every change, and every 5 minutes regardless.
  if (key !== lastStateKey || Date.now() - lastStateAt > 5 * 60 * 1000) {
    lastStateKey = key;
    lastStateAt = Date.now();
    record('state', [snap]);
  }
}

let client = null;
let heartbeatTimer = null;
let reloginTimer = null;
let running = false;
let stopping = false; // a logout we asked for, as opposed to one that happened to us

const headerValue = (headers, name) => {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
};

async function loadCallInfo(logId) {
  if (!logId) return null;
  try {
    const { data } = await callsApi.getCall(logId);
    return data.log;
  } catch {
    return null;
  }
}

// The server's routing reads these check-ins, so they must say what Plivo
// actually knows: "online" only while the SDK reports itself registered.
// Runs in background tabs too (browsers slow timers there, but well
// inside the server's 75s window) — a hidden CRM tab keeps taking calls.
const isRegistered = () => {
  try { return !!(client?.isLoggedIn || client?.isRegistered?.()); } catch { return false; }
};

function beat() {
  if (!running) return;
  recordState('heartbeat');
  if (state.status === 'ready' && isRegistered()) {
    callsApi.presence(true).catch(() => {});
  } else if (state.status === 'ready') {
    // Plivo dropped us without an onLogout — say so, then sign in again.
    callsApi.presence(false).catch(() => {});
    set({ status: 'starting' });
    scheduleRelogin();
  }
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
}

// Hiding the tab changes nothing about the Plivo session; coming back just
// confirms presence at once rather than waiting for the next beat.
const onVisible = () => { if (document.visibilityState === 'visible') beat(); };

// The page is really going away (closed, reloaded, navigated off): tell
// the server first, then leave Plivo. keepalive lets the request outlive
// the page; it carries the CRM login the same way the API client does.
const onPageHide = (e) => {
  if (!running || e.persisted) return; // bfcache: the page may come back
  try {
    fetch('https://api.savelife.health/api/calls/webrtc/presence', {
      method   : 'POST',
      keepalive: true,
      headers  : { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}` },
      body     : JSON.stringify({ online: false }),
    }).catch(() => {});
  } catch { /* best effort — the server's 75s window covers it anyway */ }
  record('call:logout', ['pagehide']);
  flushDebug();
  try { stopping = true; client?.logout(); } catch { /* page is closing */ }
};

// Plivo asks for a token itself whenever it needs one — at sign-in and
// before the current one expires — so renewal never logs out.
const tokenGenerator = {
  getAccessToken: () => callsApi.webrtcToken(SESSION_ID).then(({ data }) => {
    record('token:received', [{ expiresAt: data.expiresAt, endpointCheck: data.endpointCheck }]);
    return data.token;
  }).catch((err) => {
    record('token:failed', [err?.response?.data?.message || err?.message || 'token request failed', { status: err?.response?.status, stage: err?.response?.data?.stage }]);
    throw err;
  }),
};

// Two ways in, chosen by the server (PLIVO_WEBRTC_LOGIN, default
// 'password') or, to compare them on one machine, by
// localStorage.plivoLoginMode = 'token' | 'password':
//   password — classic SIP registration with this user's own endpoint
//              username and password. The default, and the only one Plivo
//              registers on our account.
//   token    — access token from Plivo's JWT API (refreshed by the SDK);
//              kept to switch back to.
const localLoginMode = () => {
  try { return localStorage.getItem('plivoLoginMode') || undefined; } catch { return undefined; }
};

// The server's default is 'password' — on our account it is the login
// Plivo actually registers. The credentials are used here and nowhere
// else: not stored, not logged, not put in __plivoDebug.
let lastLoginMode = null;
let passwordRetried = false;

async function login({ reset = false } = {}) {
  let mode = 'token';
  let creds = null;
  try {
    const { data } = await callsApi.webrtcLogin(localLoginMode(), SESSION_ID, reset);
    mode = data.mode;
    if (mode === 'password') creds = data;
  } catch (err) {
    record('login:mode_failed', [err?.response?.data?.message || err?.message || 'login mode request failed', { status: err?.response?.status }]);
  }

  if (mode === 'password' && creds?.username && creds?.password) {
    lastLoginMode = 'password';
    record('call:login', ['password', { endpointCheck: creds.endpointCheck, reset }]);
    client.login(creds.username, creds.password);
    return;
  }
  lastLoginMode = 'token';
  record('call:login', ['loginWithAccessTokenGenerator']);
  client.loginWithAccessTokenGenerator(tokenGenerator);
}

// Plivo refused the stored password (changed in the Plivo console, say):
// once per page, have the server set a fresh one and try again.
function retryPasswordLogin() {
  if (lastLoginMode !== 'password' || passwordRetried || !running) return false;
  passwordRetried = true;
  record('call:login_retry', ['password reset after rejected login']);
  login({ reset: true }).catch(() => {});
  return true;
}

function scheduleRelogin() {
  clearTimeout(reloginTimer);
  reloginTimer = setTimeout(() => {
    if (running && !isRegistered()) {
      login().catch(() => set({ status: 'error', error: 'Could not reconnect in-app calling. Calls will ring your phone.' }));
    }
  }, RELOGIN_DELAY_MS);
}

function wire(c) {
  // TEMPORARY: see every event the SDK emits, before any handler runs.
  const emit = c.emit.bind(c);
  c.emit = (name, ...args) => {
    try {
      record(name, args);
      if (['onLogin', 'onLogout', 'onLoginFailed', 'onConnectionChange'].includes(name)) setTimeout(() => recordState(name), 0);
    } catch { /* never break the SDK */ }
    return emit(name, ...args);
  };

  // Presence first, then state, so routing is never behind the browser.
  c.on('onLogin', () => {
    passwordRetried = false;
    callsApi.presence(true).catch(() => {});
    set({ status: 'ready', error: '' });
    startHeartbeat();
  });
  c.on('onLoginFailed', (reason) => {
    callsApi.presence(false).catch(() => {});
    if (retryPasswordLogin()) { set({ status: 'starting' }); return; }
    set({ status: 'error', error: `Plivo sign-in failed${reason ? ` (${reason})` : ''}. Calls will ring your phone.` });
  });
  c.on('onLogout', (reason) => {
    callsApi.presence(false).catch(() => {});
    if (stopping || !running) return;
    // Not something we asked for: keep the user reachable by signing in
    // again. Meanwhile the server rings their phone.
    console.warn('[in-app phone] Plivo logged out unexpectedly', reason || '');
    set({ status: 'starting' });
    scheduleRelogin();
  });
  c.on('onPermissionDenied', () => {
    set({ status: 'mic_blocked', error: 'Microphone is blocked for this site. Calls will ring your phone until you allow it.' });
    callsApi.presence(false).catch(() => {});
  });
  c.on('onWebrtcNotSupported', () => {
    set({ status: 'unsupported', error: 'This browser cannot take calls in the app. Calls will ring your phone.' });
    callsApi.presence(false).catch(() => {});
  });

  // Every call is tracked by its own callUUID, and an event only ever
  // touches the call it is about. A late "ended" from one call must never
  // wipe the ringing screen of the next — the bug where the second call
  // rang but showed no Answer screen.
  c.on('onIncomingCall', (callerName, extraHeaders, callInfo) => {
    showIncoming(callInfo?.callUUID || null, extraHeaders, 'onIncomingCall');
  });
  // Someone else on duty answered first, or the caller hung up.
  c.on('onIncomingCallCanceled', (callInfo) => clearIncoming(callInfo?.callUUID, 'canceled'));
  c.on('onIncomingCallIgnored', (callInfo) => clearIncoming(callInfo?.callUUID, 'ignored'));
  c.on('onCallAnswered', (callInfo) => {
    const from = state.incoming || {};
    const callUUID = callInfo?.callUUID || from.callUUID;
    record('ui:in_call', [{ callUUID }]);
    set({
      incoming: null,
      inCall: { callUUID, logId: from.logId, log: from.log, startedAt: Date.now(), muted: false },
    });
  });
  // onCallTerminated is ({originator, reason}, callInfo); onCallFailed is
  // (cause, callInfo). Only the call named is cleared.
  c.on('onCallTerminated', (_why, callInfo) => endCall(callInfo?.callUUID, 'terminated'));
  c.on('onCallFailed', (_cause, callInfo) => endCall(callInfo?.callUUID, 'failed'));

  watchRingtone(c);
}

// Shows the ringing screen for one call. Safe to call twice for the same
// call (the SDK event and the ring-tone fallback below may both fire).
async function showIncoming(callUUID, extraHeaders, source) {
  if (callUUID && state.incoming?.callUUID === callUUID) return;
  if (callUUID && state.inCall?.callUUID === callUUID) return;
  const logId = headerValue(extraHeaders, 'X-PH-logId');
  record('ui:incoming_shown', [{ callUUID, logId, source }]);
  set({ incoming: { callUUID, logId, log: null } });
  const log = await loadCallInfo(logId);
  if (state.incoming?.callUUID === callUUID) set({ incoming: { callUUID, logId, log } });
}

// Clears the ringing screen only if it is for this call (or the event
// names no call and nothing has been answered since).
function clearIncoming(callUUID, why) {
  if (!state.incoming) return;
  if (callUUID && state.incoming.callUUID && state.incoming.callUUID !== callUUID) {
    record('ui:clear_ignored', [{ why, eventCall: callUUID, showing: state.incoming.callUUID }]);
    return;
  }
  record('ui:incoming_cleared', [{ why, callUUID: callUUID || state.incoming.callUUID }]);
  set({ incoming: null });
}

function endCall(callUUID, why) {
  const patch = {};
  if (state.inCall && (!callUUID || !state.inCall.callUUID || state.inCall.callUUID === callUUID)) patch.inCall = null;
  if (state.incoming && (!callUUID || !state.incoming.callUUID || state.incoming.callUUID === callUUID)) patch.incoming = null;
  record('ui:call_ended', [{ why, callUUID, cleared: Object.keys(patch) }]);
  if (Object.keys(patch).length) set(patch);
}

// Fallback for the SDK ringing without telling us: it starts the ring tone
// BEFORE emitting onIncomingCall, and only emits once a fresh microphone
// stream is ready — which can lag or stall. If the ring tone is playing
// and no ringing screen is up shortly after, build it from the SDK's own
// list of incoming calls, so a ringing call can always be answered.
function watchRingtone(c) {
  const attach = () => {
    const el = c.ringToneView || document.getElementById('plivo_ringtone');
    if (!el || el.__slWatched) return !!el;
    el.__slWatched = true;
    el.addEventListener('play', () => {
      setTimeout(() => {
        if (!running || state.incoming || state.inCall) return;
        // The ringing sessions themselves carry the X-PH-logId header;
        // getIncomingCalls() (call info only) is the fallback.
        let calls = [];
        try {
          calls = c.incomingInvites instanceof Map ? [...c.incomingInvites.values()] : (c.getIncomingCalls?.() || []);
        } catch { /* SDK internals */ }
        const call = calls[calls.length - 1];
        record('ui:ringtone_without_event', [{ incomingCalls: calls.length, callUUID: call?.callUUID || null }]);
        if (call) showIncoming(call.callUUID || null, call.extraHeaders || {}, 'ringtone_fallback');
      }, 1500);
    });
    return true;
  };
  // The SDK creates its audio elements during login; look again until found.
  if (!attach()) {
    let tries = 0;
    const t = setInterval(() => { if (attach() || ++tries > 20) clearInterval(t); }, 1000);
  }
}

export async function start() {
  if (running) return;
  running = true;
  set({ ...initial, status: 'starting' });

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    set({ status: 'unsupported', error: 'This browser cannot take calls in the app. Calls will ring your phone.' });
    return;
  }

  // Ask for the microphone up front, so a refusal is known before a call
  // rings rather than at the moment someone tries to answer.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    set({ status: 'mic_blocked', error: 'Microphone is blocked for this site. Calls will ring your phone until you allow it.' });
    callsApi.presence(false).catch(() => {});
    return;
  }
  if (!running) return;

  try {
    if (!client) {
      // Loaded only for people who ring in the app; it is a large library.
      const { default: Plivo } = await import('plivo-browser-sdk');
      const plivo = new Plivo({
        debug: 'ERROR',
        permOnClick: false,
        allowMultipleIncomingCalls: false,
        closeProtection: true, // warn before closing the tab mid-call
        enableTracking: false,
      });
      client = plivo.client;
      wire(client);
    }
    stopping = false;
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onPageHide);
    await login();
  } catch (err) {
    set({ status: 'error', error: err?.response?.data?.message || 'Could not start in-app calling. Calls will ring your phone.' });
    callsApi.presence(false).catch(() => {});
  }
}

// Only for going off duty, switching to "ring my phone", or signing out of
// the CRM — never because the tab was hidden.
export function stop() {
  if (!running) return;
  running = false;
  stopping = true;
  clearInterval(heartbeatTimer);
  clearTimeout(reloginTimer);
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('pagehide', onPageHide);
  callsApi.presence(false).catch(() => {});
  record('call:logout', ['stop']);
  try { if (client && !state.inCall) client.logout(); } catch { /* already gone */ }
  set({ ...initial });
}

export function answer() {
  const inc = state.incoming;
  if (!client || !inc) return;
  // Any other call that rings while we're on this one is turned away.
  client.answer(inc.callUUID, 'reject');
  if (inc.logId) callsApi.answered(inc.logId).catch(() => {});
}

export function reject() {
  const inc = state.incoming;
  if (!client || !inc) return;
  client.reject(inc.callUUID);
  set({ incoming: null }); // others on duty keep ringing
}

export function hangup() {
  if (client) client.hangup();
}

export function toggleMute() {
  if (!client || !state.inCall) return;
  if (state.inCall.muted) client.unmute(); else client.mute();
  set({ inCall: { ...state.inCall, muted: !state.inCall.muted } });
}
