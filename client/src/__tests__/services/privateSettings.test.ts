import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn().mockResolvedValue({});
const getStatus = vi.fn().mockResolvedValue({ icsEnabled: false });
vi.mock('../../services/api.js', () => ({
  settings: { upsert: (...a: unknown[]) => upsert(...a), getAll: vi.fn() },
  calendar: { getStatus: () => getStatus() },
}));
vi.mock('../../contexts/EncryptionContext.js', () => ({ useEncryption: () => ({}) }));

import {
  sealSetting, openSettingsMap, migrateSettings, openStartupSettings, isSealed, settingAad,
  PRIVATE_SETTING_KEYS, SEAL_MARKER_KEY,
} from '../../services/privateSettings.js';
import { openForExport } from '../../services/settingCipher.js';
import { featureFlagsFrom } from '../../utils/featureFlags.js';
import { encrypt, generateMasterKey } from '@shared/crypto/primitives.js';
import { encryptBytes as rawEncryptBytes, decryptBytes as rawDecryptBytes } from '@shared/crypto/primitives.js';
import { arrayBufferToBase64 } from '@shared/crypto/encoding.js';

// Real AES-GCM, so AAD binding is actually checked
let key: CryptoKey;
const encryptBytes = (data: ArrayBuffer, aad?: string) => rawEncryptBytes(key, data, aad);
const decryptBytes = (ct: ArrayBuffer, iv: string, aad?: string) => rawDecryptBytes(key, ct, iv, aad);
/** A value sealed the pre-v2 way: no AAD, no `v` */
async function unbound(value: unknown) {
  const { ciphertext, iv } = await rawEncryptBytes(key, new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer);
  return { ciphertext: arrayBufferToBase64(ciphertext), iv };
}

beforeEach(async () => {
  key = await generateMasterKey();
  upsert.mockClear();
  getStatus.mockClear();
});

describe('settings sealing', () => {
  it('seals a value bound to its key, so the server never sees it, and opens it again', async () => {
    const sealed = await sealSetting('weatherCity', 'Portland, OR', encryptBytes);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed.v).toBe(2);
    expect(JSON.stringify(sealed)).not.toContain('Portland');

    const map: Record<string, unknown> = { weatherCity: sealed, themeMode: 'dark', [SEAL_MARKER_KEY]: await sealSetting(SEAL_MARKER_KEY, true, encryptBytes) };
    expect(await openSettingsMap(map, decryptBytes)).toEqual({ toReseal: [], migrated: true });
    expect(map).toEqual({ weatherCity: 'Portland, OR', themeMode: 'dark' });
  });

  it('will not open a ciphertext moved to another setting', async () => {
    const financeOn = await sealSetting('financeEnabled', true, encryptBytes);
    const map: Record<string, unknown> = { icsIncludeDetails: financeOn };
    await openSettingsMap(map, decryptBytes);
    expect(map.icsIncludeDetails).toBeUndefined();
    expect(settingAad('icsIncludeDetails')).toBe('chronicles:setting:v2:icsIncludeDetails');
  });

  it('drops a value that will not decrypt so callers fall back to defaults', async () => {
    const map: Record<string, unknown> = { timezone: { ciphertext: 'AAAA', iv: 'AAAAAAAAAAAAAAAA', v: 2 } };
    await openSettingsMap(map, decryptBytes);
    expect(map).toEqual({});
  });
});

