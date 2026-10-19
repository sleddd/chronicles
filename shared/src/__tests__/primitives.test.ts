/**
 * Unit tests for crypto primitives (Web Crypto wrappers)
 */
import { describe, it, expect } from 'vitest';
import {
  generateMasterKey,
  generateRecoveryKey,
  generateSalt,
  generateIv,
  deriveKEK,
  importRawKey,
  wrapKey,
  unwrapKey,
  toNonExtractable,
  encrypt,
  decrypt,
} from '../crypto/primitives.js';
import type { WrapPurpose } from '../crypto/primitives.js';
import {
  AES_KEY_LENGTH,
  IV_LENGTH,
  PBKDF2_SALT_LENGTH,
  RECOVERY_KEY_LENGTH,
} from '../crypto/constants.js';

// ============================================================================
// Key generation
// ============================================================================
describe('generateMasterKey', () => {
  it('returns an extractable AES-256-GCM CryptoKey', async () => {
    const key = await generateMasterKey();
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.extractable).toBe(true);
    expect(key.algorithm).toEqual({ name: 'AES-GCM', length: AES_KEY_LENGTH });
    expect(key.usages).toContain('encrypt');
    expect(key.usages).toContain('decrypt');
  });

  it('generates unique keys each time', async () => {
    const key1 = await generateMasterKey();
    const key2 = await generateMasterKey();
    const raw1 = new Uint8Array(await crypto.subtle.exportKey('raw', key1));
    const raw2 = new Uint8Array(await crypto.subtle.exportKey('raw', key2));
    expect(raw1).not.toEqual(raw2);
  });
});

describe('generateRecoveryKey', () => {
  it('returns 32 bytes', () => {
    const key = generateRecoveryKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(RECOVERY_KEY_LENGTH);
  });

  it('produces different keys each call', () => {
    const a = generateRecoveryKey();
    const b = generateRecoveryKey();
    expect(a).not.toEqual(b);
  });
});

describe('generateSalt', () => {
  it('returns 16 bytes', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(PBKDF2_SALT_LENGTH);
  });
});

describe('generateIv', () => {
  it('returns 12 bytes', () => {
    const iv = generateIv();
    expect(iv).toBeInstanceOf(Uint8Array);
    expect(iv.length).toBe(IV_LENGTH);
  });
});

// ============================================================================
// deriveKEK
// ============================================================================
describe('deriveKEK', () => {
  it('returns a non-extractable AES-256-GCM key with wrapKey/unwrapKey usages', async () => {
    const salt = generateSalt();
    const kek = await deriveKEK('password123', salt, 1000);
    expect(kek).toBeInstanceOf(CryptoKey);
    expect(kek.extractable).toBe(false);
    expect(kek.algorithm).toEqual({ name: 'AES-GCM', length: AES_KEY_LENGTH });
    expect(kek.usages).toContain('wrapKey');
    expect(kek.usages).toContain('unwrapKey');
  });

  it('derives the same key from the same password and salt', async () => {
    const salt = generateSalt();
    const kek1 = await deriveKEK('testpassword', salt, 1000);
    const kek2 = await deriveKEK('testpassword', salt, 1000);
    // Cannot compare directly since non-extractable, but we can verify both
    // successfully wrap/unwrap the same key
    const masterKey = await generateMasterKey();
    const iv = generateIv();
    const wrapped = await wrapKey(masterKey, kek1, iv, 'kek-wrap');
    // If kek2 is the same derived key, unwrapping should succeed
    const unwrapped = await unwrapKey(wrapped, kek2, iv, false, 'kek-wrap');
    expect(unwrapped).toBeInstanceOf(CryptoKey);
  });

  it('derives different keys from different passwords', async () => {
    const salt = generateSalt();
    const kek1 = await deriveKEK('password1', salt, 1000);
    const kek2 = await deriveKEK('password2', salt, 1000);
    const masterKey = await generateMasterKey();
    const iv = generateIv();
    const wrapped = await wrapKey(masterKey, kek1, iv, 'kek-wrap');
    // kek2 should fail to unwrap
    await expect(unwrapKey(wrapped, kek2, iv, false, 'kek-wrap')).rejects.toThrow();
  });

  it('derives different keys from different salts', async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const kek1 = await deriveKEK('samepassword', salt1, 1000);
    const kek2 = await deriveKEK('samepassword', salt2, 1000);
    const masterKey = await generateMasterKey();
    const iv = generateIv();
    const wrapped = await wrapKey(masterKey, kek1, iv, 'kek-wrap');
    await expect(unwrapKey(wrapped, kek2, iv, false, 'kek-wrap')).rejects.toThrow();
  });
});

// ============================================================================
// importRawKey
// ============================================================================
describe('importRawKey', () => {
  it('returns a non-extractable AES-256-GCM key with wrapKey/unwrapKey usages', async () => {
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const key = await importRawKey(keyBytes);
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toEqual({ name: 'AES-GCM', length: AES_KEY_LENGTH });
    expect(key.usages).toContain('wrapKey');
    expect(key.usages).toContain('unwrapKey');
  });
});

