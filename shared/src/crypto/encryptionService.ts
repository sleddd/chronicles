/**
 * EncryptionService - Stateless service for all encryption operations
 *
 * All methods are pure functions — no internal state.
 * The client's EncryptionContext manages the master key state.
 */

import { PBKDF2_ITERATIONS } from './constants.js';
import {
  generateMasterKey,
  generateRecoveryKey,
  generateSalt,
  generateIv,
  deriveKEK,
  checkKekIterations,
  importRawKey,
  wrapKey,
  unwrapKey,
  toNonExtractable,
  encrypt,
  decrypt,
  encryptBytes,
  decryptBytes,
  importDeviceWrapKey,
  unwrapDeviceKey,
} from './primitives.js';
import { uint8ArrayToBase64, base64ToUint8Array } from './encoding.js';
import type {
  SetupEncryptionResult,
  RewrapResult,
  EncryptedPostData,
  EncryptedPost,
  DecryptedPost,
} from './types.js';

function isJsonObject(text: string): boolean {
  try {
    const v = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  } catch {
    return false;
  }
}

class EncryptionService {
  /**
   * Set up encryption for a new user (called during registration)
   */
  async setupEncryption(password: string): Promise<SetupEncryptionResult> {
    const extractableKey = await generateMasterKey();

    // Wrap with password-derived KEK
    const salt = generateSalt();
    const kek = await deriveKEK(password, salt, PBKDF2_ITERATIONS);
    const wrapIv = generateIv();
    const wrappedMKBuffer = await wrapKey(extractableKey, kek, wrapIv, 'kek-wrap');

    // Wrap with recovery key
    const recoveryKeyBytes = generateRecoveryKey();
    const recoveryKeyObj = await importRawKey(recoveryKeyBytes);
    const recoveryWrapIv = generateIv();
    const recoveryWrappedMKBuffer = await wrapKey(extractableKey, recoveryKeyObj, recoveryWrapIv, 'recovery-wrap');

    // Convert to non-extractable for in-memory use (encrypt/decrypt only)
    const masterKey = await toNonExtractable(extractableKey);

    // Capture base64 before zeroing
    const recoveryKeyBase64 = uint8ArrayToBase64(recoveryKeyBytes);
    // Zero recovery key raw bytes — only the base64 string is returned for user display
    recoveryKeyBytes.fill(0);

    return {
      salt: uint8ArrayToBase64(salt),
      wrappedMK: uint8ArrayToBase64(new Uint8Array(wrappedMKBuffer)),
      wrapIv: uint8ArrayToBase64(wrapIv),
      recoveryKey: recoveryKeyBase64,
      recoveryWrappedMK: uint8ArrayToBase64(new Uint8Array(recoveryWrappedMKBuffer)),
      recoveryWrapIv: uint8ArrayToBase64(recoveryWrapIv),
      masterKey,
    };
  }

  /**
   * Unwrap master key using password (called during login)
   */
  async unwrapMasterKey(
    password: string,
    saltBase64: string,
    wrappedMKBase64: string,
    wrapIvBase64: string,
    iterations: number
  ): Promise<CryptoKey> {
    const salt = base64ToUint8Array(saltBase64);
    const wrappedMK = base64ToUint8Array(wrappedMKBase64);
    const wrapIv = base64ToUint8Array(wrapIvBase64);

    checkKekIterations(iterations);
    const kek = await deriveKEK(password, salt, iterations);
    return unwrapKey(wrappedMK.buffer as ArrayBuffer, kek, wrapIv, false, 'kek-wrap');
  }

  /**
   * Password unlock that also produces a "remember me" blob: the master key
   * wrapped (AES-GCM, purpose AAD 'device-wrap') under a key imported from a
   * per-sign-in device secret. The KEK is derived once; the extractable copy
   * used for wrapping never leaves this function and raw key bytes are never
   * exposed to JavaScript. The returned master key is non-extractable.
   */
  async unwrapMasterKeyForDevice(
    password: string,
    saltBase64: string,
    wrappedMKBase64: string,
    wrapIvBase64: string,
    iterations: number,
    deviceSecret: Uint8Array
  ): Promise<{ masterKey: CryptoKey; deviceWrapped: string; deviceIv: string }> {
    const salt = base64ToUint8Array(saltBase64);
    const wrappedMK = base64ToUint8Array(wrappedMKBase64);
    const wrapIv = base64ToUint8Array(wrapIvBase64);
    checkKekIterations(iterations);
    const kek = await deriveKEK(password, salt, iterations);
    const masterKey = await unwrapKey(wrappedMK.buffer as ArrayBuffer, kek, wrapIv, false, 'kek-wrap');
    const extractable = await unwrapKey(wrappedMK.buffer as ArrayBuffer, kek, wrapIv, true, 'kek-wrap');
    const deviceKey = await importDeviceWrapKey(deviceSecret);
    const deviceIv = generateIv();
    const deviceWrapped = await wrapKey(extractable, deviceKey, deviceIv, 'device-wrap');
    return {
      masterKey,
      deviceWrapped: uint8ArrayToBase64(new Uint8Array(deviceWrapped)),
      deviceIv: uint8ArrayToBase64(deviceIv),
    };
  }

