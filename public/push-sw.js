/* public/push-sw.js
 *
 * Web Push for the CRM's service worker, pulled into the generated sw.js
 * by vite.config.js (workbox.importScripts). Background "New booking"
 * alerts from the backend (services/bookingPush.js): a normal system
 * notification — one chime, vibration, the device's own sound settings —
 * not the in-app 60-second ring, which is unchanged.
 *
 * Tap: focus an open CRM window and ask it to route to the booking (an
 * in-app route change, so a live in-app call is never cut off by a page
 * load); with no CRM window open, open one at the booking.
 */
/* eslint-disable no-restricted-globals */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }

  event.waitUntil(self.registration.showNotification(data.title || 'New booking', {
    body              : data.body || 'A customer booking is waiting on the Dispatch board',
    tag               : data.tag || 'booking',
    renotify          : true,   // a second booking still chimes, even with the first one showing
    requireInteraction: true,   // stays until tapped or swiped (desktop)
    icon              : '/pwa-192x192.png',
    badge             : '/favicon-64x64.png',
    vibrate           : [400, 150, 400, 150, 400],
    data              : { url: data.url || '/dispatch', tripId: data.tripId || null },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/dispatch', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const crm = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (crm) {
      await crm.focus();
      crm.postMessage({ type: 'open-url', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
