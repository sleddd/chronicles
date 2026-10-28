import { Router, type Request, type Response } from 'express';
import { PENDING_2FA } from './authState.js';
import bcrypt, { HasherBusyError } from '../services/passwordHasher.js';
import crypto from 'crypto';
import { promisify } from 'util';
import { generateSecret, generateSync, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../db/prisma.js';
import { isApproved, hasPendingInvite, spendInvite } from '../db/betaQueries.js';
import { registerTenant, deleteAccountById } from '../db/schemaManager.js';
import { revokeGoogleAccess } from '../services/googleRevoke.js';
import { createSession, revokeSession, revokeAllSessions, authMiddleware, revokeBrowserSession } from '../middleware/auth.js';
import { revokeGrantsForAccount } from '../services/rememberGrants.js';
import { sharedState, resetSharedStateForTests } from '../services/sharedState.js';
import { encryptToken, decryptToken, isTokenCryptoConfigured } from '../services/tokenCrypto.js';
import { authLimiter, strictLimiter, registerLimiter } from '../middleware/rateLimiter.js';
import { registerSchema, loginSchema, changePasswordSchema, changeEmailSchema, saveRecoveryKeySchema, recoverSchema, emailSchema, twoFALoginSchema, enable2FASchema, disable2FASchema, deleteAccountSchema, normalizeEmail } from '@chronicles/shared';
import { logSecurityEvent } from '../utils/securityLogger.js';
import { clearRememberCookie } from './remember.js';

// Sign-in state every instance shares (services/sharedState.ts: Postgres by
// default): pending 2FA sign-ins (kept by the token's hash), the last TOTP
// step each account used, and the lockout counters below
const PENDING_2FA_TTL_MS = 5 * 60 * 1000;
const TOTP_STEP = 'totp_step';
const TWO_FA_FAILURES = 'fail_2fa';
const TWO_FA_STRIKES = 'strike_2fa';
const TWO_FA_LONG_LOCK = 'lock_2fa';
const LOGIN_FAILURES = 'fail_login';
const CONFIRM_FAILURES = 'fail_confirm';
const PASSWORD_STRIKES = 'strike_pw';
const PASSWORD_LONG_LOCK = 'lock_pw';
const EMAIL_CHANGES = 'email_change';

/** Drop an account's pending 2FA sign-ins (after a password change, recovery or 2FA change). */
async function cancelPendingTwoFA(accountId: number): Promise<void> {
  await sharedState.deleteTokensForAccount(PENDING_2FA, accountId);
}

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// Backup codes are salted + scrypt-hashed (48 bits of entropy is too little for
// a bare SHA-256 to survive a database leak). Older codes stored as plain
// SHA-256 hex still verify until they're used or replaced — they can't be
// re-hashed without the codes themselves.
async function hashBackupCode(code: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(code, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function findBackupCode(code: string, stored: string[]): Promise<number> {
  const legacy = crypto.createHash('sha256').update(code).digest();
  for (let i = 0; i < stored.length; i++) {
    const entry = stored[i];
    if (entry.startsWith('scrypt$')) {
      const [, saltHex, hashHex] = entry.split('$');
      const expected = Buffer.from(hashHex ?? '', 'hex');
      const actual = await scrypt(code, Buffer.from(saltHex ?? '', 'hex'), 32);
      if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) return i;
    } else {
      const expected = Buffer.from(entry, 'hex');
      if (expected.length === legacy.length && crypto.timingSafeEqual(expected, legacy)) return i;
    }
  }
  return -1;
}

// The TOTP secret is encrypted at rest with the server secrets key when one is
// configured. Base32 secrets never contain ':', which marks the encrypted form.
// Bound to the account, so a sealed secret copied onto another account's row
// doesn't open there; older unbound ones are re-sealed at startup.
const totpAad = (accountId: number) => `totp:${accountId}`;

function sealTotpSecret(secret: string, accountId: number): string {
  return isTokenCryptoConfigured() ? encryptToken(secret, totpAad(accountId)) : secret;
}

function openTotpSecret(stored: string, accountId: number): string {
  return stored.includes(':') ? decryptToken(stored, totpAad(accountId)) : stored;
}

// Replay protection: a TOTP code is accepted at most once (its time step must
// be newer than the last one used — raised atomically, so two instances can't
// both accept it). A day is far longer than any code's window.
const TOTP_STEP_TTL_MS = 24 * 60 * 60 * 1000;

// Per-account cap on wrong second-factor codes, on top of the per-IP limits,
// so guesses spread across many IPs still run out
const TWO_FA_MAX_FAILURES = 10;
const TWO_FA_LOCK_MS = 15 * 60 * 1000;
// Repeat offenders: the third 15-minute lock within a day locks 2FA for a day,
// so a patient guesser gets ~15 codes a day per account instead of ~480
const TWO_FA_MAX_STRIKES = 3;
const TWO_FA_STRIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
const TWO_FA_LONG_LOCK_MS = 24 * 60 * 60 * 1000;

/**
 * Wrong codes count per bucket, like wrong passwords at sign-in: a signed-in
 * session (a password-confirmed action) and a known device (the code screen
 * after signing in on a browser that signed in before) each get their own, and
 * everyone else shares the account's. Someone holding a phished password can
 * then lock only the strangers' bucket — not the owner's own browsers, where
 * they still need to change the password and recover. A session or a known
 * device can only be had by passing 2FA once, so the extra buckets don't give
 * a guesser more tries.
 */
function twoFABucket(req: Request, account: DeviceAccount): string {
  if (req.auth?.accountId === account.id) return `${account.id}:s:${req.auth.selector}`;
  const nonce = knownDeviceNonce(req, account);
  return nonce ? `${account.id}:d:${nonce}` : String(account.id);
}

/** Which 2FA lock the bucket is under, if any. */
async function twoFALock(bucket: string): Promise<'long' | 'short' | null> {
  if (await sharedState.locked(TWO_FA_LONG_LOCK, bucket, 1)) return 'long';
  if (await sharedState.locked(TWO_FA_FAILURES, bucket, TWO_FA_MAX_FAILURES)) return 'short';
  return null;
}

const twoFALockMessage = (lock: 'long' | 'short') => lock === 'long'
  ? 'Too many incorrect codes. Two-factor sign-in is locked for 24 hours.'
  : 'Too many incorrect codes. Try again in 15 minutes.';

/** A wrong code just locked the account: count the strike, and lock for a day on the third. */
async function strikeTwoFALock(accountId: number, bucket: string): Promise<void> {
  const { count } = await sharedState.hit(TWO_FA_STRIKES, bucket, TWO_FA_STRIKE_WINDOW_MS);
  if (count >= TWO_FA_MAX_STRIKES) {
    await sharedState.hit(TWO_FA_LONG_LOCK, bucket, TWO_FA_LONG_LOCK_MS);
    logSecurityEvent('2fa_locked_long', { accountId, details: { strikes: count } });
  } else {
    logSecurityEvent('2fa_locked', { accountId, details: { strikes: count } });
  }
}

/** When 2FA is turned on or off, or the account is deleted: a fresh count, replay guard and locks. */
async function clearTwoFAState(accountId: number): Promise<void> {
  const id = String(accountId);
  await Promise.all([
    sharedState.clear(TWO_FA_FAILURES, id),
    sharedState.clear(TOTP_STEP, id),
    sharedState.clear(TWO_FA_STRIKES, id),
    sharedState.clear(TWO_FA_LONG_LOCK, id),
  ]);
}

// Per-email cap on wrong passwords, on top of the per-IP limit, so guesses
// spread across many IPs still run out. Keyed by the normalized email whether
// or not an account exists, so a lockout never reveals which emails are real.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** Tests only: clear every sign-in record (pending 2FA sign-ins, used
 *  authenticator steps, 2FA and password failure counters) so one test's state
 *  can never leak into the next. Never called by the app. */
export function resetAuthStateForTests(): void {
  resetSharedStateForTests();
}

/**
 * Count a sign-in attempt before the password is checked (bcrypt takes a
 * while, and parallel requests mustn't all pass the lock in that time).
 * Returns false when this bucket is locked. A correct password clears it.
 */
// Repeat offenders, as for 2FA codes: the third 15-minute password lock within
// a day locks that bucket for a day, so guessing from rotating IPs gets ~30
// passwords a day per bucket instead of ~960, for as long as it keeps going
const PASSWORD_MAX_STRIKES = 3;
const PASSWORD_STRIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
const PASSWORD_LONG_LOCK_MS = 24 * 60 * 60 * 1000;

/** The attempt number (1-based) when the bucket has room, else null (locked). */
async function claimPasswordAttempt(failures: string, key: string, max: number, lockMs: number): Promise<number | null> {
  if (await sharedState.locked(PASSWORD_LONG_LOCK, `${failures}:${key}`, 1)) return null;
  const n = await sharedState.attempt(failures, key, max, lockMs);
  return n <= max ? n : null;
}

/** A wrong password on attempt `n`: when it was the one that locked the bucket, count a strike. */
async function passwordFailed(failures: string, key: string, n: number, max: number): Promise<void> {
  if (n !== max) return;
  const id = `${failures}:${key}`;
  const { count } = await sharedState.hit(PASSWORD_STRIKES, id, PASSWORD_STRIKE_WINDOW_MS);
  if (count >= PASSWORD_MAX_STRIKES) await sharedState.hit(PASSWORD_LONG_LOCK, id, PASSWORD_LONG_LOCK_MS);
}

function claimLoginAttempt(key: string): Promise<number | null> {
  return claimPasswordAttempt(LOGIN_FAILURES, key, LOGIN_MAX_FAILURES, LOGIN_LOCK_MS);
}

// Per-account cap on wrong passwords at the password-confirmed actions (change
// password or email, recovery key, key wrap, 2FA, delete account), on top of
// the per-IP limit, so a stolen session can't be used to guess the password
// from many IPs. Counted before the check, like sign-in.
const CONFIRM_MAX_FAILURES = 10;
const CONFIRM_LOCK_MS = 15 * 60 * 1000;

// Per-account cap on email changes, counting every try
const EMAIL_CHANGE_MAX = 5;
const EMAIL_CHANGE_WINDOW_MS = 60 * 60 * 1000;

function claimConfirmAttempt(accountId: number): Promise<number | null> {
  return claimPasswordAttempt(CONFIRM_FAILURES, String(accountId), CONFIRM_MAX_FAILURES, CONFIRM_LOCK_MS);
}

/**
 * Check an authenticator code or a backup code. A used backup code is removed.
 * Returns which factor matched, or null.
 */
async function verifySecondFactor(
  account: { id: number; totpSecret: string; totpBackupCodes: string[] },
  code: string,
  bucket: string,
): Promise<'totp' | 'backup' | null> {
  // Counted (atomically, across instances) before the check, so concurrent
  // guesses can't slip past the cap. Exactly one attempt sees the count reach
  // the cap: if its code is wrong, that's the moment the lock triggered
  if (await sharedState.locked(TWO_FA_LONG_LOCK, bucket, 1)) return null;
  // A sealed secret this server can't open (SECRETS_ENCRYPTION_KEY missing, e.g. a
  // dev server on the live database): every authenticator code would fail, and
  // counting them would lock the owner out everywhere. Refuse as a server error
  // instead, uncounted. Backup codes don't need the key, so they still work.
  if (/^\d{6}$/.test(code) && account.totpSecret.includes(':') && !isTokenCryptoConfigured()) {
    throw new Error('SECRETS_ENCRYPTION_KEY is missing or invalid, so this server cannot open authenticator secrets');
  }
  const attempt = await sharedState.attempt(TWO_FA_FAILURES, bucket, TWO_FA_MAX_FAILURES, TWO_FA_LOCK_MS);
  if (attempt > TWO_FA_MAX_FAILURES) return null;
  const factor = await checkSecondFactor(account, code);
  if (factor) await sharedState.clear(TWO_FA_FAILURES, bucket);
  else if (attempt === TWO_FA_MAX_FAILURES) await strikeTwoFALock(account.id, bucket);
  return factor;
}

/**
 * With 2FA on, an account change that could lock the owner out (password,
 * email, recovery key, deleting the account) also needs an authenticator or
 * backup code, so a stolen session plus a phished password isn't enough.
 * Sends the refusal itself; true means go ahead.
 */
async function secondFactorGate(
  account: { id: number; totpEnabled: boolean; totpSecret: string | null; totpBackupCodes: string[] },
  code: string | undefined,
  req: Request,
  res: Response,
  failedEvent: string,
): Promise<boolean> {
  if (!account.totpEnabled || !account.totpSecret) return true;
  const ip = req.ip;
  const bucket = `${account.id}:s:${req.auth!.selector}`;
  const lock = await twoFALock(bucket);
  if (lock) {
    res.status(429).json({ error: twoFALockMessage(lock) });
    return false;
  }
  if (!code) {
    res.status(401).json({ error: 'Enter the code from your authenticator app or a backup code', requires2FA: true });
    return false;
  }
  const factor = await verifySecondFactor({ id: account.id, totpSecret: account.totpSecret, totpBackupCodes: account.totpBackupCodes }, code, bucket);
  if (!factor) {
    logSecurityEvent(failedEvent, { accountId: account.id, ip, details: { reason: 'bad_code' } });
    res.status(401).json({ error: 'Invalid code', requires2FA: true });
    return false;
  }
  return true;
}

async function checkSecondFactor(
  account: { id: number; totpSecret: string; totpBackupCodes: string[] },
  code: string,
): Promise<'totp' | 'backup' | null> {
  if (/^\d{6}$/.test(code)) {
    let step: number | null = null;
    try {
      const result = verifySync({ token: code, secret: openTotpSecret(account.totpSecret, account.id) });
      // TOTP results carry timeStep (HOTP's don't — the union covers both)
      if (result.valid && 'timeStep' in result) step = result.timeStep;
    } catch {
      // malformed secret/token — fall through to backup codes
    }
    if (step !== null) {
      // Only the first use of a step (or a later one) wins: a replayed code fails
      if (!(await sharedState.advance(TOTP_STEP, String(account.id), step, TOTP_STEP_TTL_MS))) return null;
      return 'totp';
    }
  }

  const matchIndex = await findBackupCode(code.trim(), account.totpBackupCodes);
  if (matchIndex === -1) return null;
  // Consume atomically: only the request that actually removes the code wins,
  // so two concurrent requests can't both spend the same backup code
  const used = account.totpBackupCodes[matchIndex];
  const consumed = await prisma.$executeRaw`
    UPDATE "accounts" SET totp_backup_codes = array_remove(totp_backup_codes, ${used})
    WHERE id = ${account.id} AND ${used} = ANY(totp_backup_codes)`;
  if (consumed === 0) return null;
  return 'backup';
}

function buildEncryptionResponse(account: {
  encryptionEnabled: boolean;
  kekSalt: Uint8Array | null;
  encryptedMasterKey: Uint8Array | null;
  kekWrapIv: Uint8Array | null;
  kekIterations: number;
  recoveryWrappedMK: Uint8Array | null;
  recoveryWrapIv: Uint8Array | null;
}) {
  return {
    encryptionEnabled: account.encryptionEnabled,
    kekSalt: account.kekSalt ? Buffer.from(account.kekSalt).toString('base64') : null,
    encryptedMasterKey: account.encryptedMasterKey ? Buffer.from(account.encryptedMasterKey).toString('base64') : null,
    kekWrapIv: account.kekWrapIv ? Buffer.from(account.kekWrapIv).toString('base64') : null,
    kekIterations: account.kekIterations,
    recoveryWrappedMK: account.recoveryWrappedMK ? Buffer.from(account.recoveryWrappedMK).toString('base64') : null,
    recoveryWrapIv: account.recoveryWrapIv ? Buffer.from(account.recoveryWrapIv).toString('base64') : null,
  };
}

const router = Router();

const BCRYPT_ROUNDS = 12;
const IS_PRODUCTION = process.env.NODE_ENV !== 'development';
const COOKIE_NAME = IS_PRODUCTION ? '__Host-chronicle_session' : 'chronicle_session';
const SESSION_MAX_AGE_DAYS = 7;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'strict' as const,
  maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  path: '/',
};

