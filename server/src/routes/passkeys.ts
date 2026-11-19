import { Router, type Request, type Response } from 'express';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import {
  passkeyRegisterSchema, passkeyRenameSchema, passkeyRemoveSchema, passkeyLoginSchema,
  confirmOptionsSchema, confirmVerifySchema, type ConfirmAction,
} from '@chronicles/shared';
import { prisma } from '../db/prisma.js';
import {
  MAX_PASSKEYS, addPasskey, findPasskey, listPasskeys, notePasskeyUsed, passkeyExists,
  removeAllPasskeys, removePasskey, renamePasskey, type StoredPasskey,
} from '../db/passkeyQueries.js';
import { authMiddleware, createSession, revokeAllSessions, revokeBrowserSession, revokeSession } from '../middleware/auth.js';
import { apiLimiter, authLimiter, strictLimiter } from '../middleware/rateLimiter.js';
import { parseId } from '../middleware/parseId.js';
import { sharedState } from '../services/sharedState.js';
import { issueConfirmToken } from '../services/confirmTokens.js';
import { passkeyUserHandle, webauthnConfig } from '../services/webauthn.js';
import { logSecurityEvent } from '../utils/securityLogger.js';
import { beginPending2FA, confirmGate, confirmIdentity, countConfirmFailure, rememberKnownDevice, rememberSignInNetwork, secondFactorGate, sendIfHasherBusy, setSessionCookie, trustedForSignIn } from './auth.js';
import { beginSignIn, cancelSignIns, endSignIn, signInStillWanted } from './authState.js';
import { previewField } from '../services/previews.js';

/*
 * Passkeys: sign in and open the journal with one touch.
 *
 * A passkey signs a challenge (which proves who it is, with the fingerprint /
 * face / PIN check done) and, through the PRF extension, gives the page a
 * secret that opens this passkey's wrap of the master key. The server checks
 * the signature and hands back that wrap — ciphertext it can't open. The PRF
 * secret never comes here: `clientExtensionResults` is dropped by the schemas.
 *
 * Mounted at /api/auth. Public: passkey/options, passkey/verify (sign-in).
 * Signed in: the list, adding, renaming, removing, and confirming a sensitive
 * action with a touch (confirm/options, confirm/verify).
 */

const router = Router();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOGIN_CHALLENGES = 'passkey_login';
const registerChallenges = (selector: string) => `passkey_register:${selector}`;
const confirmChallenges = (action: ConfirmAction, selector: string) => `passkey_confirm:${action}:${selector}`;

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/** What the list in Settings shows — never the public key or the wrap */
const publicView = (p: StoredPasskey) => ({
  id: p.id, name: p.name, synced: p.backedUp,
  createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
});

/** This passkey's wrap of the master key: what its PRF secret opens */
const wrapOf = (p: StoredPasskey) => ({ credentialId: p.credentialId, wrappedMK: b64(p.wrappedMK), wrapIv: b64(p.wrapIv) });

/** The challenge an answer says it signed (from its clientDataJSON), or null. */
function challengeOf(clientDataJSON: string): string | null {
  try {
    const challenge = (JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as { challenge?: unknown }).challenge;
    return typeof challenge === 'string' && challenge.length <= 512 ? challenge : null;
  } catch {
    return null;
  }
}

/**
 * Check a signed challenge against a stored passkey. The challenge must be one
 * this server issued into `bucket` and is spent here, whatever the outcome
 * (an unknown passkey included), so an answer can't be replayed. The user must
 * have been verified (the touch).
 */
