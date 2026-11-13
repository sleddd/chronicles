// First: every HTML / script sink goes through the Trusted Types policy
import './security/trustedTypes.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.js';
import { PAGE_COLOR, resolveTheme, startingTheme } from './utils/autoTheme.js';
import { setUpdateAvailable } from './services/appUpdate.js';

// Start in the remembered theme (else light) before anything paints — the
// app's own tokens follow in App's layout effect
{
  const mode = resolveTheme(startingTheme());
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.style.backgroundColor = PAGE_COLOR[mode];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAGE_COLOR[mode]);
}

// After a deploy, a page still running the previous build can ask for a chunk
// that no longer exists (its hash changed). Load the new build instead —
// once: a second failure within a minute is left to show its error
window.addEventListener('vite:preloadError', event => {
  try {
    const last = Number(sessionStorage.getItem('chronicles.chunk-reload') ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('chronicles.chunk-reload', String(Date.now()));
  } catch { /* storage refused: still try one reload */ }
  event.preventDefault();
  window.location.reload();
});

// index.html carries the home page's SEO title; everywhere else the tab just says Chronicles
if (window.location.pathname !== '/') document.title = 'Chronicles';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA (shell caching only — no encrypted data cached).
// A new version shows the in-app UpdatePrompt instead of window.confirm, which
// iPad Safari blocks.
const updateSW = registerSW({
  onNeedRefresh() {
    setUpdateAvailable(() => { void updateSW(true); });
  },
});
