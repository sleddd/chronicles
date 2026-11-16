import { clearEntryCache } from './entryCache.js';
import { EGRESS_STORE } from './deviceConsent.js';
import { SETTING_REVS_STORE } from './settingCipher.js';
import { SEEN_MARKERS_STORE } from './sealedFormats.js';
import { KNOWN_PASSKEYS_STORE } from './passkeys.js';

/*
 * What this browser keeps on disk for whoever uses Chronicles in it: the
 * encrypted journal cache, sealed drafts, per-browser preferences, the service
 * worker and its caches.
 *
 * It is wiped when someone presses Sign out, and when a DIFFERENT person signs
 * in. It is kept when the same person comes back (a reload, the idle sign-out,
 * the app reopened), so a sign-in doesn't download the whole journal again.
 * "The same person" is decided by the master key, never by anything the server
 * says: a mark only that key can make (`ownerMark`).
 */

/** Kept through a wipe: they hold no data, and dropping them would weaken what they guard. */
// (The passkey ids are random and name nobody; without them sign-in can't ask
// the device for its own passkey ahead of a password manager's)
const KEPT = [EGRESS_STORE, SEEN_MARKERS_STORE, SETTING_REVS_STORE, KNOWN_PASSKEYS_STORE];
const OWNER_STORE = 'chronicles.owner-v1';

/** A mark for the account, from a tag only its master key can make (never the email). */
export async function ownerMark(accountTag: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chronicles:owner:v1:${accountTag}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Everything this browser stores for Chronicles, gone (memory is the caller's). */
export async function wipeBrowserData(): Promise<void> {
  // The journal cache first: its open connection would block deleting the database below
  await clearEntryCache().catch(() => {});
  await Promise.allSettled([
    (async () => {
      const kept = KEPT.map(k => [k, localStorage.getItem(k)] as const);
      localStorage.clear();
      sessionStorage.clear();
      for (const [k, v] of kept) if (v !== null) localStorage.setItem(k, v);
    })(),
    (async () => {
      if (!('caches' in window)) return;
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    })(),
    (async () => {
      if (!('indexedDB' in window)) return;
      const dbs = await indexedDB.databases?.() ?? [];
      await Promise.all(dbs.map(db => new Promise<void>((res, rej) => {
        if (!db.name) return res();
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = () => res();
        req.onerror = () => rej(req.error);
        req.onblocked = () => res(); // don't hang if another tab has it open
      })));
    })(),
    (async () => {
      if (!('serviceWorker' in navigator)) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    })(),
    // Non-HttpOnly cookies (the session cookies are the server's to clear)
    (async () => {
      document.cookie.split(';').forEach(c => {
        const name = c.split('=')[0].trim();
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    })(),
  ]);
}

/**
 * The key just opened: is what this browser holds this person's? If it holds
 * someone else's — or nobody's mark at all (a browser from before marks, whose
 * leftovers can't be told apart) — it is wiped before anything loads. Returns
 * true when a wipe happened.
 */
export async function claimBrowserFor(accountTag: string): Promise<boolean> {
  const mark = await ownerMark(accountTag);
  let stored: string | null = null;
  try { stored = localStorage.getItem(OWNER_STORE); } catch { return false; }
  if (stored === mark) return false;
  await wipeBrowserData();
  try { localStorage.setItem(OWNER_STORE, mark); } catch { /* storage unavailable: next sign-in wipes again */ }
  return true;
}
