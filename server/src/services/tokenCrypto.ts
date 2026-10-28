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

// Bound form: `b1:iv:ciphertext:tag`, sealed with an AAD naming the row the
// secret belongs to (`totp:<account id>`, a grant's hash…), so a ciphertext
// copied into another row of the database no longer opens there. The older
// unbound `iv:ciphertext:tag` still opens where the caller allows it.
const BOUND_PREFIX = 'b1';

export function isBoundToken(stored: string): boolean {
  return stored.startsWith(`${BOUND_PREFIX}:`);
}

export function encryptToken(plaintext: string, aad?: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const body = `${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
  return aad !== undefined ? `${BOUND_PREFIX}:${body}` : body;
}

/**
 * Open a sealed secret. With `aad`, a bound value must carry that AAD; an
 * unbound (older) value opens only while `allowUnbound` (the default) holds.
 */
export function decryptToken(stored: string, aad?: string, { allowUnbound = true } = {}): string {
  const key = getKey();
  let parts = stored.split(':');
  let bound = false;
  if (parts.length === 4 && parts[0] === BOUND_PREFIX) { parts = parts.slice(1); bound = true; }
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  if (bound && aad === undefined) throw new Error('Sealed secret needs its binding');
  if (!bound && aad !== undefined && !allowUnbound) throw new Error('Unbound sealed secret refused');
  const [iv, ciphertext, tag] = parts.map(p => Buffer.from(p, 'base64'));
  // A full 16-byte tag only: a truncated one would be accepted otherwise
  if (tag.length !== 16) throw new Error('Invalid encrypted token format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  if (bound) decipher.setAAD(Buffer.from(aad!, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** The AAD a Google Calendar refresh token is sealed with: its account. */
export const googleTokenAad = (accountId: number) => `google:${accountId}`;
