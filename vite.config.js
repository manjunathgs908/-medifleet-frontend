import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// Which build is running, shown in the sidebar: the deployed commit (Render
// sets RENDER_GIT_COMMIT while building) or the local one, plus build time.
const buildCommit = (() => {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return 'dev'; }
})();
const buildInfo = { commit: buildCommit, builtAt: new Date().toISOString() };

export default defineConfig({
  plugins: [
    react(),
    // Installable "SaveLife CRM" app. The service worker precaches the app's
    // own build output (scripts, styles, icons) so it opens instantly and
    // full-screen. It never caches the API: that lives on
    // api.savelife.health, a different origin, so every trip, alert and fare
    // is always fetched live.
    //
    // Staying current: pages (index.html) are NOT precached — they load
    // network-first, falling back to the last copy only when offline — so a
    // plain refresh after a deploy loads the new build. A precached
    // index.html is what used to keep the old build running until the app
    // was closed and reopened. New service workers activate immediately
    // (skipWaiting + clientsClaim), and src/lib/pwaUpdate.jsx registers the
    // worker itself (injectRegister: false), checks for updates every minute
    // and on return to the app, and offers "Reload" instead of reloading on
    // its own, so a live call is never cut off.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
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
        // No html here on purpose — see above.
        globPatterns: ['**/*.{js,css,png,svg,ico,woff2}'],
        navigateFallback: null,
        // Every page load (/, /dispatch, /q/<token>, ...) asks the server
        // first; the cached copy is only for when the network is down.
        runtimeCaching: [{
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pages',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 20 },
          },
        }],
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
    'import.meta.env.VITE_API_URL': JSON.stringify('https://api.savelife.health'),
    __APP_BUILD__: JSON.stringify(buildInfo),
  }
});