// A server key for one purpose, from the server secret when configured.
// Without one it's derived from DATABASE_URL (it holds the DB password) so it
// stays the same across restarts; random only when neither is set (dev/tests).
function serverKey(label: string): Buffer {
  const configured = process.env.SECRETS_ENCRYPTION_KEY || process.env.CALENDAR_TOKEN_KEY;
  if (configured) return crypto.createHmac('sha256', Buffer.from(configured, 'base64')).update(label).digest();
  if (process.env.DATABASE_URL) return crypto.createHmac('sha256', process.env.DATABASE_URL).update(label).digest();
  return crypto.randomBytes(32);
}

// Decoy recovery params for emails with no account must look exactly like a
// real account's: the same bytes every time for the same email (random-per-
// request decoys gave the game away — real params never change).
const DECOY_KEY = serverKey('chronicles:recovery-decoy');

// Known devices: a browser that has signed in to an email gets a signed,
// HttpOnly cookie, and its wrong passwords count in their own bucket. Someone
// guessing an email's password from elsewhere can then lock out only
// themselves, not the owner's own browser (the per-email cap was a lockout
// anyone could trigger). The cookie only skips that shared bucket — the
// password and 2FA are still checked as always. The MAC covers the account and
// a hash of its current sign-in hash, which changes with the password, a
// recovery and the email (the sign-in secret is email-salted) — so a cookie
// stops counting as known after any of those.
const DEVICE_KEY = serverKey('chronicles:known-device');
const DEVICE_COOKIE = IS_PRODUCTION ? '__Host-chronicle_device' : 'chronicle_device';
const DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'strict' as const,
  maxAge: 90 * 24 * 60 * 60 * 1000,
  path: '/',
};
interface DeviceAccount { id: number; email: string; passwordHash: string }

