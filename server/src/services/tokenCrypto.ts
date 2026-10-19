import crypto from 'crypto';

/**
 * Encrypts server-held secrets at rest with AES-256-GCM (OAuth refresh tokens,
 * R2 credentials). Key comes from SECRETS_ENCRYPTION_KEY (base64, 32 bytes);
 * CALENDAR_TOKEN_KEY is accepted as a backward-compatible alias.
 * Stored format: iv:ciphertext:tag (base64 parts).
 */

function getKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY || process.env.CALENDAR_TOKEN_KEY;
  if (!raw) {
    throw new Error('SECRETS_ENCRYPTION_KEY is not configured');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  }
  return key;
}

export function isTokenCryptoConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
}

export function decryptToken(stored: string): string {
  const key = getKey();
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  const [iv, ciphertext, tag] = parts.map(p => Buffer.from(p, 'base64'));
  // A full 16-byte tag only: a truncated one would be accepted otherwise
  if (tag.length !== 16) throw new Error('Invalid encrypted token format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
