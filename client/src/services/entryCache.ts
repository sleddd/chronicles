/**
 * The browser's copy of the journal, between visits — **ciphertext only**,
 * exactly as the server sends it (base64 fields), so it reveals nothing the
 * master key doesn't unlock. Opening the app then asks the server only for
 * what changed (`entries.getAll` in services/api.ts) instead of downloading
 * every entry (7 MB for a 3,000-entry journal).
 *
 * Kept by `scope` — a value the server derives from the account's journal —
 * so two accounts on one browser never mix, and an account deleted and made
 * again under the same email starts fresh. Lock keeps it (nothing decrypted
 * is in it); sign-out and account deletion erase it (`clearEntryCache`).
 */

export type WireEntry = Record<string, unknown> & { id: number };

export interface CachedJournal {
  cursor: string;
  /** When everything was last loaded from the server (ms) */
  fullAt: number;
  rows: WireEntry[];
}

const DB_NAME = 'chronicles-entries';
const DB_VERSION = 1;
const ROWS = 'rows';
const META = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

export function entryCacheAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function done(req: IDBRequest | IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    if ('oncomplete' in req) {
      req.oncomplete = () => resolve();
      req.onabort = () => reject(req.error ?? new Error('Cache write aborted'));
      req.onerror = () => reject(req.error);
    } else {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }
  });
}

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ROWS)) {
        db.createObjectStore(ROWS, { keyPath: ['scope', 'id'] }).createIndex('scope', 'scope');
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'scope' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let sign-out (or another tab) delete the database instead of blocking it
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('Entry cache is blocked')); };
  });
  return dbPromise;
}

/** The cached journal for this scope, or null. */
export async function readCache(scope: string): Promise<CachedJournal | null> {
  const db = await open();
  const tx = db.transaction([ROWS, META], 'readonly');
  const metaReq = tx.objectStore(META).get(scope);
  const rowsReq = tx.objectStore(ROWS).index('scope').getAll(IDBKeyRange.only(scope));
  await done(tx);
  const meta = metaReq.result as { cursor: string; fullAt: number } | undefined;
  if (!meta) return null;
  const rows = (rowsReq.result as (WireEntry & { scope: string })[]).map(({ scope: _s, ...row }) => row as WireEntry);
  return { cursor: meta.cursor, fullAt: meta.fullAt, rows };
}

/** Replace this scope's cache with a full load. */
export async function replaceCache(scope: string, cursor: string, rows: WireEntry[]): Promise<void> {
  const db = await open();
  const tx = db.transaction([ROWS, META], 'readwrite');
  const store = tx.objectStore(ROWS);
  store.delete(IDBKeyRange.bound([scope, -Infinity], [scope, Infinity]));
  for (const row of rows) store.put({ ...row, scope });
  tx.objectStore(META).put({ scope, cursor, fullAt: Date.now() });
  await done(tx);
}

/** Apply a /changes response; the cursor moves only if every row was written. */
export async function applyToCache(scope: string, cursor: string, upserts: WireEntry[], deleted: number[]): Promise<void> {
  const db = await open();
  const tx = db.transaction([ROWS, META], 'readwrite');
  const store = tx.objectStore(ROWS);
  for (const row of upserts) store.put({ ...row, scope });
  for (const id of deleted) store.delete([scope, id]);
  const metaStore = tx.objectStore(META);
  const metaReq = metaStore.get(scope);
  metaReq.onsuccess = () => {
    const meta = metaReq.result as { fullAt: number } | undefined;
    metaStore.put({ scope, cursor, fullAt: meta?.fullAt ?? 0 });
  };
  await done(tx);
}

/** Erase the browser's copy of every journal (sign-out, account deletion). */
export async function clearEntryCache(): Promise<void> {
  if (!entryCacheAvailable()) return;
  const pending = dbPromise;
  dbPromise = null;
  if (pending) await pending.then(db => db.close(), () => {});
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve(); // another tab closes its copy on versionchange
  });
}
