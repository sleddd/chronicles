/**
 * Zero-knowledge image pipeline against the user's own R2 bucket — fully
 * client-side. The R2 credentials are themselves encrypted with the master key
 * and stored as an ordinary setting; after unlock they are decrypted in memory
 * and used to sign requests directly in the browser (see r2Signer.ts).
 * The Chronicles server never sees the credentials or any image bytes.
 *
 * Module-level (not a hook) — entry deletion paths need it outside React.
 * Upload: downscale → encrypt → signed PUT of ciphertext straight to R2.
 * Display: signed GET → fetch ciphertext → decrypt in memory → object URL.
 */

import { presignR2, type R2Config } from './r2Signer.js';
import { processImage } from '../utils/processImage.js';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@shared/crypto/encoding.js';
import { isSealed, openSetting, sealSetting } from './settingCipher.js';

export type { R2Config };

/** Per-image metadata stored inside the entry's encrypted metadata blob (`_images`). */
export interface EntryImage {
  key: string;        // R2 object key of the full image, e.g. img/<uuid>
  iv: string;         // base64 12-byte IV for the full image
  thumbKey: string;   // R2 object key of the encrypted thumbnail
  thumbIv: string;    // base64 IV for the thumbnail
  mimeType: string;   // 'image/jpeg'
  size: number;       // ciphertext bytes (full image)
  width?: number;
  height?: number;
  /** What stays in view when the photo is cropped to fit (the featured banner,
      board avatars): 0–100 across and down, 50 / 50 (the centre) by default */
  focusX?: number;
  focusY?: number;
}

type EncryptBytesFn = (data: ArrayBuffer, aad?: string) => Promise<{ ciphertext: ArrayBuffer; iv: string }>;
type DecryptBytesFn = (ciphertext: ArrayBuffer, iv: string, aad?: string) => Promise<ArrayBuffer>;

/** Value shape of the `imageStorageConfig` setting: master-key ciphertext. */
export interface EncryptedConfigValue {
  ciphertext: string; // base64
  iv: string;         // base64
  v?: 2;              // bound to the setting's key (settingCipher.ts)
}

// ── In-memory credential state ───────────────────────────────────────────────
// The decrypted config mirrors the master key's lifecycle: derived after
// unlock, cleared on lock. The encrypted blob is kept so unlock can re-derive
// without refetching settings. The stored config may be PARTIAL — the Settings
// form autosaves every keystroke so nothing the user typed is ever lost.
let r2Config: R2Config | null = null;
let encryptedConfig: EncryptedConfigValue | null = null;

// Unsaved form draft — deliberately survives lock (it is the user's own typed
// input, equivalent to a form field keeping its value) so tabbing away to
// fetch credentials never wipes what was already entered.
let draftConfig: R2Config | null = null;

const configListeners = new Set<() => void>();
function notifyConfigListeners(): void {
  for (const listener of configListeners) listener();
}

/** Subscribe to config changes (async decrypt on init/unlock). Returns unsubscribe. */
export function subscribeImageStorage(listener: () => void): () => void {
  configListeners.add(listener);
  return () => { configListeners.delete(listener); };
}

/** All four fields present — the config is usable for signing requests. */
export function isCompleteConfig(cfg: R2Config | null): cfg is R2Config {
  return !!cfg && !!(cfg.accountId.trim() && cfg.bucket.trim() && cfg.accessKeyId.trim() && cfg.secretAccessKey.trim());
}

function activeConfig(): R2Config | null {
  return isCompleteConfig(r2Config) ? r2Config : null;
}

/** Decrypted object URLs cached per session, keyed by object key. */
const objectUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
// Moves on at every lock, so a download still running when the journal locks
// can't put a decrypted URL back into the cache afterwards
let lockEpoch = 0;

/** The only object keys this app makes: `img/<uuid>` and its `-t` thumbnail. */
const IMAGE_KEY = /^img\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-t)?$/;
export function isImageKey(key: string): boolean {
  return IMAGE_KEY.test(key);
}

// Uploads are re-encoded to JPEG; anything else named in metadata is shown as
// JPEG, never as a type a browser would run (text/html, image/svg+xml)
const DISPLAY_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const displayType = (mimeType: string) => DISPLAY_TYPES.has(mimeType) ? mimeType : 'image/jpeg';

function isValidConfig(cfg: unknown): cfg is R2Config {
  if (!cfg || typeof cfg !== 'object') return false;
  const c = cfg as Record<string, unknown>;
  return typeof c.accountId === 'string' && typeof c.bucket === 'string'
    && typeof c.accessKeyId === 'string' && typeof c.secretAccessKey === 'string';
}

/**
 * Load the `imageStorageConfig` setting value: remember the encrypted blob and
 * decrypt it with the master key. The stored value may be a partial draft.
 * Returns whether a COMPLETE (usable) config is present.
 */
