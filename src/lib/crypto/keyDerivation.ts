/**
 * Derive an encryption key from a password and salt using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: string
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
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable for HMAC key derivation
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * Generate a random salt for encryption (32 bytes)
 */
export function generateSalt(): string {
  const salt = window.crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...salt));
}
