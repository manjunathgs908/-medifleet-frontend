// src/lib/bookingPush.js
//
// Background "New booking" Web Push for CRM operators: subscribe this
// browser with the server's VAPID key and register it with the backend
// (/api/push), so a new customer booking notifies the dispatcher even with
// the CRM in the background or closed. The foreground full-screen ring
// (components/IncomingBookingAlert) is separate and unchanged.
//
// The operator's choice is remembered per browser: 'on' re-subscribes
// silently after the next login, 'off' never asks again, unset means
// "ask once after login". Logout unsubscribes this browser (its booking
// notifications carry patient names) but keeps the choice.
//
// Never throws to callers: every function resolves to a state —
//   'on' | 'off' | 'denied' | 'ios_install' | 'unsupported' | 'server_off' | 'error'
import { pushApi } from '../api/client';

const PREF_KEY = 'medifleet.bookingPush.v1';
export const pushPref = () => { try { return localStorage.getItem(PREF_KEY); } catch { return null; } };
const setPref = (v) => { try { localStorage.setItem(PREF_KEY, v); } catch { /* private mode */ } };

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac

// What stops push here before anything is asked, or null if nothing.
export function pushBlocker() {
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // iOS only offers Web Push to an installed home-screen app (16.4+): in a
  // Safari tab, or on an older iOS, PushManager simply isn't there.
  if (!supported) return isIos() ? 'ios_install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return null;
}

export const PUSH_HINTS = {
  ios_install: 'On iPhone/iPad, booking notifications need the CRM installed: Share → Add to Home Screen (iOS 16.4+), then open it from the home screen.',
  unsupported: 'This browser can’t receive booking notifications. Use Chrome, Edge, Firefox or Safari.',
  denied     : 'Notifications are blocked for this site. Allow them in the browser’s site settings, then turn booking push on again.',
  server_off : 'Booking notifications aren’t set up on the server yet.',
  error      : 'Could not turn on booking notifications. Try again in a moment.',
};

// The service worker registration — src/lib/pwaUpdate registers it. Not
// waited on forever: in dev, or if registration failed, there is none.
async function registration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);
}

const keyBytes = (base64url) => {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const sameKey = (buffer, bytes) => {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
};

// Current state without asking anything.
export async function bookingPushState() {
  const blocked = pushBlocker();
  if (blocked) return blocked;
  try {
    const reg = await registration();
    const sub = reg && await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' && pushPref() !== 'off' ? 'on' : 'off';
  } catch { return 'off'; }
}

// Turn on. prompt:false never shows the permission dialog (used for the
// silent re-subscribe after login); prompt:true must run from a user
// gesture — Safari only shows the dialog then.
export async function enableBookingPush({ prompt = true } = {}) {
  const blocked = pushBlocker();
  if (blocked) return blocked;
  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      if (!prompt) return 'off';
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

    const { data } = await pushApi.publicKey();
    if (!data?.enabled || !data.publicKey) return 'server_off';
    const key = keyBytes(data.publicKey);

    const reg = await registration();
    if (!reg) return 'unsupported';
    let sub = await reg.pushManager.getSubscription();
    // Subscribed with an old server key (keys rotated): start over.
    if (sub && !sameKey(sub.options?.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

    await pushApi.subscribe(sub.toJSON());
    setPref('on');
    return 'on';
  } catch {
    return 'error';
  }
}

// Turn off. remember:false (logout) unsubscribes but keeps the choice, so
// the next login turns it back on by itself.
export async function disableBookingPush({ remember = true } = {}) {
  if (remember) setPref('off');
  try {
    if (!('serviceWorker' in navigator)) return 'off';
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      await pushApi.unsubscribe(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* already gone */ }
  return 'off';
}