// ============================================================================
// wrapKey / unwrapKey
// ============================================================================
describe('wrapKey / unwrapKey', () => {
  it('roundtrips with kek-wrap purpose', async () => {
    const masterKey = await generateMasterKey();
    const salt = generateSalt();
    const kek = await deriveKEK('password', salt, 1000);
    const iv = generateIv();

    const wrapped = await wrapKey(masterKey, kek, iv, 'kek-wrap');
    expect(wrapped).toBeInstanceOf(ArrayBuffer);
    expect(wrapped.byteLength).toBeGreaterThan(0);

    const unwrapped = await unwrapKey(wrapped, kek, iv, true, 'kek-wrap');
    // Verify same key material
    const originalRaw = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey));
    const unwrappedRaw = new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped));
    expect(unwrappedRaw).toEqual(originalRaw);
  });

  it('roundtrips with recovery-wrap purpose', async () => {
    const masterKey = await generateMasterKey();
    const recoveryKeyBytes = generateRecoveryKey();
    const recoveryKey = await importRawKey(recoveryKeyBytes);
    const iv = generateIv();

    const wrapped = await wrapKey(masterKey, recoveryKey, iv, 'recovery-wrap');
    const unwrapped = await unwrapKey(wrapped, recoveryKey, iv, true, 'recovery-wrap');

    const originalRaw = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey));
    const unwrappedRaw = new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped));
    expect(unwrappedRaw).toEqual(originalRaw);
  });

  it('fails when unwrapping with wrong purpose (AAD mismatch)', async () => {
    const masterKey = await generateMasterKey();
    const salt = generateSalt();
    const kek = await deriveKEK('password', salt, 1000);
    const iv = generateIv();

    // Wrap with kek-wrap, try to unwrap with recovery-wrap
    const wrapped = await wrapKey(masterKey, kek, iv, 'kek-wrap');
    await expect(
      unwrapKey(wrapped, kek, iv, false, 'recovery-wrap')
    ).rejects.toThrow();
  });

  it('unwrapKey returns non-extractable by default', async () => {
    const masterKey = await generateMasterKey();
    const salt = generateSalt();
    const kek = await deriveKEK('password', salt, 1000);
    const iv = generateIv();

    const wrapped = await wrapKey(masterKey, kek, iv, 'kek-wrap');
    const unwrapped = await unwrapKey(wrapped, kek, iv); // defaults: extractable=false, purpose='kek-wrap'
    expect(unwrapped.extractable).toBe(false);
    expect(unwrapped.usages).toContain('encrypt');
    expect(unwrapped.usages).toContain('decrypt');
  });

  it('unwrapKey returns extractable when requested', async () => {
    const masterKey = await generateMasterKey();
    const salt = generateSalt();
    const kek = await deriveKEK('password', salt, 1000);
    const iv = generateIv();

    const wrapped = await wrapKey(masterKey, kek, iv, 'kek-wrap');
    const unwrapped = await unwrapKey(wrapped, kek, iv, true, 'kek-wrap');
    expect(unwrapped.extractable).toBe(true);
  });

  it('fails when unwrapping with wrong key', async () => {
    const masterKey = await generateMasterKey();
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const kek1 = await deriveKEK('password1', salt1, 1000);
    const kek2 = await deriveKEK('password2', salt2, 1000);
    const iv = generateIv();

    const wrapped = await wrapKey(masterKey, kek1, iv, 'kek-wrap');
    await expect(unwrapKey(wrapped, kek2, iv, false, 'kek-wrap')).rejects.toThrow();
  });

  it('defaults to kek-wrap purpose', async () => {
    const masterKey = await generateMasterKey();
    const salt = generateSalt();
    const kek = await deriveKEK('password', salt, 1000);
    const iv = generateIv();

    // wrapKey default purpose is 'kek-wrap'
    const wrapped = await wrapKey(masterKey, kek, iv);
    // unwrapKey default purpose is 'kek-wrap' — should match
    const unwrapped = await unwrapKey(wrapped, kek, iv, true);
    const originalRaw = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey));
    const unwrappedRaw = new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped));
    expect(unwrappedRaw).toEqual(originalRaw);
  });
});

// ============================================================================
// WrapPurpose type
// ============================================================================
describe('WrapPurpose type', () => {
  it('accepts valid purpose strings', async () => {
    const purposes: WrapPurpose[] = ['kek-wrap', 'recovery-wrap'];
    expect(purposes).toHaveLength(2);
    // Type-level check — these should compile
    const p1: WrapPurpose = 'kek-wrap';
    const p2: WrapPurpose = 'recovery-wrap';
    expect(p1).toBe('kek-wrap');
    expect(p2).toBe('recovery-wrap');
  });
});

