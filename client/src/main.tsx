// First: every HTML / script sink goes through the Trusted Types policy
import './security/trustedTypes.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.js';
import { PAGE_COLOR, resolveTheme, startingTheme, isAuthPath } from './utils/autoTheme.js';
import { ErrorBoundary } from './components/atoms/ErrorBoundary.js';
import { setUpdateAvailable } from './services/appUpdate.js';

// Start in the remembered theme (else light) before anything paints — the
// app's own tokens follow in App's layout effect
{
  // The sign-in pages are always dark
  const mode = isAuthPath(window.location.pathname) ? 'dark' : resolveTheme(startingTheme());
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.style.backgroundColor = PAGE_COLOR[mode];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAGE_COLOR[mode]);
}

// After a deploy, a page still running the previous build can ask for a chunk
// that no longer exists (its hash changed). Load the new build instead —
// once: a second failure within a minute is left to show its error. The time
// of the last reload is kept in sessionStorage, else window.name (which
// survives a reload in the same tab); when neither can hold it, no reload at
// all — reloading without a mark could loop forever
const CHUNK_RELOAD_KEY = 'chronicles.chunk-reload';
const CHUNK_NAME_MARK = /(?:^|;)chronicles-chunk-reload=(\d+)/;
function lastChunkReload(): number {
  try { const v = sessionStorage.getItem(CHUNK_RELOAD_KEY); if (v) return Number(v) || 0; } catch { /* refused */ }
  try { const m = CHUNK_NAME_MARK.exec(window.name); if (m) return Number(m[1]) || 0; } catch { /* refused */ }
  return 0;
}
function markChunkReload(now: number): boolean {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === String(now)) return true;
  } catch { /* refused: try window.name */ }
  try {
    const rest = window.name.replace(CHUNK_NAME_MARK, '').replace(/^;/, '');
    window.name = `chronicles-chunk-reload=${now}${rest ? `;${rest}` : ''}`;
    return CHUNK_NAME_MARK.exec(window.name)?.[1] === String(now);
  } catch { return false; }
}
window.addEventListener('vite:preloadError', event => {
  const now = Date.now();
  if (now - lastChunkReload() < 60_000) return;
  if (!markChunkReload(now)) return; // nowhere to note it: show the error rather than risk a loop
  event.preventDefault();
  window.location.reload();
});

// index.html carries the home page's SEO title; everywhere else the tab just says Chronicles
if (window.location.pathname !== '/') document.title = 'Chronicles';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Last resort: never a blank page (each page has its own boundary inside) */}
    <ErrorBoundary fallback="page" links={[{ to: '/settings', label: 'Settings' }]}>
      <App />
    </ErrorBoundary>
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
