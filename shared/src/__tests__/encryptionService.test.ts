/**
 * Unit tests for EncryptionService class
 */
import { describe, it, expect } from 'vitest';
import { encryptionService } from '../crypto/encryptionService.js';
import {
  generateMasterKey,
  deriveKEK,
  wrapKey,
  unwrapKey,
  toNonExtractable,
  generateSalt,
  generateIv,
  importRawKey,
  generateRecoveryKey,
  decrypt,
} from '../crypto/primitives.js';
import { uint8ArrayToBase64, base64ToUint8Array } from '../crypto/encoding.js';
import { PBKDF2_ITERATIONS } from '../crypto/constants.js';
import type { EncryptedPost } from '../crypto/types.js';

// Use low iterations for fast tests
const TEST_ITERATIONS = 1000;


/** Decrypt an encryptPost() result's content (the halves are AAD-bound, so go through decryptPost). */
async function decryptContent(key: CryptoKey, enc: { contentEncrypted: string; contentIv: string; metadataEncrypted: string; metadataIv: string }): Promise<string> {
  const post = await encryptionService.decryptPost(key, { id: 1, ...enc, isEncrypted: true, createdAt: new Date(), updatedAt: new Date() });
  return post.content;
}

/** Content half of a post saved before AAD binding. */
async function legacyContent(key: CryptoKey, text: string): Promise<{ contentEncrypted: string; contentIv: string }> {
  const { encrypt } = await import('../crypto/primitives.js');
  const { ciphertext, iv } = await encrypt(key, text);
  return { contentEncrypted: ciphertext, contentIv: iv };
}

// ============================================================================
// setupEncryption
// ============================================================================
describe('setupEncryption', () => {
  it('returns all required fields', async () => {
    const result = await encryptionService.setupEncryption('TestPassword123!');
    expect(result.salt).toBeDefined();
    expect(result.wrappedMK).toBeDefined();
    expect(result.wrapIv).toBeDefined();
    expect(result.recoveryKey).toBeDefined();
    expect(result.recoveryWrappedMK).toBeDefined();
    expect(result.recoveryWrapIv).toBeDefined();
    expect(result.masterKey).toBeDefined();
  });

  it('returns base64-encoded strings for all string fields', async () => {
    const result = await encryptionService.setupEncryption('TestPassword123!');
    const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
    expect(result.salt).toMatch(base64Pattern);
    expect(result.wrappedMK).toMatch(base64Pattern);
    expect(result.wrapIv).toMatch(base64Pattern);
    expect(result.recoveryKey).toMatch(base64Pattern);
    expect(result.recoveryWrappedMK).toMatch(base64Pattern);
    expect(result.recoveryWrapIv).toMatch(base64Pattern);
  });

  it('returns a non-extractable master key', async () => {
    const result = await encryptionService.setupEncryption('TestPassword123!');
    expect(result.masterKey).toBeInstanceOf(CryptoKey);
    expect(result.masterKey.extractable).toBe(false);
    expect(result.masterKey.usages).toContain('encrypt');
    expect(result.masterKey.usages).toContain('decrypt');
  });

  it('wrapped key can be unwrapped with the same password', async () => {
    const password = 'TestPassword123!';
    const result = await encryptionService.setupEncryption(password);

    // Unwrap using the same password and stored params
    const unwrapped = await encryptionService.unwrapMasterKey(
      password,
      result.salt,
      result.wrappedMK,
      result.wrapIv,
      PBKDF2_ITERATIONS
    );
    expect(unwrapped).toBeInstanceOf(CryptoKey);
    expect(unwrapped.extractable).toBe(false);
  });

  it('recovery-wrapped key can be unwrapped with the recovery key', async () => {
    const result = await encryptionService.setupEncryption('TestPassword123!');

    const recovered = await encryptionService.unwrapWithRecoveryKey(
      result.recoveryKey,
      result.recoveryWrappedMK,
      result.recoveryWrapIv
    );
    expect(recovered).toBeInstanceOf(CryptoKey);
    expect(recovered.extractable).toBe(true);
  });
});