const deviceMac = (account: DeviceAccount, nonce: string) => {
  const credential = crypto.createHash('sha256').update(account.passwordHash).digest('hex');
  return crypto.createHmac('sha256', DEVICE_KEY)
    .update(`${account.id}\n${credential}\n${account.email}\n${nonce}`).digest('base64url');
};

function rememberKnownDevice(res: Response, account: DeviceAccount): void {
  const nonce = crypto.randomBytes(16).toString('base64url');
  res.cookie(DEVICE_COOKIE, `${nonce}.${deviceMac(account, nonce)}`, DEVICE_COOKIE_OPTIONS);
}

/** This browser's known-device nonce for the account, when its cookie verifies. */
function knownDeviceNonce(req: Request, account: DeviceAccount): string | null {
  const raw = req.cookies?.[DEVICE_COOKIE];
  if (typeof raw !== 'string' || raw.length > 128) return null;
  const [nonce, mac] = raw.split('.');
  if (!nonce || !mac) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(deviceMac(account, nonce));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? nonce : null;
}

/** The failure bucket for this attempt: the device's own when it's known for this account. */
async function loginFailureKey(req: Request, email: string): Promise<string> {
  const raw = req.cookies?.[DEVICE_COOKIE];
  if (typeof raw !== 'string' || raw.length > 128) return email;
  // Only browsers carrying a cookie pay for this lookup; without an account
  // there's nothing to be known for
  const account = await prisma.account.findUnique({ where: { email }, select: { id: true, email: true, passwordHash: true } });
  if (!account) return email;
  const nonce = knownDeviceNonce(req, account);
  return nonce ? `${email}#${nonce}` : email;
}

function decoyBytes(email: string, label: string, length: number): string {
  return crypto.createHmac('sha256', DECOY_KEY).update(`${label}:${email}`).digest()
    .subarray(0, length).toString('base64');
}

function longDecoyBytes(email: string, label: string, length: number): string {
  // Two HMAC blocks, for values longer than 32 bytes
  const a = crypto.createHmac('sha256', DECOY_KEY).update(`${label}:1:${email}`).digest();
  const b = crypto.createHmac('sha256', DECOY_KEY).update(`${label}:2:${email}`).digest();
  return Buffer.concat([a, b]).subarray(0, length).toString('base64');
}

// =============================================================================
// Credentials the server can check but can't use to decrypt
// =============================================================================
//
// The client sends authSecret = PBKDF2(password, email salt), never the
// password: the master key is wrapped under PBKDF2(password, kekSalt), so a
// server that saw the password could unwrap it (shared/src/crypto/authSecret.ts).
// Sign-in hashes are bcrypt(authSecret) marked with AUTH_PREFIX. Hashes of
// the password itself (from before derived secrets) are no longer accepted:
// accepting them meant asking the client for the password, which any server
// reply could trigger.
export const AUTH_PREFIX = 'auth1$';