  /** Restore a remembered unlock: device secret + blob → non-extractable master key. */
  async unwrapFromDevice(deviceSecret: Uint8Array, deviceWrappedBase64: string, deviceIvBase64: string): Promise<CryptoKey> {
    const deviceKey = await importDeviceWrapKey(deviceSecret);
    const wrapped = base64ToUint8Array(deviceWrappedBase64);
    return unwrapDeviceKey(wrapped.buffer as ArrayBuffer, deviceKey, base64ToUint8Array(deviceIvBase64));
  }

  /**
   * Unwrap master key using recovery key (password reset flow).
   * Returns extractable key so it can be re-wrapped with a new password.
   */
  async unwrapWithRecoveryKey(
    recoveryKeyBase64: string,
    recoveryWrappedMKBase64: string,
    recoveryWrapIvBase64: string
  ): Promise<CryptoKey> {
    const recoveryKeyBytes = base64ToUint8Array(recoveryKeyBase64);
    const recoveryWrappedMK = base64ToUint8Array(recoveryWrappedMKBase64);
    const recoveryWrapIv = base64ToUint8Array(recoveryWrapIvBase64);

    const recoveryKeyObj = await importRawKey(recoveryKeyBytes);
    return unwrapKey(recoveryWrappedMK.buffer as ArrayBuffer, recoveryKeyObj, recoveryWrapIv, true, 'recovery-wrap');
  }

  /**
   * Generate a fresh recovery key and wrap the master key with it.
   * Used after password recovery to issue a new recovery key.
   */
  async generateNewRecoveryWrapping(masterKey: CryptoKey): Promise<{
    recoveryKey: string;
    recoveryWrappedMK: string;
    recoveryWrapIv: string;
  }> {
    const recoveryKeyBytes = generateRecoveryKey();
    const recoveryKeyObj = await importRawKey(recoveryKeyBytes);
    const recoveryWrapIv = generateIv();
    const recoveryWrappedMKBuffer = await wrapKey(masterKey, recoveryKeyObj, recoveryWrapIv, 'recovery-wrap');
    const recoveryKey = uint8ArrayToBase64(recoveryKeyBytes);
    recoveryKeyBytes.fill(0);
    return {
      recoveryKey,
      recoveryWrappedMK: uint8ArrayToBase64(new Uint8Array(recoveryWrappedMKBuffer)),
      recoveryWrapIv: uint8ArrayToBase64(recoveryWrapIv),
    };
  }

  /**
   * Re-wrap master key with a new password (after recovery)
   */
  async rewrapMasterKey(
    masterKey: CryptoKey,
    newPassword: string
  ): Promise<RewrapResult> {
    const salt = generateSalt();
    const kek = await deriveKEK(newPassword, salt, PBKDF2_ITERATIONS);
    const wrapIv = generateIv();
    const wrappedMKBuffer = await wrapKey(masterKey, kek, wrapIv, 'kek-wrap');

    return {
      salt: uint8ArrayToBase64(salt),
      wrappedMK: uint8ArrayToBase64(new Uint8Array(wrappedMKBuffer)),
      wrapIv: uint8ArrayToBase64(wrapIv),
    };
  }

  /**
   * Generate a new recovery key wrapping from stored encryption params + current password.
   * Used in Settings when the user needs to (re)generate their recovery key.
   */
  async generateRecoveryKeyFromParams(
    currentPassword: string,
    kekSaltBase64: string,
    encryptedMKBase64: string,
    kekWrapIvBase64: string,
    kekIterations: number
  ): Promise<{ recoveryKey: string; recoveryWrappedMK: string; recoveryWrapIv: string }> {
    const salt = base64ToUint8Array(kekSaltBase64);
    const wrappedMK = base64ToUint8Array(encryptedMKBase64);
    const wrapIv = base64ToUint8Array(kekWrapIvBase64);
    checkKekIterations(kekIterations);
    const kek = await deriveKEK(currentPassword, salt, kekIterations);
    const extractableKey = await unwrapKey(wrappedMK.buffer as ArrayBuffer, kek, wrapIv, true, 'kek-wrap');
    return this.generateNewRecoveryWrapping(extractableKey);
  }

