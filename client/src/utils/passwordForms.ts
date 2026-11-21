import { deriveAuthSecret, legacyPasswordForm } from '@shared/crypto/authSecret.js';

/*
 * Passwords are normalized (NFKC) before the sign-in secret and the KEK are
 * derived (shared/src/crypto/authSecret.ts). An account whose password was set
 * before that, with characters normalizing changes, still has a secret made
 * from the password exactly as typed — so a check the server refuses as a
 * wrong password is tried once more with that form. Nearly every password is
 * the same either way and is sent once.
 */

// By shape, not `instanceof ApiError`: many tests mock services/api.ts
const wrongPassword = (err: unknown): boolean => {
  const e = err as { status?: unknown; body?: { requires2FA?: unknown } } | null;
  // A 401 that asks for the 2FA code means the password was right
  return e?.status === 401 && e.body?.requires2FA !== true;
};

/** Send a request that carries the sign-in secret for this password (normalized, then as typed for an older account). */
export async function withAuthSecret<T>(password: string, email: string, send: (authSecret: string) => Promise<T>): Promise<T> {
  try {
    return await send(await deriveAuthSecret(password, email));
  } catch (err) {
    if (legacyPasswordForm(password) === null || !wrongPassword(err)) throw err;
    return send(await deriveAuthSecret(password, email, undefined, { asTyped: true }));
  }
}
