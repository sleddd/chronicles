import { arrayBufferToBase64, base64ToArrayBuffer } from '@shared/crypto/encoding.js';
import { accountTagForRecords } from './deviceConsent.js';

/*
 * Sealing for settings values: `{ ciphertext, iv, v: 2 }`, AES-GCM with the
 * AAD `chronicles:setting:v2:<key>`, so a ciphertext only opens as the setting
 * it was written for. No React here (the AI and R2 config services use it,
 * and EncryptionContext imports those). The trust rules — which values may
 * still be opened unbound, which plaintext is refused — are in
 * privateSettings.ts.
 */

export interface SealedValue { ciphertext: string; iv: string; v?: 2 }

export type EncryptBytes = (data: ArrayBuffer, aad?: string) => Promise<{ ciphertext: ArrayBuffer; iv: string }>;
export type DecryptBytes = (ciphertext: ArrayBuffer, iv: string, aad?: string) => Promise<ArrayBuffer>;

export const settingAad = (key: string) => `chronicles:setting:v2:${key}`;

/** A sealed value, either format. */
export function isSealed(v: unknown): v is SealedValue {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.ciphertext !== 'string' || typeof o.iv !== 'string') return false;
  const extra = Object.keys(o).filter(k => k !== 'ciphertext' && k !== 'iv');
  return extra.length === 0 || (extra.length === 1 && o.v === 2);
}

export const isBound = (v: SealedValue) => v.v === 2;

/*
 * Rollback guard. A sealed value is bound to its key, not to its version, so
 * a server could serve an older one it kept — an AI key or provider, or an
 * image bucket, the user has since moved away from. For these settings each
 * write carries a revision (`_rev`, inside the sealed value) one past the
 * newest this browser has opened or written, and this browser refuses anything
 * older than the newest it has seen (kept per account under its master-key
 * tag, so through sign-out). "Seen" moves on when a value is opened and when
 * the server has taken a save (`trackGuardedSave`) — so the value just
 * replaced is refused from then on, not only once the new one was read back —
 * and removing the setting (`noteSettingRemoved`) leaves a mark one past
 * everything written, so nothing from before the removal opens here again.
 * A value from before revisions opens until a revised one has been seen. It
 * can't stop a server hiding another device's newer write altogether —
 * nothing passing only through the server can.
 */
export const SETTING_REVS_STORE = 'chronicles.setting-rev.v1';
const ROLLBACK_GUARDED = new Set(['aiConfig', 'imageStorageConfig']);

function revs(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SETTING_REVS_STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function seenRev(key: string): number {
  const tag = accountTagForRecords();
  return tag ? (revs()[`${tag}|${key}`] ?? 0) : 0;
}

function noteRev(key: string, rev: number): void {
  const tag = accountTagForRecords();
  if (!tag) return;
  const all = revs();
  if ((all[`${tag}|${key}`] ?? 0) >= rev) return;
  all[`${tag}|${key}`] = rev;
  try { localStorage.setItem(SETTING_REVS_STORE, JSON.stringify(all)); } catch { /* private mode */ }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// This session's writes, per account + key: the newest revision handed out
// (so each save gets its own), the lowest handed out since no save was in
// flight, and how many saves are on their way to the server
const written = new Map<string, { issued: number; burstMin: number | null; inFlight: number; landed: boolean }>();

function writes(key: string) {
  const id = `${accountTagForRecords() ?? ''}|${key}`;
  let w = written.get(id);
  if (!w) { w = { issued: 0, burstMin: null, inFlight: 0, landed: false }; written.set(id, w); }
  return w;
}

function nextRev(key: string): number {
  const w = writes(key);
  const rev = Math.max(seenRev(key), w.issued) + 1;
  w.issued = rev;
  if (w.burstMin === null) w.burstMin = rev;
  return rev;
}

/**
 * Send a rollback-guarded setting's save. Once no save is in flight and one
 * has landed, everything older than this burst of saves is refused here. (The
 * burst's lowest revision, not its highest: two saves can reach the server in
 * either order, and the one it kept must still open.) A failed save changes
 * nothing — the value the server still holds keeps opening.
 */
export async function trackGuardedSave<T>(key: string, send: () => Promise<T>): Promise<T> {
  if (!ROLLBACK_GUARDED.has(key)) return send();
  const w = writes(key);
  w.inFlight++;
  try {
    const result = await send();
    w.landed = true;
    return result;
  } finally {
    w.inFlight--;
    if (w.inFlight <= 0) {
      if (w.landed && w.burstMin !== null) noteRev(key, w.burstMin);
      w.inFlight = 0; w.burstMin = null; w.landed = false;
    }
  }
}

/** The setting was removed: nothing written before now opens in this browser again. */
export function noteSettingRemoved(key: string): void {
  if (!ROLLBACK_GUARDED.has(key)) return;
  const w = writes(key);
  const mark = Math.max(seenRev(key), w.issued) + 1;
  w.issued = mark;
  w.burstMin = null;
  noteRev(key, mark);
}

/** Seal a setting's value for `key`. */
export async function sealSetting(key: string, value: unknown, encryptBytes: EncryptBytes): Promise<SealedValue> {
  if (ROLLBACK_GUARDED.has(key) && isPlainObject(value)) {
    // Noted as seen once the server has taken it (trackGuardedSave) or when
    // it's next opened, not now: if this write never reaches the server, the
    // value it still holds keeps opening
    value = { ...value, _rev: nextRev(key) };
  }
  const data = new TextEncoder().encode(JSON.stringify(value));
  const { ciphertext, iv } = await encryptBytes(data.buffer as ArrayBuffer, settingAad(key));
  return { ciphertext: arrayBufferToBase64(ciphertext), iv, v: 2 };
}

/** Open a v2 value sealed for `key`. Throws for anything else. */
export async function openSetting(key: string, sealed: SealedValue, decryptBytes: DecryptBytes): Promise<unknown> {
  if (!isBound(sealed)) throw new Error(`Setting "${key}" is not bound to its key`);
  const plain = await decryptBytes(base64ToArrayBuffer(sealed.ciphertext), sealed.iv, settingAad(key));
  const value: unknown = JSON.parse(new TextDecoder().decode(plain));
  if (!ROLLBACK_GUARDED.has(key) || !isPlainObject(value)) return value;
  const { _rev, ...rest } = value;
  const rev = typeof _rev === 'number' && Number.isInteger(_rev) && _rev > 0 ? _rev : 0;
  if (rev < seenRev(key)) throw new Error(`Setting "${key}" is older than one this browser has already seen`);
  noteRev(key, rev);
  return rest;
}

export async function openUnbound(sealed: SealedValue, decryptBytes: DecryptBytes): Promise<unknown> {
  const plain = await decryptBytes(base64ToArrayBuffer(sealed.ciphertext), sealed.iv);
  return JSON.parse(new TextDecoder().decode(plain));
}

/**
 * Open a sealed value for a read-only copy the user takes away (Export All):
 * an unbound value from before v2 still opens there, since nothing is
 * decided by it.
 */
export async function openForExport(key: string, sealed: SealedValue, decryptBytes: DecryptBytes): Promise<unknown> {
  return isBound(sealed) ? openSetting(key, sealed, decryptBytes) : openUnbound(sealed, decryptBytes);
}

