import { useCallback } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { settings as settingsApi } from './api.js';
import { isSealed, isBound, sealSetting, openSetting, openUnbound, type SealedValue, type EncryptBytes, type DecryptBytes } from './settingCipher.js';
import { PRIVATE_SETTING_KEYS } from '@shared/validation/sealedSettings.js';
import { sealMarkerHeld, noteSealMarker } from './sealedFormats.js';
import { EGRESS_KEYS, egressOn, type EgressKey } from './deviceConsent.js';

/**
 * Encrypted settings.
 *
 * Settings that say something personal (your name, where you live, what you
 * search for, the fields you track, which health features you use, whether
 * calendar data leaves the device) are stored encrypted with the master key.
 * So are the master-key settings with their own hooks (`useEncryptedSetting`:
 * nutrition goals, the dashboard, planning order) and the AI / R2 credentials.
 *
 * Every sealed value is `{ ciphertext, iv, v: 2 }`, AES-GCM with the AAD
 * `chronicles:setting:v2:<key>`, so the server can't move a ciphertext from one
 * setting to another (e.g. any sealed `true` into `icsIncludeDetails`).
 *
 * Values sealed before (`{ ciphertext, iv }`, no AAD) are opened and re-sealed
 * once by `migrateSettings`, which then writes the sealed marker
 * `settingsSealV2`. Once the marker exists no unbound value is accepted, so an
 * old ciphertext the server kept can't be replayed under another key.
 * Plaintext values of private keys are refused — except the few harmless
 * keys that only became private with v2 (`NEWLY_PRIVATE`), which are sealed by
 * that same one-time migration, before the marker. The switches that send data
 * off the device (`EGRESS_KEYS`) open only bound, never unbound or plaintext,
 * and count only where this browser turned them on (`deviceConsent.ts`); the
 * marker itself is backed by `sealedFormats.ts`.
 */
export { PRIVATE_SETTING_KEYS };
export type PrivateSettingKey = typeof PRIVATE_SETTING_KEYS[number];

const PRIVATE = new Set<string>(PRIVATE_SETTING_KEYS);
const NEWLY_PRIVATE = new Set<string>(['imagesEnabled', 'topicHideText']);
const EGRESS = new Set<string>(EGRESS_KEYS);

/** Sealed marker: present once every setting of the account is on the v2 format. */
export const SEAL_MARKER_KEY = 'settingsSealV2';

export { isSealed, sealSetting, openSetting, openForExport, settingAad, type SealedValue } from './settingCipher.js';

/** Whether the account is past the one-time migration (the marker exists and opens). */
async function isMigrated(map: Record<string, unknown>, decryptBytes: DecryptBytes): Promise<boolean> {
  const marker = map[SEAL_MARKER_KEY];
  if (marker === undefined || marker === null) return sealMarkerHeld(SEAL_MARKER_KEY, false);
  noteSealMarker(SEAL_MARKER_KEY);
  // A marker that is there but doesn't open still counts: refusing unbound
  // values is the safe side, and only the server could have damaged it
  if (!isSealed(marker)) return true;
  try { await openSetting(SEAL_MARKER_KEY, marker, decryptBytes); } catch { /* still migrated */ }
  return true;
}

export interface OpenedSettings {
  /** Keys still to re-seal (only ever non-empty before the marker exists) */
  toReseal: string[];
  migrated: boolean;
}

/**
 * Open every sealed value of a settings map in place (any key) and drop what
 * may not be trusted: values that fail to open, unbound values once migrated,
 * and plaintext values of private keys. Callers then fall back to defaults.
 */