async function checkAssertion(
  response: Parameters<typeof verifyAuthenticationResponse>[0]['response'],
  bucket: string,
  expectAccount: number | null,
): Promise<StoredPasskey | null> {
  const passkey = await findPasskey(response.id);
  if (!passkey || (expectAccount !== null && passkey.accountId !== expectAccount)) {
    const challenge = challengeOf(response.response.clientDataJSON);
    if (challenge) await sharedState.takeToken(bucket, challenge);
    return null;
  }
  const { rpID, origins } = webauthnConfig();
  let issuedFor: number | null = null;
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: async (challenge: string) => {
      issuedFor = await sharedState.takeToken(bucket, challenge);
      return issuedFor !== null;
    },
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey) as Parameters<typeof verifyAuthenticationResponse>[0]['credential']['publicKey'],
      // A synced passkey lives on several devices, and their counters don't
      // run in step (most leave it at 0). Holding one to "never lower than last
      // time" refuses a good passkey for good, so only a device-bound one is held to it
      counter: passkey.backedUp ? 0 : passkey.signCount,
      transports: passkey.transports as Parameters<typeof verifyAuthenticationResponse>[0]['credential']['transports'],
    },
  }).catch((err: unknown) => {
    // Why it failed, for the log only (the answer to the browser stays the
    // same): the verifier's own words name the cause — an origin or RP ID that
    // isn't this server's, a spent challenge, a signature that doesn't check
    logSecurityEvent('passkey_verify_failed', { accountId: passkey.accountId, details: { bucket: bucket.split(':')[0], why: (err instanceof Error ? err.message : 'unknown').slice(0, 240) } });
    return null;
  });
  if (!verification) return null;
  if (!verification.verified || !verification.authenticationInfo.userVerified) {
    logSecurityEvent('passkey_verify_failed', { accountId: passkey.accountId, details: { bucket: bucket.split(':')[0], why: verification.verified ? 'user not verified' : 'not verified' } });
    return null;
  }
  // A challenge made for one account's confirmation only confirms that account
  if (expectAccount !== null && issuedFor !== expectAccount) return null;
  await notePasskeyUsed(passkey.id, verification.authenticationInfo.newCounter, verification.authenticationInfo.credentialBackedUp);
  return passkey;
}

// =============================================================================
// POST /api/auth/passkey/options — a challenge to sign in with
// =============================================================================
// No email is asked for and no passkeys are listed: the browser offers the ones
// it holds for this site, so the answer says nothing about who has an account.
router.post('/passkey/options', authLimiter, async (_req, res) => {
  try {
    const { rpID } = webauthnConfig();
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', timeout: 120_000 });
    await sharedState.putToken(LOGIN_CHALLENGES, options.challenge, 0, CHALLENGE_TTL_MS);
    res.json({ options });
  } catch (err) {
    console.error('Passkey options error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Passkey sign-in is unavailable' });
  }
});

