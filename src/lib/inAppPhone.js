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
// The backend only rings this tab while it keeps checking in (every 30s).
// Mic blocked, SDK failure or the tab closing simply stops the check-ins,
// and the user is rung on their phone instead.
import { callsApi } from '../api/client';

const HEARTBEAT_MS = 30 * 1000;
const RENEW_BEFORE_MS = 10 * 60 * 1000;

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

let client = null;
let heartbeatTimer = null;
let renewTimer = null;
let running = false;

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

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  const beat = () => { if (running && state.status === 'ready') callsApi.presence(true).catch(() => {}); };
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
}

const onVisible = () => {
  if (document.visibilityState === 'visible' && running && state.status === 'ready') callsApi.presence(true).catch(() => {});
};

async function login() {
  const { data } = await callsApi.webrtcToken();
  client.loginWithAccessToken(data.token);
  // Renew before the token lapses, with a fresh login.
  clearTimeout(renewTimer);
  const renewIn = Math.max(60 * 1000, new Date(data.expiresAt).getTime() - Date.now() - RENEW_BEFORE_MS);
  renewTimer = setTimeout(() => {
    if (!running || state.inCall || state.incoming) { renewTimer = setTimeout(() => login().catch(() => {}), 60 * 1000); return; }
    try { client.logout(); } catch { /* re-login below */ }
    login().catch((err) => set({ status: 'error', error: err?.response?.data?.message || 'Could not renew in-app calling.' }));
  }, renewIn);
}

function wire(c) {
  c.on('onLogin', () => { set({ status: 'ready', error: '' }); startHeartbeat(); });
  c.on('onLoginFailed', (reason) => {
    set({ status: 'error', error: `Plivo sign-in failed${reason ? ` (${reason})` : ''}. Calls will ring your phone.` });
    callsApi.presence(false).catch(() => {});
  });
  c.on('onLogout', () => { if (running && state.status === 'ready') set({ status: 'starting' }); });
  c.on('onPermissionDenied', () => {
    set({ status: 'mic_blocked', error: 'Microphone is blocked for this site. Calls will ring your phone until you allow it.' });
    callsApi.presence(false).catch(() => {});
  });
  c.on('onWebrtcNotSupported', () => {
    set({ status: 'unsupported', error: 'This browser cannot take calls in the app. Calls will ring your phone.' });
    callsApi.presence(false).catch(() => {});
  });

  c.on('onIncomingCall', async (callerName, extraHeaders, callInfo) => {
    const logId = headerValue(extraHeaders, 'X-PH-logId');
    const callUUID = callInfo?.callUUID || null;
    set({ incoming: { callUUID, logId, log: null } });
    const log = await loadCallInfo(logId);
    if (state.incoming?.callUUID === callUUID) set({ incoming: { callUUID, logId, log } });
  });
  // Someone else on duty answered first, or the caller hung up.
  c.on('onIncomingCallCanceled', (callInfo) => {
    if (!callInfo?.callUUID || state.incoming?.callUUID === callInfo.callUUID) set({ incoming: null });
  });
  c.on('onIncomingCallIgnored', () => set({ incoming: null }));
  c.on('onCallAnswered', (callInfo) => {
    const from = state.incoming || {};
    set({
      incoming: null,
      inCall: { callUUID: callInfo?.callUUID || from.callUUID, logId: from.logId, log: from.log, startedAt: Date.now(), muted: false },
    });
  });
  const ended = () => set({ incoming: null, inCall: null });
  c.on('onCallTerminated', ended);
  c.on('onCallFailed', ended);
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
    document.addEventListener('visibilitychange', onVisible);
    await login();
  } catch (err) {
    set({ status: 'error', error: err?.response?.data?.message || 'Could not start in-app calling. Calls will ring your phone.' });
    callsApi.presence(false).catch(() => {});
  }
}

export function stop() {
  if (!running) return;
  running = false;
  clearInterval(heartbeatTimer);
  clearTimeout(renewTimer);
  document.removeEventListener('visibilitychange', onVisible);
  callsApi.presence(false).catch(() => {});
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
