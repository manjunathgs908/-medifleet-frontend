// src/lib/pwaUpdate.jsx
//
// Keeps the installed app (and every open tab) on the latest deploy.
//
//   - Registers the service worker itself (vite.config.js: injectRegister
//     false), with updateViaCache 'none' so sw.js is never served stale.
//   - Asks for an update every minute and whenever the app comes back to
//     the foreground — an installed app can stay open for days.
//   - New workers activate at once (skipWaiting + clientsClaim). When one
//     takes over a page that was already running, that page is still on the
//     old code, so it shows "New version available — Reload". It never
//     reloads by itself: that would cut off a call in progress.
import React from 'react';
import toast from 'react-hot-toast';
import { getState as phoneState } from './inAppPhone';

const CHECK_EVERY_MS = 60 * 1000;

export const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : { commit: 'dev', builtAt: null };

function reload() {
  const { inCall, incoming } = phoneState();
  if ((inCall || incoming) && !window.confirm('You are on a call. Reloading now will end it. Reload anyway?')) return;
  window.location.reload();
}

function showUpdatePrompt() {
  toast((t) => (
    <span className="flex items-center gap-3 text-sm">
      New version available
      <button
        onClick={() => { toast.dismiss(t.id); reload(); }}
        className="px-3 py-1 rounded-lg font-semibold"
        style={{ background: 'var(--accent)', color: 'var(--ink)' }}
      >
        Reload
      </button>
    </span>
  ), { id: 'pwa-update', duration: Infinity });
}

export function startPwaUpdates() {
  window.__APP_BUILD__ = APP_BUILD;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  // A page that already had a worker is running some build; a worker taking
  // over now means a newer build is live. First install is not an update.
  const hadController = !!navigator.serviceWorker.controller;
  let prompted = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || prompted) return;
    prompted = true;
    showUpdatePrompt();
  });

  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((reg) => {
      const check = () => { reg.update().catch(() => {}); };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    })
    .catch(() => { /* no offline support this session; the app still works */ });
}
