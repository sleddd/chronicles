import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.js';
import { setUpdateAvailable } from './services/appUpdate.js';

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
