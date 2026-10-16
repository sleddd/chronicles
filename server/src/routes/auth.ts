import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { promisify } from 'util';
import { generateSecret, generateSync, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../db/prisma.js';
import { registerTenant, deleteAccountById } from '../db/schemaManager.js';
import { createSession, revokeSession, revokeAllSessions, authMiddleware } from '../middleware/auth.js';
import { revokeGrantsForAccount } from '../services/rememberGrants.js';
import { encryptToken, decryptToken, isTokenCryptoConfigured } from '../services/tokenCrypto.js';
import { authLimiter, strictLimiter, registerLimiter } from '../middleware/rateLimiter.js';
import { registerSchema, loginSchema, changePasswordSchema, changeEmailSchema, saveRecoveryKeySchema, recoverSchema, emailSchema, twoFALoginSchema, enable2FASchema, disable2FASchema, deleteAccountSchema, normalizeEmail } from '@chronicles/shared';
import { logSecurityEvent } from '../utils/securityLogger.js';
import { clearRememberCookie } from './remember.js';

// In-memory map for pending 2FA sessions (single-instance safe for Render).
// upgradedHash: a legacy account's new sign-in hash, saved once 2FA passes.
const pendingTwoFA = new Map<string, { accountId: number; expiresAt: Date; upgradedHash?: string }>();

function cleanExpiredPending() {
  const now = new Date();
  for (const [token, entry] of pendingTwoFA) {
    if (entry.expiresAt <= now) pendingTwoFA.delete(token);
  }
}

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// Backup codes are salted + scrypt-hashed (48 bits of entropy is too little for
// a bare SHA-256 to survive a database leak). Older codes stored as plain
// SHA-256 hex still verify until they're used or replaced.
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
function sealTotpSecret(secret: string): string {
  return isTokenCryptoConfigured() ? encryptToken(secret) : secret;
}

function openTotpSecret(stored: string): string {
  return stored.includes(':') ? decryptToken(stored) : stored;
}

// Replay protection: a TOTP code is accepted at most once (its time step must
// be newer than the last one used). In memory, like pendingTwoFA — a restart
// only reopens a code's own 30-second window.
const lastTotpStep = new Map<number, number>();

// Per-account cap on wrong second-factor codes, on top of the per-IP limits,
// so guesses spread across many IPs still run out
const TWO_FA_MAX_FAILURES = 5;
const TWO_FA_LOCK_MS = 15 * 60 * 1000;
const twoFAFailures = new Map<number, { count: number; resetAt: number }>();

function twoFALocked(accountId: number): boolean {
  const f = twoFAFailures.get(accountId);
  if (!f) return false;
  if (f.resetAt <= Date.now()) { twoFAFailures.delete(accountId); return false; }
  return f.count >= TWO_FA_MAX_FAILURES;
}

function recordTwoFAFailure(accountId: number): void {
  const now = Date.now();
  const f = twoFAFailures.get(accountId);
  if (!f || f.resetAt <= now) twoFAFailures.set(accountId, { count: 1, resetAt: now + TWO_FA_LOCK_MS });
  else f.count++;
}

// Per-email cap on wrong passwords, on top of the per-IP limit, so guesses
// spread across many IPs still run out. Keyed by the normalized email whether
// or not an account exists, so a lockout never reveals which emails are real.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginFailures = new Map<string, { count: number; resetAt: number }>();

function loginLocked(email: string): boolean {
  const f = loginFailures.get(email);
  if (!f) return false;
  if (f.resetAt <= Date.now()) { loginFailures.delete(email); return false; }
  return f.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(email: string): void {
  const now = Date.now();
  if (loginFailures.size > 50_000) {
    for (const [k, v] of loginFailures) if (v.resetAt <= now) loginFailures.delete(k);
  }
  const f = loginFailures.get(email);
  if (!f || f.resetAt <= now) loginFailures.set(email, { count: 1, resetAt: now + LOGIN_LOCK_MS });
  else f.count++;
}

/**
 * Check an authenticator code or a backup code. A used backup code is removed.
 * Returns which factor matched, or null.
 */
async function verifySecondFactor(
  account: { id: number; totpSecret: string; totpBackupCodes: string[] },
  code: string,
): Promise<'totp' | 'backup' | null> {
  if (/^\d{6}$/.test(code)) {
    try {
      const last = lastTotpStep.get(account.id);
      const result = verifySync({
        token: code,
        secret: openTotpSecret(account.totpSecret),
        ...(last !== undefined && { afterTimeStep: last }),
      });
      // TOTP results carry timeStep (HOTP's don't — the union covers both)
      if (result.valid && 'timeStep' in result) {
        lastTotpStep.set(account.id, result.timeStep);
        twoFAFailures.delete(account.id);
        return 'totp';
      }
    } catch {
      // malformed secret/token — fall through to backup codes
    }
  }

  const matchIndex = await findBackupCode(code.trim(), account.totpBackupCodes);
  if (matchIndex === -1) {
    recordTwoFAFailure(account.id);
    return null;
  }
  // Consume atomically: only the request that actually removes the code wins,
  // so two concurrent requests can't both spend the same backup code
  const used = account.totpBackupCodes[matchIndex];
  const consumed = await prisma.$executeRaw`
    UPDATE "accounts" SET totp_backup_codes = array_remove(totp_backup_codes, ${used})
    WHERE id = ${account.id} AND ${used} = ANY(totp_backup_codes)`;
  if (consumed === 0) {
    recordTwoFAFailure(account.id);
    return null;
  }
  twoFAFailures.delete(account.id);
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

// Decoy recovery params for emails with no account must look exactly like a
// real account's: the same bytes every time for the same email (random-per-
// request decoys gave the game away — real params never change). Derived from
// the server secret when configured, else a per-process key.
const DECOY_KEY = (() => {
  const configured = process.env.SECRETS_ENCRYPTION_KEY || process.env.CALENDAR_TOKEN_KEY;
  if (configured) {
    return crypto.createHmac('sha256', Buffer.from(configured, 'base64')).update('chronicles:recovery-decoy').digest();
  }
  // No secrets key: derive from DATABASE_URL (it holds the DB password) so
  // decoys stay the same across restarts — a per-process key would change them
  // and give unknown emails away. Random only when neither is set (dev/tests).
  if (process.env.DATABASE_URL) {
    return crypto.createHmac('sha256', process.env.DATABASE_URL).update('chronicles:recovery-decoy').digest();
  }
  return crypto.randomBytes(32);
})();

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
// Sign-in hashes are bcrypt(authSecret) marked with AUTH_PREFIX. A bare bcrypt
// hash ($2…) is a legacy hash of the password itself; /login upgrades it.
export const AUTH_PREFIX = 'auth1$';

export const isLegacyAuthHash = (stored: string) => !stored.startsWith(AUTH_PREFIX);

async function hashAuthSecret(authSecret: string): Promise<string> {
  return AUTH_PREFIX + await bcrypt.hash(authSecret, BCRYPT_ROUNDS);
}

/** Check a derived sign-in secret. Legacy hashes never match (their sessions are revoked at startup). */
async function checkAuthSecret(stored: string, authSecret: string): Promise<boolean> {
  if (isLegacyAuthHash(stored)) return false;
  return bcrypt.compare(authSecret, stored.slice(AUTH_PREFIX.length));
}

/** Replace a legacy password hash — only if it's still the one that was checked. */
async function upgradeAuthHash(accountId: number, checkedHash: string, upgradedHash: string): Promise<void> {
  if (!isLegacyAuthHash(checkedHash)) return;
  await prisma.account.updateMany({ where: { id: accountId, passwordHash: checkedHash }, data: { passwordHash: upgradedHash } });
  logSecurityEvent('auth_hash_upgraded', { accountId });
}

// The recovery check stores SHA-256 of the client's proof (PBKDF2 of the
// recovery key), so a leaked row can't be replayed as the proof. Rows from
// before hold the proof itself; upgradeStoredCredentials() rewrites them.
const RECOVERY_PREFIX = 'v2$';
const sha256Hex = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const sealRecoveryProof = (proof: string) => RECOVERY_PREFIX + sha256Hex(proof);

function recoveryProofMatches(stored: string, proof: string): boolean {
  const sealed = stored.startsWith(RECOVERY_PREFIX);
  const a = Buffer.from(sealed ? sha256Hex(proof) : proof);
  const b = Buffer.from(sealed ? stored.slice(RECOVERY_PREFIX.length) : stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Startup: seal old recovery checks, and sign out every account that still
 * has a legacy password hash — its next sign-in replaces the hash, and the
 * password-confirmed actions (change password, 2FA, delete…) only accept
 * derived secrets.
 */
export async function upgradeStoredCredentials(): Promise<{ recoverySealed: number; sessionsRevoked: number }> {
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
  const revoked = await prisma.session.updateMany({
    where: { revokedAt: null, account: { NOT: { passwordHash: { startsWith: AUTH_PREFIX } } } },
    data: { revokedAt: new Date(), revokedReason: 'auth_upgrade' },
  });
  return { recoverySealed: unsealed.length, sessionsRevoked: revoked.count };
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

    const { email: rawEmail, username, authSecret, encryptedMasterKey, kekSalt, kekWrapIv, recoveryWrappedMK, recoveryWrapIv, recoveryKeyHash, recoveryKeySalt } = parsed.data;
    const email = normalizeEmail(rawEmail);

    // Whitelist check — if REGISTRATION_WHITELIST is set, only allow listed emails
    const whitelist = process.env.REGISTRATION_WHITELIST;
    if (whitelist) {
      const allowed = whitelist.split(',').map(e => e.trim().toLowerCase());
      if (!allowed.includes(email)) {
        logSecurityEvent('register_not_whitelisted', { ip: req.ip });
        res.status(403).json({ error: 'Registration is currently restricted.' });
        return;
      }
    }

    // Check for existing account — check email and username separately for clear feedback
    const existingEmail = await prisma.account.findUnique({ where: { email } });
    if (existingEmail) {
      logSecurityEvent('register_duplicate', { ip: req.ip });
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      res.status(409).json({ error: 'An account with this email already exists.', field: 'email' });
      return;
    }

    const existingUsername = await prisma.account.findUnique({ where: { username } });
    if (existingUsername) {
      logSecurityEvent('register_duplicate', { ip: req.ip });
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      res.status(409).json({ error: 'This username is already taken.', field: 'username' });
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

    logSecurityEvent('register_success', { accountId: account.id, ip: req.ip });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.status(201).json({
      user: { email: account.email, username: account.username },
    });
  } catch (err) {
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

    const { email, authSecret, legacyPassword } = parsed.data;

    const normalizedEmail = normalizeEmail(email);
    if (loginLocked(normalizedEmail)) {
      logSecurityEvent('login_locked', { ip: req.ip });
      await constantTimeDelay(startTime);
      res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in 15 minutes.' });
      return;
    }
    const account = await prisma.account.findUnique({ where: { email: normalizedEmail } });
    const legacy = !account || isLegacyAuthHash(account.passwordHash);
    if (legacy && !legacyPassword) {
      // A legacy account can only be checked against the password, so ask the
      // client for it once. Nothing was checked, so nothing counts as a
      // failure. An unknown email answers exactly like a legacy account.
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Invalid credentials', legacyAuth: true });
      return;
    }
    if (!account) {
      logSecurityEvent('login_failed_no_account', { ip: req.ip });
      recordLoginFailure(normalizedEmail);
      // Constant-time delay to prevent timing-based email enumeration
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = legacy
      ? await bcrypt.compare(legacyPassword!, account.passwordHash)
      : await checkAuthSecret(account.passwordHash, authSecret);
    if (!valid) {
      recordLoginFailure(normalizedEmail);
      logSecurityEvent('login_failed_bad_password', { accountId: account.id, ip: req.ip });
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    loginFailures.delete(normalizedEmail);

    // A legacy account swaps its password hash for one of the derived secret.
    // With 2FA on this waits until the code checks out, so someone holding
    // only the password can't swap in a secret and lock the owner out.
    const upgradedHash = legacy ? await hashAuthSecret(authSecret) : undefined;

    // 2FA check — if enabled, return a pending token instead of a session
    if (account.totpEnabled) {
      cleanExpiredPending();
      const pendingToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      pendingTwoFA.set(pendingToken, { accountId: account.id, expiresAt, upgradedHash });
      logSecurityEvent('login_2fa_required', { accountId: account.id, ip: req.ip });
      res.json({ requires2FA: true, pendingToken });
      return;
    }

    if (upgradedHash) await upgradeAuthHash(account.id, account.passwordHash, upgradedHash);

    const token = await createSession(account.id, account.tenantSchemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logSecurityEvent('login_success', { accountId: account.id, ip: req.ip });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({
      user: { email: account.email, username: account.username, totpEnabled: account.totpEnabled },
      encryption: buildEncryptionResponse(account),
    });
  } catch (err) {
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
router.post('/change-password', strictLimiter, authMiddleware, async (req, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Password does not meet requirements' });
      return;
    }

    const { currentAuthSecret, newAuthSecret, newEncryptedMasterKey, newKekSalt, newKekWrapIv } = parsed.data;
    const account = await prisma.account.findUnique({ where: { id: req.auth!.accountId } });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const valid = await checkAuthSecret(account.passwordHash, currentAuthSecret);
    if (!valid) {
      logSecurityEvent('password_change_failed', { accountId: account.id, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }

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

    revokeGrantsForAccount(account.id);

    // Create a fresh session after revoking all old ones (prevents race condition)
    const token = await createSession(account.id, account.tenantSchemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logSecurityEvent('password_change', { accountId: account.id, ip: req.ip });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Password change failed' });
  }
});

// =============================================================================
// POST /api/auth/change-email — Change email address
// =============================================================================
router.post('/change-email', strictLimiter, authMiddleware, async (req, res) => {
  try {
    const parsed = changeEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const normalizedEmail = normalizeEmail(parsed.data.newEmail);
    const emailParsed = emailSchema.safeParse(normalizedEmail);
    if (!emailParsed.success) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // The email is the login identifier — changing it needs the password
    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { passwordHash: true },
    });
    if (!account || !(await checkAuthSecret(account.passwordHash, parsed.data.currentAuthSecret))) {
      logSecurityEvent('email_change_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }

    // Check if email is already taken
    const existing = await prisma.account.findUnique({ where: { email: normalizedEmail } });
    if (existing && existing.id !== req.auth!.accountId) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    await prisma.account.update({
      where: { id: req.auth!.accountId },
      // The sign-in secret is salted with the email, so it's replaced too
      data: { email: normalizedEmail, passwordHash: await hashAuthSecret(parsed.data.newAuthSecret) },
    });

    logSecurityEvent('email_changed', { accountId: req.auth!.accountId, ip: req.ip });
    res.json({ success: true, email: normalizedEmail });
  } catch (err) {
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
      // Legacy accounts without recoveryKeyHash or accounts that already used recovery
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
      if (twoFALocked(account.id)) {
        res.status(429).json({ error: 'Too many incorrect codes. Try again in 15 minutes.', requires2FA: true });
        return;
      }
      if (!code) {
        res.status(401).json({ error: 'Enter the code from your authenticator app or a backup code', requires2FA: true });
        return;
      }
      const factor = await verifySecondFactor({ id: account.id, totpSecret: account.totpSecret, totpBackupCodes: account.totpBackupCodes }, code);
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

    revokeGrantsForAccount(account.id);
    logSecurityEvent('recovery_success', { accountId: account.id, ip: req.ip });

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

    cleanExpiredPending();
    const pending = pendingTwoFA.get(pendingToken);
    if (!pending || pending.expiresAt <= new Date()) {
      pendingTwoFA.delete(pendingToken);
      res.status(401).json({ error: 'Verification session expired. Please log in again.' });
      return;
    }

    // Single-use — remove immediately
    pendingTwoFA.delete(pendingToken);

    const account = await prisma.account.findUnique({
      where: { id: pending.accountId },
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
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (twoFALocked(account.id)) {
      logSecurityEvent('login_2fa_locked', { accountId: account.id, ip: req.ip });
      res.status(429).json({ error: 'Too many incorrect codes. Try again in 15 minutes.' });
      return;
    }

    const factor = await verifySecondFactor({ id: account.id, totpSecret: account.totpSecret, totpBackupCodes: account.totpBackupCodes }, code);
    if (!factor) {
      logSecurityEvent('login_2fa_failed', { accountId: account.id, ip: req.ip });
      res.status(401).json({ error: 'Invalid code' });
      return;
    }
    if (factor === 'backup') {
      logSecurityEvent('login_2fa_backup_code_used', { accountId: account.id, ip: req.ip });
    }
    if (pending.upgradedHash) await upgradeAuthHash(account.id, account.passwordHash, pending.upgradedHash);

    const token = await createSession(account.id, account.tenantSchemaName, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logSecurityEvent('login_success', { accountId: account.id, ip: req.ip });
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
router.post('/2fa/enable', strictLimiter, authMiddleware, async (req, res) => {
  try {
    const parsed = enable2FASchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const { secret, code, currentAuthSecret } = parsed.data;

    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { passwordHash: true, totpEnabled: true },
    });
    if (!account || !(await checkAuthSecret(account.passwordHash, currentAuthSecret))) {
      logSecurityEvent('2fa_enable_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }
    // Replacing a live authenticator goes through disable (password) first
    if (account.totpEnabled) {
      res.status(409).json({ error: 'Two-factor authentication is already on' });
      return;
    }

    let valid = false;
    try {
      valid = verifySync({ token: code, secret }).valid;
    } catch {
      valid = false;
    }
    if (!valid) {
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
      data: { totpSecret: sealTotpSecret(secret), totpEnabled: true, totpBackupCodes: hashedCodes },
    });
    lastTotpStep.delete(req.auth!.accountId);
    twoFAFailures.delete(req.auth!.accountId);

    logSecurityEvent('2fa_enabled', { accountId: req.auth!.accountId, ip: req.ip });
    res.json({ backupCodes });
  } catch (err) {
    console.error('2FA enable error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: '2FA enable failed' });
  }
});

// =============================================================================
// DELETE /api/auth/2fa — Disable 2FA (requires password confirmation)
// =============================================================================
router.delete('/2fa', strictLimiter, authMiddleware, async (req, res) => {
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

    const valid = await checkAuthSecret(account.passwordHash, parsed.data.authSecret);
    if (!valid) {
      logSecurityEvent('2fa_disable_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    if (account.totpEnabled && account.totpSecret) {
      if (twoFALocked(account.id)) {
        res.status(429).json({ error: 'Too many incorrect codes. Try again in 15 minutes.' });
        return;
      }
      const factor = await verifySecondFactor({ id: account.id, totpSecret: account.totpSecret, totpBackupCodes: account.totpBackupCodes }, parsed.data.code);
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
    lastTotpStep.delete(req.auth!.accountId);
    twoFAFailures.delete(req.auth!.accountId);

    logSecurityEvent('2fa_disabled', { accountId: req.auth!.accountId, ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    console.error('2FA disable error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: '2FA disable failed' });
  }
});

// =============================================================================
// DELETE /api/auth/account — permanently delete the account and all its data
// =============================================================================
router.delete('/account', strictLimiter, authMiddleware, async (req, res) => {
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
    if (!(await checkAuthSecret(account.passwordHash, parsed.data.authSecret))) {
      logSecurityEvent('account_delete_failed', { accountId: account.id, ip: req.ip });
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }
    if (account.totpEnabled && account.totpSecret) {
      if (twoFALocked(account.id)) {
        res.status(429).json({ error: 'Too many incorrect codes. Try again in 15 minutes.' });
        return;
      }
      if (!parsed.data.code) {
        res.status(401).json({ error: 'Enter the code from your authenticator app or a backup code', requires2FA: true });
        return;
      }
      const factor = await verifySecondFactor({ id: account.id, totpSecret: account.totpSecret, totpBackupCodes: account.totpBackupCodes }, parsed.data.code);
      if (!factor) {
        logSecurityEvent('account_delete_failed', { accountId: account.id, ip: req.ip, details: { reason: 'bad_code' } });
        res.status(401).json({ error: 'Invalid code', requires2FA: true });
        return;
      }
    }

    revokeGrantsForAccount(account.id);
    await deleteAccountById(account.id);
    lastTotpStep.delete(account.id);
    twoFAFailures.delete(account.id);

    logSecurityEvent('account_deleted', { accountId: account.id, ip: req.ip });
    res.clearCookie(COOKIE_NAME, { path: '/', secure: IS_PRODUCTION, sameSite: 'strict' as const });
    clearRememberCookie(res);
    res.json({ success: true });
  } catch (err) {
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
router.post('/recovery-key', strictLimiter, authMiddleware, async (req, res) => {
  try {
    const parsed = saveRecoveryKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { currentAuthSecret, recoveryWrappedMK, recoveryWrapIv, recoveryKeyHash, recoveryKeySalt } = parsed.data;

    // Whoever sets the recovery key can later reset the password with it, so
    // a signed-in session alone must not be enough to replace it
    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { passwordHash: true },
    });
    if (!account || !(await checkAuthSecret(account.passwordHash, currentAuthSecret))) {
      logSecurityEvent('recovery_key_regenerate_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }

    await prisma.account.update({
      where: { id: req.auth!.accountId },
      data: {
        recoveryWrappedMK: new Uint8Array(Buffer.from(recoveryWrappedMK, 'base64')),
        recoveryWrapIv: new Uint8Array(Buffer.from(recoveryWrapIv, 'base64')),
        recoveryKeyHash: sealRecoveryProof(recoveryKeyHash),
        recoveryKeySalt,
      },
    });

    logSecurityEvent('recovery_key_regenerated', { accountId: req.auth!.accountId, ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    console.error('Recovery key regeneration error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to save recovery key' });
  }
});

export default router;
