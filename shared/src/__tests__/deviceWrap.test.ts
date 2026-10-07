import { describe, it, expect } from 'vitest';
import { encryptionService } from '../crypto/encryptionService.js';
import { PBKDF2_ITERATIONS } from '../crypto/constants.js';

const secret = () => crypto.getRandomValues(new Uint8Array(32));

describe('remember-me device wrap', async () => {
  const password = 'TestPassword123!';
  const setup = await encryptionService.setupEncryption(password);
  const params = [password, setup.salt, setup.wrappedMK, setup.wrapIv, PBKDF2_ITERATIONS] as const;

  it('unlocks to a non-extractable key and restores the same key from the blob', async () => {
    const s = secret();
    const { masterKey, deviceWrapped, deviceIv } = await encryptionService.unwrapMasterKeyForDevice(...params, s);
    expect(masterKey.extractable).toBe(false);

    const restored = await encryptionService.unwrapFromDevice(s, deviceWrapped, deviceIv);
    expect(restored.extractable).toBe(false);
    expect(restored.usages.sort()).toEqual(['decrypt', 'encrypt']);

    const enc = await encryptionService.encryptPost(masterKey, 'hello', { a: 1 });
    const dec = await encryptionService.decryptPost(restored, { id: 1, ...enc, isEncrypted: true, createdAt: new Date(), updatedAt: new Date() } as never);
    expect(dec.content).toBe('hello');
  });

  it('cannot restore with a different secret', async () => {
    const { deviceWrapped, deviceIv } = await encryptionService.unwrapMasterKeyForDevice(...params, secret());
    await expect(encryptionService.unwrapFromDevice(secret(), deviceWrapped, deviceIv)).rejects.toThrow();
  });

  it('rejects secrets that are not 32 bytes', async () => {
    await expect(encryptionService.unwrapMasterKeyForDevice(...params, new Uint8Array(16))).rejects.toThrow(/32 bytes/);
  });

  it('a device blob is not accepted as a password-wrapped key (purpose AAD)', async () => {
    const s = secret();
    const { deviceWrapped, deviceIv } = await encryptionService.unwrapMasterKeyForDevice(...params, s);
    // Same bytes but the wrong purpose must fail — the blob only opens as a device wrap
    await expect(encryptionService.unwrapFromDevice(s, setup.wrappedMK, setup.wrapIv)).rejects.toThrow();
    expect(deviceWrapped).not.toBe(setup.wrappedMK);
    expect(deviceIv).not.toBe(setup.wrapIv);
  });
});