// ============================================================================
// toNonExtractable
// ============================================================================
describe('toNonExtractable', () => {
  it('converts an extractable key to non-extractable', async () => {
    const extractable = await generateMasterKey();
    expect(extractable.extractable).toBe(true);

    const nonExtractable = await toNonExtractable(extractable);
    expect(nonExtractable.extractable).toBe(false);
    expect(nonExtractable.algorithm).toEqual({ name: 'AES-GCM', length: AES_KEY_LENGTH });
    expect(nonExtractable.usages).toContain('encrypt');
    expect(nonExtractable.usages).toContain('decrypt');
  });

  it('preserves the key material (can encrypt/decrypt with same data)', async () => {
    const extractable = await generateMasterKey();
    const nonExtractable = await toNonExtractable(extractable);

    // Encrypt with extractable, decrypt with non-extractable
    const { ciphertext, iv } = await encrypt(extractable, 'test data');
    const decrypted = await decrypt(nonExtractable, ciphertext, iv);
    expect(decrypted).toBe('test data');
  });

  it('non-extractable key cannot be exported', async () => {
    const extractable = await generateMasterKey();
    const nonExtractable = await toNonExtractable(extractable);
    await expect(crypto.subtle.exportKey('raw', nonExtractable)).rejects.toThrow();
  });
});

// ============================================================================
// encrypt / decrypt
// ============================================================================
describe('encrypt / decrypt', () => {
  it('roundtrips plaintext', async () => {
    const key = await generateMasterKey();
    const plaintext = 'Hello, encrypted world!';
    const { ciphertext, iv } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('roundtrips empty string', async () => {
    const key = await generateMasterKey();
    const { ciphertext, iv } = await encrypt(key, '');
    const decrypted = await decrypt(key, ciphertext, iv);
    expect(decrypted).toBe('');
  });

  it('roundtrips unicode content', async () => {
    const key = await generateMasterKey();
    const plaintext = '\u{1F600} \u4F60\u597D world \u00E9\u00E8\u00EA';
    const { ciphertext, iv } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('roundtrips large content', async () => {
    const key = await generateMasterKey();
    const plaintext = 'A'.repeat(100000);
    const { ciphertext, iv } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const key = await generateMasterKey();
    const plaintext = 'same plaintext';
    const result1 = await encrypt(key, plaintext);
    const result2 = await encrypt(key, plaintext);

    expect(result1.ciphertext).not.toBe(result2.ciphertext);
    expect(result1.iv).not.toBe(result2.iv);
  });

  it('returns base64-encoded ciphertext and iv', async () => {
    const key = await generateMasterKey();
    const { ciphertext, iv } = await encrypt(key, 'test');
    expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('decrypt with wrong key fails', async () => {
    const key1 = await generateMasterKey();
    const key2 = await generateMasterKey();
    const { ciphertext, iv } = await encrypt(key1, 'secret');
    await expect(decrypt(key2, ciphertext, iv)).rejects.toThrow();
  });

  it('decrypt with wrong IV fails', async () => {
    const key = await generateMasterKey();
    const { ciphertext } = await encrypt(key, 'secret');
    // Use a different IV
    const wrongIv = await encrypt(key, 'other');
    await expect(decrypt(key, ciphertext, wrongIv.iv)).rejects.toThrow();
  });

  it('decrypt with tampered ciphertext fails', async () => {
    const key = await generateMasterKey();
    const { ciphertext, iv } = await encrypt(key, 'secret');
    // Tamper with the ciphertext by flipping a character
    const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith('AA') ? 'BB' : 'AA');
    await expect(decrypt(key, tampered, iv)).rejects.toThrow();
  });
});

describe('unwrapKey — AAD fallback', () => {
  it('refuses a password (kek) wrap without its purpose AAD', async () => {
    const masterKey = await generateMasterKey();
    const kek = await deriveKEK('correct horse battery staple', generateSalt(), 1000);
    const iv = generateIv();
    const old = await crypto.subtle.wrapKey('raw', masterKey, kek, { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer });
    await expect(unwrapKey(old, kek, iv, false, 'kek-wrap')).rejects.toThrow();
  });

  it('still opens an old no-AAD recovery wrap (it cannot be re-wrapped without the recovery key)', async () => {
    const masterKey = await generateMasterKey();
    const recoveryKey = await importRawKey(crypto.getRandomValues(new Uint8Array(32)));
    const iv = generateIv();
    const old = await crypto.subtle.wrapKey('raw', masterKey, recoveryKey, { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer });
    const key = await unwrapKey(old, recoveryKey, iv, false, 'recovery-wrap');
    const { ciphertext, iv: dataIv } = await encrypt(masterKey, 'hello');
    expect(await decrypt(key, ciphertext, dataIv)).toBe('hello');
  });
});

describe('deriveKEK — salt from the server', () => {
  it('refuses any salt that is not 16 bytes', async () => {
    await expect(deriveKEK('pw', new Uint8Array(15), 1000)).rejects.toThrow('Invalid key salt');
    await expect(deriveKEK('pw', new Uint8Array(17), 1000)).rejects.toThrow('Invalid key salt');
  });

  it("refuses the sign-in secret's salt, so a server can't turn authSecret into the KEK", async () => {
    const authSalt = new TextEncoder().encode('chronicles:auth:v1:user@example.com');
    await expect(deriveKEK('pw', authSalt, 600_000)).rejects.toThrow('Invalid key salt');
  });
});
