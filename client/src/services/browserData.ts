import { clearEntryCache } from './entryCache.js';
import { EGRESS_STORE } from './deviceConsent.js';
import { SETTING_REVS_STORE } from './settingCipher.js';
import { SEEN_MARKERS_STORE, setLegacyMigrationAllowed } from './sealedFormats.js';
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
// (The finished re-key ids too: forgetting them would let a server bring an old
// key back into use here — rekeyFinishedHere)
const REKEY_DONE_STORE = 'chronicles.rekey-done-v1';
const KEPT = [EGRESS_STORE, SEEN_MARKERS_STORE, SETTING_REVS_STORE, KNOWN_PASSKEYS_STORE, REKEY_DONE_STORE];
// A re-key sent to the server whose answer hasn't been acted on yet (see noteRetagPending)
const RETAG_STORE = 'chronicles.rekey-retag-v1';
const OWNER_STORE = 'chronicles.owner-v1';
// Set (to the mark) when this browser was claimed for the account in the
// current sign-in — a wipe, or a browser that had no mark. Taken away at the
// next real sign-in that finds the mark already there. While it stands, the
// browser has no evidence of the account from before this sign-in (a second
// tab taking the key reads it, so it can't count the first tab's claim as
// history). Not kept through a wipe: a wipe always comes with a fresh claim.
const FRESH_STORE = 'chronicles.owner-fresh-v1';

/** A mark for the account, from a tag only its master key can make (never the email). */
export async function ownerMark(accountTag: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chronicles:owner:v1:${accountTag}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Is the mark this browser holds another key's? A tab asks this of its own
 * key's mark: after a re-key in another tab (or someone else signing in) the
 * stored mark is no longer its own, and a tab that missed the announcement —
 * frozen in the background, say — must not go on writing under a key the
 * journal has left. No mark stored is no evidence either way.
 */
export function ownedByAnotherKey(mark: string): boolean {
  try {
    const stored = localStorage.getItem(OWNER_STORE);
    return stored !== null && stored !== mark;
  } catch { return false; }
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
 *
 * It also decides whether this browser may move the account's older records to
 * the current format (`setLegacyMigrationAllowed`, sealedFormats.ts): only when
 * it knew the account before this sign-in. `signedIn` is false for a key taken
 * from another tab, which is part of that tab's sign-in, not a new one.
 */
export async function claimBrowserFor(accountTag: string, signedIn = true): Promise<boolean> {
  setLegacyMigrationAllowed(false);
  await applyPendingRetag(accountTag);
  const mark = await ownerMark(accountTag);
  let stored: string | null = null;
  let fresh: string | null = null;
  try {
    stored = localStorage.getItem(OWNER_STORE);
    fresh = localStorage.getItem(FRESH_STORE);
  } catch { return false; }
  if (stored === mark) {
    if (signedIn) {
      // A real sign-in that found the mark: it was made by an earlier one
      try { localStorage.removeItem(FRESH_STORE); } catch { /* storage unavailable */ }
      setLegacyMigrationAllowed(true);
    } else {
      setLegacyMigrationAllowed(fresh !== mark);
    }
    return false;
  }
  await wipeBrowserData();
  try {
    localStorage.setItem(OWNER_STORE, mark);
    localStorage.setItem(FRESH_STORE, mark);
  } catch { /* storage unavailable: next sign-in wipes again */ }
  return true;
}

/**
 * The journal was re-encrypted under a new master key, so the account's tag
 * changed (it comes from the key). What this browser keeps under the old tag —
 * the owner mark, the off-device switches and consents, the settings'
 * revisions — moves to the new one, so the next sign-in isn't read as a
 * stranger's (a wipe) and nothing switched on here is lost.
 */
export async function retagBrowser(oldTag: string, newTag: string): Promise<void> {
  try {
    const [oldMark, newMark] = await Promise.all([ownerMark(oldTag), ownerMark(newTag)]);
    if (localStorage.getItem(OWNER_STORE) === oldMark) localStorage.setItem(OWNER_STORE, newMark);
    if (localStorage.getItem(FRESH_STORE) === oldMark) localStorage.setItem(FRESH_STORE, newMark);
    for (const store of [EGRESS_STORE, SETTING_REVS_STORE]) {
      const raw = localStorage.getItem(store);
      if (!raw) continue;
      const all = JSON.parse(raw) as Record<string, unknown>;
      if (!all || typeof all !== 'object' || Array.isArray(all)) continue;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(all)) out[k.startsWith(`${oldTag}|`) ? `${newTag}|${k.slice(oldTag.length + 1)}` : k] = v;
      localStorage.setItem(store, JSON.stringify(out));
    }
  } catch { /* storage unavailable: at worst a switch is turned on here again */ }
}

/**
 * A re-key is about to be sent. If its answer never arrives (the connection
 * drops after the server has made the change), this browser would still carry
 * the old key's mark, and the next sign-in — under the new key — would read it
 * as a stranger's and wipe it, sealed drafts included. So the move is written
 * down first and made at that sign-in (`applyPendingRetag`), which only acts
 * when the key that opened really is the new one.
 */
export function noteRetagPending(oldTag: string, newTag: string): void {
  try { localStorage.setItem(RETAG_STORE, JSON.stringify({ oldTag, newTag })); } catch { /* storage unavailable */ }
}

export function clearRetagPending(): void {
  try { localStorage.removeItem(RETAG_STORE); } catch { /* storage unavailable */ }
}

async function applyPendingRetag(accountTag: string): Promise<void> {
  try {
    const raw = localStorage.getItem(RETAG_STORE);
    if (!raw) return;
    const p = JSON.parse(raw) as { oldTag?: unknown; newTag?: unknown } | null;
    if (!p || p.newTag !== accountTag || typeof p.oldTag !== 'string') return;
    await retagBrowser(p.oldTag, accountTag);
    localStorage.removeItem(RETAG_STORE);
  } catch { /* storage unavailable */ }
}

/**
 * Re-keys this browser has seen finished. Once one is done its old key must
 * never open anything here again: the re-key was made because someone else may
 * hold that key, and a server (or anyone writing its database) that put the
 * finished re-key's row back could otherwise have records forged under the old
 * key re-sealed as genuine. Kept through sign-out and a wipe.
 */
export function rekeyFinishedHere(rekeyId: string): boolean {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(REKEY_DONE_STORE) ?? '[]');
    return Array.isArray(list) && list.includes(rekeyId);
  } catch { return false; }
}

export function markRekeyFinished(rekeyId: string): void {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(REKEY_DONE_STORE) ?? '[]');
    const list = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string' && v !== rekeyId) : [];
    localStorage.setItem(REKEY_DONE_STORE, JSON.stringify([...list, rekeyId].slice(-50)));
  } catch { /* storage unavailable */ }
}
