import { describe, it, expect, beforeEach } from 'vitest';
import { sealSetting, openSetting, trackGuardedSave, noteSettingRemoved } from '../../services/settingCipher.js';
import { setEgressAccount } from '../../services/deviceConsent.js';
import { generateMasterKey, encryptBytes as rawEncryptBytes, decryptBytes as rawDecryptBytes } from '@shared/crypto/primitives.js';

let key: CryptoKey;
const encryptBytes = (data: ArrayBuffer, aad?: string) => rawEncryptBytes(key, data, aad);
const decryptBytes = (ciphertext: ArrayBuffer, iv: string, aad?: string) => rawDecryptBytes(key, ciphertext, iv, aad);
let n = 0;

beforeEach(async () => {
  localStorage.clear();
  key = await generateMasterKey();
  // A fresh account tag each test: revisions are kept per account
  setEgressAccount(`acct-${n++}`);
});

describe('rollback guard for the AI and image-bucket settings', () => {
  it('once the server has taken a save, the value it replaced no longer opens', async () => {
    const first = await sealSetting('aiConfig', { provider: 'claude' }, encryptBytes);
    await trackGuardedSave('aiConfig', async () => undefined);
    const second = await sealSetting('aiConfig', { provider: 'openai' }, encryptBytes);
    await trackGuardedSave('aiConfig', async () => undefined);
    await expect(openSetting('aiConfig', first, decryptBytes)).rejects.toThrow(/older/);
    expect(await openSetting('aiConfig', second, decryptBytes)).toEqual({ provider: 'openai' });
  });

  it('a save that never reached the server changes nothing: what it still holds keeps opening', async () => {
    const first = await sealSetting('aiConfig', { provider: 'claude' }, encryptBytes);
    await trackGuardedSave('aiConfig', async () => undefined);
    await sealSetting('aiConfig', { provider: 'openai' }, encryptBytes);
    await expect(trackGuardedSave('aiConfig', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(await openSetting('aiConfig', first, decryptBytes)).toEqual({ provider: 'claude' });
  });

  it('two saves in flight at once: whichever the server kept still opens', async () => {
    const a = await sealSetting('aiConfig', { model: 'a' }, encryptBytes);
    const b = await sealSetting('aiConfig', { model: 'b' }, encryptBytes);
    let landA!: () => void; let landB!: () => void;
    const sendA = trackGuardedSave('aiConfig', () => new Promise<void>(r => { landA = r; }));
    const sendB = trackGuardedSave('aiConfig', () => new Promise<void>(r => { landB = r; }));
    landB(); landA();
    await Promise.all([sendA, sendB]);
    expect(await openSetting('aiConfig', a, decryptBytes)).toEqual({ model: 'a' });
    expect(await openSetting('aiConfig', b, decryptBytes)).toEqual({ model: 'b' });
  });

  it('removing the setting shuts out everything written before, and a new one opens', async () => {
    const old = await sealSetting('imageStorageConfig', { bucket: 'old' }, encryptBytes);
    await trackGuardedSave('imageStorageConfig', async () => undefined);
    noteSettingRemoved('imageStorageConfig');
    await expect(openSetting('imageStorageConfig', old, decryptBytes)).rejects.toThrow(/older/);
    const fresh = await sealSetting('imageStorageConfig', { bucket: 'new' }, encryptBytes);
    await trackGuardedSave('imageStorageConfig', async () => undefined);
    expect(await openSetting('imageStorageConfig', fresh, decryptBytes)).toEqual({ bucket: 'new' });
  });
});
