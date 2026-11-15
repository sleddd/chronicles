import crypto from 'crypto';
import type { ConfirmAction } from '@chronicles/shared';
import { sharedState } from './sharedState.js';

/*
 * A passkey touch can confirm a sensitive action in place of the password and
 * the 2FA code. The touch is checked once (POST /api/auth/confirm/verify) and
 * answered with a token that the action's own request then spends. A token is
 * good for one action, in the session that earned it, once, for five minutes:
 * one made for "delete account" confirms nothing else.
 */

const TTL_MS = 5 * 60 * 1000;
const bucket = (action: ConfirmAction, selector: string) => `confirm:${action}:${selector}`;

export async function issueConfirmToken(action: ConfirmAction, selector: string, accountId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await sharedState.putToken(bucket(action, selector), token, accountId, TTL_MS);
  return token;
}

/** Spend a token: true only for this action, this session and this account, and only once. */
export async function takeConfirmToken(action: ConfirmAction, selector: string, accountId: number, token: string): Promise<boolean> {
  return (await sharedState.takeToken(bucket(action, selector), token)) === accountId;
}