// =============================================================================
// POST /api/auth/passkey/verify — sign in with a passkey
// =============================================================================
// On an account without 2FA, one touch signs in (the device, and its
// fingerprint / face / PIN). With 2FA on, a passkey stands in for the password
// only: the answer is a pending token, like /login's, and /login/2fa makes the
// session once the authenticator or backup code is given — handing back this
// passkey's wrap — unless this browser is trusted to skip the code (checked
// after the touch, again once the session exists). Every failure answers the same.
router.post('/passkey/verify', authLimiter, async (req, res) => {
  let flight: string | null = null;
  // Every answer that makes no session releases the flight at once
  const refuse = async () => {
    await endSignIn(flight);
    res.status(401).json({ error: 'That passkey didn’t work. Try again, or sign in with your password.' });
  };
  try {
    const parsed = passkeyLoginSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid request' }); return; }

    // Held from before the check until the session exists: "Sign out
    // everywhere" landing in between cancels this sign-in (routes/authState.ts).
    // A failed lookup is a server error, never "not on your account" — that
    // answer tells the browser to delete the passkey from the device
    const candidate = await findPasskey(parsed.data.response.id);
    flight = candidate ? await beginSignIn(candidate.accountId) : null;
    const passkey = await checkAssertion(parsed.data.response, LOGIN_CHALLENGES, null);
    if (!passkey) {
      // A passkey this server has never stored: one made on the device whose
      // adding never finished (the page was closed, a password manager took
      // over half way). Saying so lets the browser drop it from the device
      // (signalUnknownCredential) instead of offering it at every sign-in. It
      // tells nothing about any account: the id is one the caller already holds
      const unknown = !candidate;
      logSecurityEvent('passkey_login_failed', { ip: req.ip, details: { reason: unknown ? 'unknown_credential' : 'verification' } });
      if (unknown) {
        res.status(401).json({ error: 'That passkey didn’t work because it isn’t on your account. Sign in with your password, then add it again in Settings.', unknownCredential: true });
        return;
      }
      await refuse();
      return;
    }
    if (!flight || !candidate || candidate.accountId !== passkey.accountId) { await refuse(); return; }
    const account = await prisma.account.findUnique({ where: { id: passkey.accountId } });
    if (!account) { await refuse(); return; }

    // With 2FA on, the code is still needed — unless this browser is trusted.
    // The pending token takes over from the flight (cancelSignIns ends both)
    const twoFA = !!(account.totpEnabled && account.totpSecret);
    const trusted = twoFA && await trustedForSignIn(req, account.id);
    if (twoFA && !trusted) {
      const pendingToken = await beginPending2FA(account.id, passkey.id);
      await endSignIn(flight);
      logSecurityEvent('login_2fa_required', { accountId: account.id, ip: req.ip, details: { method: 'passkey' } });
      res.json({ requires2FA: true, pendingToken });
      return;
    }
    if (trusted) logSecurityEvent('login_trusted_browser', { accountId: account.id, ip: req.ip, details: { method: 'passkey' } });

    const token = await createSession(account.id, account.tenantSchemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: 'passkey',
    });
    // Removed while this request was in flight ("Remove all passkeys" after a
    // lost device), every session signed out, or the browser's trust ended:
    // the session it just earned must not outlive that. (signInStillWanted
    // spends the flight either way)
    if (!(await passkeyExists(passkey.id, account.id)) || !(await signInStillWanted(account.id, flight))
      || (trusted && !(await trustedForSignIn(req, account.id)))) {
      try { await revokeSession(token.slice(0, 12), 'credentials_changed'); } catch { /* already gone */ }
      logSecurityEvent('login_superseded', { accountId: account.id });
      await refuse();
      return;
    }

    logSecurityEvent('login_success', { accountId: account.id, ip: req.ip, details: { method: 'passkey' } });
    rememberSignInNetwork(req, account.id);
    try { await revokeBrowserSession(req); } catch { /* best effort: the new session works either way */ }
    rememberKnownDevice(res, account);
    setSessionCookie(res, token);
    res.json({
      user: { ...previewField(account.id), email: account.email, username: account.username, totpEnabled: account.totpEnabled },
      passkey: wrapOf(passkey),
    });
  } catch (err) {
    console.error('Passkey sign-in error:', err instanceof Error ? err.message : 'Unknown error');
    await endSignIn(flight).catch(() => { /* expires on its own */ });
    res.status(500).json({ error: 'Passkey sign-in failed' });
  }
});

// =============================================================================
// GET /api/auth/passkeys — this account's passkeys
// =============================================================================
router.get('/passkeys', authMiddleware, apiLimiter, async (req, res) => {
  try {
    res.json((await listPasskeys(req.auth!.accountId)).map(publicView));
  } catch (err) {
    console.error('List passkeys error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to list passkeys' });
  }
});

// =============================================================================
// POST /api/auth/passkeys/register/options — a challenge to make a passkey with
// =============================================================================
router.post('/passkeys/register/options', authLimiter, authMiddleware, async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.auth!.accountId }, select: { id: true, email: true, username: true } });
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
    const existing = await listPasskeys(account.id);
    if (existing.length >= MAX_PASSKEYS) {
      res.status(409).json({ error: `You can have up to ${MAX_PASSKEYS} passkeys. Remove one first.` });
      return;
    }
    const { rpID, rpName } = webauthnConfig();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: account.email,
      userDisplayName: account.username,
      userID: new Uint8Array(passkeyUserHandle(account.id)) as Parameters<typeof generateRegistrationOptions>[0]['userID'],
      attestationType: 'none',
      timeout: 120_000,
      // The same authenticator can't hold two passkeys for one account
      excludeCredentials: existing.map(p => ({ id: p.credentialId, transports: p.transports })),
      // Discoverable (sign-in asks for no email) and always user-verified
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    await sharedState.putToken(registerChallenges(req.auth!.selector), options.challenge, account.id, CHALLENGE_TTL_MS);
    res.json({ options });
  } catch (err) {
    console.error('Passkey register options error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Couldn’t start adding a passkey' });
  }
});