async function hashAuthSecret(authSecret: string): Promise<string> {
  return AUTH_PREFIX + await bcrypt.hash(authSecret, BCRYPT_ROUNDS);
}

/** A sign-in burst filled the hashing queue: say "try again" (503) rather than fail. */
function sendIfHasherBusy(err: unknown, res: Response): boolean {
  if (!(err instanceof HasherBusyError)) return false;
  res.set('Retry-After', '5').status(503).json({ error: 'Lots of people are signing in right now. Please try again in a few seconds.' });
  return true;
}

// A 12-round bcrypt hash of nothing in use, compared against when the stored
// hash can't match, so that answer takes as long as a real check
const DUMMY_BCRYPT_HASH = '$2b$12$DWfEthtYC3Z4n.Oyg7YQXOXt7PGJvzZ4zeHYQ5qQQaxfiJHVjJK6a';

/** Check a derived sign-in secret. Anything but an auth1$ hash never matches. */
async function checkAuthSecret(stored: string, authSecret: string): Promise<boolean> {
  const current = stored.startsWith(AUTH_PREFIX);
  const matched = await bcrypt.compare(authSecret, current ? stored.slice(AUTH_PREFIX.length) : DUMMY_BCRYPT_HASH);
  return current && matched;
}

async function confirmLocked(accountId: number): Promise<boolean> {
  const id = String(accountId);
  return (await sharedState.locked(PASSWORD_LONG_LOCK, `${CONFIRM_FAILURES}:${id}`, 1))
    || sharedState.locked(CONFIRM_FAILURES, id, CONFIRM_MAX_FAILURES);
}

