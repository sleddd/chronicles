import { encryptionService } from '@shared/crypto/encryptionService.js';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@shared/crypto/encoding.js';
import type { EncryptedPost } from '@shared/crypto/types.js';
import { ApiError, assistantChanges as assistantChangesApi, auth as authApi, entries as entriesApi, finance as financeApi, settings as settingsApi, rekeyRecords, type FinanceKind } from './api.js';
import { isSealed, settingAad } from './settingCipher.js';
import { presignR2, type R2Config } from './r2Signer.js';
import { imageAad, testR2Connection } from './imageStorage.js';
import { isImageKey } from '../utils/storedImage.js';
import { resealDraft, type DraftCipher } from './drafts.js';

/*
 * Re-encrypting the journal under a new master key (Settings → change password
 * → "Also re-encrypt my journal").
 *
 * By the time this runs the server already holds the new key's wraps (password
 * and recovery) and the OLD key sealed under the new one (auth.rekeyStatus).
 * Every record is opened with whichever of the two keys it is under and sealed
 * again with the new one: entries, topics, dose records, finance records, every
 * sealed setting, the photos in the person's R2 bucket and this browser's
 * sealed drafts. Then the server drops the old key (auth.rekeyFinish).
 *
 * It can stop anywhere — a closed tab, the idle sign-out, a lost connection —
 * and is simply run again at the next sign-in: a record already under the new
 * key is left alone, so every step is safe to repeat. Each kind of record is
 * worked through until a fresh read from the server finds none of it left
 * under the old key (`drain`), with no cap on how many rounds that takes, and
 * the server is told to drop the old key only after that. Anything that can't
 * be moved stops the job WITHOUT finishing, so the old key is never dropped
 * while something still needs it.
 *
 * Photos are the one step that isn't a plain re-seal: an entry (or a background
 * setting) holds each photo's IV, so the new ciphertext goes to a NEW object
 * (named from the old one and the re-key id, so a repeat lands on the same
 * name), the holders are pointed at it, and only then is the old object
 * deleted. A moved photo remembers where it came from (`rekeyFrom`, with the
 * re-key id), so a run cut short still deletes the old objects next time.
 *
 * What it can't do: tell a record that was genuinely under the old key from
 * one forged under it. The re-key is made because someone may hold the old
 * key, and while the job runs anything sealed with that key is opened and
 * sealed again as the person's own — the R2 and AI credentials included. Only
 * someone who can also write the database or the bucket could use that, and
 * only until the job ends (a finished re-key's old key is never taken up again
 * in a browser that saw it finish). It is why the person is told to replace
 * their R2 and AI keys afterwards.
 */

export type RekeyPhase = 'starting' | 'photos' | 'entries' | 'topics' | 'doses' | 'finance' | 'settings' | 'cleanup' | 'done';
export interface RekeyProgress { phase: RekeyPhase; done: number; total: number }

export class RekeyError extends Error {
  constructor(message: string, public readonly kind: 'photos' | 'missing' | 'taken' | 'other' = 'other') {
    super(message);
    this.name = 'RekeyError';
  }
}

interface RekeyDeps {
  newKey: CryptoKey;
  oldKey: CryptoKey;
  rekeyId: string;
  /** This browser's id in the server's claim on the job: only its holder can finish it */
  runner: string;
  onProgress?: (p: RekeyProgress) => void;
  /** Tests: the R2 calls */
  fetchFn?: typeof fetch;
  /**
   * Called before every write: throws (RekeyError 'taken') when this browser no
   * longer holds the server's claim on the job, so two browsers never write at once
   */
  guard?: () => Promise<void>;
  /**
   * The person has said to finish without the photos that can't be found or
   * opened. Without it the job stops (RekeyError 'missing') before anything
   * else moves: once the old key is gone those photos could never be opened,
   * even if the bucket's settings turn out to have been wrong
   */
  allowMissingPhotos?: boolean;
  /** Tests: the pause before a round that moved nothing is tried again */
  pauseMs?: number;
}