// ============================================================================
// unwrapMasterKey
// ============================================================================
describe('unwrapMasterKey', () => {
  it('succeeds with correct password', async () => {
    const password = 'CorrectPassword1!';
    const setup = await encryptionService.setupEncryption(password);

    const key = await encryptionService.unwrapMasterKey(
      password,
      setup.salt,
      setup.wrappedMK,
      setup.wrapIv,
      PBKDF2_ITERATIONS
    );
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.extractable).toBe(false);
  });

  it('fails with wrong password', async () => {
    const setup = await encryptionService.setupEncryption('CorrectPassword1!');

    await expect(
      encryptionService.unwrapMasterKey(
        'WrongPassword1!',
        setup.salt,
        setup.wrappedMK,
        setup.wrapIv,
        PBKDF2_ITERATIONS
      )
    ).rejects.toThrow();
  });

  it('unwrapped key can decrypt data encrypted by setup masterKey', async () => {
    const password = 'TestPassword123!';
    const setup = await encryptionService.setupEncryption(password);

    // Encrypt with setup master key
    const encrypted = await encryptionService.encryptPost(
      setup.masterKey,
      1,
      'secret content',
      { title: 'test' }
    );

    // Unwrap and decrypt
    const unwrappedKey = await encryptionService.unwrapMasterKey(
      password,
      setup.salt,
      setup.wrappedMK,
      setup.wrapIv,
      PBKDF2_ITERATIONS
    );

    const contentDecrypted = await decryptContent(unwrappedKey, encrypted);
    expect(contentDecrypted).toBe('secret content');
  });
});

// ============================================================================
// unwrapWithRecoveryKey
// ============================================================================
describe('unwrapWithRecoveryKey', () => {
  it('returns an extractable key', async () => {
    const setup = await encryptionService.setupEncryption('TestPassword123!');

    const recovered = await encryptionService.unwrapWithRecoveryKey(
      setup.recoveryKey,
      setup.recoveryWrappedMK,
      setup.recoveryWrapIv
    );
    expect(recovered.extractable).toBe(true);
  });

  it('fails with wrong recovery key', async () => {
    const setup = await encryptionService.setupEncryption('TestPassword123!');

    // Generate a different recovery key
    const wrongKey = uint8ArrayToBase64(generateRecoveryKey());

    await expect(
      encryptionService.unwrapWithRecoveryKey(
        wrongKey,
        setup.recoveryWrappedMK,
        setup.recoveryWrapIv
      )
    ).rejects.toThrow();
  });

  it('recovered key can decrypt data encrypted by setup masterKey', async () => {
    const setup = await encryptionService.setupEncryption('TestPassword123!');

    const encrypted = await encryptionService.encryptPost(
      setup.masterKey,
      1,
      'recovery test',
      { note: 'important' }
    );

    const recovered = await encryptionService.unwrapWithRecoveryKey(
      setup.recoveryKey,
      setup.recoveryWrappedMK,
      setup.recoveryWrapIv
    );

    const nonExtractable = await toNonExtractable(recovered);
    const content = await decryptContent(nonExtractable, encrypted);
    expect(content).toBe('recovery test');
  });
});

// ============================================================================
// rewrapMasterKey
// ============================================================================
describe('rewrapMasterKey', () => {
  it('produces valid wrapped key that can be unwrapped with new password', async () => {
    const setup = await encryptionService.setupEncryption('OldPassword123!');

    // Get extractable key via recovery
    const extractableKey = await encryptionService.unwrapWithRecoveryKey(
      setup.recoveryKey,
      setup.recoveryWrappedMK,
      setup.recoveryWrapIv
    );

    const newPassword = 'NewPassword456!';
    const rewrapResult = await encryptionService.rewrapMasterKey(extractableKey, newPassword);

    expect(rewrapResult.salt).toBeDefined();
    expect(rewrapResult.wrappedMK).toBeDefined();
    expect(rewrapResult.wrapIv).toBeDefined();

    // Unwrap with new password should succeed
    const unwrapped = await encryptionService.unwrapMasterKey(
      newPassword,
      rewrapResult.salt,
      rewrapResult.wrappedMK,
      rewrapResult.wrapIv,
      PBKDF2_ITERATIONS
    );
    expect(unwrapped).toBeInstanceOf(CryptoKey);
  });

  it('old password no longer works after rewrap', async () => {
    const oldPassword = 'OldPassword123!';
    const setup = await encryptionService.setupEncryption(oldPassword);

    const extractableKey = await encryptionService.unwrapWithRecoveryKey(
      setup.recoveryKey,
      setup.recoveryWrappedMK,
      setup.recoveryWrapIv
    );

    const newPassword = 'NewPassword456!';
    const rewrapResult = await encryptionService.rewrapMasterKey(extractableKey, newPassword);

    // Old password fails on new wrapped key
    await expect(
      encryptionService.unwrapMasterKey(
        oldPassword,
        rewrapResult.salt,
        rewrapResult.wrappedMK,
        rewrapResult.wrapIv,
        PBKDF2_ITERATIONS
      )
    ).rejects.toThrow();
  });
});

