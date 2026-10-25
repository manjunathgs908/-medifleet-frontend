import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Installable "SaveLife CRM" app. The service worker precaches the app's
    // own build output only, so it opens instantly and full-screen. It never
    // caches the API: that lives on api.savelife.health, a different origin
    // the precache does not touch, so every trip, alert and fare is always
    // fetched live. A new deploy is picked up on the next app open.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'favicon-64x64.png'],
      manifest: {
        name            : 'SaveLife CRM',
        short_name      : 'SaveLife',
        description     : 'SaveLife ambulance dispatch and fleet CRM',
        start_url       : '/dispatch',
        scope           : '/',
        display         : 'standalone',
        orientation     : 'any',
        theme_color     : '#0a0f1e',
        background_color: '#0a0f1e',
        icons: [
          { src: 'pwa-192x192.png',           sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',           sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        // Deep links (/trips, /q/<token>, ...) open the app shell offline-
        // first, exactly like a fresh load of index.html.
        navigateFallback: '/index.html',
        // The main bundle is ~1 MB; the default 2 MiB cap is close enough to
        // be worth raising before it silently drops the app from the cache.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('https://api.savelife.health')
  }
});
