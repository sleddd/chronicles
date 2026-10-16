import { useCallback } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { settings as settingsApi } from './api.js';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@shared/crypto/encoding.js';

/**
 * Settings that say something personal (your name, where you live, what you
 * search for, the fields you track) are stored encrypted with the master key,
 * in the same `{ ciphertext, iv }` shape as `useEncryptedSetting`. Values saved
 * before this was introduced are still plaintext on the server: `openPrivateSettings`
 * reads them as-is and `migratePrivateSettings` re-saves them sealed.
 */
export const PRIVATE_SETTING_KEYS = ['displayName', 'weatherCity', 'timezone', 'plannerFilters', 'topicCustomFields'] as const;
export type PrivateSettingKey = typeof PRIVATE_SETTING_KEYS[number];

export interface SealedValue { ciphertext: string; iv: string }

type EncryptBytes = (data: ArrayBuffer) => Promise<{ ciphertext: ArrayBuffer; iv: string }>;
type DecryptBytes = (ciphertext: ArrayBuffer, iv: string) => Promise<ArrayBuffer>;

export function isSealed(v: unknown): v is SealedValue {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && typeof (v as SealedValue).ciphertext === 'string'
    && typeof (v as SealedValue).iv === 'string'
    && Object.keys(v).length === 2;
}

export async function sealValue(value: unknown, encryptBytes: EncryptBytes): Promise<SealedValue> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const { ciphertext, iv } = await encryptBytes(data.buffer as ArrayBuffer);
  return { ciphertext: arrayBufferToBase64(ciphertext), iv };
}

export async function openValue(sealed: SealedValue, decryptBytes: DecryptBytes): Promise<unknown> {
  const plain = await decryptBytes(base64ToArrayBuffer(sealed.ciphertext), sealed.iv);
  return JSON.parse(new TextDecoder().decode(plain));
}

/**
 * Decrypt the private keys of a settings map in place. Returns the keys that
 * were still plaintext (to be migrated). A value that fails to decrypt is
 * dropped, so callers fall back to their defaults.
 */
export async function openPrivateSettings(map: Record<string, unknown>, decryptBytes: DecryptBytes): Promise<PrivateSettingKey[]> {
  const legacy: PrivateSettingKey[] = [];
  await Promise.all(PRIVATE_SETTING_KEYS.map(async key => {
    const v = map[key];
    if (v === undefined || v === null) return;
    if (isSealed(v)) {
      try { map[key] = await openValue(v, decryptBytes); }
      catch { delete map[key]; }
    } else {
      legacy.push(key);
    }
  }));
  return legacy;
}

/** Re-save plaintext private settings sealed. Best-effort: a failure retries next load. */
export async function migratePrivateSettings(map: Record<string, unknown>, keys: PrivateSettingKey[], encryptBytes: EncryptBytes): Promise<void> {
  for (const key of keys) {
    try { await settingsApi.upsert(key, await sealValue(map[key], encryptBytes)); }
    catch { /* stays plaintext until the next successful load */ }
  }
}

/** Load all settings with the private ones decrypted. */
export async function loadSettingsMap(decryptBytes: DecryptBytes): Promise<Record<string, unknown>> {
  const all = await settingsApi.getAll();
  const map: Record<string, unknown> = {};
  for (const s of all) map[s.key] = s.value;
  await openPrivateSettings(map, decryptBytes);
  return map;
}

/** `savePrivateSetting(key, value)` — encrypts with the master key, then saves. */
export function usePrivateSettings() {
  const { encryptBytes, decryptBytes } = useEncryption();
  const savePrivateSetting = useCallback(async (key: PrivateSettingKey, value: unknown) => {
    await settingsApi.upsert(key, await sealValue(value, encryptBytes));
  }, [encryptBytes]);
  const loadPrivateSettings = useCallback(() => loadSettingsMap(decryptBytes), [decryptBytes]);
  return { savePrivateSetting, loadPrivateSettings };
}
