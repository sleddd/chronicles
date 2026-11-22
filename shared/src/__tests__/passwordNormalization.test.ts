import { describe, it, expect } from 'vitest';
import { deriveAuthSecret, legacyPasswordForm, normalizePassword } from '../crypto/authSecret.js';
import { encryptionService } from '../crypto/encryptionService.js';
import { deriveKEK, generateIv, generateMasterKey, generateSalt, wrapKey } from '../crypto/primitives.js';
import { PBKDF2_ITERATIONS } from '../crypto/constants.js';
import { uint8ArrayToBase64 } from '../crypto/encoding.js';

// "café" typed two ways: one precomposed é, or e + a combining accent
const COMPOSED = 'Café-Password-1!';
const DECOMPOSED = 'Café-Password-1!';

describe('password normalization', () => {
  it('spells the same password the same way however it was typed', () => {
    expect(COMPOSED).not.toBe(DECOMPOSED);
    expect(normalizePassword(DECOMPOSED)).toBe(normalizePassword(COMPOSED));
    expect(normalizePassword('Plain-ascii-1!')).toBe('Plain-ascii-1!');
  });

  it('names the as-typed form only when normalizing changes it', () => {
    expect(legacyPasswordForm('Plain-ascii-1!')).toBeNull();
    expect(legacyPasswordForm(DECOMPOSED)).toBe(DECOMPOSED);
  });

  it('gives one sign-in secret for both spellings, and the old one as typed', async () => {
    const a = await deriveAuthSecret(COMPOSED, 'a@b.c', 1000);
    expect(await deriveAuthSecret(DECOMPOSED, 'a@b.c', 1000)).toBe(a);
    expect(await deriveAuthSecret(DECOMPOSED, 'a@b.c', 1000, { asTyped: true })).not.toBe(a);
  });

  it('opens a new wrap from either spelling', async () => {
    const setup = await encryptionService.setupEncryption(COMPOSED);
    await expect(encryptionService.unwrapMasterKey(DECOMPOSED, setup.salt, setup.wrappedMK, setup.wrapIv, PBKDF2_ITERATIONS)).resolves.toBeDefined();
  });

  it('still opens a wrap made from the password as typed before normalization', async () => {
    const mk = await generateMasterKey();
    const salt = generateSalt();
    const iv = generateIv();
    const wrapped = await wrapKey(mk, await deriveKEK(DECOMPOSED, salt, PBKDF2_ITERATIONS, true), iv, 'kek-wrap');
    const args = [uint8ArrayToBase64(salt), uint8ArrayToBase64(new Uint8Array(wrapped)), uint8ArrayToBase64(iv), PBKDF2_ITERATIONS] as const;
    await expect(encryptionService.unwrapMasterKey(DECOMPOSED, ...args)).resolves.toBeDefined();
    await expect(encryptionService.unwrapMasterKey('Wrong-Password-1!', ...args)).rejects.toThrow();
  });
});

describe('re-key: the old key carried under the new one', () => {
  it('opens only under the new key and its own re-key id, and still decrypts old data', async () => {
    const old = await generateMasterKey();
    const { encrypt, decrypt } = await import('../crypto/primitives.js');
    const sealedData = await encrypt(old, 'a private line');
    const fresh = await encryptionService.setupEncryption('New-Password-123!');
    const id = 'a'.repeat(32);
    const carried = await encryptionService.sealOldKey(fresh.masterKey, old, id);
    const reopened = await encryptionService.openOldKey(fresh.masterKey, carried.oldKey, carried.oldKeyIv, id);
    expect(reopened.extractable).toBe(false);
    expect(await decrypt(reopened, sealedData.ciphertext, sealedData.iv)).toBe('a private line');
    await expect(encryptionService.openOldKey(fresh.masterKey, carried.oldKey, carried.oldKeyIv, 'b'.repeat(32))).rejects.toThrow();
    const other = await encryptionService.setupEncryption('Other-Password-123!');
    await expect(encryptionService.openOldKey(other.masterKey, carried.oldKey, carried.oldKeyIv, id)).rejects.toThrow();
  });
});