export async function loadImageStorageConfig(value: unknown, decryptBytes: DecryptBytesFn): Promise<boolean> {
  r2Config = null;
  encryptedConfig = null;
  try {
    if (!value || typeof value !== 'object') return false;
    if (!isSealed(value)) return false;
    encryptedConfig = value;
    try {
      const parsed = await openSetting('imageStorageConfig', value, decryptBytes) as Record<string, unknown> | null;
      if (isValidConfig(parsed)) {
        r2Config = parsed;
        return isCompleteConfig(parsed);
      }
    } catch (err) {
      console.warn('Image storage config could not be decrypted:', err);
    }
    return false;
  } finally {
    notifyConfigListeners();
  }
}

/** Re-derive the in-memory config after an unlock (called from EncryptionContext). */
export async function rederiveImageStorageConfig(decryptBytes: DecryptBytesFn): Promise<void> {
  if (r2Config || !encryptedConfig) return;
  await loadImageStorageConfig(encryptedConfig, decryptBytes);
}

/** Set (or clear) the config directly — used by the Settings save/disconnect flow. */
export function setImageStorageConfig(cfg: R2Config | null, encrypted: EncryptedConfigValue | null): void {
  r2Config = cfg;
  encryptedConfig = encrypted;
  notifyConfigListeners();
}

/** Remember the unsaved form draft (survives lock; cleared on disconnect). */
export function setImageStorageDraft(cfg: R2Config | null): void {
  draftConfig = cfg;
}

/** Encrypt a config for storage in the `imageStorageConfig` setting. */
export async function encryptImageStorageConfig(cfg: R2Config, encryptBytes: EncryptBytesFn): Promise<EncryptedConfigValue> {
  return sealSetting('imageStorageConfig', cfg, encryptBytes) as Promise<EncryptedConfigValue>;
}

export function isImageStorageConfigured(): boolean {
  return r2Config !== null || encryptedConfig !== null;
}

/** Masked display info for Settings, or null when no complete config is available. */
export function getImageStorageInfo(): { bucket: string; accountId: string } | null {
  const cfg = activeConfig();
  return cfg ? { bucket: cfg.bucket, accountId: cfg.accountId } : null;
}

/** Latest field values for the Settings form: unsaved draft first, then stored config. */
export function getImageStorageConfigValue(): R2Config | null {
  return draftConfig ?? r2Config;
}

function requireConfig(): R2Config {
  const cfg = activeConfig();
  if (!cfg) throw new Error('Image storage is not configured or the journal is locked');
  return cfg;
}

// ── R2 operations ────────────────────────────────────────────────────────────

/** Upload straight to R2 — a plain fetch with no app headers or credentials.
 *  The typeless Blob body means no Content-Type header, keeping CORS minimal. */
async function putToR2(url: string, body: Blob): Promise<void> {
  const res = await fetch(url, { method: 'PUT', body });
  if (!res.ok) {
    throw new Error(`Upload to storage failed (${res.status})`);
  }
}

/** AAD binding an encrypted image object to its R2 key. */
export const imageAad = (objectKey: string) => `chronicles:image:v1:${objectKey}`;

/**
 * Process, encrypt, and upload one image (full + thumbnail).
 * Keys are client-generated random UUIDs — no user information.
 * Returns the EntryImage metadata to store in the entry's encrypted metadata.
 */
export async function uploadEntryImage(file: File, encryptBytes: EncryptBytesFn): Promise<EntryImage> {
  const cfg = requireConfig();
  const processed = await processImage(file);

  const uuid = crypto.randomUUID();
  const key = `img/${uuid}`;
  const thumbKey = `img/${uuid}-t`;

  // Each object is bound to its own key, so one can't be served in another's place
  const [fullEnc, thumbEnc] = await Promise.all([
    processed.full.arrayBuffer().then(b => encryptBytes(b, imageAad(key))),
    processed.thumb.arrayBuffer().then(b => encryptBytes(b, imageAad(thumbKey))),
  ]);

  const [putUrl, thumbPutUrl] = await Promise.all([
    presignR2(cfg, 'PUT', key),
    presignR2(cfg, 'PUT', thumbKey),
  ]);
  await Promise.all([
    putToR2(putUrl, new Blob([fullEnc.ciphertext])),
    putToR2(thumbPutUrl, new Blob([thumbEnc.ciphertext])),
  ]);

  return {
    key,
    iv: fullEnc.iv,
    thumbKey,
    thumbIv: thumbEnc.iv,
    mimeType: processed.mimeType,
    size: fullEnc.ciphertext.byteLength,
    width: processed.width,
    height: processed.height,
  };
}

/**
 * Resolve an object key to a displayable object URL: signed GET → fetch
 * ciphertext → decrypt → URL.createObjectURL. Cached per session; concurrent
 * requests for the same key share one fetch. Works for thumbs and full images.
 */