describe('the one-time move to v2', () => {
  it('before the marker: opens unbound values, re-seals them bound, seeds the feed switch, then writes the marker', async () => {
    getStatus.mockResolvedValue({ icsEnabled: true });
    const map: Record<string, unknown> = {
      nutritionGoals: await unbound({ iron: 18 }),
      calendarSyncEnabled: true, // private since v2: its plaintext is sealed this once
      themeMode: 'dark',
    };
    const opened = await openSettingsMap(map, decryptBytes);
    expect(opened.migrated).toBe(false);
    expect(opened.toReseal.sort()).toEqual(['calendarSyncEnabled', 'nutritionGoals']);
    expect(map.nutritionGoals).toEqual({ iron: 18 });

    const resealed = await migrateSettings(map, opened, encryptBytes);
    const written = Object.fromEntries(upsert.mock.calls);
    expect(Object.keys(written).sort()).toEqual(['calendarSyncEnabled', 'icsFeedEnabled', 'nutritionGoals', SEAL_MARKER_KEY].sort());
    for (const v of Object.values(written)) expect((v as { v?: number }).v).toBe(2);
    expect(resealed.nutritionGoals).toBe(written.nutritionGoals);
    expect(map.icsFeedEnabled).toBe(true);
    // The marker is written last
    expect(upsert.mock.calls.at(-1)?.[0]).toBe(SEAL_MARKER_KEY);
  });

  it('writes no marker when a re-seal fails, so the next load tries again', async () => {
    upsert.mockRejectedValueOnce(new Error('offline'));
    const map: Record<string, unknown> = { dashboardConfig: await unbound({ hidden: [] }) };
    const opened = await openSettingsMap(map, decryptBytes);
    await expect(migrateSettings(map, opened, encryptBytes)).rejects.toThrow('offline');
    expect(upsert.mock.calls.map(c => c[0])).not.toContain(SEAL_MARKER_KEY);
  });

  it('after the marker: refuses unbound values (an old ciphertext replayed) and private plaintext', async () => {
    const map: Record<string, unknown> = {
      [SEAL_MARKER_KEY]: await sealSetting(SEAL_MARKER_KEY, true, encryptBytes),
      icsIncludeDetails: await unbound(true),
      calendarSyncEnabled: true,
      displayName: 'Planted',
      accentColor: '#fff',
    };
    const opened = await openSettingsMap(map, decryptBytes);
    expect(opened).toEqual({ toReseal: [], migrated: true });
    expect(map).toEqual({ accentColor: '#fff' });
    await migrateSettings(map, opened, encryptBytes);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never accepts plaintext for keys that were already private, even before the marker', async () => {
    const map: Record<string, unknown> = { icsIncludeDetails: true, financeEnabled: true, displayName: 'Alex' };
    const opened = await openSettingsMap(map, decryptBytes);
    expect(opened.toReseal).toEqual([]);
    expect(map).toEqual({});
  });

  it('a marker that does not open still counts as migrated (the safe side)', async () => {
    const map: Record<string, unknown> = { [SEAL_MARKER_KEY]: { ciphertext: 'AAAA', iv: 'AAAAAAAAAAAAAAAA', v: 2 }, timezone: await unbound('UTC') };
    expect((await openSettingsMap(map, decryptBytes)).migrated).toBe(true);
    expect(map.timezone).toBeUndefined();
  });

  it('startup hands the loaders the freshly re-sealed blob', async () => {
    const old = await unbound({ provider: 'claude' });
    const { map, sealed } = await openStartupSettings([{ key: 'aiConfig', value: old }], decryptBytes, encryptBytes);
    expect(map.aiConfig).toEqual({ provider: 'claude' });
    expect((sealed('aiConfig') as { v?: number }).v).toBe(2);
  });
});

describe('private keys', () => {
  it('treats every feature switch, Cycle Tracking, the calendar switches and feed details as private', async () => {
    for (const k of ['medicationEnabled', 'foodEnabled', 'allergiesEnabled', 'financeEnabled', 'cycleTrackingEnabled',
      'icsIncludeDetails', 'icsFeedEnabled', 'calendarSyncEnabled', 'googleCalendarId', 'imagesEnabled', 'topicHideText']) {
      expect(PRIVATE_SETTING_KEYS).toContain(k);
    }
    const map: Record<string, unknown> = {
      [SEAL_MARKER_KEY]: await sealSetting(SEAL_MARKER_KEY, true, encryptBytes),
      medicationEnabled: await sealSetting('medicationEnabled', false, encryptBytes),
    };
    await openSettingsMap(map, decryptBytes);
    expect(featureFlagsFrom(map).medicationEnabled).toBe(false);
  });

  it('Export All still opens a pre-v2 value', async () => {
    expect(await openForExport('timezone', await unbound('UTC'), decryptBytes)).toBe('UTC');
    // and a post (string AAD) ciphertext is not a setting
    const post = await encrypt(key, '"x"', { aad: 'chronicles:post:v2:content:abc' });
    await expect(openForExport('timezone', { ciphertext: post.ciphertext, iv: post.iv, v: 2 }, decryptBytes)).rejects.toThrow();
  });
});