export async function openSettingsMap(map: Record<string, unknown>, decryptBytes: DecryptBytes): Promise<OpenedSettings> {
  const migrated = await isMigrated(map, decryptBytes);
  delete map[SEAL_MARKER_KEY];
  const toReseal: string[] = [];
  await Promise.all(Object.keys(map).map(async key => {
    const v = map[key];
    if (v === undefined || v === null) return;
    if (isSealed(v)) {
      if (isBound(v)) {
        try { map[key] = await openSetting(key, v, decryptBytes); }
        catch { delete map[key]; }
      } else if (!migrated && !EGRESS.has(key)) {
        try { map[key] = await openUnbound(v, decryptBytes); toReseal.push(key); }
        catch { delete map[key]; }
      } else {
        delete map[key];
      }
    } else if (PRIVATE.has(key)) {
      if (!migrated && NEWLY_PRIVATE.has(key)) toReseal.push(key);
      else delete map[key];
    }
  }));
  return { toReseal, migrated };
}

/**
 * The one-time move to v2: re-seal what `openSettingsMap` listed (the map
 * holds their opened values), then write the marker. Returns the new sealed
 * values by key (the AI / R2 loaders take the sealed blob). If any write fails
 * it throws before the marker, and the next load tries again.
 *
 * The ICS feed switch (`icsFeedEnabled`) starts off: what the server reports
 * about the feed never switches it on, so an account that had the feed turns
 * it on again in Settings.
 */
export async function migrateSettings(
  map: Record<string, unknown>,
  opened: OpenedSettings,
  encryptBytes: EncryptBytes,
): Promise<Record<string, SealedValue>> {
  const resealed: Record<string, SealedValue> = {};
  if (opened.migrated) return resealed;
  for (const key of opened.toReseal) {
    resealed[key] = await sealSetting(key, map[key], encryptBytes);
    await settingsApi.upsert(key, resealed[key]);
  }
  if (map.icsFeedEnabled === undefined) {
    map.icsFeedEnabled = false;
    await settingsApi.upsert('icsFeedEnabled', await sealSetting('icsFeedEnabled', false, encryptBytes));
  }
  await settingsApi.upsert(SEAL_MARKER_KEY, await sealSetting(SEAL_MARKER_KEY, true, encryptBytes));
  noteSealMarker(SEAL_MARKER_KEY);
  return resealed;
}

/**
 * Startup: the settings rows opened (`map`), the one-time migration run (a
 * failure is retried next load), and `sealed(key)` — the sealed blob of a
 * setting whose loader keeps it (AI and R2 credentials re-open it on unlock).
 */
export async function openStartupSettings(
  rows: { key: string; value: unknown }[],
  decryptBytes: DecryptBytes,
  encryptBytes: EncryptBytes,
): Promise<{ map: Record<string, unknown>; sealed: (key: string) => unknown }> {
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;
  const raw = { ...map };
  const opened = await openSettingsMap(map, decryptBytes);
  let resealed: Record<string, SealedValue> = {};
  try { resealed = await migrateSettings(map, opened, encryptBytes); }
  catch (err) { console.warn('Settings will be re-sealed at the next load:', err instanceof Error ? err.message : err); }
  honourEgress(map);
  return { map, sealed: key => resealed[key] ?? raw[key] };
}

/** The off-device switches as this browser honours them (see deviceConsent.ts). */
function honourEgress(map: Record<string, unknown>): void {
  for (const key of EGRESS_KEYS) {
    if (key in map) map[key] = egressOn(key as EgressKey, map[key]);
  }
}

/** Load all settings, opened. */
export async function loadSettingsMap(decryptBytes: DecryptBytes): Promise<Record<string, unknown>> {
  const all = await settingsApi.getAll();
  const map: Record<string, unknown> = {};
  for (const s of all) map[s.key] = s.value;
  await openSettingsMap(map, decryptBytes);
  honourEgress(map);
  return map;
}

/** `savePrivateSetting(key, value)` — seals with the master key, then saves. */
export function usePrivateSettings() {
  const { encryptBytes, decryptBytes } = useEncryption();
  const savePrivateSetting = useCallback(async (key: PrivateSettingKey, value: unknown) => {
    await settingsApi.upsert(key, await sealSetting(key, value, encryptBytes));
  }, [encryptBytes]);
  const loadPrivateSettings = useCallback(() => loadSettingsMap(decryptBytes), [decryptBytes]);
  return { savePrivateSetting, loadPrivateSettings };
}