  /**
   * Re-wrap master key for password change (when only non-extractable key is in memory).
   * Re-derives the extractable key from stored encryption params + current password,
   * wraps with new password, then discards the extractable key.
   */
  async rewrapFromParams(
    currentPassword: string,
    kekSaltBase64: string,
    encryptedMKBase64: string,
    kekWrapIvBase64: string,
    kekIterations: number,
    newPassword: string
  ): Promise<RewrapResult> {
    // Unwrap as extractable so we can re-wrap
    const salt = base64ToUint8Array(kekSaltBase64);
    const wrappedMK = base64ToUint8Array(encryptedMKBase64);
    const wrapIv = base64ToUint8Array(kekWrapIvBase64);
    checkKekIterations(kekIterations);
    const kek = await deriveKEK(currentPassword, salt, kekIterations);
    const extractableKey = await unwrapKey(wrappedMK.buffer as ArrayBuffer, kek, wrapIv, true, 'kek-wrap');

    try {
      // Wrap with new password
      const result = await this.rewrapMasterKey(extractableKey, newPassword);
      return result;
    } finally {
      // Zero intermediate buffers to reduce key material exposure window
      salt.fill(0);
      wrappedMK.fill(0);
      wrapIv.fill(0);
    }
  }

  /**
   * Encrypt post content and metadata as a bound pair, bound to the entry's
   * id: each half's AAD names the entry id and the other half's IV, so a
   * server can't splice one entry's content onto another entry's metadata,
   * swap the two fields, or serve one entry's ciphertext as another entry,
   * without decryption failing. Content and metadata are always saved together.
   * A new entry reserves its id first (POST /api/entries/ids).
   */
  async encryptPost(
    masterKey: CryptoKey,
    id: number,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<EncryptedPostData> {
    if (!Number.isInteger(id) || id < 1) throw new Error('Entry id required to encrypt');
    const contentIv = generateIv();
    const metadataIv = generateIv();
    const contentIvB64 = uint8ArrayToBase64(contentIv);
    const metadataIvB64 = uint8ArrayToBase64(metadataIv);
    const [contentResult, metadataResult] = await Promise.all([
      encrypt(masterKey, content, { iv: contentIv, aad: postAad('content', id, metadataIvB64) }),
      encrypt(masterKey, JSON.stringify(metadata), { iv: metadataIv, aad: postAad('metadata', id, contentIvB64) }),
    ]);

    return {
      contentEncrypted: contentResult.ciphertext,
      contentIv: contentResult.iv,
      metadataEncrypted: metadataResult.ciphertext,
      metadataIv: metadataResult.iv,
    };
  }

  /**
   * Decrypt a single post. Plaintext posts are refused: every entry is
   * encrypted client-side, so a plaintext one can only have been planted by
   * whoever controls the server or database.
   *
   * Entries are bound to their id (v3). `allowOlder` also opens the formats
   * from before — v2 (pair-bound, no id) and the no-AAD pair — and marks them
   * `needsReseal`; the client allows that only until every entry of the account
   * has been re-sealed (the `entriesSealV3` marker), so an old ciphertext the
   * server kept can't be replayed afterwards.
   */
  async decryptPost(
    masterKey: CryptoKey,
    post: EncryptedPost,
    options: { allowOlder?: boolean } = {}
  ): Promise<DecryptedPost> {
    if (!post.isEncrypted) {
      throw new Error('Refusing unencrypted post');
    }

    if (!post.contentEncrypted || !post.contentIv || !post.metadataEncrypted || !post.metadataIv) {
      throw new Error('Encrypted post missing required fields');
    }
    const { contentEncrypted, contentIv, metadataEncrypted, metadataIv } = post;

    let content: string;
    let metadataStr: string;
    let needsReseal = false;
    try {
      [content, metadataStr] = await Promise.all([
        decrypt(masterKey, contentEncrypted, contentIv, postAad('content', post.id, metadataIv)),
        decrypt(masterKey, metadataEncrypted, metadataIv, postAad('metadata', post.id, contentIv)),
      ]);
    } catch (err) {
      if (!options.allowOlder) throw err;
      needsReseal = true;
      try {
        [content, metadataStr] = await Promise.all([
          decrypt(masterKey, contentEncrypted, contentIv, postAadV2('content', metadataIv)),
          decrypt(masterKey, metadataEncrypted, metadataIv, postAadV2('metadata', contentIv)),
        ]);
      } catch {
        // Entries saved before AAD binding: both halves must be legacy — a bound
        // half never decrypts without its AAD, so this can't be used to unpair one
        [content, metadataStr] = await Promise.all([
          decrypt(masterKey, contentEncrypted, contentIv),
          decrypt(masterKey, metadataEncrypted, metadataIv),
        ]);
      }
    }

    // An older entry's halves aren't bound to its id (and before AAD, not to
    // each other), so a server could pair any ciphertext with it; one whose
    // metadata isn't a JSON object wasn't written by this app — refuse it
    // rather than open (and later re-seal) it with empty metadata
    if (needsReseal && !isJsonObject(metadataStr)) {
      throw new Error('Refusing older entry whose metadata is not an object');
    }

    let metadata: Record<string, unknown>;
    try {
      const parsed = JSON.parse(metadataStr);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        metadata = {};
      } else {
        metadata = parsed;
      }
    } catch (err) {
      console.warn(`Metadata parsing failed for post ${post.id}:`, err instanceof Error ? err.message : 'Unknown error');
      metadata = {};
    }

    // The creation time sealed in the metadata wins over the server's
    // readable one (entries saved before it was sealed keep the server's)
    const sealedAt = typeof metadata._createdAt === 'string' && !Number.isNaN(Date.parse(metadata._createdAt))
      ? metadata._createdAt : null;

    return {
      id: post.id,
      content,
      metadata,
      isEncrypted: true,
      createdAt: sealedAt ? new Date(sealedAt) : post.createdAt,
      updatedAt: post.updatedAt,
      ...(needsReseal && { needsReseal: true }),
    };
  }