// ============================================================================
// rewrapFromParams — full roundtrip
// ============================================================================
describe('rewrapFromParams', () => {
  it('full roundtrip: unwrap with current password and rewrap with new password', async () => {
    const currentPassword = 'CurrentPass123!';
    const newPassword = 'NewPass456!';
    const setup = await encryptionService.setupEncryption(currentPassword);

    // Encrypt some data first
    const encrypted = await encryptionService.encryptPost(
      setup.masterKey,
      1,
      'important journal entry',
      { mood: 'happy' }
    );

    // Rewrap from params
    const rewrapResult = await encryptionService.rewrapFromParams(
      currentPassword,
      setup.salt,
      setup.wrappedMK,
      setup.wrapIv,
      PBKDF2_ITERATIONS,
      newPassword
    );

    // Unwrap with new password
    const newKey = await encryptionService.unwrapMasterKey(
      newPassword,
      rewrapResult.salt,
      rewrapResult.wrappedMK,
      rewrapResult.wrapIv,
      PBKDF2_ITERATIONS
    );

    // Verify can decrypt data
    const content = await decryptContent(newKey, encrypted);
    expect(content).toBe('important journal entry');
  });

  it('fails with wrong current password', async () => {
    const setup = await encryptionService.setupEncryption('CorrectPass123!');

    await expect(
      encryptionService.rewrapFromParams(
        'WrongPass123!',
        setup.salt,
        setup.wrappedMK,
        setup.wrapIv,
        PBKDF2_ITERATIONS,
        'NewPass456!'
      )
    ).rejects.toThrow();
  });
});

// ============================================================================
// encryptPost
// ============================================================================
describe('encryptPost', () => {
  it('returns encrypted fields with IVs', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const result = await encryptionService.encryptPost(
      nonExtKey,
      1,
      '<p>Hello world</p>',
      { title: 'My Entry', mood: 'happy' }
    );

    expect(result.contentEncrypted).toBeDefined();
    expect(result.contentIv).toBeDefined();
    expect(result.metadataEncrypted).toBeDefined();
    expect(result.metadataIv).toBeDefined();

    // All should be base64
    const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
    expect(result.contentEncrypted).toMatch(base64Pattern);
    expect(result.contentIv).toMatch(base64Pattern);
    expect(result.metadataEncrypted).toMatch(base64Pattern);
    expect(result.metadataIv).toMatch(base64Pattern);
  });

  it('content and metadata have different IVs', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const result = await encryptionService.encryptPost(
      nonExtKey,
      1,
      'content',
      { key: 'value' }
    );

    expect(result.contentIv).not.toBe(result.metadataIv);
  });

  it('encrypts empty content', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const result = await encryptionService.encryptPost(nonExtKey, 1, '', {});
    expect(result.contentEncrypted).toBeDefined();
    expect(result.metadataEncrypted).toBeDefined();
  });

  it('produces different ciphertext for same input', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const r1 = await encryptionService.encryptPost(nonExtKey, 1, 'same', { a: 1 });
    const r2 = await encryptionService.encryptPost(nonExtKey, 1, 'same', { a: 1 });

    expect(r1.contentEncrypted).not.toBe(r2.contentEncrypted);
  });
});

