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
   * Encrypt post content and metadata
   */
  async encryptPost(
    masterKey: CryptoKey,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<EncryptedPostData> {
    const [contentResult, metadataResult] = await Promise.all([
      encrypt(masterKey, content),
      encrypt(masterKey, JSON.stringify(metadata)),
    ]);

    return {
      contentEncrypted: contentResult.ciphertext,
      contentIv: contentResult.iv,
      metadataEncrypted: metadataResult.ciphertext,
      metadataIv: metadataResult.iv,
    };
  }

  /**
   * Decrypt a single post. Passes through plaintext posts unchanged.
   */
  async decryptPost(
    masterKey: CryptoKey,
    post: EncryptedPost
  ): Promise<DecryptedPost> {
    if (!post.isEncrypted) {
      return {
        id: post.id,
        content: post.content || '',
        metadata: post.metadata || {},
        isEncrypted: false,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    }

    if (!post.contentEncrypted || !post.contentIv || !post.metadataEncrypted || !post.metadataIv) {
      throw new Error('Encrypted post missing required fields');
    }

    const [content, metadataStr] = await Promise.all([
      decrypt(masterKey, post.contentEncrypted, post.contentIv),
      decrypt(masterKey, post.metadataEncrypted, post.metadataIv),
    ]);

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

    return {
      id: post.id,
      content,
      metadata,
      isEncrypted: true,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  /**
   * Encrypt a binary file (image) with the master key
   */
  async encryptFile(
    masterKey: CryptoKey,
    data: ArrayBuffer
  ): Promise<{ ciphertext: ArrayBuffer; iv: string }> {
    return encryptBytes(masterKey, data);
  }

  /**
   * Decrypt a binary file (image) with the master key
   */
  async decryptFile(
    masterKey: CryptoKey,
    ciphertext: ArrayBuffer,
    ivBase64: string
  ): Promise<ArrayBuffer> {
    return decryptBytes(masterKey, ciphertext, ivBase64);
  }

  /**
   * Decrypt multiple posts
   */
  async decryptPosts(
    masterKey: CryptoKey,
    posts: EncryptedPost[]
  ): Promise<DecryptedPost[]> {
    return Promise.all(posts.map((post) => this.decryptPost(masterKey, post)));
  }
}

export const encryptionService = new EncryptionService();