/** Route guard for the password-confirmed actions: 429 once the account is locked. */
async function confirmGate(req: Request, res: Response, next: (err?: unknown) => void): Promise<void> {
  try {
    if (req.auth && (await confirmLocked(req.auth.accountId))) {
      res.status(429).json({ error: 'Too many incorrect passwords. Try again later.' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Check the current password at a password-confirmed action (counted per account). */
async function checkConfirmSecret(account: { id: number; passwordHash: string }, authSecret: string): Promise<boolean> {
  const n = await claimConfirmAttempt(account.id);
  if (n === null) return false;
  const ok = await checkAuthSecret(account.passwordHash, authSecret);
  if (ok) await sharedState.clear(CONFIRM_FAILURES, String(account.id));
  else await passwordFailed(CONFIRM_FAILURES, String(account.id), n, CONFIRM_MAX_FAILURES);
  return ok;
}

// The recovery check stores SHA-256 of the client's proof (PBKDF2 of the
// recovery key), so a leaked row can't be replayed as the proof.
const RECOVERY_PREFIX = 'v2$';
const sha256Hex = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const sealRecoveryProof = (proof: string) => RECOVERY_PREFIX + sha256Hex(proof);

function recoveryProofMatches(stored: string, proof: string): boolean {
  if (!stored.startsWith(RECOVERY_PREFIX)) return false;
  const a = Buffer.from(sha256Hex(proof));
  const b = Buffer.from(stored.slice(RECOVERY_PREFIX.length));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Startup: seal any recovery check still holding the bare proof (sealing needs
 * nothing from the user), and sign out every account whose password hash is
 * from before derived secrets. Those can no longer sign in with a password —
 * they recover with their recovery key — so their ids are returned for the log.
 */
export async function checkStoredCredentials(): Promise<{ recoverySealed: number; outdated: number[]; sessionsRevoked: number }> {
  const unsealed = await prisma.account.findMany({
    where: { recoveryKeyHash: { not: null }, NOT: { recoveryKeyHash: { startsWith: RECOVERY_PREFIX } } },
    select: { id: true, recoveryKeyHash: true },
  });
  for (const a of unsealed) {
    // Conditional, so a recovery racing this can't be overwritten
    await prisma.account.updateMany({
      where: { id: a.id, recoveryKeyHash: a.recoveryKeyHash },
      data: { recoveryKeyHash: sealRecoveryProof(a.recoveryKeyHash!) },
    });
  }
  const outdated = (await prisma.account.findMany({
    where: { NOT: { passwordHash: { startsWith: AUTH_PREFIX } } },
    select: { id: true },
  })).map(a => a.id);
  const revoked = outdated.length
    ? await prisma.session.updateMany({
      where: { revokedAt: null, accountId: { in: outdated } },
      data: { revokedAt: new Date(), revokedReason: 'auth_upgrade' },
    })
    : { count: 0 };
  return { recoverySealed: unsealed.length, outdated, sessionsRevoked: revoked.count };
}

/**
 * Startup: authenticator secrets stored readable (saved before
 * SECRETS_ENCRYPTION_KEY was set) are sealed with it. Without the key they
 * stay readable — a database copy would hold every account's second factor —
 * so the count is returned for a warning.
 */
export async function sealStoredTotpSecrets(): Promise<{ sealed: number; readable: number; unopenable: number }> {
  const plain = await prisma.account.findMany({
    where: { totpSecret: { not: null }, NOT: { totpSecret: { contains: ':' } } },
    select: { id: true, totpSecret: true },
  });
  if (!isTokenCryptoConfigured()) {
    // Sealed by a server that has the key: this one can't check their codes
    const unopenable = await prisma.account.count({ where: { totpSecret: { contains: ':' } } });
    return { sealed: 0, readable: plain.length, unopenable };
  }
  for (const a of plain) {
    // Conditional, so a 2FA change racing this can't be overwritten
    await prisma.account.updateMany({
      where: { id: a.id, totpSecret: a.totpSecret },
      data: { totpSecret: sealTotpSecret(a.totpSecret!, a.id) },
    });
  }
  // Sealed before secrets were bound to their account: bind them
  const unbound = await prisma.account.findMany({
    where: { totpSecret: { contains: ':' }, NOT: { totpSecret: { startsWith: 'b1:' } } },
    select: { id: true, totpSecret: true },
  });
  let rebound = 0;
  for (const a of unbound) {
    let secret: string;
    try { secret = decryptToken(a.totpSecret!); } catch { continue; }
    await prisma.account.updateMany({
      where: { id: a.id, totpSecret: a.totpSecret },
      data: { totpSecret: sealTotpSecret(secret, a.id) },
    });
    rebound++;
  }
  return { sealed: plain.length + rebound, readable: 0, unopenable: 0 };
}

export function registrationWhitelist(): string[] {
  return (process.env.REGISTRATION_WHITELIST ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

/** Enforce a constant-time floor on endpoint response time to prevent timing-based enumeration */
async function constantTimeDelay(startTime: number, minMs = 200): Promise<void> {
  const elapsed = Date.now() - startTime;
  if (elapsed < minMs) {
    await new Promise(resolve => setTimeout(resolve, minMs - elapsed));
  }
}

// =============================================================================
// POST /api/auth/register
// =============================================================================
router.post('/register', registerLimiter, authLimiter, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid registration details' });
      return;
    }

    const { email: rawEmail, username, authSecret, encryptedMasterKey, kekSalt, kekWrapIv, recoveryWrappedMK, recoveryWrapIv, recoveryKeyHash, recoveryKeySalt, inviteCode } = parsed.data;
    const email = normalizeEmail(rawEmail);

    // Order matters. The username is checked first and answered the same for
    // everyone: checked after approval, "username taken" (409) vs "restricted"
    // (403) told anyone whether an email was approved. Then approval, then the
    // email — "email taken" only reaches an approved (or listed) email, and
    // with no email verification sign-up has to say so. Every refusal pays
    // for a hash, like a sign-up does.
    //
    // Squatting: an approved email also needs the invite code issued with the
    // approval (sent by the owner with the link), so knowing an approved email
    // isn't enough to claim it — and without the code it's refused like any
    // other, so approval can't be told from the answer.
    const existingUsername = await prisma.account.findUnique({ where: { username } });
    if (existingUsername) {
      logSecurityEvent('register_duplicate', { ip: req.ip });
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      res.status(409).json({ error: 'This username is already taken.', field: 'username' });
      return;
    }

    // Who may sign up: closed unless REGISTRATION_OPEN=true. Emails approved on
    // the beta list (`npm run beta -- --approve`, no restart) with their invite
    // code, or (outside production) listed in the optional
    // REGISTRATION_WHITELIST, may; anyone else is refused
    let invited = false;
    if (process.env.REGISTRATION_OPEN !== 'true') {
      // The whitelist needs no code, so anyone who learns a listed email can
      // claim it first: in production only approvals (with their code) count
      const listed = process.env.NODE_ENV === 'production' ? [] : registrationWhitelist();
      invited = !listed.includes(email) && await isApproved(email, inviteCode).catch(() => false);
      if (!listed.includes(email) && !invited) {
        logSecurityEvent('register_not_whitelisted', { ip: req.ip });
        await bcrypt.hash('dummy', BCRYPT_ROUNDS);
        res.status(403).json({ error: 'Registration is currently restricted. If you joined the waitlist, check your email for your sign-up instructions. Please allow one day for processing.' });
        return;
      }
    }

    const existingEmail = await prisma.account.findUnique({ where: { email } });
    if (existingEmail) {
      logSecurityEvent('register_duplicate', { ip: req.ip });
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      res.status(409).json({ error: 'An account with this email already exists.', field: 'email' });
      return;
    }

    const passwordHash = await hashAuthSecret(authSecret);

    const { account, schemaName } = await registerTenant(email, username, passwordHash, {
      kekSalt: new Uint8Array(Buffer.from(kekSalt, 'base64')),
      encryptedMasterKey: new Uint8Array(Buffer.from(encryptedMasterKey, 'base64')),
      kekWrapIv: new Uint8Array(Buffer.from(kekWrapIv, 'base64')),
      recoveryWrappedMK: new Uint8Array(Buffer.from(recoveryWrappedMK, 'base64')),
      recoveryWrapIv: new Uint8Array(Buffer.from(recoveryWrapIv, 'base64')),
      recoveryKeyHash: sealRecoveryProof(recoveryKeyHash),
      recoveryKeySalt,
    });

    // Create session
    const token = await createSession(account.id, schemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (invited) {
      try { await spendInvite(email); } catch { /* the account exists; a code left unspent is refused by the 409 anyway */ }
    }
    logSecurityEvent('register_success', { accountId: account.id, ip: req.ip });
    rememberKnownDevice(res, { id: account.id, email, passwordHash });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.status(201).json({
      user: { email: account.email, username: account.username },
    });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Registration error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// =============================================================================
// GET /api/auth/me — Validate current session and return user info
// =============================================================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: {
        email: true,
        username: true,
        encryptionEnabled: true,
        kekSalt: true,
        encryptedMasterKey: true,
        kekWrapIv: true,
        kekIterations: true,
        recoveryWrappedMK: true,
        recoveryWrapIv: true,
        totpEnabled: true,
      },
    });

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({
      user: { email: account.email, username: account.username, totpEnabled: account.totpEnabled },
      encryption: buildEncryptionResponse(account),
    });
  } catch (err) {
    console.error('Me error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// =============================================================================
// POST /api/auth/login
// =============================================================================
router.post('/login', authLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }

    const { email, authSecret } = parsed.data;

    const normalizedEmail = normalizeEmail(email);
    const failureKey = await loginFailureKey(req, normalizedEmail);
    // Counted (atomically, across instances) before the password check:
    // parallel guesses can't all pass the lock
    const attemptNo = await claimLoginAttempt(failureKey);
    if (attemptNo === null) {
      logSecurityEvent('login_locked', { ip: req.ip });
      await constantTimeDelay(startTime);
      res.status(429).json({ error: 'Too many failed sign-in attempts. Try again later.' });
      return;
    }
    const account = await prisma.account.findUnique({ where: { email: normalizedEmail } });
    if (!account) {
      logSecurityEvent('login_failed_no_account', { ip: req.ip });
      // Strikes too, so a lockout looks the same whether or not the account exists
      await passwordFailed(LOGIN_FAILURES, failureKey, attemptNo, LOGIN_MAX_FAILURES);
      // Constant-time delay to prevent timing-based email enumeration
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!(await checkAuthSecret(account.passwordHash, authSecret))) {
      logSecurityEvent('login_failed_bad_password', { accountId: account.id, ip: req.ip });
      await passwordFailed(LOGIN_FAILURES, failureKey, attemptNo, LOGIN_MAX_FAILURES);
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await sharedState.clear(LOGIN_FAILURES, failureKey);

    // 2FA check — if enabled, return a pending token instead of a session
    if (account.totpEnabled) {
      const pendingToken = crypto.randomBytes(32).toString('hex');
      await sharedState.putToken(PENDING_2FA, pendingToken, account.id, PENDING_2FA_TTL_MS);
      logSecurityEvent('login_2fa_required', { accountId: account.id, ip: req.ip });
      res.json({ requires2FA: true, pendingToken });
      return;
    }

    const token = await createSession(account.id, account.tenantSchemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logSecurityEvent('login_success', { accountId: account.id, ip: req.ip });
    try { await revokeBrowserSession(req); } catch { /* best effort: the new session works either way */ }
    rememberKnownDevice(res, account);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({
      user: { email: account.email, username: account.username, totpEnabled: account.totpEnabled },
      encryption: buildEncryptionResponse(account),
    });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Login error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// =============================================================================
// POST /api/auth/logout
// =============================================================================
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await revokeSession(req.auth!.selector, 'user_logout');
    logSecurityEvent('logout', { accountId: req.auth!.accountId, ip: req.ip });
    res.clearCookie(COOKIE_NAME, { path: '/', secure: IS_PRODUCTION, sameSite: 'strict' as const });
    clearRememberCookie(res);
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Encryption params (salt + wrapped master key) are only ever returned by
// /login and /me, i.e. after the password or a session has been verified.
// There is deliberately no unauthenticated lookup: handing the wrapped key to
// anyone who knows an email would allow offline password guessing with no
// rate limit.

// =============================================================================
// POST /api/auth/change-password
// =============================================================================
router.post('/change-password', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Password does not meet requirements' });
      return;
    }

    const { currentAuthSecret, newAuthSecret, newEncryptedMasterKey, newKekSalt, newKekWrapIv, code } = parsed.data;
    const account = await prisma.account.findUnique({ where: { id: req.auth!.accountId } });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const valid = await checkConfirmSecret(account, currentAuthSecret);
    if (!valid) {
      logSecurityEvent('password_change_failed', { accountId: account.id, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }
    if (!(await secondFactorGate(account, code, req, res, 'password_change_failed'))) return;

    const passwordHash = await hashAuthSecret(newAuthSecret);

    // Atomic: update password + revoke ALL sessions (including current) in a single transaction
    await prisma.$transaction([
      prisma.account.update({
        where: { id: account.id },
        data: {
          passwordHash,
          encryptedMasterKey: new Uint8Array(Buffer.from(newEncryptedMasterKey, 'base64')),
          kekSalt: new Uint8Array(Buffer.from(newKekSalt, 'base64')),
          kekWrapIv: new Uint8Array(Buffer.from(newKekWrapIv, 'base64')),
        },
      }),
      prisma.session.updateMany({
        where: {
          accountId: account.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date(), revokedReason: 'password_change' },
      }),
    ]);

    await revokeGrantsForAccount(account.id);
    await cancelPendingTwoFA(account.id);

    // Create a fresh session after revoking all old ones (prevents race condition)
    const token = await createSession(account.id, account.tenantSchemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logSecurityEvent('password_change', { accountId: account.id, ip: req.ip });
    // The old known-device cookie no longer verifies; this browser stays known
    rememberKnownDevice(res, { id: account.id, email: account.email, passwordHash });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Change password error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Password change failed' });
  }
});

// =============================================================================
// POST /api/auth/change-email — Change email address
// =============================================================================
router.post('/change-email', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const parsed = changeEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const normalizedEmail = normalizeEmail(parsed.data.newEmail);
    const emailParsed = emailSchema.safeParse(normalizedEmail);
    if (!emailParsed.success) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Every try counts (per account, across instances): the "already in use"
    // answer below says whether an email has an account, so a session can't
    // be used to test emails at the per-IP rate
    if (!(await sharedState.claim(EMAIL_CHANGES, String(req.auth!.accountId), EMAIL_CHANGE_MAX, EMAIL_CHANGE_WINDOW_MS))) {
      logSecurityEvent('email_change_limited', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(429).json({ error: 'Too many email changes. Try again in an hour.' });
      return;
    }

    // The email is the login identifier — changing it needs the password
    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { id: true, passwordHash: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
    });
    if (!account || !(await checkConfirmSecret(account, parsed.data.currentAuthSecret))) {
      logSecurityEvent('email_change_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }
    if (!(await secondFactorGate(account, parsed.data.code, req, res, 'email_change_failed'))) return;

    // Check if email is already taken
    // An email approved for someone else's beta invite is taken too: moving an
    // account onto it would lock the invited person out of signing up
    const existing = await prisma.account.findUnique({ where: { email: normalizedEmail } });
    if ((existing && existing.id !== req.auth!.accountId) || (!existing && await hasPendingInvite(normalizedEmail))) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    // The sign-in secret is salted with the email, so it's replaced too
    const passwordHash = await hashAuthSecret(parsed.data.newAuthSecret);
    await prisma.account.update({
      where: { id: req.auth!.accountId },
      data: { email: normalizedEmail, passwordHash },
    });
    // Like a password change: every other session (and its Remember me
    // grant) is signed out and pending 2FA sign-ins are cancelled; this one stays
    await revokeAllSessions(account.id, req.auth!.selector, 'email_change');
    await cancelPendingTwoFA(account.id);

    logSecurityEvent('email_changed', { accountId: req.auth!.accountId, ip: req.ip });
    rememberKnownDevice(res, { id: account.id, email: normalizedEmail, passwordHash });
    res.json({ success: true, email: normalizedEmail });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Change email error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Email change failed' });
  }
});

// =============================================================================
// POST /api/auth/recover — Password recovery using recovery key
// =============================================================================
router.post('/recover', strictLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const parsed = recoverSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Recovery failed' });
      return;
    }

    const { email: rawEmail, recoveryProof, newAuthSecret, newEncryptedMasterKey, newKekSalt, newKekWrapIv, newRecoveryWrappedMK, newRecoveryWrapIv, newRecoveryKeyHash, newRecoveryKeySalt, code } = parsed.data;
    const email = normalizeEmail(rawEmail);

    const account = await prisma.account.findUnique({ where: { email } });
    if (!account) {
      // Constant-time delay to prevent timing-based enumeration
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Recovery failed' });
      return;
    }

    if (!account.recoveryKeyHash || !account.recoveryKeySalt) {
      // No recovery key saved for this account
      logSecurityEvent('recovery_failed', { accountId: account.id, ip: req.ip, details: { reason: 'no_recovery_hash' } });
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Recovery failed' });
      return;
    }

    // The client sends PBKDF2(recoveryKey, recoveryKeySalt) — never the key,
    // which would unwrap recoveryWrappedMK
    const verifiedHash = account.recoveryKeyHash;
    if (!recoveryProofMatches(verifiedHash, recoveryProof)) {
      logSecurityEvent('recovery_failed', { accountId: account.id, ip: req.ip });
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Recovery failed' });
      return;
    }

    // With 2FA on, the recovery key alone isn't enough: also need an
    // authenticator or backup code (asked for only after the key checks out)
    if (account.totpEnabled && account.totpSecret) {
      const bucket = twoFABucket(req, account);
      const lock = await twoFALock(bucket);
      if (lock) {
        res.status(429).json({ error: twoFALockMessage(lock), requires2FA: true });
        return;
      }
      if (!code) {
        res.status(401).json({ error: 'Enter the code from your authenticator app or a backup code', requires2FA: true });
        return;
      }
      const factor = await verifySecondFactor({ id: account.id, totpSecret: account.totpSecret, totpBackupCodes: account.totpBackupCodes }, code, bucket);
      if (!factor) {
        logSecurityEvent('recovery_2fa_failed', { accountId: account.id, ip: req.ip });
        res.status(401).json({ error: 'Invalid code', requires2FA: true });
        return;
      }
    }

    const passwordHash = await hashAuthSecret(newAuthSecret);

    // Interactive transaction with row-level locking to prevent concurrent recovery race condition
    const txResult = await prisma.$transaction(async (tx) => {
      // Lock the account row to prevent concurrent recovery attempts
      const locked = await tx.$queryRawUnsafe<{ id: number; recovery_key_hash: string | null }[]>(
        'SELECT id, recovery_key_hash FROM "accounts" WHERE id = $1 FOR UPDATE',
        account.id
      );

      // Re-check the recovery key we verified is still the stored one — a
      // concurrent recovery replaces it, and only the first may win
      if (locked[0]?.recovery_key_hash !== verifiedHash) {
        return null; // Recovery already consumed by another request
      }

      await tx.account.update({
        where: { id: account.id },
        data: {
          passwordHash,
          encryptedMasterKey: new Uint8Array(Buffer.from(newEncryptedMasterKey, 'base64')),
          kekSalt: new Uint8Array(Buffer.from(newKekSalt, 'base64')),
          kekWrapIv: new Uint8Array(Buffer.from(newKekWrapIv, 'base64')),
          recoveryKeyHash: sealRecoveryProof(newRecoveryKeyHash),
          recoveryKeySalt: newRecoveryKeySalt,
          recoveryWrappedMK: new Uint8Array(Buffer.from(newRecoveryWrappedMK, 'base64')),
          recoveryWrapIv: new Uint8Array(Buffer.from(newRecoveryWrapIv, 'base64')),
          recoveryKeyUsedAt: new Date(),
        },
      });

      await tx.session.updateMany({
        where: { accountId: account.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'recovery' },
      });

      return { success: true };
    });

    if (!txResult) {
      logSecurityEvent('recovery_failed', { accountId: account.id, ip: req.ip, details: { reason: 'concurrent_recovery' } });
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Recovery failed' });
      return;
    }

    await revokeGrantsForAccount(account.id);
    await cancelPendingTwoFA(account.id);
    logSecurityEvent('recovery_success', { accountId: account.id, ip: req.ip });
    rememberKnownDevice(res, { id: account.id, email, passwordHash });

    // Create new session after revoking all old ones
    const token = await createSession(account.id, account.tenantSchemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({
      user: { email: account.email, username: account.username },
      encryption: {
        encryptionEnabled: account.encryptionEnabled,
        kekSalt: newKekSalt,
        encryptedMasterKey: newEncryptedMasterKey,
        kekWrapIv: newKekWrapIv,
        kekIterations: account.kekIterations,
        recoveryWrappedMK: null,
        recoveryWrapIv: null,
      },
    });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Recovery error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Recovery failed' });
  }
});

// =============================================================================
// POST /api/auth/login/2fa — Complete login with TOTP or backup code
// =============================================================================
router.post('/login/2fa', authLimiter, async (req, res) => {
  try {
    const parsed = twoFALoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const { pendingToken, code } = parsed.data;

    const pendingAccountId = await sharedState.getToken(PENDING_2FA, pendingToken);
    if (pendingAccountId === null) {
      res.status(401).json({ error: 'Verification session expired. Please log in again.' });
      return;
    }

    // The pending token survives a wrong code so the user can retry (the
    // 5-wrong-codes lock, the 5-minute expiry and authLimiter bound guessing);
    // it's single-use once a code is accepted.
    const account = await prisma.account.findUnique({
      where: { id: pendingAccountId },
      select: {
        id: true,
        email: true,
        username: true,
        tenantSchemaName: true,
        totpSecret: true,
        totpEnabled: true,
        totpBackupCodes: true,
        passwordHash: true,
        encryptionEnabled: true,
        kekSalt: true,
        encryptedMasterKey: true,
        kekWrapIv: true,
        kekIterations: true,
        recoveryWrappedMK: true,
        recoveryWrapIv: true,
      },
    });

    if (!account || !account.totpEnabled || !account.totpSecret) {
      await sharedState.deleteToken(PENDING_2FA, pendingToken);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const bucket = twoFABucket(req, account);
    const lock = await twoFALock(bucket);
    if (lock) {
      logSecurityEvent('login_2fa_locked', { accountId: account.id, ip: req.ip });
      res.status(429).json({ error: twoFALockMessage(lock) });
      return;
    }

    const factor = await verifySecondFactor({ id: account.id, totpSecret: account.totpSecret, totpBackupCodes: account.totpBackupCodes }, code, bucket);
    if (!factor) {
      logSecurityEvent('login_2fa_failed', { accountId: account.id, ip: req.ip });
      res.status(401).json({ error: 'Invalid code' });
      return;
    }
    // Accepted — the pending token is spent
    await sharedState.deleteToken(PENDING_2FA, pendingToken);
    if (factor === 'backup') {
      logSecurityEvent('login_2fa_backup_code_used', { accountId: account.id, ip: req.ip });
    }

    const token = await createSession(account.id, account.tenantSchemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logSecurityEvent('login_success', { accountId: account.id, ip: req.ip });
    try { await revokeBrowserSession(req); } catch { /* best effort: the new session works either way */ }
    rememberKnownDevice(res, account);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({
      user: { email: account.email, username: account.username, totpEnabled: account.totpEnabled },
      encryption: buildEncryptionResponse(account),
    });
  } catch (err) {
    console.error('2FA login error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Verification failed' });
  }
});

// =============================================================================
// POST /api/auth/2fa/setup — Generate TOTP secret and QR code (not saved yet)
// =============================================================================
router.post('/2fa/setup', authLimiter, authMiddleware, async (req, res) => {
  try {
    const secret = generateSecret();
    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { email: true },
    });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const otpAuthUrl = generateURI({ label: account.email, issuer: 'Chronicles', secret });
    const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);
    res.json({ secret, qrCodeUrl });
  } catch (err) {
    console.error('2FA setup error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: '2FA setup failed' });
  }
});

// =============================================================================
// POST /api/auth/2fa/enable — Confirm TOTP code and save secret + backup codes
// =============================================================================
router.post('/2fa/enable', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const parsed = enable2FASchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const { secret, code, currentAuthSecret } = parsed.data;

    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { id: true, passwordHash: true, totpEnabled: true },
    });
    if (!account || !(await checkConfirmSecret(account, currentAuthSecret))) {
      logSecurityEvent('2fa_enable_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }
    // Replacing a live authenticator goes through disable (password) first
    if (account.totpEnabled) {
      res.status(409).json({ error: 'Two-factor authentication is already on' });
      return;
    }

    let step: number | null = null;
    try {
      const result = verifySync({ token: code, secret });
      if (result.valid) step = 'timeStep' in result ? result.timeStep : 0;
    } catch {
      step = null;
    }
    if (step === null) {
      res.status(400).json({ error: 'Invalid code — check your authenticator app and try again' });
      return;
    }

    // Generate 8 single-use backup codes
    const backupCodes: string[] = [];
    const hashedCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const raw = crypto.randomBytes(6).toString('hex'); // 12 hex chars
      const formatted = `${raw.slice(0, 6)}-${raw.slice(6)}`; // xxxxxx-xxxxxx
      backupCodes.push(formatted);
      hashedCodes.push(await hashBackupCode(formatted));
    }

    await prisma.account.update({
      where: { id: req.auth!.accountId },
      data: { totpSecret: sealTotpSecret(secret, req.auth!.accountId), totpEnabled: true, totpBackupCodes: hashedCodes },
    });
    // A fresh count, then the enabling code's step marked used, so that same
    // code can't then finish a sign-in (replay)
    await clearTwoFAState(account.id);
    await sharedState.advance(TOTP_STEP, String(account.id), step, TOTP_STEP_TTL_MS);
    // Like a password change: every other session (and its Remember me grant)
    // is signed out and pending sign-ins are cancelled; this one stays
    await revokeAllSessions(account.id, req.auth!.selector, '2fa_enabled');
    await cancelPendingTwoFA(account.id);

    logSecurityEvent('2fa_enabled', { accountId: req.auth!.accountId, ip: req.ip });
    res.json({ backupCodes });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('2FA enable error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: '2FA enable failed' });
  }
});

// =============================================================================
// DELETE /api/auth/2fa — Disable 2FA (requires password confirmation)
// =============================================================================
router.delete('/2fa', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const parsed = disable2FASchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Password and a code from your authenticator app (or a backup code) are required' });
      return;
    }

    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { id: true, passwordHash: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
    });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const valid = await checkConfirmSecret(account, parsed.data.authSecret);
    if (!valid) {
      logSecurityEvent('2fa_disable_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    if (account.totpEnabled && account.totpSecret) {
      const bucket = `${account.id}:s:${req.auth!.selector}`;
      const lock = await twoFALock(bucket);
      if (lock) {
        res.status(429).json({ error: twoFALockMessage(lock) });
        return;
      }
      const factor = await verifySecondFactor({ id: account.id, totpSecret: account.totpSecret, totpBackupCodes: account.totpBackupCodes }, parsed.data.code, bucket);
      if (!factor) {
        logSecurityEvent('2fa_disable_failed', { accountId: account.id, ip: req.ip, details: { reason: 'bad_code' } });
        res.status(401).json({ error: 'Invalid code' });
        return;
      }
    }

    await prisma.account.update({
      where: { id: req.auth!.accountId },
      data: { totpSecret: null, totpEnabled: false, totpBackupCodes: [] },
    });
    await clearTwoFAState(req.auth!.accountId);
    await cancelPendingTwoFA(req.auth!.accountId);
    // Like turning it on: every other session (and its Remember me grant) is
    // signed out, so one that was let in before stays out; this one stays
    await revokeAllSessions(req.auth!.accountId, req.auth!.selector, '2fa_disabled');

    logSecurityEvent('2fa_disabled', { accountId: req.auth!.accountId, ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('2FA disable error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: '2FA disable failed' });
  }
});

// =============================================================================
// DELETE /api/auth/account — permanently delete the account and all its data
// =============================================================================
router.delete('/account', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { id: true, passwordHash: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
    });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (!(await checkConfirmSecret(account, parsed.data.authSecret))) {
      logSecurityEvent('account_delete_failed', { accountId: account.id, ip: req.ip });
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }
    if (!(await secondFactorGate(account, parsed.data.code, req, res, 'account_delete_failed'))) return;

    await revokeGrantsForAccount(account.id);
    // Revoke Google Calendar access at Google before the token row is deleted
    await revokeGoogleAccess(account.id);
    await deleteAccountById(account.id);
    await clearTwoFAState(account.id);

    logSecurityEvent('account_deleted', { accountId: account.id, ip: req.ip });
    res.clearCookie(COOKIE_NAME, { path: '/', secure: IS_PRODUCTION, sameSite: 'strict' as const });
    clearRememberCookie(res);
    res.json({ success: true });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Account delete error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

// =============================================================================
// GET /api/auth/recovery-params — Get recovery key params for password reset
// =============================================================================
router.get('/recovery-params', authLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const rawEmail = req.query.email as string;
    if (!rawEmail || typeof rawEmail !== 'string' || rawEmail.length > 254) {
      res.status(400).json({ error: 'Email required' });
      return;
    }
    const emailParsed = emailSchema.safeParse(rawEmail);
    if (!emailParsed.success) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }
    const email = normalizeEmail(rawEmail);

    const account = await prisma.account.findUnique({
      where: { email },
      select: {
        recoveryWrappedMK: true,
        recoveryWrapIv: true,
        recoveryKeySalt: true,
        encryptionEnabled: true,
      },
    });

    if (!account || !account.encryptionEnabled || !account.recoveryWrappedMK || !account.recoveryWrapIv || !account.recoveryKeySalt) {
      // Stable decoy params (same size as a real AES-GCM-wrapped 32-byte key)
      // so an unknown email is indistinguishable from a real one
      await constantTimeDelay(startTime);
      res.json({
        recoveryWrappedMK: longDecoyBytes(email, 'wrapped-mk', 48),
        recoveryWrapIv: decoyBytes(email, 'wrap-iv', 12),
        recoveryKeySalt: Buffer.from(decoyBytes(email, 'recovery-salt', 16), 'base64').toString('hex'),
      });
      return;
    }

    await constantTimeDelay(startTime);
    res.json({
      recoveryWrappedMK: Buffer.from(account.recoveryWrappedMK).toString('base64'),
      recoveryWrapIv: Buffer.from(account.recoveryWrapIv).toString('base64'),
      // Salt for the recovery proof, which the client now computes itself
      recoveryKeySalt: account.recoveryKeySalt,
    });
  } catch (err) {
    console.error('Recovery params error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch recovery params' });
  }
});

