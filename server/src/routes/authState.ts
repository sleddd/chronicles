import crypto from 'crypto';
import { sharedState } from '../services/sharedState.js';

/** Shared sign-in state bucket for pending 2FA sign-ins (services/sharedState.ts). */
export const PENDING_2FA = 'pending_2fa';
/*
 * A passkey sign-in waiting on its 2FA code: which passkey started it, so the
 * session made after the code hands back that passkey's wrap. Kept under the
 * same pending token, and only a token still in PENDING_2FA counts, so
 * `cancelSignIns` ends these too.
 *
 * The shared state's token rows hold one number, normally an account id; here
 * it is the passkey's row id. Only these three functions touch the bucket —
 * never `deleteTokensForAccount`, which would read that number as an account.
 */
const PENDING_2FA_PASSKEY = 'pending_2fa_passkey';

export function rememberPendingPasskey(pendingToken: string, passkeyId: number, ttlMs: number): Promise<void> {
  return sharedState.putToken(PENDING_2FA_PASSKEY, pendingToken, passkeyId, ttlMs);
}

/** The passkey row id a pending sign-in started with, or null for a password sign-in. */
export function pendingPasskeyOf(pendingToken: string): Promise<number | null> {
  return sharedState.getToken(PENDING_2FA_PASSKEY, pendingToken);
}

export function forgetPendingPasskey(pendingToken: string): Promise<void> {
  return sharedState.deleteToken(PENDING_2FA_PASSKEY, pendingToken);
}

/* A sign-in that began as the Chronicles AI app's (`client: 'smith'`) can only
   be finished as one, and a browser's can't be finished as the app's: the
   pending token remembers which it was, so the two steps always agree. */
const PENDING_2FA_ASSISTANT = 'pending_2fa_assistant';

export function rememberPendingAssistant(pendingToken: string, accountId: number, ttlMs: number): Promise<void> {
  return sharedState.putToken(PENDING_2FA_ASSISTANT, pendingToken, accountId, ttlMs);
}

export async function pendingIsAssistant(pendingToken: string): Promise<boolean> {
  return (await sharedState.getToken(PENDING_2FA_ASSISTANT, pendingToken)) !== null;
}

export function forgetPendingAssistant(pendingToken: string): Promise<void> {
  return sharedState.deleteToken(PENDING_2FA_ASSISTANT, pendingToken);
}

/*
 * Sign-ins in flight. A sign-in checks who is asking, then makes its session a
 * moment later. "Sign out everywhere" (and the other changes that sign out
 * every other session) revoke the sessions that exist — not the one about to
 * be made. So a sign-in holds a short-lived token from before its check until
 * its session exists, and those changes delete the account's tokens BEFORE
 * they revoke its sessions (`cancelSignIns`). Either the token was deleted
 * before the sign-in took it (the sign-in is refused), or it was taken first —
 * then the session already existed when the sessions were revoked. None slips
 * through.
 */
const SIGN_IN_FLIGHT = 'signin_flight';
const FLIGHT_TTL_MS = 60 * 1000;

/** A sign-in for this account is starting: the token to hand to `signInStillWanted`. */
export async function beginSignIn(accountId: number): Promise<string> {
  const flight = crypto.randomBytes(32).toString('hex');
  await sharedState.putToken(SIGN_IN_FLIGHT, flight, accountId, FLIGHT_TTL_MS);
  return flight;
}

/** A sign-in that won't make a session (refused, or handed on to the 2FA code): its flight goes now, not at expiry. */
export async function endSignIn(flight: string | null): Promise<void> {
  if (flight) await sharedState.deleteToken(SIGN_IN_FLIGHT, flight);
}

/** The session exists now: false when the account's sign-ins were cancelled meanwhile. */
export async function signInStillWanted(accountId: number, flight: string): Promise<boolean> {
  return (await sharedState.takeToken(SIGN_IN_FLIGHT, flight)) === accountId;
}

/**
 * Cancel every sign-in the account has under way: ones waiting on a 2FA code
 * and ones between their check and their session. Call it BEFORE revoking the
 * account's sessions.
 */
export async function cancelSignIns(accountId: number): Promise<void> {
  await Promise.all([
    sharedState.deleteTokensForAccount(PENDING_2FA, accountId),
    sharedState.deleteTokensForAccount(SIGN_IN_FLIGHT, accountId),
  ]);
}
