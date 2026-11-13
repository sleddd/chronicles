import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
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
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
