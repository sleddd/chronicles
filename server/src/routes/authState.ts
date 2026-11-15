import crypto from 'crypto';
import { sharedState } from '../services/sharedState.js';

/** Shared sign-in state bucket for pending 2FA sign-ins (services/sharedState.ts). */
export const PENDING_2FA = 'pending_2fa';

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