// =============================================================================
// POST /api/auth/passkeys/register/verify — store the new passkey and its wrap
// =============================================================================
// Adding a passkey adds a way to open the journal, so it is confirmed like the
// other sensitive actions: the password (and a 2FA code when on), or a touch
// of a passkey the account already has.
router.post('/passkeys/register/verify', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const parsed = passkeyRegisterSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }); return; }
    const { response, wrappedMK, wrapIv, name, currentAuthSecret, confirmToken, code } = parsed.data;

    const account = await prisma.account.findUnique({ where: { id: req.auth!.accountId } });
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

    // The new passkey first: its challenge is spent whatever happens next
    const { rpID, origins } = webauthnConfig();
    const bucket = registerChallenges(req.auth!.selector);
    const verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: async (challenge: string) => (await sharedState.takeToken(bucket, challenge)) === account.id,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
    }).catch(() => null);
    if (!verification?.verified || !verification.registrationInfo.userVerified) {
      logSecurityEvent('passkey_add_failed', { accountId: account.id, ip: req.ip, details: { reason: 'verification' } });
      res.status(400).json({ error: 'That passkey couldn’t be verified. Try adding it again.' });
      return;
    }

    if (!(await confirmIdentity(req, res, account, { authSecret: currentAuthSecret, code, confirmToken }, 'passkey-add', 'passkey_add_failed'))) return;

    const { credential, credentialBackedUp } = verification.registrationInfo;
    const added = await addPasskey({
      accountId: account.id,
      credentialId: credential.id,
      publicKey: credential.publicKey,
      signCount: credential.counter,
      transports: (credential.transports ?? []) as string[],
      backedUp: credentialBackedUp,
      name,
      wrappedMK: new Uint8Array(Buffer.from(wrappedMK, 'base64')),
      wrapIv: new Uint8Array(Buffer.from(wrapIv, 'base64')),
    });
    if (!added) {
      res.status(409).json({ error: `That passkey is already added, or you have ${MAX_PASSKEYS} already.` });
      return;
    }
    logSecurityEvent('passkey_added', { accountId: account.id, ip: req.ip });
    res.status(201).json({ passkeys: (await listPasskeys(account.id)).map(publicView) });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Passkey register error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Couldn’t add the passkey' });
  }
});

// =============================================================================
// PATCH /api/auth/passkeys/:id — rename
// =============================================================================
router.patch('/passkeys/:id', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const id = parseId(String(req.params.id));
    const parsed = passkeyRenameSchema.safeParse(req.body);
    if (Number.isNaN(id) || !parsed.success) { res.status(400).json({ error: 'Invalid request' }); return; }
    if (!(await renamePasskey(req.auth!.accountId, id, parsed.data.name))) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('Rename passkey error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed' });
  }
});

/** Shared by the two removals: the confirmation, then `remove`. */
async function confirmedRemoval(req: Request, res: Response, remove: (accountId: number) => Promise<number>): Promise<void> {
  const parsed = passkeyRemoveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Enter your account password' }); return; }
  const account = await prisma.account.findUnique({ where: { id: req.auth!.accountId } });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
  const { currentAuthSecret, confirmToken, code } = parsed.data;
  if (!(await confirmIdentity(req, res, account, { authSecret: currentAuthSecret, code, confirmToken }, 'passkey-remove', 'passkey_remove_failed'))) return;
  const removed = await remove(account.id);
  if (removed === 0) { res.status(404).json({ error: 'Not found' }); return; }
  // A passkey is removed because its device is gone or no longer trusted: any
  // session it already made must not outlive it. Like the other credential
  // changes, every other session is signed out and this one stays (sign-ins
  // under way are cancelled first, so none finishes afterwards)
  await cancelSignIns(account.id);
  await revokeAllSessions(account.id, req.auth!.selector, 'passkey_removed');
  logSecurityEvent(removed > 1 ? 'passkeys_removed_all' : 'passkey_removed', { accountId: account.id, ip: req.ip, details: { count: removed } });
  res.json({ passkeys: (await listPasskeys(account.id)).map(publicView) });
}