/** A photo as entries and settings hold it */
interface ImageRef {
  key: string; iv: string; thumbKey: string; thumbIv: string;
  rekeyFrom?: string; rekeyFromThumb?: string; rekeyId?: string;
  [k: string]: unknown;
}

const isRef = (v: unknown): v is ImageRef => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.key === 'string' && isImageKey(o.key) && typeof o.thumbKey === 'string' && isImageKey(o.thumbKey)
    && typeof o.iv === 'string' && typeof o.thumbIv === 'string';
};

/** Every photo reference anywhere in a decrypted value */
export function findImageRefs(value: unknown, out: ImageRef[] = []): ImageRef[] {
  if (Array.isArray(value)) { for (const v of value) findImageRefs(v, out); return out; }
  if (!value || typeof value !== 'object') return out;
  if (isRef(value)) { out.push(value); return out; }
  for (const v of Object.values(value as Record<string, unknown>)) findImageRefs(v, out);
  return out;
}

/** A copy of a decrypted value with its photo references (and `_featuredKey`) moved to their new objects */
export function remapImages(value: unknown, moved: Map<string, Partial<ImageRef> & { key: string }>): unknown {
  if (Array.isArray(value)) return value.map(v => remapImages(v, moved));
  if (!value || typeof value !== 'object') return value;
  if (isRef(value)) {
    const next = moved.get(value.key);
    return next ? { ...value, ...next } : value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = k === '_featuredKey' && typeof v === 'string' && moved.has(v) ? moved.get(v)!.key : remapImages(v, moved);
  }
  return out;
}

