import { describe, it, expect, vi } from 'vitest';

const upsert = vi.fn().mockResolvedValue({});
vi.mock('../../services/api.js', () => ({ settings: { upsert: (...a: unknown[]) => upsert(...a), getAll: vi.fn() } }));
vi.mock('../../contexts/EncryptionContext.js', () => ({ useEncryption: () => ({}) }));

import { sealValue, openPrivateSettings, migratePrivateSettings, isSealed, PRIVATE_SETTING_KEYS } from '../../services/privateSettings.js';
import { featureFlagsFrom } from '../../utils/featureFlags.js';

// Stand-in cipher: reverses the bytes, so ciphertext never equals plaintext
const encryptBytes = async (data: ArrayBuffer) => ({ ciphertext: new Uint8Array(data).slice().reverse().buffer, iv: 'iv' });
const decryptBytes = async (ct: ArrayBuffer) => new Uint8Array(ct).slice().reverse().buffer;

describe('private settings', () => {
  it('seals a value so the server never sees it, and opens it again', async () => {
    const sealed = await sealValue('Portland, OR', encryptBytes);
    expect(isSealed(sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain('Portland');

    const map: Record<string, unknown> = { weatherCity: sealed, themeMode: 'dark' };
    expect(await openPrivateSettings(map, decryptBytes)).toEqual([]);
    expect(map).toEqual({ weatherCity: 'Portland, OR', themeMode: 'dark' });
  });

  it('reports old plaintext values and re-saves them sealed', async () => {
    const map: Record<string, unknown> = { displayName: 'Alex', plannerFilters: [{ name: 'x' }], accentColor: '#fff' };
    const legacy = await openPrivateSettings(map, decryptBytes);
    expect(legacy.sort()).toEqual(['displayName', 'plannerFilters']);

    await migratePrivateSettings(map, legacy, encryptBytes);
    expect(upsert).toHaveBeenCalledTimes(2);
    for (const [key, value] of upsert.mock.calls) {
      expect(isSealed(value)).toBe(true);
      expect(JSON.stringify(value)).not.toContain(key === 'displayName' ? 'Alex' : 'name');
    }
  });

  it('drops a value that will not decrypt so callers fall back to defaults', async () => {
    const map: Record<string, unknown> = { timezone: { ciphertext: 'AAAA', iv: 'x' } };
    await openPrivateSettings(map, async () => { throw new Error('bad'); });
    expect(map).toEqual({});
  });

  it('treats every feature switch, Cycle Tracking and feed details as private', async () => {
    for (const key of ['medicationEnabled', 'foodEnabled', 'allergiesEnabled', 'financeEnabled', 'cycleTrackingEnabled', 'icsIncludeDetails']) {
      expect(PRIVATE_SETTING_KEYS).toContain(key);
    }
    // Plaintext switches from before are reported for sealing; sealed ones open to booleans the flag reader understands
    const map: Record<string, unknown> = {
      medicationEnabled: false,
      cycleTrackingEnabled: await sealValue(true, encryptBytes),
      themeMode: 'dark',
    };
    expect(await openPrivateSettings(map, decryptBytes)).toEqual(['medicationEnabled']);
    expect(map.cycleTrackingEnabled).toBe(true);
    expect(featureFlagsFrom(map).medicationEnabled).toBe(false);
  });
});
