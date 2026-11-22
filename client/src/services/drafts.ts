/*
 * Sealed drafts: unsaved writing survives the session ending.
 *
 * A session can end under someone mid-sentence — 15 minutes away, the server
 * expiring it, a reload, a crash. Writing not saved as an entry yet (the Quick
 * entry, a new journal entry) is therefore sealed with the master key a moment
 * after each pause in typing and kept in this browser, and offered back after
 * the next sign-in.
 *
 * Only ciphertext is stored (AES-GCM under the master key, bound to its slot),
 * so without the key a draft opens nothing. A draft goes when its entry is
 * saved or it is discarded, after 7 days, when Sign out is pressed, and when a
 * different person signs in (the whole browser is wiped then).
 */

const DB_NAME = 'chronicles-drafts';
const STORE = 'drafts';
export const DRAFT_DAYS = 7;
const MAX_AGE_MS = DRAFT_DAYS * 24 * 60 * 60 * 1000;

export interface DraftCipher {
  encryptBytes: (data: ArrayBuffer, aad?: string) => Promise<{ ciphertext: ArrayBuffer; iv: string }>;
  decryptBytes: (ciphertext: ArrayBuffer, iv: string, aad?: string) => Promise<ArrayBuffer>;
}

interface Row { slot: string; ciphertext: ArrayBuffer; iv: string; savedAt: number }

const aad = (slot: string) => `chronicles:draft:v1:${slot}`;

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'slot' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let a wipe (Sign out, another tab) delete the database instead of blocking it
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

export const draftsAvailable = (): boolean => typeof indexedDB !== 'undefined';

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const req = work(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/** Seal a draft into its slot (replacing what was there). */
export async function saveDraft(cipher: DraftCipher, slot: string, value: unknown, now = Date.now()): Promise<void> {
  if (!draftsAvailable()) return;
  const data = new TextEncoder().encode(JSON.stringify(value));
  const { ciphertext, iv } = await cipher.encryptBytes(data.buffer as ArrayBuffer, aad(slot));
  await run('readwrite', s => s.put({ slot, ciphertext, iv, savedAt: now } satisfies Row));
}

/** The draft in a slot and when it was sealed, or null. One too old, or that doesn't open, is removed. */
export async function readDraft<T>(cipher: DraftCipher, slot: string, now = Date.now()): Promise<{ value: T; savedAt: number } | null> {
  if (!draftsAvailable()) return null;
  const row = await run<Row | undefined>('readonly', s => s.get(slot));
  if (!row) return null;
  if (now - row.savedAt > MAX_AGE_MS) { await removeDraft(slot); return null; }
  try {
    const plain = await cipher.decryptBytes(row.ciphertext, row.iv, aad(slot));
    return { value: JSON.parse(new TextDecoder().decode(plain)) as T, savedAt: row.savedAt };
  } catch (err) {
    // Only when the cipher itself refused it (another key's, or damaged) can it
    // never open here. Anything else — the key left the tab while this was
    // reading, which is the very moment drafts exist for — leaves it stored
    // By name: the error can come from another realm, where `instanceof DOMException` is false
    if ((err as { name?: unknown } | null)?.name === 'OperationError') await removeDraft(slot);
    return null;
  }
}

/**
 * Re-encrypting under a new master key: the draft in a slot, moved from the old
 * key to the new one (same time sealed). Never removes anything: one already
 * under the new key, or that neither opens, stays exactly as it is.
 */
export async function resealDraft(oldCipher: DraftCipher, newCipher: DraftCipher, slot: string): Promise<void> {
  if (!draftsAvailable()) return;
  const row = await run<Row | undefined>('readonly', s => s.get(slot));
  if (!row) return;
  try { await newCipher.decryptBytes(row.ciphertext, row.iv, aad(slot)); return; } catch { /* not under the new key yet */ }
  let plain: ArrayBuffer;
  try { plain = await oldCipher.decryptBytes(row.ciphertext, row.iv, aad(slot)); } catch { return; }
  const { ciphertext, iv } = await newCipher.encryptBytes(plain, aad(slot));
  await run('readwrite', s => s.put({ slot, ciphertext, iv, savedAt: row.savedAt } satisfies Row));
}

export async function removeDraft(slot: string): Promise<void> {
  if (!draftsAvailable()) return;
  await run('readwrite', s => s.delete(slot)).catch(() => {});
}

// Forms with a draft waiting on its pause register a way to seal it now
const pending = new Set<() => Promise<void>>();
export function onFlushDrafts(flush: () => Promise<void>): () => void {
  pending.add(flush);
  return () => { pending.delete(flush); };
}
/** Seal everything still waiting — before the session is ended on purpose (idle sign-out). */
export async function flushDrafts(): Promise<void> {
  await Promise.allSettled([...pending].map(f => f()));
}
