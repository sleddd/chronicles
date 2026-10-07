import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateSecret, generateSync, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../db/prisma.js';
import { registerTenant } from '../db/schemaManager.js';
import { createSession, revokeSession, revokeAllSessions, authMiddleware } from '../middleware/auth.js';
import { authLimiter, strictLimiter, registerLimiter } from '../middleware/rateLimiter.js';
import { registerSchema, loginSchema, changePasswordSchema, changeEmailSchema, saveRecoveryKeySchema, recoverSchema, emailSchema, twoFALoginSchema, enable2FASchema, disable2FASchema } from '@chronicles/shared';
import { logSecurityEvent } from '../utils/securityLogger.js';
import { clearRememberCookie } from './remember.js';

// In-memory map for pending 2FA sessions (single-instance safe for Render)
const pendingTwoFA = new Map<string, { accountId: number; expiresAt: Date }>();

function cleanExpiredPending() {
  const now = new Date();
  for (const [token, entry] of pendingTwoFA) {
    if (entry.expiresAt <= now) pendingTwoFA.delete(token);
  }
}

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
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
  return configured
    ? crypto.createHmac('sha256', Buffer.from(configured, 'base64')).update('chronicles:recovery-decoy').digest()
    : crypto.randomBytes(32);
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
      res.status(400).json({ error: 'Password does not meet requirements' });
      return;
    }

    const { email: rawEmail, username, password, encryptedMasterKey, kekSalt, kekWrapIv, recoveryWrappedMK, recoveryWrapIv, recoveryKeyHash, recoveryKeySalt } = parsed.data;
    const email = rawEmail.toLowerCase();

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

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { account, schemaName } = await registerTenant(email, username, passwordHash, {
      kekSalt: new Uint8Array(Buffer.from(kekSalt, 'base64')),
      encryptedMasterKey: new Uint8Array(Buffer.from(encryptedMasterKey, 'base64')),
      kekWrapIv: new Uint8Array(Buffer.from(kekWrapIv, 'base64')),
      recoveryWrappedMK: new Uint8Array(Buffer.from(recoveryWrappedMK, 'base64')),
      recoveryWrapIv: new Uint8Array(Buffer.from(recoveryWrapIv, 'base64')),
      recoveryKeyHash,
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

    const { email, password } = parsed.data;

    const normalizedEmail = email.toLowerCase();
    const account = await prisma.account.findUnique({ where: { email: normalizedEmail } });
    if (!account) {
      logSecurityEvent('login_failed_no_account', { ip: req.ip });
      // Constant-time delay to prevent timing-based email enumeration
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) {
      logSecurityEvent('login_failed_bad_password', { accountId: account.id, ip: req.ip });
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // 2FA check — if enabled, return a pending token instead of a session
    if (account.totpEnabled) {
      cleanExpiredPending();
      const pendingToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      pendingTwoFA.set(pendingToken, { accountId: account.id, expiresAt });
      logSecurityEvent('login_2fa_required', { accountId: account.id, ip: req.ip });
      res.json({ requires2FA: true, pendingToken });
      return;
    }

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

    const { currentPassword, newPassword, newEncryptedMasterKey, newKekSalt, newKekWrapIv } = parsed.data;
    const account = await prisma.account.findUnique({ where: { id: req.auth!.accountId } });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!valid) {
      logSecurityEvent('password_change_failed', { accountId: account.id, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

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

    const normalizedEmail = parsed.data.newEmail.toLowerCase().trim();
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
    if (!account || !(await bcrypt.compare(parsed.data.currentPassword, account.passwordHash))) {
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
      data: { email: normalizedEmail },
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
      res.status(400).json({ error: 'Password does not meet requirements' });
      return;
    }

    const { email: rawEmail, recoveryKey, newPassword, newEncryptedMasterKey, newKekSalt, newKekWrapIv, newRecoveryWrappedMK, newRecoveryWrapIv, newRecoveryKeyHash, newRecoveryKeySalt } = parsed.data;
    const email = rawEmail.toLowerCase();

    const account = await prisma.account.findUnique({ where: { email } });
    if (!account) {
      // Constant-time delay to prevent timing-based enumeration
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
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

    // Verify recovery key using PBKDF2 (salted + iterated)
    const recoveryKeySalt = Buffer.from(account.recoveryKeySalt, 'hex');
    const providedHash = crypto.pbkdf2Sync(recoveryKey, recoveryKeySalt, 600000, 32, 'sha256').toString('hex');

    if (!crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(account.recoveryKeyHash))) {
      logSecurityEvent('recovery_failed', { accountId: account.id, ip: req.ip });
      await constantTimeDelay(startTime);
      res.status(401).json({ error: 'Recovery failed' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Interactive transaction with row-level locking to prevent concurrent recovery race condition
    const txResult = await prisma.$transaction(async (tx) => {
      // Lock the account row to prevent concurrent recovery attempts
      const locked = await tx.$queryRawUnsafe<{ id: number; recovery_key_hash: string | null }[]>(
        'SELECT id, recovery_key_hash FROM "accounts" WHERE id = $1 FOR UPDATE',
        account.id
      );

      // Re-check recovery key hasn't been used by a concurrent request
      if (!locked[0]?.recovery_key_hash) {
        return null; // Recovery already consumed by another request
      }

      await tx.account.update({
        where: { id: account.id },
        data: {
          passwordHash,
          encryptedMasterKey: new Uint8Array(Buffer.from(newEncryptedMasterKey, 'base64')),
          kekSalt: new Uint8Array(Buffer.from(newKekSalt, 'base64')),
          kekWrapIv: new Uint8Array(Buffer.from(newKekWrapIv, 'base64')),
          recoveryKeyHash: newRecoveryKeyHash,
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

    // Try TOTP code first
    const totpResult = verifySync({ token: code, secret: account.totpSecret });
    const totpValid = totpResult.valid;

    if (!totpValid) {
      // Try backup codes
      const codeHash = hashBackupCode(code);
      const matchIndex = account.totpBackupCodes.indexOf(codeHash);
      if (matchIndex === -1) {
        logSecurityEvent('login_2fa_failed', { accountId: account.id, ip: req.ip });
        res.status(401).json({ error: 'Invalid code' });
        return;
      }
      // Consume the backup code (single-use)
      const updatedCodes = account.totpBackupCodes.filter((_, i) => i !== matchIndex);
      await prisma.account.update({
        where: { id: account.id },
        data: { totpBackupCodes: updatedCodes },
      });
      logSecurityEvent('login_2fa_backup_code_used', { accountId: account.id, ip: req.ip });
    }

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
router.post('/2fa/setup', authMiddleware, async (req, res) => {
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

    const { secret, code } = parsed.data;
    const verifyResult = verifySync({ token: code, secret });
    if (!verifyResult.valid) {
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
      hashedCodes.push(hashBackupCode(formatted));
    }

    await prisma.account.update({
      where: { id: req.auth!.accountId },
      data: { totpSecret: secret, totpEnabled: true, totpBackupCodes: hashedCodes },
    });

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
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { passwordHash: true },
    });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const valid = await bcrypt.compare(parsed.data.password, account.passwordHash);
    if (!valid) {
      logSecurityEvent('2fa_disable_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    await prisma.account.update({
      where: { id: req.auth!.accountId },
      data: { totpSecret: null, totpEnabled: false, totpBackupCodes: [] },
    });

    logSecurityEvent('2fa_disabled', { accountId: req.auth!.accountId, ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    console.error('2FA disable error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: '2FA disable failed' });
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
    const email = rawEmail.toLowerCase();

    const account = await prisma.account.findUnique({
      where: { email },
      select: {
        recoveryWrappedMK: true,
        recoveryWrapIv: true,
        encryptionEnabled: true,
      },
    });

    if (!account || !account.encryptionEnabled || !account.recoveryWrappedMK || !account.recoveryWrapIv) {
      // Stable decoy params (same size as a real AES-GCM-wrapped 32-byte key)
      // so an unknown email is indistinguishable from a real one
      await constantTimeDelay(startTime);
      res.json({
        recoveryWrappedMK: longDecoyBytes(email, 'wrapped-mk', 48),
        recoveryWrapIv: decoyBytes(email, 'wrap-iv', 12),
      });
      return;
    }

    await constantTimeDelay(startTime);
    res.json({
      recoveryWrappedMK: Buffer.from(account.recoveryWrappedMK).toString('base64'),
      recoveryWrapIv: Buffer.from(account.recoveryWrapIv).toString('base64'),
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
    const { currentPassword, recoveryWrappedMK, recoveryWrapIv, recoveryKeyHash, recoveryKeySalt } = parsed.data;

    // Whoever sets the recovery key can later reset the password with it, so
    // a signed-in session alone must not be enough to replace it
    const account = await prisma.account.findUnique({
      where: { id: req.auth!.accountId },
      select: { passwordHash: true },
    });
    if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
      logSecurityEvent('recovery_key_regenerate_failed', { accountId: req.auth!.accountId, ip: req.ip });
      res.status(401).json({ error: 'Current password incorrect' });
      return;
    }

    await prisma.account.update({
      where: { id: req.auth!.accountId },
      data: {
        recoveryWrappedMK: new Uint8Array(Buffer.from(recoveryWrappedMK, 'base64')),
        recoveryWrapIv: new Uint8Array(Buffer.from(recoveryWrapIv, 'base64')),
        recoveryKeyHash,
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
