/**
 * Security audit unit tests — shared encryption
 * Tests for all encryption security fixes applied during the audit
 */
import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// 1. toNonExtractable — multi-pass key material zeroing
// ============================================================================
describe('toNonExtractable — key material cleanup', () => {
  it('returns a non-extractable key', async () => {
    const { generateMasterKey, toNonExtractable } = await import('../crypto/primitives.js');
    const extractable = await generateMasterKey();
    expect(extractable.extractable).toBe(true);

    const nonExtractable = await toNonExtractable(extractable);
    expect(nonExtractable.extractable).toBe(false);
    expect(nonExtractable.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect(nonExtractable.usages).toContain('encrypt');
    expect(nonExtractable.usages).toContain('decrypt');
  });

  it('non-extractable key cannot be exported', async () => {
    const { generateMasterKey, toNonExtractable } = await import('../crypto/primitives.js');
    const extractable = await generateMasterKey();
    const nonExtractable = await toNonExtractable(extractable);

    await expect(
      crypto.subtle.exportKey('raw', nonExtractable)
    ).rejects.toThrow();
  });

  it('uses multi-pass zeroing in source code', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../crypto/primitives.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    // Should zero, randomize, then zero again
    expect(content).toContain('rawArray.fill(0)');
    expect(content).toContain('crypto.getRandomValues(rawArray)');
    // Should be in a finally block
    expect(content).toContain('finally');
  });
});

// ============================================================================
// 2. rewrapFromParams — intermediate buffer zeroing
// ============================================================================
describe('rewrapFromParams — buffer cleanup', () => {
  it('zeros intermediate buffers after rewrap', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../crypto/encryptionService.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const rewrapSection = content.split('async rewrapFromParams')[1]?.split('async ')[0] || '';
    // Should have try/finally for cleanup
    expect(rewrapSection).toContain('finally');
    // Should zero salt, wrappedMK, wrapIv
    expect(rewrapSection).toContain('salt.fill(0)');
    expect(rewrapSection).toContain('wrappedMK.fill(0)');
    expect(rewrapSection).toContain('wrapIv.fill(0)');
  });

  it('rewrapFromParams produces valid new wrapping', async () => {
    const { encryptionService } = await import('../crypto/encryptionService.js');
    const { encrypt, decrypt, toNonExtractable, unwrapKey, deriveKEK } = await import('../crypto/primitives.js');
    const { base64ToUint8Array } = await import('../crypto/encoding.js');

    const password = 'TestPassword123!';
    const newPassword = 'NewPassword456!';

    // Setup: create encryption params
    const setup = await encryptionService.setupEncryption(password);

    // Rewrap with new password
    const result = await encryptionService.rewrapFromParams(
      password,
      setup.salt,
      setup.wrappedMK,
      setup.wrapIv,
      600000,
      newPassword
    );

    expect(result.salt).toBeTruthy();
    expect(result.wrappedMK).toBeTruthy();
    expect(result.wrapIv).toBeTruthy();

    // Verify: unwrap with new password and check it works
    const newSalt = base64ToUint8Array(result.salt);
    const newWrappedMK = base64ToUint8Array(result.wrappedMK);
    const newWrapIv = base64ToUint8Array(result.wrapIv);
    const newKek = await deriveKEK(newPassword, newSalt, 600000);
    const unwrapped = await unwrapKey(newWrappedMK.buffer as ArrayBuffer, newKek, newWrapIv, false);

    // The unwrapped key should be able to encrypt/decrypt
    const testPlain = 'Hello Security Audit';
    const encrypted = await encrypt(unwrapped, testPlain);
    const decrypted = await decrypt(unwrapped, encrypted.ciphertext, encrypted.iv);
    expect(decrypted).toBe(testPlain);
  });
});