// =============================================================================
// POST /api/auth/recovery-key — Generate / regenerate recovery key (authenticated)
// =============================================================================
router.post('/recovery-key', strictLimiter, authMiddleware, confirmGate, async (req, res) => {
  try {
    const parsed = saveRecoveryKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { currentAuthSecret, recoveryWrappedMK, recoveryWrapIv, recoveryKeyHash, recoveryKeySalt, code } = parsed.data;

    // Whoever sets the recovery key can later reset the password with it, so
    // a signed-in session alone must not be enough to replace it
    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { id: true, passwordHash: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
    });
    if (!account || !(await checkConfirmSecret(account, currentAuthSecret))) {
      logSecurityEvent('recovery_key_regenerate_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }
    if (!(await secondFactorGate(account, code, req, res, 'recovery_key_regenerate_failed'))) return;

    await prisma.account.update({
      where: { id: req.auth!.accountId },
      data: {
        recoveryWrappedMK: new Uint8Array(Buffer.from(recoveryWrappedMK, 'base64')),
        recoveryWrapIv: new Uint8Array(Buffer.from(recoveryWrapIv, 'base64')),
        recoveryKeyHash: sealRecoveryProof(recoveryKeyHash),
        recoveryKeySalt,
      },
    });

    // Whoever held the old key may be the reason for replacing it: every other
    // session (and its Remember me grant) is signed out, this one stays
    await revokeAllSessions(account.id, req.auth!.selector, 'recovery_key_changed');
    await cancelPendingTwoFA(account.id);
    logSecurityEvent('recovery_key_regenerated', { accountId: req.auth!.accountId, ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    if (sendIfHasherBusy(err, res)) return;
    console.error('Recovery key regeneration error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to save recovery key' });
  }
});

export default router;