/** The new object for a photo: named from the old one and the re-key, so a repeated run reuses it */
export async function movedImageKey(oldKey: string, rekeyId: string): Promise<string> {
  const base = oldKey.replace(/-t$/, '');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chronicles:rekey:image:${rekeyId}:${base}`)));
  const h = Array.from(hash.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
  // Shaped like a v4 UUID, so it passes the one image-key pattern
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return `img/${uuid}${oldKey.endsWith('-t') ? '-t' : ''}`;
}

/** Opened with the new key, else the old one — and which (null when neither opens it) */
async function eitherKey<T>(newKey: CryptoKey, oldKey: CryptoKey, open: (key: CryptoKey) => Promise<T>): Promise<{ value: T; old: boolean } | null> {
  try { return { value: await open(newKey), old: false }; } catch { /* the old key */ }
  try { return { value: await open(oldKey), old: true }; } catch { return null; }
}

const FINANCE_KINDS: FinanceKind[] = ['bills', 'budget', 'expenses', 'goals', 'savings'];
const DRAFT_SLOTS = ['quick-entry', 'journal'];
const IMAGE_SETTINGS_HINT = /"thumbKey"/;
const RESEAL_ENTRIES = 100;
const RESEAL_BYTES = 3_500_000;
// Doses and finance records go through the 1 MB JSON parser: batches stay well under it
const RECORD_BATCH = 200;
const RECORD_BATCH_BYTES = 600_000;
// A round that moved nothing is tried again after a pause; this many in a row
// and the job stops WITHOUT finishing (the old key stays, Try again carries on)
const STUCK_ROUNDS = 5;
const STUCK_PAUSE_MS = 2000;

const gone = (err: unknown): boolean => (err as { status?: unknown } | null)?.status === 404;

/** Batches of at most `count` items and `bytes` in all (a batch always holds at least one) */
export function inBatches<T>(items: T[], size: (item: T) => number, count: number, bytes: number): T[][] {
  const out: T[][] = [];
  let batch: T[] = [];
  let n = 0;
  for (const item of items) {
    const sz = size(item);
    if (batch.length && (batch.length >= count || n + sz > bytes)) { out.push(batch); batch = []; n = 0; }
    batch.push(item);
    n += sz;
  }
  if (batch.length) out.push(batch);
  return out;
}

/** What a move changes on a photo reference (nothing else about the holder's own copy) */
type Move = Pick<ImageRef, 'key' | 'iv' | 'thumbKey' | 'thumbIv' | 'rekeyFrom' | 'rekeyFromThumb' | 'rekeyId'>;

/**
 * The IV a moved photo is sealed with: fixed by the re-key, the new object's
 * name AND the photo's own bytes. The same bytes under the same key and IV
 * give the same ciphertext, so a repeated upload (a run cut short, another
 * browser taking over) writes the identical object and every holder's IV stays
 * right whoever wrote it last. Different bytes get a different IV.
 *
 * It is keyed with `secret` — the new key's account tag, which only a holder
 * of the NEW key can make and which never leaves the browser. Derived from
 * public values alone (as it was), the IV could be worked out by anyone: with
 * 96 bits, about 2^48 tries offline find two different photos that share one,
 * and whoever holds the old key and the bucket — the very person a re-key is
 * for — could swap the source between two runs to have the new key seal both
 * under that IV, which breaks AES-GCM for the key. Keyed, there is nothing to
 * search offline.
 */
export async function movedImageIv(toKey: string, rekeyId: string, plain: ArrayBuffer, secret: string): Promise<Uint8Array> {
  if (!secret) throw new Error('movedImageIv needs the new key’s account tag');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', plain));
  const head = new TextEncoder().encode(`chronicles:rekey:image-iv:v3:${rekeyId}:${toKey}:`);
  const input = new Uint8Array(head.length + digest.length);
  input.set(head);
  input.set(digest, head.length);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, input)).slice(0, 12);
}

/**
 * This browser's unsaved writing (sealed drafts), from the old key to the new.
 * Any browser that holds both keys does this for itself, runner or not: once
 * the re-key is finished the old key is gone, and a draft still under it could
 * never be opened. Never a reason to stop: a draft that can't be moved stays.
 */
export async function resealLocalDrafts(newKey: CryptoKey, oldKey: CryptoKey): Promise<void> {
  const cipherFor = (key: CryptoKey): DraftCipher => ({
    encryptBytes: (d, aad) => encryptionService.encryptFile(key, d, aad),
    decryptBytes: (c, iv, aad) => encryptionService.decryptFile(key, c, iv, aad),
  });
  for (const slot of DRAFT_SLOTS) await resealDraft(cipherFor(oldKey), cipherFor(newKey), slot).catch(() => {});
}

/**
 * The photos sealed settings hold (a background of the person's own, a Vision
 * area's). Asked before a re-key starts: those photos are moved too, which
 * needs the bucket's settings, and the job can't be left to find that out once
 * the app is already shut behind it.
 */
export async function settingsPhotoRefs(decryptBytes: (ciphertext: ArrayBuffer, iv: string, aad?: string) => Promise<ArrayBuffer>): Promise<{ key: string }[]> {
  const out: { key: string }[] = [];
  for (const row of await settingsApi.getAll()) {
    if (!isSealed(row.value) || row.value.v !== 2) continue;
    try {
      const json = new TextDecoder().decode(await decryptBytes(base64ToArrayBuffer(row.value.ciphertext), row.value.iv, settingAad(row.key)));
      if (IMAGE_SETTINGS_HINT.test(json)) out.push(...findImageRefs(JSON.parse(json)));
    } catch { /* one that doesn't open holds nothing the job would move */ }
  }
  return out;
}

/** Does any sealed setting hold a photo? */
export async function settingsHoldPhotos(decryptBytes: (ciphertext: ArrayBuffer, iv: string, aad?: string) => Promise<ArrayBuffer>): Promise<boolean> {
  return (await settingsPhotoRefs(decryptBytes)).length > 0;
}

/**
 * Can the photos be moved? Asked before a re-key is sent, with the bucket's
 * settings as this browser holds them: a test upload and delete (credentials,
 * CORS), then a download of a few real photos. Throws with what to fix. Once
 * the re-key is sent the app is shut until the photos have moved, and Settings
 * can't be reached to correct a key that was rotated or a bucket that changed.
 */
export async function checkPhotosReachable(cfg: R2Config, photoKeys: string[], fetchFn: typeof fetch = fetch, probe: (cfg: R2Config) => Promise<void> = testR2Connection): Promise<void> {
  await probe(cfg);
  const sample = [...new Set(photoKeys)].slice(0, 3);
  let found = 0;
  for (const key of sample) {
    let res: Response;
    // (A plain GET, its body let go unread: a Range header can need a CORS
    // preflight the bucket's policy doesn't allow)
    try { res = await fetchFn(await presignR2(cfg, 'GET', key)); void res.body?.cancel().catch(() => {}); }
    catch { throw new Error('Your bucket couldn’t be reached to read your photos. Check its CORS policy allows GET, then try again.'); }
    if (res.ok) found++;
    else if (res.status !== 404) throw new Error(`Your bucket refused to read a photo (HTTP ${res.status}). Check the API token in Settings → Entry Images, then try again.`);
  }
  if (sample.length && !found) {
    throw new Error('Your photos weren’t found in the bucket set up here. If you changed buckets, point Entry Images at the one that holds your photos first, or untick re-encrypt.');
  }
}

export async function runRekey({ newKey, oldKey, rekeyId, runner, onProgress, fetchFn = fetch, guard = async () => {}, allowMissingPhotos = false, pauseMs = STUCK_PAUSE_MS }: RekeyDeps): Promise<void> {
  const progress = (phase: RekeyPhase, done = 0, total = 0) => onProgress?.({ phase, done, total });
  const open = <T>(fn: (key: CryptoKey) => Promise<T>) => eitherKey(newKey, oldKey, fn);
  progress('starting');
  await guard();

  /**
   * One kind of record, until none of it is left under the old key: read what
   * still needs moving, write it, read again. It only returns once a fresh read
   * finds nothing left, however many rounds that takes. Rounds that move
   * nothing (the same records still waiting) are retried after a pause, and
   * after several in a row the job stops without finishing.
   */
  const drain = async <R>(phase: RekeyPhase, read: () => Promise<R[]>, idOf: (r: R) => string, write: (todo: R[], done: (n: number) => void) => Promise<void>) => {
    let total = -1;
    let stuck = 0;
    let before = '';
    for (;;) {
      const todo = await read();
      if (total < 0) { total = todo.length; progress(phase, 0, total); }
      if (!todo.length) { progress(phase, total, total); return; }
      const now = todo.map(idOf).sort().join(',');
      if (now === before) {
        if (++stuck >= STUCK_ROUNDS) throw new RekeyError(`${todo.length} ${todo.length === 1 ? 'item' : 'items'} couldn’t be re-encrypted yet. Nothing is lost: the old key is kept until everything has moved. Try again.`);
        await new Promise(r => setTimeout(r, pauseMs));
      } else stuck = 0;
      before = now;
      let moved = 0;
      const base = Math.max(0, total - todo.length);
      await write(todo, n => { moved += n; progress(phase, Math.min(total, base + moved), total); });
    }
  };

  // ── Settings as stored, opened ──────────────────────────────────────────
  type OpenedSetting = { key: string; json: string; old: boolean };
  const readSettings = async (): Promise<OpenedSetting[]> => {
    const out: OpenedSetting[] = [];
    for (const row of await settingsApi.getAll()) {
      if (!isSealed(row.value) || row.value.v !== 2) continue;
      const sealed = row.value;
      const plain = await open(key => encryptionService.decryptFile(key, base64ToArrayBuffer(sealed.ciphertext), sealed.iv, settingAad(row.key)));
      // One neither key opens was unreadable before too: it is left as it is
      if (plain) out.push({ key: row.key, json: new TextDecoder().decode(plain.value), old: plain.old });
    }
    return out;
  };
  const settingsAtStart = await readSettings();
  // Settings move FIRST, as they are (the ones holding photos are pointed at
  // the new objects in a second pass, once the photos have moved). They hold
  // the R2 and AI credentials: left to the end, a value forged under the old
  // key could be slipped in at any time during the photo phase, which can
  // take minutes. This way that window is the first seconds of the job
  const sealSetting = async (key: string, json: string) => {
    const data = new TextEncoder().encode(json);
    const { ciphertext, iv } = await encryptionService.encryptFile(newKey, data.buffer as ArrayBuffer, settingAad(key));
    await guard();
    await settingsApi.upsert(key, { ciphertext: arrayBufferToBase64(ciphertext), iv, v: 2 });
  };
  let firstSettings: OpenedSetting[] | null = settingsAtStart;
  await drain<OpenedSetting>('settings',
    async () => {
      const all = firstSettings ?? await readSettings();
      firstSettings = null;
      return all.filter(s => s.old);
    },
    s => s.key,
    async (todo, done) => {
      for (const s of todo) { await sealSetting(s.key, s.json); done(1); }
    });
  const r2 = (() => {
    const cfg = settingsAtStart.find(s => s.key === 'imageStorageConfig');
    if (!cfg) return null;
    try {
      const v = JSON.parse(cfg.json) as Partial<R2Config>;
      return v.accountId && v.bucket && v.accessKeyId && v.secretAccessKey ? v as R2Config : null;
    } catch { return null; }
  })();

  // ── Entries as stored, opened ───────────────────────────────────────────
  type OpenedEntry = { id: number; updatedAt: string; content: string; metadata: Record<string, unknown>; old: boolean };
  const readEntries = async (): Promise<OpenedEntry[]> => {
    const wire = (await entriesApi.getAll()) as unknown as (EncryptedPost & { updatedAt: string })[];
    const out: OpenedEntry[] = [];
    for (const post of wire) {
      const d = await open(key => encryptionService.decryptPost(key, post));
      // One neither key opens was unreadable before too: it is left as it is
      if (d) out.push({ id: d.value.id, updatedAt: String(post.updatedAt), content: d.value.content, metadata: d.value.metadata, old: d.old });
    }
    return out;
  };
  const entriesAtStart = await readEntries();

  // ── Photos ──────────────────────────────────────────────────────────────
  const settingRefs = (list: OpenedSetting[]) =>
    list.filter(s => IMAGE_SETTINGS_HINT.test(s.json)).flatMap(s => { try { return findImageRefs(JSON.parse(s.json)); } catch { return []; } });
  const refs = [...entriesAtStart.flatMap(e => findImageRefs(e.metadata)), ...settingRefs(settingsAtStart)];
  // old object → where it lives now. Photos an earlier run of this re-key
  // already moved are taken from the holder that says so, never moved again
  const moved = new Map<string, Move>();
  const toDelete = new Set<string>();
  for (const r of refs) {
    if (r.rekeyId !== rekeyId) continue;
    if (typeof r.rekeyFrom === 'string' && isImageKey(r.rekeyFrom)) {
      toDelete.add(r.rekeyFrom);
      moved.set(r.rekeyFrom, { key: r.key, iv: r.iv, thumbKey: r.thumbKey, thumbIv: r.thumbIv, rekeyFrom: r.rekeyFrom, rekeyFromThumb: r.rekeyFromThumb, rekeyId });
    }
    if (typeof r.rekeyFromThumb === 'string' && isImageKey(r.rekeyFromThumb)) toDelete.add(r.rekeyFromThumb);
  }
  const pending = new Map<string, ImageRef>();
  for (const r of refs) if (r.rekeyId !== rekeyId && !moved.has(r.key) && !pending.has(r.key)) pending.set(r.key, r);
  if (pending.size && !r2) {
    throw new RekeyError('Your photos are in your own R2 bucket, and its settings couldn’t be opened. Update the bucket settings, then try again. Nothing has been lost.', 'photos');
  }
  let photoDone = 0;
  let missing = 0;
  progress('photos', 0, pending.size);
  for (const ref of pending.values()) {
    await guard();
    // A request that never completed (the connection, or a bucket whose CORS
    // policy now blocks this site) is photo trouble too, so the paused screen
    // offers the bucket's settings
    const next = await moveImage(ref, r2!, newKey, oldKey, rekeyId, fetchFn).catch(err => {
      if (err instanceof RekeyError) throw err;
      throw new RekeyError('Your photo bucket couldn’t be reached. Check your connection and the bucket’s settings, then try again.', 'photos');
    });
    if (next) {
      moved.set(ref.key, next);
      toDelete.add(ref.key);
      toDelete.add(ref.thumbKey);
    } else missing++;
    progress('photos', ++photoDone, pending.size);
  }
  // A photo that isn't in the bucket (or that neither key opens) can't be
  // moved, and once the old key is gone it never could be. That is only
  // harmless when the photo really is lost already. With the wrong bucket set
  // up it is every photo, so the person decides, before anything else moves
  if (missing && !allowMissingPhotos) {
    throw new RekeyError(
      `${missing} ${missing === 1 ? 'photo' : 'photos'} couldn’t be found in your bucket or couldn’t be opened. If you finish without ${missing === 1 ? 'it' : 'them'}, ${missing === 1 ? 'it' : 'they'} can’t be recovered later.`,
      'missing',
    );
  }
  const pointsAtOld = (value: unknown): boolean => {
    if (!moved.size) return false;
    if (findImageRefs(value).some(r => moved.has(r.key))) return true;
    const featured = (value as Record<string, unknown> | null)?._featuredKey;
    return typeof featured === 'string' && moved.has(featured);
  };

  // ── Entries ─────────────────────────────────────────────────────────────
  // Every round reads the whole journal again, so this only ends once no entry
  // is under the old key and none still points at a photo's old object
  let firstRead: OpenedEntry[] | null = entriesAtStart;
  await drain<OpenedEntry>('entries',
    async () => {
      const all = firstRead ?? await readEntries();
      firstRead = null;
      return all.filter(e => e.old || pointsAtOld(e.metadata));
    },
    e => `${e.id}@${e.updatedAt}`,
    async (todo, done) => {
      const sealed: (Parameters<typeof entriesApi.reseal>[0][number])[] = [];
      for (const e of todo) {
        const metadata = moved.size ? remapImages(e.metadata, moved) as Record<string, unknown> : e.metadata;
        sealed.push({ id: e.id, updatedAt: new Date(e.updatedAt).toISOString(), ...(await encryptionService.encryptPost(newKey, e.id, e.content, metadata)) });
      }
      // An entry changed since it was read is refused by the server (its count
      // comes back short): the next round reads it as it is now and redoes it
      for (const batch of inBatches(sealed, e => e.contentEncrypted.length + e.metadataEncrypted.length, RESEAL_ENTRIES, RESEAL_BYTES)) {
        await guard();
        done((await entriesApi.reseal(batch)).resealed);
      }
    });

  // ── Topics ──────────────────────────────────────────────────────────────
  type Rec = { id: string; payload: string; iv: string };
  await drain<{ id: number; plain: unknown }>('topics',
    async () => {
      const out: { id: number; plain: unknown }[] = [];
      for (const t of await rekeyRecords.topics()) {
        if (!Number.isSafeInteger(t.id) || !t.payload || !t.iv) continue;
        const p = await open(key => encryptionService.decryptRecord(key, 'topic', String(t.id), t.payload!, t.iv!));
        if (p?.old) out.push({ id: t.id, plain: p.value });
      }
      return out;
    },
    t => String(t.id),
    async (todo, done) => {
      for (const t of todo) {
        await guard();
        const sealed = await encryptionService.encryptRecord(newKey, 'topic', String(t.id), t.plain);
        // Deleted meanwhile: nothing to move
        await rekeyRecords.putTopic(t.id, sealed).catch(err => { if (!gone(err)) throw err; });
        done(1);
      }
    });

  // ── Dose records ────────────────────────────────────────────────────────
  await drain<Rec & { date: string; plain: unknown }>('doses',
    async () => {
      const out: (Rec & { date: string; plain: unknown })[] = [];
      for (const d of (await rekeyRecords.doses()).records) {
        if (!/^[0-9a-f-]{36}$/i.test(d.id) || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
        const p = await open(key => encryptionService.decryptRecord(key, 'dose', `${d.id}|${d.date}`, d.payload, d.iv));
        if (p?.old) out.push({ ...d, plain: p.value });
      }
      return out;
    },
    d => d.id,
    async (todo, done) => {
      const sealed: { id: string; date: string; payload: string; iv: string }[] = [];
      for (const d of todo) sealed.push({ id: d.id, date: d.date, ...(await encryptionService.encryptRecord(newKey, 'dose', `${d.id}|${d.date}`, d.plain)) });
      for (const batch of inBatches(sealed, r => r.payload.length + 120, RECORD_BATCH, RECORD_BATCH_BYTES)) {
        await guard();
        await rekeyRecords.resealDoses(batch);
        done(batch.length);
      }
    });

  // ── Finance ─────────────────────────────────────────────────────────────
  for (const kind of FINANCE_KINDS) {
    await drain<Rec & { plain: unknown }>('finance',
      async () => {
        const out: (Rec & { plain: unknown })[] = [];
        for (const r of (await financeApi.list(kind)).records) {
          const p = await open(key => encryptionService.decryptRecord(key, kind, r.id, r.payload, r.iv));
          if (p?.old) out.push({ id: r.id, payload: r.payload, iv: r.iv, plain: p.value });
        }
        return out;
      },
      r => r.id,
      async (todo, done) => {
        const sealed: Rec[] = [];
        for (const r of todo) sealed.push({ id: r.id, ...(await encryptionService.encryptRecord(newKey, kind, r.id, r.plain)) });
        for (const batch of inBatches(sealed, r => r.payload.length + 120, RECORD_BATCH, RECORD_BATCH_BYTES)) {
          await guard();
          await rekeyRecords.resealFinance(kind, batch);
          done(batch.length);
        }
      });
  }

  // ── Settings ────────────────────────────────────────────────────────────
  // The second pass: the ones that hold a moved photo (and any that came to be
  // under the old key since the first). Read afresh, never from the copy taken
  // when the job started (minutes ago by now): a save that landed since would
  // be written over with the old value
  await drain<OpenedSetting>('settings',
    async () => {
      const all = await readSettings();
      return all.filter(s => {
        if (s.old) return true;
        if (!moved.size || !IMAGE_SETTINGS_HINT.test(s.json)) return false;
        try { return pointsAtOld(JSON.parse(s.json)); } catch { return false; }
      });
    },
    s => s.key,
    async (todo, done) => {
      for (const s of todo) {
        let json = s.json;
        if (moved.size && IMAGE_SETTINGS_HINT.test(json)) {
          try { json = JSON.stringify(remapImages(JSON.parse(json), moved)); } catch { /* left as it is */ }
        }
        await sealSetting(s.key, json);
        done(1);
      }
    });

  // ── This browser's unsaved writing ──────────────────────────────────────
  await resealLocalDrafts(newKey, oldKey);

  // ── The old photo objects, now nothing points at them ───────────────────
  if (toDelete.size && r2) {
    await guard();
    progress('cleanup', 0, toDelete.size);
    let n = 0;
    for (const key of toDelete) {
      try {
        const res = await fetchFn(await presignR2(r2, 'DELETE', key), { method: 'DELETE' });
        if (!res.ok && res.status !== 404) console.warn(`Couldn’t delete an old photo object (status ${res.status})`);
      } catch { console.warn('Couldn’t reach R2 to delete an old photo object'); }
      progress('cleanup', ++n, toDelete.size);
    }
  }

  // Versions kept of what the Chronicles AI app overwrote are sealed with the
  // old key, so they go before the old key does. If that fails the job stops
  // here without finishing (Try again carries on). A server from before the
  // feature has none to clear (404)
  try {
    await assistantChangesApi.clear();
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }

  await guard();
  // The server ends it only for the browser holding the job. Told no, this
  // one isn't that any more (or it was ended elsewhere): the caller asks again
  const { finished } = await authApi.rekeyFinish(rekeyId, runner);
  if (!finished) throw new RekeyError('The re-encryption wasn’t this browser’s to finish', 'taken');
  progress('done');
}

/**
 * One photo (and its thumbnail) to a new object under the new key. Null when
 * the photo is gone from the bucket or neither key opens it (it was unreadable
 * before too). The new object's name is fixed by the re-key and its IV by the
 * re-key and the photo's bytes, so doing this twice — or in two browsers —
 * writes the same object. (An old object is deleted only once no holder points
 * at it, so a holder still pointing at one that is gone has lost its photo.)
 */
async function moveImage(ref: ImageRef, r2: R2Config, newKey: CryptoKey, oldKey: CryptoKey, rekeyId: string, fetchFn: typeof fetch): Promise<Move | null> {
  const [key, thumbKey] = await Promise.all([movedImageKey(ref.key, rekeyId), movedImageKey(ref.thumbKey, rekeyId)]);
  // What keys the new objects' IVs: only a holder of the new key can make it (movedImageIv)
  const ivSecret = await encryptionService.accountTag(newKey, 'egress');
  const b64 = (iv: Uint8Array) => arrayBufferToBase64(iv.buffer as ArrayBuffer);
  const download = async (from: string): Promise<ArrayBuffer | null> => {
    const res = await fetchFn(await presignR2(r2, 'GET', from));
    if (res.status === 404) return null;
    if (!res.ok) throw new RekeyError(`Couldn’t download a photo from your bucket (status ${res.status}). Try again.`, 'photos');
    return res.arrayBuffer();
  };
  const one = async (from: string, iv: string, to: string): Promise<string | null> => {
    const ciphertext = await download(from);
    if (!ciphertext) return null;
    // Photos from before key binding have no AAD (their IV comes from the
    // entry's authenticated metadata, so nothing else opens under it)
    let plain: ArrayBuffer | null = null;
    for (const k of [newKey, oldKey]) {
      for (const aad of [imageAad(from), undefined]) {
        if (plain) break;
        try { plain = await encryptionService.decryptFile(k, ciphertext, iv, aad); } catch { /* the next way */ }
      }
    }
    if (!plain) return null;
    const toIv = await movedImageIv(to, rekeyId, plain, ivSecret);
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toIv.buffer as ArrayBuffer, additionalData: new TextEncoder().encode(imageAad(to)) },
      newKey, plain,
    );
    const put = await fetchFn(await presignR2(r2, 'PUT', to), { method: 'PUT', body: new Blob([sealed]) });
    if (!put.ok) throw new RekeyError(`Couldn’t upload a photo to your bucket (status ${put.status}). Try again.`, 'photos');
    return b64(toIv);
  };
  const iv = await one(ref.key, ref.iv, key);
  if (!iv) return null;
  const thumbIv = await one(ref.thumbKey, ref.thumbIv, thumbKey);
  // A thumbnail that was gone: the photo itself stands in for it
  return thumbIv
    ? { key, iv, thumbKey, thumbIv, rekeyFrom: ref.key, rekeyFromThumb: ref.thumbKey, rekeyId }
    : { key, iv, thumbKey: key, thumbIv: iv, rekeyFrom: ref.key, rekeyFromThumb: ref.thumbKey, rekeyId };
}
