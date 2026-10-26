// src/lib/installApp.jsx
//
// "📲 Install app": a visible button instead of Chrome's menu.
//
// Chrome/Edge/Android fire `beforeinstallprompt` once the CRM is
// installable; we keep that event and replay it when the button is tapped,
// which opens the browser's own install dialog. iOS Safari has no such
// event, so there the button shows a hint instead (Share → Add to Home
// Screen). Nothing shows when the CRM is already running as the installed
// app, or after it is installed.
//
// startInstallCapture() runs from main.jsx before React mounts, because
// the event can fire before any component is listening.
import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

let deferredPrompt = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPhone / iPad Safari (iPadOS reports itself as a Mac with touch).
const isIosSafari = () => {
  const ua = window.navigator.userAgent || '';
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const otherBrowser = /crios|fxios|edgios|opios/i.test(ua);
  return ios && !otherBrowser;
};

export function startInstallCapture() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's mini-infobar away; our button asks instead
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

function useInstallState() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', fn);
    return () => { listeners.delete(fn); mq?.removeEventListener?.('change', fn); };
  }, []);
  if (installed || isStandalone()) return { mode: 'hidden' };
  if (deferredPrompt) return { mode: 'prompt' };
  if (isIosSafari()) return { mode: 'ios' };
  return { mode: 'hidden' };
}

export function InstallAppButton({ compact = false }) {
  const { mode } = useInstallState();
  const [showIosHint, setShowIosHint] = useState(false);
  if (mode === 'hidden') return null;

  const install = async () => {
    if (mode === 'ios') { setShowIosHint((v) => !v); return; }
    const prompt = deferredPrompt;
    if (!prompt) return;
    deferredPrompt = null; // a prompt can be shown only once
    notify();
    try {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') { installed = true; notify(); }
    } catch { /* dismissed or unsupported; Chrome offers it again later */ }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: 'rgba(0,212,170,.12)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,.35)' }}
        title="Install the SaveLife CRM as an app on this device"
      >
        <Download size={13} />
        <span className={compact ? 'hidden sm:inline' : ''}>📲 Install app</span>
      </button>
      {showIosHint && (
        <span className="absolute right-0 top-full mt-2 z-50 w-56 rounded-lg p-3 text-xs shadow-lg"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border2)' }}
          onClick={() => setShowIosHint(false)}>
          On iPhone/iPad: tap <b>Share</b> <span aria-hidden>⬆️</span> → <b>Add to Home Screen</b>.
        </span>
      )}
    </span>
  );
}