// =============================================================================
// POST /api/auth/passkeys/remove-all — a device was lost
// =============================================================================
// (Before /:id, so "remove-all" is never read as an id.)
router.post('/passkeys/remove-all', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    await confirmedRemoval(req, res, removeAllPasskeys);
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Remove passkeys error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed' });
  }
});

// =============================================================================
// POST /api/auth/passkeys/:id/remove
// =============================================================================
router.post('/passkeys/:id/remove', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const id = parseId(String(req.params.id));
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid request' }); return; }
    await confirmedRemoval(req, res, async accountId => ((await removePasskey(accountId, id)) ? 1 : 0));
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Remove passkey error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed' });
  }
});

// =============================================================================
// POST /api/auth/confirm/options — a challenge to confirm one action with
// =============================================================================
// Tied to the action and to this session: a challenge made for "delete
// account" confirms nothing else, and nothing in another session.
router.post('/confirm/options', authLimiter, authMiddleware, async (req, res) => {
  try {
    const parsed = confirmOptionsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid request' }); return; }
    const passkeys = await listPasskeys(req.auth!.accountId);
    if (passkeys.length === 0) { res.status(409).json({ error: 'This account has no passkey. Enter your account password.' }); return; }
    const { rpID } = webauthnConfig();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      timeout: 120_000,
      allowCredentials: passkeys.map(p => ({ id: p.credentialId, transports: p.transports })),
    });
    await sharedState.putToken(confirmChallenges(parsed.data.action, req.auth!.selector), options.challenge, req.auth!.accountId, CHALLENGE_TTL_MS);
    res.json({ options });
  } catch (err) {
    console.error('Confirm options error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Passkey confirmation is unavailable' });
  }
});

// =============================================================================
// POST /api/auth/confirm/verify — the touch checked: a token for that action
// =============================================================================
// Answers with a single-use token the action's own request spends, and with
// that passkey's wrap, which the page needs to make a new wrap of the key (a
// new password, a recovery key, another passkey). Wrong answers count in the
// session's confirm lockout, like wrong passwords. With 2FA on, the touch
// stands in for the password only: an authenticator or backup code comes with
// it (counted in the session's 2FA bucket), and no token is issued without it.
router.post('/confirm/verify', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const parsed = confirmVerifySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid request' }); return; }
    const { action, response, code } = parsed.data;
    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { id: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
    });
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
    const twoFA = !!(account.totpEnabled && account.totpSecret);
    if (twoFA && !code) {
      res.status(401).json({ error: 'Enter the code from your authenticator app or a backup code', requires2FA: true });
      return;
    }
    const passkey = await checkAssertion(response, confirmChallenges(action, req.auth!.selector), req.auth!.accountId);
    if (!passkey) {
      await countConfirmFailure(req);
      logSecurityEvent('passkey_confirm_failed', { accountId: req.auth!.accountId, ip: req.ip, details: { action } });
      res.status(401).json({ error: 'That passkey didn’t work. Try again, or enter your account password.' });
      return;
    }
    if (twoFA && !(await secondFactorGate({ ...account, totpEnabled: true }, code, req, res, 'passkey_confirm_failed'))) return;
    const confirmToken = await issueConfirmToken(action, req.auth!.selector, req.auth!.accountId);
    logSecurityEvent('passkey_confirmed', { accountId: req.auth!.accountId, ip: req.ip, details: { action } });
    res.json({ confirmToken, passkey: wrapOf(passkey) });
  } catch (err) {
    console.error('Confirm verify error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Passkey confirmation failed' });
  }
});

export default router;