// ============================================================================
// decryptPost
// ============================================================================
describe('decryptPost', () => {
  it('roundtrips with encrypted post', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const content = '<p>My secret journal entry</p>';
    const metadata = { title: 'Day 1', mood: 'reflective', tags: ['personal'] };

    const encrypted = await encryptionService.encryptPost(nonExtKey, 42, content, metadata);

    const encryptedPost: EncryptedPost = {
      id: 42,
      contentEncrypted: encrypted.contentEncrypted,
      contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted,
      metadataIv: encrypted.metadataIv,
      isEncrypted: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    };

    const decrypted = await encryptionService.decryptPost(nonExtKey, encryptedPost);

    expect(decrypted.id).toBe(42);
    expect(decrypted.content).toBe(content);
    expect(decrypted.metadata).toEqual(metadata);
    expect(decrypted.isEncrypted).toBe(true);
    expect(decrypted.createdAt).toEqual(new Date('2024-01-01'));
    expect(decrypted.updatedAt).toEqual(new Date('2024-01-02'));
  });

  it('refuses non-encrypted posts (only a compromised server could plant one)', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const post: EncryptedPost = {
      id: 1,
      contentEncrypted: null,
      contentIv: null,
      metadataEncrypted: null,
      metadataIv: null,
      isEncrypted: false,
      content: 'plaintext content',
      metadata: { title: 'Plain' },
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-01'),
    };

    await expect(encryptionService.decryptPost(nonExtKey, post)).rejects.toThrow('Refusing unencrypted post');
  });

  it('rejects content spliced onto another entry\'s metadata', async () => {
    const key = await toNonExtractable(await generateMasterKey());
    const a = await encryptionService.encryptPost(key, 1, 'entry A', { title: 'A' });
    const b = await encryptionService.encryptPost(key, 1, 'entry B', { title: 'B' });

    const spliced: EncryptedPost = {
      id: 1,
      contentEncrypted: a.contentEncrypted,
      contentIv: a.contentIv,
      metadataEncrypted: b.metadataEncrypted,
      metadataIv: b.metadataIv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(encryptionService.decryptPost(key, spliced)).rejects.toThrow();
  });

  it('rejects content and metadata swapped with each other', async () => {
    const key = await toNonExtractable(await generateMasterKey());
    const enc = await encryptionService.encryptPost(key, 1, '{"title":"x"}', { title: 'x' });

    const swapped: EncryptedPost = {
      id: 1,
      contentEncrypted: enc.metadataEncrypted,
      contentIv: enc.metadataIv,
      metadataEncrypted: enc.contentEncrypted,
      metadataIv: enc.contentIv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(encryptionService.decryptPost(key, swapped)).rejects.toThrow();
  });

  it('bound halves do not decrypt without their AAD', async () => {
    const key = await toNonExtractable(await generateMasterKey());
    const enc = await encryptionService.encryptPost(key, 1, 'secret', { t: 1 });
    await expect(decrypt(key, enc.contentEncrypted, enc.contentIv)).rejects.toThrow();
    await expect(decrypt(key, enc.metadataEncrypted, enc.metadataIv)).rejects.toThrow();
  });

  it('opens entries saved before AAD binding only when older formats are allowed, marked for re-sealing', async () => {
    const key = await toNonExtractable(await generateMasterKey());
    const { encrypt } = await import('../crypto/primitives.js');
    const content = await encrypt(key, '<p>old entry</p>');
    const meta = await encrypt(key, JSON.stringify({ title: 'Old' }));
    const post = {
      id: 9,
      contentEncrypted: content.ciphertext,
      contentIv: content.iv,
      metadataEncrypted: meta.ciphertext,
      metadataIv: meta.iv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(encryptionService.decryptPost(key, post)).rejects.toThrow();
    const decrypted = await encryptionService.decryptPost(key, post, { allowOlder: true });
    expect(decrypted.content).toBe('<p>old entry</p>');
    expect(decrypted.metadata).toEqual({ title: 'Old' });
    expect(decrypted.needsReseal).toBe(true);
  });

  it('opens a v2 (pair-bound) entry only when older formats are allowed', async () => {
    const key = await toNonExtractable(await generateMasterKey());
    const { encrypt } = await import('../crypto/primitives.js');
    const { generateIv } = await import('../crypto/primitives.js');
    const { uint8ArrayToBase64 } = await import('../crypto/encoding.js');
    const cIv = generateIv(); const mIv = generateIv();
    const c = await encrypt(key, 'v2 text', { iv: cIv, aad: `chronicles:post:v2:content:${uint8ArrayToBase64(mIv)}` });
    const m = await encrypt(key, '{"t":2}', { iv: mIv, aad: `chronicles:post:v2:metadata:${uint8ArrayToBase64(cIv)}` });
    const post = { id: 3, contentEncrypted: c.ciphertext, contentIv: c.iv, metadataEncrypted: m.ciphertext, metadataIv: m.iv, isEncrypted: true, createdAt: new Date(), updatedAt: new Date() };

    await expect(encryptionService.decryptPost(key, post)).rejects.toThrow();
    const d = await encryptionService.decryptPost(key, post, { allowOlder: true });
    expect(d.content).toBe('v2 text');
    expect(d.needsReseal).toBe(true);
  });

  it("won't open one entry's ciphertext served as another entry", async () => {
    const key = await toNonExtractable(await generateMasterKey());
    const enc = await encryptionService.encryptPost(key, 5, 'entry five', { t: 5 });
    const asSix = { id: 6, ...enc, isEncrypted: true, createdAt: new Date(), updatedAt: new Date() };
    await expect(encryptionService.decryptPost(key, asSix)).rejects.toThrow();
    await expect(encryptionService.decryptPost(key, asSix, { allowOlder: true })).rejects.toThrow();
    const asFive = await encryptionService.decryptPost(key, { ...asSix, id: 5 });
    expect(asFive.content).toBe('entry five');
    expect(asFive.needsReseal).toBeUndefined();
  });

  it('needs an entry id to encrypt', async () => {
    const key = await toNonExtractable(await generateMasterKey());
    await expect(encryptionService.encryptPost(key, 0, 'x', {})).rejects.toThrow('Entry id required');
  });

  it('rejects a legacy half paired with a bound half', async () => {
    const key = await toNonExtractable(await generateMasterKey());
    const { encrypt } = await import('../crypto/primitives.js');
    const legacyMeta = await encrypt(key, JSON.stringify({ title: 'Old' }));
    const bound = await encryptionService.encryptPost(key, 1, 'new', { title: 'New' });

    await expect(encryptionService.decryptPost(key, {
      id: 10,
      contentEncrypted: bound.contentEncrypted,
      contentIv: bound.contentIv,
      metadataEncrypted: legacyMeta.ciphertext,
      metadataIv: legacyMeta.iv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })).rejects.toThrow();
  });

  it('throws when encrypted post is missing required fields', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const post: EncryptedPost = {
      id: 3,
      contentEncrypted: null,
      contentIv: null,
      metadataEncrypted: null,
      metadataIv: null,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(
      encryptionService.decryptPost(nonExtKey, post)
    ).rejects.toThrow('Encrypted post missing required fields');
  });

  it('refuses an older entry with malformed metadata (non-object JSON)', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    // Encrypt a string that is valid JSON but not an object
    const { ciphertext: metaCipher, iv: metaIv } = await (async () => {
      const { encrypt } = await import('../crypto/primitives.js');
      return encrypt(nonExtKey, '"just a string"');
    })();

    // Legacy (pre-AAD) post: both halves encrypted without AAD
    const encrypted = await legacyContent(nonExtKey, 'content');

    const post: EncryptedPost = {
      id: 4,
      contentEncrypted: encrypted.contentEncrypted,
      contentIv: encrypted.contentIv,
      metadataEncrypted: metaCipher,
      metadataIv: metaIv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // An older entry isn't bound to its id: metadata that isn't an object can't
    // be the app's, so it's refused rather than opened (and re-sealed) as {}
    await expect(encryptionService.decryptPost(nonExtKey, post, { allowOlder: true })).rejects.toThrow(/not an object/);
  });

  it('refuses an older entry with malformed metadata (array JSON)', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const { encrypt } = await import('../crypto/primitives.js');
    const { ciphertext: metaCipher, iv: metaIv } = await encrypt(nonExtKey, '[1,2,3]');

    // Legacy (pre-AAD) post: both halves encrypted without AAD
    const encrypted = await legacyContent(nonExtKey, 'content');

    const post: EncryptedPost = {
      id: 5,
      contentEncrypted: encrypted.contentEncrypted,
      contentIv: encrypted.contentIv,
      metadataEncrypted: metaCipher,
      metadataIv: metaIv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // An older entry isn't bound to its id: metadata that isn't an object can't
    // be the app's, so it's refused rather than opened (and re-sealed) as {}
    await expect(encryptionService.decryptPost(nonExtKey, post, { allowOlder: true })).rejects.toThrow(/not an object/);
  });

  it('refuses an older entry with malformed metadata (null JSON)', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const { encrypt } = await import('../crypto/primitives.js');
    const { ciphertext: metaCipher, iv: metaIv } = await encrypt(nonExtKey, 'null');

    // Legacy (pre-AAD) post: both halves encrypted without AAD
    const encrypted = await legacyContent(nonExtKey, 'content');

    const post: EncryptedPost = {
      id: 6,
      contentEncrypted: encrypted.contentEncrypted,
      contentIv: encrypted.contentIv,
      metadataEncrypted: metaCipher,
      metadataIv: metaIv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // An older entry isn't bound to its id: metadata that isn't an object can't
    // be the app's, so it's refused rather than opened (and re-sealed) as {}
    await expect(encryptionService.decryptPost(nonExtKey, post, { allowOlder: true })).rejects.toThrow(/not an object/);
  });

  it('refuses an older entry with metadata that is not JSON', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const { encrypt } = await import('../crypto/primitives.js');
    const { ciphertext: metaCipher, iv: metaIv } = await encrypt(nonExtKey, 'not json at all {{{');

    // Legacy (pre-AAD) post: both halves encrypted without AAD
    const encrypted = await legacyContent(nonExtKey, 'content');

    const post: EncryptedPost = {
      id: 7,
      contentEncrypted: encrypted.contentEncrypted,
      contentIv: encrypted.contentIv,
      metadataEncrypted: metaCipher,
      metadataIv: metaIv,
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // An older entry isn't bound to its id: metadata that isn't an object can't
    // be the app's, so it's refused rather than opened (and re-sealed) as {}
    await expect(encryptionService.decryptPost(nonExtKey, post, { allowOlder: true })).rejects.toThrow(/not an object/);
  });
});

// ============================================================================
// decryptPosts
// ============================================================================
describe('decryptPosts', () => {
  it('decrypts multiple posts', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const enc1 = await encryptionService.encryptPost(nonExtKey, 1, 'Entry 1', { title: 'First' });
    const enc2 = await encryptionService.encryptPost(nonExtKey, 2, 'Entry 2', { title: 'Second' });

    const posts: EncryptedPost[] = [
      {
        id: 1,
        contentEncrypted: enc1.contentEncrypted,
        contentIv: enc1.contentIv,
        metadataEncrypted: enc1.metadataEncrypted,
        metadataIv: enc1.metadataIv,
        isEncrypted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        contentEncrypted: enc2.contentEncrypted,
        contentIv: enc2.contentIv,
        metadataEncrypted: enc2.metadataEncrypted,
        metadataIv: enc2.metadataIv,
        isEncrypted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const decrypted = await encryptionService.decryptPosts(nonExtKey, posts);
    expect(decrypted).toHaveLength(2);
    expect(decrypted[0].content).toBe('Entry 1');
    expect(decrypted[0].metadata).toEqual({ title: 'First' });
    expect(decrypted[1].content).toBe('Entry 2');
    expect(decrypted[1].metadata).toEqual({ title: 'Second' });
  });

  it('refuses a list containing a non-encrypted post', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);

    const enc = await encryptionService.encryptPost(nonExtKey, 1, 'Encrypted', { x: 1 });

    const posts: EncryptedPost[] = [
      {
        id: 1,
        contentEncrypted: enc.contentEncrypted,
        contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted,
        metadataIv: enc.metadataIv,
        isEncrypted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        contentEncrypted: null,
        contentIv: null,
        metadataEncrypted: null,
        metadataIv: null,
        isEncrypted: false,
        content: 'Plaintext',
        metadata: { y: 2 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await expect(encryptionService.decryptPosts(nonExtKey, posts)).rejects.toThrow('Refusing unencrypted post');
  });

  it('handles empty array', async () => {
    const key = await generateMasterKey();
    const nonExtKey = await toNonExtractable(key);
    const decrypted = await encryptionService.decryptPosts(nonExtKey, []);
    expect(decrypted).toEqual([]);
  });
});

// ============================================================================
// encryptRecord / decryptRecord (Finance)
// ============================================================================

describe('encryptRecord / decryptRecord', () => {
  const id = '3f1c2a64-8d1e-4f5a-9b2c-0d1e2f3a4b5c';

  it('round-trips a JSON record', async () => {
    const key = await generateMasterKey();
    const record = { name: 'Rent', amountCents: 120000, tags: ['home'] };
    const enc = await encryptionService.encryptRecord(key, 'bills', id, record);
    expect(enc.payload).not.toContain('Rent');
    const out = await encryptionService.decryptRecord(key, 'bills', id, enc.payload, enc.iv);
    expect(out).toEqual(record);
  });

  it('refuses a record moved to another kind', async () => {
    const key = await generateMasterKey();
    const enc = await encryptionService.encryptRecord(key, 'bills', id, { a: 1 });
    await expect(encryptionService.decryptRecord(key, 'goals', id, enc.payload, enc.iv)).rejects.toThrow();
  });

  it('refuses a record moved to another id', async () => {
    const key = await generateMasterKey();
    const enc = await encryptionService.encryptRecord(key, 'bills', id, { a: 1 });
    const other = '00000000-0000-4000-8000-000000000000';
    await expect(encryptionService.decryptRecord(key, 'bills', other, enc.payload, enc.iv)).rejects.toThrow();
  });
});
