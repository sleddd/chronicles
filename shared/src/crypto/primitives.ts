/**
 * Low-level Web Crypto API wrappers
 * Non-extractable keys where possible for stronger zero-knowledge
 */

import {
  AES_ALGORITHM,
  AES_KEY_LENGTH,
  IV_LENGTH,
  PBKDF2_ALGORITHM,
  PBKDF2_HASH,
  PBKDF2_SALT_LENGTH,
  RECOVERY_KEY_LENGTH,
} from './constants.js';
import {
  generateRandomBytes,
  base64ToUint8Array,
  uint8ArrayToBase64,
  stringToArrayBuffer,
  arrayBufferToString,
} from './encoding.js';

/**
 * Generate a new AES-256 master key
 * extractable=true during generation because we need to wrap it with KEK and recovery key.
 * After wrapping, callers should convert to non-extractable via toNonExtractable().
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true, // extractable — required by Web Crypto for wrapKey('raw', ...)
    ['encrypt', 'decrypt']
  );
}

export function generateRecoveryKey(): Uint8Array {
  return generateRandomBytes(RECOVERY_KEY_LENGTH);
}

export function generateSalt(): Uint8Array {
  return generateRandomBytes(PBKDF2_SALT_LENGTH);
}

export function generateIv(): Uint8Array {
  return generateRandomBytes(IV_LENGTH);
}

/**
 * Derive a Key Encryption Key (KEK) from password using PBKDF2
 * Non-extractable — KEK cannot be exported from the browser's crypto subsystem
 */
export async function deriveKEK(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    stringToArrayBuffer(password),
    PBKDF2_ALGORITHM,
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: PBKDF2_ALGORITHM,
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: PBKDF2_HASH,
    },
    passwordKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false, // non-extractable
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Import a raw key (recovery key) as CryptoKey for wrapping
 */
export async function importRawKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/** Wrap purpose identifiers for Additional Authenticated Data (AAD) */
export type WrapPurpose = 'kek-wrap' | 'recovery-wrap' | 'device-wrap';

/** Encode a wrap purpose string as AAD bytes for AES-GCM */
function purposeToAAD(purpose: WrapPurpose): ArrayBuffer {
  return new TextEncoder().encode(purpose).buffer as ArrayBuffer;
}

/**
 * Wrap (encrypt) the master key with a wrapping key (KEK or recovery key).
 * The purpose parameter is authenticated as AAD — prevents cross-purpose key substitution.
 */
export async function wrapKey(
  masterKey: CryptoKey,
  wrappingKey: CryptoKey,
  iv: Uint8Array,
  purpose: WrapPurpose = 'kek-wrap'
): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey('raw', masterKey, wrappingKey, {
    name: AES_ALGORITHM,
    iv: iv.buffer as ArrayBuffer,
    additionalData: purposeToAAD(purpose),
  });
}

/**
 * Unwrap (decrypt) the master key with a wrapping key.
 * By default returns a non-extractable key for encrypt/decrypt operations.
 * Pass extractable=true when the key needs to be re-wrapped (e.g., password change, recovery).
 * Tries with AAD first; falls back to no-AAD for keys wrapped before AAD was introduced.
 */
export async function unwrapKey(
  wrappedKey: ArrayBuffer,
  wrappingKey: CryptoKey,
  iv: Uint8Array,
  extractable: boolean = false,
  purpose: WrapPurpose = 'kek-wrap'
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      wrappedKey,
      wrappingKey,
      { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer, additionalData: purposeToAAD(purpose) },
      { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
      extractable,
      ['encrypt', 'decrypt']
    );
  } catch {
    // Legacy fallback: key was wrapped without AAD before security hardening
    return crypto.subtle.unwrapKey(
      'raw',
      wrappedKey,
      wrappingKey,
      { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer },
      { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
      extractable,
      ['encrypt', 'decrypt']
    );
  }
}

/**
 * "Remember me" wrapping key, imported from a 32-byte per-sign-in secret the
 * server holds only in memory. Non-extractable and limited to wrap/unwrap.
 */
export async function importDeviceWrapKey(secret: Uint8Array): Promise<CryptoKey> {
  if (secret.byteLength !== 32) throw new Error('Device secret must be 32 bytes');
  return crypto.subtle.importKey(
    'raw',
    secret.buffer.slice(secret.byteOffset, secret.byteOffset + secret.byteLength) as ArrayBuffer,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Unwrap a "remember me" blob straight into a NON-extractable master key.
 * No legacy no-AAD fallback: the purpose AAD must match.
 */
export async function unwrapDeviceKey(wrappedKey: ArrayBuffer, wrappingKey: CryptoKey, iv: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    wrappingKey,
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer, additionalData: purposeToAAD('device-wrap') },
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert an extractable CryptoKey to non-extractable.
 * Used after wrapping operations to ensure the in-memory key cannot be exported.
 */
export async function toNonExtractable(key: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const rawArray = new Uint8Array(raw);
  try {
    const nonExtractable = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
    return nonExtractable;
  } finally {
    // Multi-pass zeroing of exported key material
    rawArray.fill(0);
    crypto.getRandomValues(rawArray);
    rawArray.fill(0);
  }
}

/**
 * Encrypt plaintext with AES-GCM
 * Returns { ciphertext, iv } both as Base64 strings
 */
export async function encrypt(
  masterKey: CryptoKey,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const iv = generateIv();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer },
    masterKey,
    stringToArrayBuffer(plaintext)
  );

  return {
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
    iv: uint8ArrayToBase64(iv),
  };
}

/**
 * Encrypt binary data (images, files) with AES-GCM using the master key directly.
 * The key is the existing non-extractable CryptoKey — no raw material is handled.
 */
export async function encryptBytes(
  masterKey: CryptoKey,
  data: ArrayBuffer
): Promise<{ ciphertext: ArrayBuffer; iv: string }> {
  const iv = generateIv();
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer },
    masterKey,
    data
  );
  return { ciphertext, iv: uint8ArrayToBase64(iv) };
}

/**
 * Decrypt binary data with AES-GCM
 */
export async function decryptBytes(
  masterKey: CryptoKey,
  ciphertext: ArrayBuffer,
  ivBase64: string
): Promise<ArrayBuffer> {
  const iv = base64ToUint8Array(ivBase64);
  return crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer },
    masterKey,
    ciphertext
  );
}

/**
 * Decrypt ciphertext with AES-GCM
 */
export async function decrypt(
  masterKey: CryptoKey,
  ciphertext: string,
  iv: string
): Promise<string> {
  const ciphertextBuffer = base64ToUint8Array(ciphertext);
  const ivBuffer = base64ToUint8Array(iv);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: ivBuffer.buffer as ArrayBuffer },
    masterKey,
    ciphertextBuffer.buffer as ArrayBuffer
  );

  return arrayBufferToString(plaintextBuffer);
}
