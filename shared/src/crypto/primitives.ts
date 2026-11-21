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
  PBKDF2_ITERATIONS,
  PBKDF2_MAX_ITERATIONS,
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
 * A KEK iteration count the server sent: never fewer than the minimum (a
 * downgrade), never so many that deriving the key freezes the tab.
 */
export function checkKekIterations(iterations: number): void {
  if (!Number.isInteger(iterations) || iterations < PBKDF2_ITERATIONS || iterations > PBKDF2_MAX_ITERATIONS) {
    throw new Error('Invalid key iterations');
  }
}

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
  iterations: number,
  asTyped = false
): Promise<CryptoKey> {
  // The salt comes from the server. Every KEK salt is 16 random bytes; refusing
  // anything else keeps a server from sending the sign-in secret's salt
  // ("chronicles:auth:v1:" + email), which would make this KEK equal to the
  // authSecret the client sends at every sign-in — and let the server wrap a
  // master key of its own choosing that the client would then accept.
  if (salt.byteLength !== PBKDF2_SALT_LENGTH) throw new Error('Invalid key salt');
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    // Normalized like the sign-in secret (authSecret.ts); `asTyped` only for
    // an older account's wrap, made from the password exactly as typed
    stringToArrayBuffer(asTyped ? password : password.normalize('NFKC')),
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
export type WrapPurpose = 'kek-wrap' | 'recovery-wrap';

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
 * The purpose AAD must match. Only recovery wraps may still be in the old
 * no-AAD format: they can't be re-wrapped without the recovery key, which is
 * never available at unlock (and a server can't forge one without it).
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
  } catch (err) {
    if (purpose !== 'recovery-wrap') throw err;
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

// ---------------------------------------------------------------------------
// Passkeys. A passkey with the PRF extension returns 32 secret bytes, the same
// each time for that passkey and only after its user check (fingerprint, face,
// device PIN). Those bytes derive the key that wraps the master key for that
// passkey — one more wrap beside the password's and the recovery key's.
// ---------------------------------------------------------------------------

/** What every passkey ceremony asks the authenticator to evaluate (32 bytes, fixed for the app) */
export async function passkeyPrfInput(): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('chronicles:passkey-prf:v1')));
}

/** The wrapping key for one passkey, from its PRF output. Non-extractable, wrap/unwrap only. */
export async function derivePasskeyKek(prfOutput: Uint8Array): Promise<CryptoKey> {
  if (prfOutput.byteLength !== 32) throw new Error('Passkey secret must be 32 bytes');
  const base = await crypto.subtle.importKey(
    'raw',
    prfOutput.buffer.slice(prfOutput.byteOffset, prfOutput.byteOffset + prfOutput.byteLength) as ArrayBuffer,
    'HKDF', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('chronicles:passkey-wrap:v1') },
    base,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

// Bound to its purpose and to the passkey it was made for, so one passkey's
// wrap filed under another (or under the password's) never opens
const passkeyAad = (credentialId: string) => new TextEncoder().encode(`passkey-wrap:${credentialId}`).buffer as ArrayBuffer;

export async function wrapKeyForPasskey(masterKey: CryptoKey, kek: CryptoKey, iv: Uint8Array, credentialId: string): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey('raw', masterKey, kek, { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer, additionalData: passkeyAad(credentialId) });
}

/** Open a passkey's wrap. No fallback form: the AAD must match. */
export async function unwrapKeyFromPasskey(wrappedKey: ArrayBuffer, kek: CryptoKey, iv: Uint8Array, credentialId: string, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw', wrappedKey, kek,
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer, additionalData: passkeyAad(credentialId) },
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Convert an extractable CryptoKey to non-extractable.
 * Used after wrapping operations to ensure the in-memory key cannot be exported.
 * The key passes through a wrap/unwrap with a throwaway non-extractable key,
 * so its raw bytes never reach JavaScript.
 */
export async function toNonExtractable(key: CryptoKey): Promise<CryptoKey> {
  const transit = await crypto.subtle.generateKey({ name: AES_ALGORITHM, length: AES_KEY_LENGTH }, false, ['wrapKey', 'unwrapKey']);
  const iv = generateIv();
  const params = { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer };
  const wrapped = await crypto.subtle.wrapKey('raw', key, transit, params);
  return crypto.subtle.unwrapKey('raw', wrapped, transit, params, { name: AES_ALGORITHM, length: AES_KEY_LENGTH }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt plaintext with AES-GCM
 * Returns { ciphertext, iv } both as Base64 strings
 */
export async function encrypt(
  masterKey: CryptoKey,
  plaintext: string,
  options: { iv?: Uint8Array; aad?: string } = {}
): Promise<{ ciphertext: string; iv: string }> {
  const iv = options.iv ?? generateIv();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv: iv.buffer as ArrayBuffer,
      ...(options.aad !== undefined && { additionalData: stringToArrayBuffer(options.aad) }),
    },
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
  data: ArrayBuffer,
  aad?: string
): Promise<{ ciphertext: ArrayBuffer; iv: string }> {
  const iv = generateIv();
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer, ...(aad !== undefined && { additionalData: stringToArrayBuffer(aad) }) },
    masterKey,
    data
  );
  return { ciphertext, iv: uint8ArrayToBase64(iv) };
}

/**
 * Decrypt binary data with AES-GCM (with the AAD it was encrypted with, if any)
 */
export async function decryptBytes(
  masterKey: CryptoKey,
  ciphertext: ArrayBuffer,
  ivBase64: string,
  aad?: string
): Promise<ArrayBuffer> {
  const iv = base64ToUint8Array(ivBase64);
  return crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer, ...(aad !== undefined && { additionalData: stringToArrayBuffer(aad) }) },
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
  iv: string,
  aad?: string
): Promise<string> {
  const ciphertextBuffer = base64ToUint8Array(ciphertext);
  const ivBuffer = base64ToUint8Array(iv);

  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: ivBuffer.buffer as ArrayBuffer,
      ...(aad !== undefined && { additionalData: stringToArrayBuffer(aad) }),
    },
    masterKey,
    ciphertextBuffer.buffer as ArrayBuffer
  );

  return arrayBufferToString(plaintextBuffer);
}