export async function getImageObjectUrl(
  key: string,
  iv: string,
  mimeType: string,
  decryptBytes: DecryptBytesFn
): Promise<string> {
  if (!isImageKey(key)) throw new Error('Not an image key');
  const cached = objectUrlCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const epoch = lockEpoch;
  const promise = (async () => {
    const cfg = requireConfig();
    const url = await presignR2(cfg, 'GET', key);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image download failed (${res.status})`);
    const ciphertext = await res.arrayBuffer();
    // Images uploaded before key binding have no AAD. Opening those is safe:
    // the IV comes from the entry's authenticated metadata, so a ciphertext
    // from any other object can't decrypt under it either way
    const plaintext = await decryptBytes(ciphertext, iv, imageAad(key))
      .catch(() => decryptBytes(ciphertext, iv));
    if (epoch !== lockEpoch) throw new Error('Locked while loading');
    const objectUrl = URL.createObjectURL(new Blob([plaintext], { type: displayType(mimeType) }));
    objectUrlCache.set(key, objectUrl);
    return objectUrl;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Revoke every cached decrypted object URL and drop the in-memory credentials.
 * Called from EncryptionContext.lock(); the encrypted blob is kept so unlock
 * can re-derive the credentials without refetching settings.
 */
export function clearImageCache(): void {
  lockEpoch++;
  for (const url of objectUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  objectUrlCache.clear();
  inflight.clear();
  r2Config = null;
  // The draft is kept — unsaved form input must survive the tab-away
  // auto-lock, or entering credentials in stages becomes impossible — but
  // never its secret key, which would otherwise outlive the lock in memory
  if (draftConfig) draftConfig = { ...draftConfig, secretAccessKey: '' };
  notifyConfigListeners();
}

/** Best-effort R2 object deletion — never throws. Skips silently when the
 *  config is unavailable (locked); orphans sit in the user's own bucket. */
export async function bestEffortDeleteImages(allKeys: string[]): Promise<void> {
  // Only keys this app makes: never sign a DELETE for some other object in
  // the bucket because an entry's metadata named it
  const keys = allKeys.filter(isImageKey);
  if (keys.length === 0) return;
  const cfg = activeConfig();
  if (!cfg) {
    console.warn(`Image cleanup skipped for ${keys.length} object(s) — storage locked or unconfigured`);
    return;
  }
  await Promise.allSettled(keys.map(async key => {
    try {
      const url = await presignR2(cfg, 'DELETE', key);
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.warn(`Image cleanup failed for ${key} (object remains in your bucket):`, err);
    }
  }));
  // Drop any cached object URLs for deleted keys
  for (const key of keys) {
    const url = objectUrlCache.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrlCache.delete(key);
    }
  }
}

/**
 * Verify credentials AND the bucket CORS policy from the browser by writing a
 * tiny probe object and deleting it — exactly the operations the app performs.
 */
export async function testR2Connection(cfg: R2Config): Promise<void> {
  const key = `chronicles-probe-${crypto.randomUUID()}`;
  const putUrl = await presignR2(cfg, 'PUT', key);
  let putRes: Response;
  try {
    putRes = await fetch(putUrl, { method: 'PUT', body: new Blob([new Uint8Array([0])]) });
  } catch {
    // The request never completed. Probe the endpoint without CORS to tell
    // "R2 unreachable" apart from "reachable but this origin is blocked".
    let reachable = false;
    try {
      await fetch(`https://${cfg.accountId}.r2.cloudflarestorage.com/`, { mode: 'no-cors' });
      reachable = true;
    } catch { /* endpoint itself unreachable */ }
    if (!reachable) {
      throw new Error('Could not reach Cloudflare R2 at all — check your internet connection and that the Account ID is the 32-character ID from the R2 overview page');
    }
    throw new Error(
      `The bucket blocked this site. On the bucket's Settings → CORS policy, AllowedOrigins must contain exactly "${window.location.origin}" ` +
      '(scheme, host, and port all matter — "localhost" and "127.0.0.1" are different origins), with AllowedMethods GET, PUT, DELETE. ' +
      'Changes can take a minute to apply. Also confirm the Account ID belongs to the account that owns this bucket.'
    );
  }
  if (!putRes.ok) {
    throw new Error(`The bucket refused a test upload (HTTP ${putRes.status}) — check the bucket name and that the API token has Object Read & Write permission scoped to this bucket`);
  }
  const delUrl = await presignR2(cfg, 'DELETE', key);
  const delRes = await fetch(delUrl, { method: 'DELETE' }).catch(() => null);
  if (!delRes || !delRes.ok) {
    throw new Error('Test upload succeeded but cleanup failed — make sure the CORS policy allows the DELETE method');
  }
}

/** Flatten all image object keys (full + thumb) from decrypted entries. */
export function collectImageKeys(entries: Array<{ metadata: Record<string, unknown> }>): string[] {
  const keys: string[] = [];
  for (const entry of entries) {
    const images = entry.metadata?._images as EntryImage[] | undefined;
    if (!Array.isArray(images)) continue;
    for (const img of images) {
      if (typeof img?.key === 'string') keys.push(img.key);
      if (typeof img?.thumbKey === 'string') keys.push(img.thumbKey);
    }
  }
  return keys;
}
