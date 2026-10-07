import crypto from 'crypto';

/**
 * "Remember me" grants — the server's half of staying unlocked across page
 * loads until the browser closes.
 *
 * The browser keeps the master key wrapped under a 32-byte device secret
 * (ciphertext only, in localStorage). That secret lives ONLY here, in process
 * memory — never in the database or logs — keyed by the SHA-256 of a random
 * grant id carried in an HttpOnly, SameSite=Strict *session* cookie (no
 * Expires, so the browser drops it when it closes). Unwrapping therefore needs
 * all of: the local blob, the session cookie, a valid signed-in session that
 * created the grant, and this process. Each grant also has an absolute
 * lifetime, so a browser that restores session cookies can't keep it alive.
 */

export const REMEMBER_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

interface Grant {
  secret: Buffer;
  selector: string;
  accountId: number;
  expiresAt: number;
}

const grants = new Map<string, Grant>();

const hashId = (id: string) => crypto.createHash('sha256').update(id).digest('hex');

function sweep(now = Date.now()) {
  for (const [k, g] of grants) {
    if (g.expiresAt <= now) { g.secret.fill(0); grants.delete(k); }
  }
}

/** Create a grant for this signed-in session. Returns the cookie value and the device secret. */
export function createGrant(accountId: number, selector: string, now = Date.now()): { grantId: string; secret: Buffer; expiresAt: number } {
  sweep(now);
  // One live grant per session: re-enabling replaces the old one
  revokeGrantsForSession(selector);
  const grantId = crypto.randomBytes(32).toString('base64url');
  const secret = crypto.randomBytes(32);
  const expiresAt = now + REMEMBER_MAX_AGE_MS;
  grants.set(hashId(grantId), { secret, selector, accountId, expiresAt });
  return { grantId, secret: Buffer.from(secret), expiresAt };
}

/** The device secret for a grant — only for the same account and session that created it. */
export function readGrant(grantId: string | undefined, accountId: number, selector: string, now = Date.now()): { secret: Buffer; expiresAt: number } | null {
  if (!grantId || grantId.length > 128) return null;
  const key = hashId(grantId);
  const g = grants.get(key);
  if (!g) return null;
  if (g.expiresAt <= now) { g.secret.fill(0); grants.delete(key); return null; }
  const sameSession = g.accountId === accountId
    && g.selector.length === selector.length
    && crypto.timingSafeEqual(Buffer.from(g.selector), Buffer.from(selector));
  if (!sameSession) return null;
  return { secret: Buffer.from(g.secret), expiresAt: g.expiresAt };
}

export function revokeGrant(grantId: string | undefined): void {
  if (!grantId) return;
  const key = hashId(grantId);
  const g = grants.get(key);
  if (g) { g.secret.fill(0); grants.delete(key); }
}

export function revokeGrantsForSession(selector: string): void {
  for (const [k, g] of grants) {
    if (g.selector === selector) { g.secret.fill(0); grants.delete(k); }
  }
}

export function revokeGrantsForAccount(accountId: number, exceptSelector?: string): void {
  for (const [k, g] of grants) {
    if (g.accountId === accountId && g.selector !== exceptSelector) { g.secret.fill(0); grants.delete(k); }
  }
}

/** Test helper. */
export function _clearGrants(): void { grants.clear(); }
