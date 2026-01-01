// PBKDF2 iteration counts
const PBKDF2_ITERATIONS_CURRENT = 600000; // OWASP 2023 recommendation
const PBKDF2_ITERATIONS_LEGACY = 100000; // Original value for backward compatibility

/**
 * Derive an encryption key from a password and salt using PBKDF2
 * Uses current iteration count (600,000) for new keys
 */
export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS_CURRENT
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));

  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable for key wrapping and export
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  return key;
}

/**
 * Derive a legacy key using the old iteration count (100,000)
 * Used for backward compatibility with accounts created before the security update
 */
export async function deriveLegacyKey(
  password: string,
  salt: string
): Promise<CryptoKey> {
  return deriveKey(password, salt, PBKDF2_ITERATIONS_LEGACY);
}

/**
 * Generate a random salt for encryption (32 bytes)
 */
export function generateSalt(): string {
  const salt = window.crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...salt));
}

/**
 * Generate a random recovery key (256 bits / 32 bytes)
 * Returns a base64-encoded string that the user must save
 */
export function generateRecoveryKey(): string {
  const recoveryKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...recoveryKeyBytes));
}

/**
 * Derive a key from a recovery key for encrypting/decrypting the master key
 */
export async function deriveKeyFromRecoveryKey(
  recoveryKey: string,
  salt: string
): Promise<CryptoKey> {
  // Decode the recovery key from base64
  const recoveryKeyBuffer = Uint8Array.from(atob(recoveryKey), (c) => c.charCodeAt(0));
  const saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));

  // Import the recovery key as key material
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    recoveryKeyBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive an AES key from the recovery key
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 600000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  return key;
}

/**
 * Export a CryptoKey to a base64 string (for wrapping/storing)
 */
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

/**
 * Import a CryptoKey from a base64 string
 */
export async function importKeyFromBase64(keyBase64: string): Promise<CryptoKey> {
  const keyBuffer = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a master key with a wrapping key (password-derived or recovery-derived)
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<{ encryptedKey: string; iv: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const wrapped = await window.crypto.subtle.wrapKey(
    'raw',
    masterKey,
    wrappingKey,
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128,
    }
  );

  return {
    encryptedKey: btoa(String.fromCharCode(...new Uint8Array(wrapped))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

/**
 * Decrypt a master key using a wrapping key (password-derived or recovery-derived)
 */
export async function unwrapMasterKey(
  encryptedKey: string,
  iv: string,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  const encryptedBuffer = Uint8Array.from(atob(encryptedKey), (c) => c.charCodeAt(0));
  const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  return await window.crypto.subtle.unwrapKey(
    'raw',
    encryptedBuffer,
    wrappingKey,
    {
      name: 'AES-GCM',
      iv: ivBuffer,
      tagLength: 128,
    },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a new master key for encryption
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Format recovery key for display (groups of 4 characters)
 */
export function formatRecoveryKeyForDisplay(recoveryKey: string): string {
  // Convert base64 to hex for easier reading
  const bytes = Uint8Array.from(atob(recoveryKey), (c) => c.charCodeAt(0));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  // Split into groups of 4
  return hex.match(/.{1,4}/g)?.join('-') || hex;
}

/**
 * Parse recovery key from display format back to base64
 */
export function parseRecoveryKeyFromDisplay(displayKey: string): string {
  // Remove dashes and convert hex back to bytes
  const hex = displayKey.replace(/-/g, '');
  const bytes = new Uint8Array(hex.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []);
  return btoa(String.fromCharCode(...bytes));
}
