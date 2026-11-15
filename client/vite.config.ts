import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

/**
 * Development only: retire a service worker left in the browser by an earlier
 * production build or preview on this address. Such a worker serves its cached
 * copy of the app (an old bundle) for every page load and never reaches the
 * dev server, so no change shows up. The dev server has no /sw.js of its own,
 * so the worker's update check found nothing and it stayed for good. This
 * answers that check with a worker that clears the caches, unregisters itself
 * and reloads the open tabs — one reload and the tab is on the live source.
 */
const RETIRE_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) await caches.delete(key);
  await self.registration.unregister();
  for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
})()));
`;
const retireStaleServiceWorker = () => ({
  name: 'retire-stale-service-worker',
  apply: 'serve' as const,
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/sw.js') { next(); return; }
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.end(RETIRE_SW);
    });
  },
});

export default defineConfig({
  plugins: [
    react(),
    retireStaleServiceWorker(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Chronicles',
        short_name: 'Chronicles',
        description: 'Zero-knowledge encrypted journal',
        theme_color: '#f4f5f7',
        background_color: '#f4f5f7',
        display: 'standalone',
        scope: '/',
        start_url: '/dashboard',
        icons: [
          { src: '/icons/icon-192x192.png?v=9', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512x512.png?v=9', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512x512.png?v=9', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // The landing page's lazy chunk (and Lenis) are precached with the rest:
        // a worker still serving an older index.html must also hold the chunks
        // that index names, or the page fails to load after a deploy. The
        // installed app never opens the landing page (HomeRoute sends it to
        // the dashboard), so this only costs it the download
        // The main bundle passed workbox's 2 MiB default, which fails the
        // build; it has to be precached for the app to open offline
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Wallpapers aren't precached (25 MB in all): the chosen one is kept
        // once loaded, so it still shows offline
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/wallpapers/'),
          handler: 'CacheFirst',
          options: { cacheName: 'wallpapers', expiration: { maxEntries: 8 } },
        }],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    // Loopback only — the dev server must never be exposed to the network.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