// ============================================================================
// 3. setupEncryption — master key is non-extractable after setup
// ============================================================================
describe('setupEncryption — key lifecycle', () => {
  it('returns non-extractable master key', async () => {
    const { encryptionService } = await import('../crypto/encryptionService.js');
    const result = await encryptionService.setupEncryption('TestPassword123!');
    expect(result.masterKey.extractable).toBe(false);
    expect(result.salt).toBeTruthy();
    expect(result.wrappedMK).toBeTruthy();
    expect(result.recoveryKey).toBeTruthy();
    expect(result.recoveryWrappedMK).toBeTruthy();
  });

  it('master key can encrypt and decrypt', async () => {
    const { encryptionService } = await import('../crypto/encryptionService.js');
    const result = await encryptionService.setupEncryption('TestPassword123!');

    const encrypted = await encryptionService.encryptPost(result.masterKey, 'Hello', { test: true });
    expect(encrypted.contentEncrypted).toBeTruthy();
    expect(encrypted.contentIv).toBeTruthy();
  });
});

// ============================================================================
// 4. unwrapWithRecoveryKey — returns extractable key for rewrap
// ============================================================================
describe('unwrapWithRecoveryKey', () => {
  it('returns extractable key that can be rewrapped', async () => {
    const { encryptionService } = await import('../crypto/encryptionService.js');
    const setup = await encryptionService.setupEncryption('TestPassword123!');

    const extractableKey = await encryptionService.unwrapWithRecoveryKey(
      setup.recoveryKey,
      setup.recoveryWrappedMK,
      setup.recoveryWrapIv
    );

    expect(extractableKey.extractable).toBe(true);

    // Should be rewrappable with new password
    const result = await encryptionService.rewrapMasterKey(extractableKey, 'NewPassword456!');
    expect(result.salt).toBeTruthy();
    expect(result.wrappedMK).toBeTruthy();
  });
});

// ============================================================================
// 5. AES-GCM — IV uniqueness
// ============================================================================
describe('AES-GCM IV generation', () => {
  it('generates unique IVs for each encryption operation', async () => {
    const { encryptionService } = await import('../crypto/encryptionService.js');
    const setup = await encryptionService.setupEncryption('TestPassword123!');

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        encryptionService.encryptPost(setup.masterKey, 'test', {})
      )
    );

    const ivs = results.map(r => r.contentIv);
    const uniqueIvs = new Set(ivs);
    expect(uniqueIvs.size).toBe(50);
  });

  it('IV is exactly 12 bytes (96 bits)', async () => {
    const { generateIv } = await import('../crypto/primitives.js');
    const iv = generateIv();
    expect(iv.length).toBe(12);
  });
});

// ============================================================================
// 6. PBKDF2 iterations — minimum 600,000
// ============================================================================
describe('PBKDF2 configuration', () => {
  it('uses 600,000 iterations (OWASP 2024)', async () => {
    const { PBKDF2_ITERATIONS } = await import('../crypto/constants.js');
    expect(PBKDF2_ITERATIONS).toBe(600000);
  });

  it('uses SHA-256 hash', async () => {
    const { PBKDF2_HASH } = await import('../crypto/constants.js');
    expect(PBKDF2_HASH).toBe('SHA-256');
  });

  it('salt is 16 bytes', async () => {
    const { PBKDF2_SALT_LENGTH } = await import('../crypto/constants.js');
    expect(PBKDF2_SALT_LENGTH).toBe(16);
  });

  it('recovery key is 32 bytes (256 bits)', async () => {
    const { RECOVERY_KEY_LENGTH } = await import('../crypto/constants.js');
    expect(RECOVERY_KEY_LENGTH).toBe(32);
  });
});

// ============================================================================
// 7. decryptPost — logs metadata parse failures instead of silent fail
// ============================================================================
describe('decryptPost metadata error handling', () => {
  it('logs warning on metadata parse failure', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../crypto/encryptionService.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    // Should log a warning, not silently swallow
    expect(content).toContain('console.warn');
    expect(content).toContain('Metadata parsing failed');
    // The catch block should have err parameter
    expect(content).toMatch(/catch\s*\(err\)/);
  });
});

