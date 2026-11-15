import crypto from 'crypto';

/*
 * Passkey (WebAuthn) settings. A passkey is tied for good to the domain it was
 * made on (the "RP ID"), so this must be the production domain from the first
 * passkey on: WEBAUTHN_RP_ID, else the host of APP_URL / CLIENT_URL, else
 * localhost (development).
 */

type Env = Record<string, string | undefined>;

const originOf = (url: string | undefined): string | null => {
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
};

export function webauthnConfig(env: Env = process.env): { rpID: string; rpName: string; origins: string[] } {
  const origins = [...new Set([originOf(env.APP_URL), originOf(env.CLIENT_URL)].filter((o): o is string => o !== null))];
  if (origins.length === 0) origins.push('http://localhost:5173', 'http://localhost:3001');
  const rpID = env.WEBAUTHN_RP_ID?.trim() || new URL(origins[0]).hostname;
  return { rpID, rpName: 'Chronicles', origins };
}

// The user handle an authenticator stores with an account's passkeys: the same
// for all of that account's passkeys, and nothing that says who it is — an
// HMAC of the account id, never the id or the email
function handleKey(env: Env): Buffer {
  const configured = env.SECRETS_ENCRYPTION_KEY || env.CALENDAR_TOKEN_KEY;
  const base = configured ? Buffer.from(configured, 'base64') : Buffer.from(env.DATABASE_URL ?? 'chronicles-dev');
  return crypto.createHmac('sha256', base).update('chronicles:passkey-user-handle').digest();
}

export function passkeyUserHandle(accountId: number, env: Env = process.env): Buffer {
  return crypto.createHmac('sha256', handleKey(env)).update(String(accountId)).digest();
}