  /**
   * Encrypt a binary file (image) with the master key
   */
  async encryptFile(
    masterKey: CryptoKey,
    data: ArrayBuffer,
    aad?: string
  ): Promise<{ ciphertext: ArrayBuffer; iv: string }> {
    return encryptBytes(masterKey, data, aad);
  }

  /**
   * Decrypt a binary file (image) with the master key
   */
  async decryptFile(
    masterKey: CryptoKey,
    ciphertext: ArrayBuffer,
    ivBase64: string,
    aad?: string
  ): Promise<ArrayBuffer> {
    return decryptBytes(masterKey, ciphertext, ivBase64, aad);
  }

  /**
   * Encrypt one Finance record (a payday, bill, budget category, goal or
   * savings pot) as JSON. The AAD names the record's kind and id, so the
   * server can't move a ciphertext to another row or another table.
   */
  async encryptRecord(
    masterKey: CryptoKey,
    kind: string,
    id: string,
    record: unknown
  ): Promise<{ payload: string; iv: string }> {
    const { ciphertext, iv } = await encrypt(masterKey, JSON.stringify(record), { aad: recordAad(kind, id) });
    return { payload: ciphertext, iv };
  }

  /** Decrypt a Finance record written by encryptRecord (no legacy fallback). */
  async decryptRecord<T = unknown>(
    masterKey: CryptoKey,
    kind: string,
    id: string,
    payload: string,
    iv: string
  ): Promise<T> {
    return JSON.parse(await decrypt(masterKey, payload, iv, recordAad(kind, id))) as T;
  }

  /**
   * Decrypt multiple posts
   */
  /**
   * A stable tag for this account, derived from its master key and a label:
   * the GCM tag of an empty message under a fixed all-zero IV — a PRF of the
   * key over the label. Only the master key's holder can compute it, and two
   * accounts never share one. (The zero IV is never used for anything else:
   * every other encryption takes 12 random bytes, a 2^-96 chance of meeting it.)
   */
  async accountTag(masterKey: CryptoKey, label: string): Promise<string> {
    const out = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12), additionalData: new TextEncoder().encode(`chronicles:tag:v1:${label}`), tagLength: 128 },
      masterKey,
      new Uint8Array(0),
    );
    return Array.from(new Uint8Array(out), b => b.toString(16).padStart(2, '0')).join('');
  }

  async decryptPosts(
    masterKey: CryptoKey,
    posts: EncryptedPost[],
    options: { allowOlder?: boolean } = {}
  ): Promise<DecryptedPost[]> {
    return Promise.all(posts.map((post) => this.decryptPost(masterKey, post, options)));
  }
}

/** AAD for one half of an encrypted post: the entry's id and the other half's IV. */
function postAad(part: 'content' | 'metadata', id: number, otherIv: string): string {
  return `chronicles:post:v3:${part}:${id}:${otherIv}`;
}

/** The v2 AAD (pair-bound, not id-bound) — read only until an account is re-sealed. */
function postAadV2(part: 'content' | 'metadata', otherIv: string): string {
  return `chronicles:post:v2:${part}:${otherIv}`;
}

/** AAD for a Finance record, binding it to its table (kind) and row id. */
function recordAad(kind: string, id: string): string {
  return `chronicles:finance:v1:${kind}:${id}`;
}

export const encryptionService = new EncryptionService();
