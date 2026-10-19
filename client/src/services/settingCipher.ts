import { arrayBufferToBase64, base64ToArrayBuffer } from '@shared/crypto/encoding.js';

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

/** Seal a setting's value for `key`. */
export async function sealSetting(key: string, value: unknown, encryptBytes: EncryptBytes): Promise<SealedValue> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const { ciphertext, iv } = await encryptBytes(data.buffer as ArrayBuffer, settingAad(key));
  return { ciphertext: arrayBufferToBase64(ciphertext), iv, v: 2 };
}

/** Open a v2 value sealed for `key`. Throws for anything else. */
export async function openSetting(key: string, sealed: SealedValue, decryptBytes: DecryptBytes): Promise<unknown> {
  if (!isBound(sealed)) throw new Error(`Setting "${key}" is not bound to its key`);
  const plain = await decryptBytes(base64ToArrayBuffer(sealed.ciphertext), sealed.iv, settingAad(key));
  return JSON.parse(new TextDecoder().decode(plain));
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