// ============================================================================
// 8. Encrypt/Decrypt round-trip integrity
// ============================================================================
describe('Encrypt/Decrypt round-trip', () => {
  it('preserves content and metadata through encrypt/decrypt cycle', async () => {
    const { encryptionService } = await import('../crypto/encryptionService.js');
    const setup = await encryptionService.setupEncryption('TestPassword123!');

    const content = '<p>Hello <strong>World</strong></p>';
    const metadata = { title: 'Test Entry', tags: ['audit', 'security'] };

    const encrypted = await encryptionService.encryptPost(setup.masterKey, content, metadata);
    const decrypted = await encryptionService.decryptPost(setup.masterKey, {
      id: 1,
      content: null,
      metadata: null,
      contentEncrypted: encrypted.contentEncrypted,
      contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted,
      metadataIv: encrypted.metadataIv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(decrypted.content).toBe(content);
    expect(decrypted.metadata).toEqual(metadata);
    expect(decrypted.isEncrypted).toBe(true);
  });

  it('wrong key fails to decrypt', async () => {
    const { encryptionService } = await import('../crypto/encryptionService.js');
    const setup1 = await encryptionService.setupEncryption('Password1_abc!');
    const setup2 = await encryptionService.setupEncryption('Password2_def!');

    const encrypted = await encryptionService.encryptPost(setup1.masterKey, 'secret', {});

    await expect(
      encryptionService.decryptPost(setup2.masterKey, {
        id: 1,
        content: null,
        metadata: null,
        contentEncrypted: encrypted.contentEncrypted,
        contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted,
        metadataIv: encrypted.metadataIv,
        isEncrypted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).rejects.toThrow();
  });
});

// ============================================================================
// 9. Validation schemas — metadata size limit
// ============================================================================
describe('Validation schema security', () => {
  it('post schemas refuse plaintext entries', async () => {
    const { createPostSchema } = await import('../validation/schemas.js');

    const result = createPostSchema.safeParse({
      content: 'test',
      metadata: { title: 'My Entry', tags: ['a', 'b'] },
    });

    expect(result.success).toBe(false);
  });

  it('registerSchema requires recoveryKeySalt', async () => {
    const { registerSchema } = await import('../validation/schemas.js');

    const result = registerSchema.safeParse({
      email: 'test@example.com',
      username: 'testuser',
      password: 'TestPassword123!',
      encryptedMasterKey: 'abc',
      kekSalt: 'abc',
      kekWrapIv: 'abc',
      recoveryWrappedMK: 'abc',
      recoveryWrapIv: 'abc',
      recoveryKeyHash: 'abc',
      // Missing recoveryKeySalt
    });

    expect(result.success).toBe(false);
  });

  it('registerSchema accepts complete payload with recoveryKeySalt', async () => {
    const { registerSchema } = await import('../validation/schemas.js');

    const result = registerSchema.safeParse({
      email: 'test@example.com',
      username: 'testuser',
      password: 'TestPassword123!',
      encryptedMasterKey: 'abc',
      kekSalt: 'abc',
      kekWrapIv: 'abc',
      recoveryWrappedMK: 'abc',
      recoveryWrapIv: 'abc',
      recoveryKeyHash: 'abc',
      recoveryKeySalt: 'abc',
    });

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// 10. RECOVERY_PBKDF2_ITERATIONS constant
// ============================================================================
describe('RECOVERY_PBKDF2_ITERATIONS constant', () => {
  it('equals 600000 to match KEK iterations', async () => {
    const { RECOVERY_PBKDF2_ITERATIONS } = await import('../crypto/constants.js');
    expect(RECOVERY_PBKDF2_ITERATIONS).toBe(600000);
  });

  it('matches PBKDF2_ITERATIONS for consistent security', async () => {
    const { PBKDF2_ITERATIONS, RECOVERY_PBKDF2_ITERATIONS } = await import('../crypto/constants.js');
    expect(RECOVERY_PBKDF2_ITERATIONS).toBe(PBKDF2_ITERATIONS);
  });
});
