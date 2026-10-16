import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { generateSecret, generateSync } from 'otplib';

// TOTP secrets are sealed with the server secrets key when one is configured
process.env.SECRETS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: { updateMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../db/schemaManager.js', () => ({ registerTenant: vi.fn(), deleteAccountById: vi.fn() }));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((req: any, _res: any, next: any) => {
    req.auth = { accountId: 1, tenantSchemaName: 'usr_1_a1b2c3', sessionId: 42, selector: 'aabbccddee11' };
    next();
  }),
  createSession: vi.fn().mockResolvedValue('aabbccddee11' + 'verifier1234567890123456789012'),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  revokeAllSessions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../middleware/rateLimiter.js', () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  strictLimiter: (_req: any, _res: any, next: any) => next(),
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  registerLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../utils/securityLogger.js', () => ({ logSecurityEvent: vi.fn() }));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import authRouter from '../../routes/auth.js';
import { prisma } from '../../db/prisma.js';
import { decryptToken } from '../../services/tokenCrypto.js';
import { deleteAccountById } from '../../db/schemaManager.js';
import bcrypt from 'bcryptjs';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  return app;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// Each test uses its own account id: replay and lockout state is per account, in memory
let nextAccountId = 100;

function twoFAAccount(secret: string, backupCodes: string[] = []) {
  return {
    id: nextAccountId++,
    email: 'test@example.com',
    username: 'testuser',
    passwordHash: '$2a$12$hashedpassword',
    tenantSchemaName: 'usr_1_a1b2c3',
    totpEnabled: true,
    totpSecret: secret,
    totpBackupCodes: backupCodes,
    encryptionEnabled: true,
    kekSalt: null, encryptedMasterKey: null, kekWrapIv: null, kekIterations: 600000,
    recoveryWrappedMK: null, recoveryWrapIv: null,
  };
}

/** Sign in with the password to get a pending 2FA token for this account. */
async function pendingTokenFor(app: express.Express, account: ReturnType<typeof twoFAAccount>): Promise<string> {
  (prisma.account.findUnique as any).mockResolvedValue(account);
  const res = await request(app).post('/api/auth/login').send({ email: account.email, password: 'whatever' });
  expect(res.body.requires2FA).toBe(true);
  return res.body.pendingToken;
}

describe('2FA hardening', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    (bcrypt.compare as any).mockResolvedValue(true);
    app = buildApp();
  });

  describe('POST /api/auth/2fa/enable', () => {
    it('requires the current password — a stolen session cannot swap the authenticator', async () => {
      const secret = generateSecret();
      (prisma.account.findUnique as any).mockResolvedValue({ passwordHash: 'x', totpEnabled: false });
      (bcrypt.compare as any).mockResolvedValue(false);

      const res = await request(app).post('/api/auth/2fa/enable')
        .send({ secret, code: generateSync({ secret }), currentPassword: 'wrong' });

      expect(res.status).toBe(401);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('rejects a request without a password', async () => {
      const secret = generateSecret();
      const res = await request(app).post('/api/auth/2fa/enable')
        .send({ secret, code: generateSync({ secret }) });

      expect(res.status).toBe(400);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('refuses to replace an authenticator that is already on', async () => {
      const secret = generateSecret();
      (prisma.account.findUnique as any).mockResolvedValue({ passwordHash: 'x', totpEnabled: true });

      const res = await request(app).post('/api/auth/2fa/enable')
        .send({ secret, code: generateSync({ secret }), currentPassword: 'right' });

      expect(res.status).toBe(409);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('stores the secret encrypted and the backup codes salted + scrypt-hashed', async () => {
      const secret = generateSecret();
      (prisma.account.findUnique as any).mockResolvedValue({ passwordHash: 'x', totpEnabled: false });

      const res = await request(app).post('/api/auth/2fa/enable')
        .send({ secret, code: generateSync({ secret }), currentPassword: 'right' });

      expect(res.status).toBe(200);
      expect(res.body.backupCodes).toHaveLength(8);
      const data = (prisma.account.update as any).mock.calls[0][0].data;
      expect(data.totpSecret).not.toBe(secret);
      expect(decryptToken(data.totpSecret)).toBe(secret);
      expect(data.totpBackupCodes).toHaveLength(8);
      for (const stored of data.totpBackupCodes) expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    });
  });

  describe('POST /api/auth/login/2fa', () => {
    it('accepts a TOTP code once, then rejects the same code (replay)', async () => {
      const secret = generateSecret();
      const account = twoFAAccount(secret);
      const code = generateSync({ secret });

      const first = await request(app).post('/api/auth/login/2fa')
        .send({ pendingToken: await pendingTokenFor(app, account), code });
      expect(first.status).toBe(200);

      const replay = await request(app).post('/api/auth/login/2fa')
        .send({ pendingToken: await pendingTokenFor(app, account), code });
      expect(replay.status).toBe(401);
    });

    it('reads a secret sealed at rest', async () => {
      const secret = generateSecret();
      const { encryptToken } = await import('../../services/tokenCrypto.js');
      const account = twoFAAccount(encryptToken(secret));

      const res = await request(app).post('/api/auth/login/2fa')
        .send({ pendingToken: await pendingTokenFor(app, account), code: generateSync({ secret }) });
      expect(res.status).toBe(200);
    });

    it('locks the account after 5 wrong codes, even with fresh pending tokens', async () => {
      const secret = generateSecret();
      const account = twoFAAccount(secret);

      for (let i = 0; i < 5; i++) {
        const res = await request(app).post('/api/auth/login/2fa')
          .send({ pendingToken: await pendingTokenFor(app, account), code: '000000' === generateSync({ secret }) ? '111111' : '000000' });
        expect(res.status).toBe(401);
      }

      const locked = await request(app).post('/api/auth/login/2fa')
        .send({ pendingToken: await pendingTokenFor(app, account), code: generateSync({ secret }) });
      expect(locked.status).toBe(429);
    });

    it('accepts and consumes a legacy SHA-256 backup code', async () => {
      const account = twoFAAccount(generateSecret(), [sha256('aaaaaa-bbbbbb'), sha256('cccccc-dddddd')]);

      const res = await request(app).post('/api/auth/login/2fa')
        .send({ pendingToken: await pendingTokenFor(app, account), code: 'aaaaaa-bbbbbb' });

      expect(res.status).toBe(200);
      const [, used, id] = (prisma.$executeRaw as any).mock.calls[0];
      expect(used).toBe(sha256('aaaaaa-bbbbbb'));
      expect(id).toBe(account.id);
    });

    it('rejects a backup code a concurrent request already spent', async () => {
      const account = twoFAAccount(generateSecret(), [sha256('aaaaaa-bbbbbb')]);
      (prisma.$executeRaw as any).mockResolvedValueOnce(0);

      const res = await request(app).post('/api/auth/login/2fa')
        .send({ pendingToken: await pendingTokenFor(app, account), code: 'aaaaaa-bbbbbb' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/recover with 2FA on', () => {
    const recoveryKey = 'my-recovery-key-value';
    const salt = crypto.randomBytes(16);
    const recoveryKeyHash = crypto.pbkdf2Sync(recoveryKey, salt, 600000, 32, 'sha256').toString('hex');
    const body = {
      email: 'test@example.com',
      recoveryKey,
      newPassword: 'NewRecovered1!xyz',
      newEncryptedMasterKey: Buffer.from('newkey').toString('base64'),
      newKekSalt: Buffer.from('newsalt1234567890').toString('base64'),
      newKekWrapIv: Buffer.from('newiv1234567').toString('base64'),
      newRecoveryWrappedMK: Buffer.from('newrecoverymk').toString('base64'),
      newRecoveryWrapIv: Buffer.from('newrecoveryiv').toString('base64'),
      newRecoveryKeyHash: 'newrecoveryhash',
      newRecoveryKeySalt: 'newrecoverysalt',
    };

    function recoverableAccount(secret: string) {
      return { ...twoFAAccount(secret), recoveryKeyHash, recoveryKeySalt: salt.toString('hex') };
    }

    function mockTransaction(lockedHash: string) {
      const tx = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 1, recovery_key_hash: lockedHash }]),
        account: { update: vi.fn().mockResolvedValue({}) },
        session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
      return tx;
    }

    it('asks for a second factor instead of resetting with the recovery key alone', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(recoverableAccount(generateSecret()));
      const tx = mockTransaction(recoveryKeyHash);

      const res = await request(app).post('/api/auth/recover').send(body);

      expect(res.status).toBe(401);
      expect(res.body.requires2FA).toBe(true);
      expect(tx.account.update).not.toHaveBeenCalled();
    }, 30000);

    it('rejects a wrong code', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(recoverableAccount(generateSecret()));
      const tx = mockTransaction(recoveryKeyHash);

      const res = await request(app).post('/api/auth/recover').send({ ...body, code: 'zzzzzz-zzzzzz' });

      expect(res.status).toBe(401);
      expect(tx.account.update).not.toHaveBeenCalled();
    }, 30000);

    it('resets with the recovery key plus a valid authenticator code', async () => {
      const secret = generateSecret();
      (prisma.account.findUnique as any).mockResolvedValue(recoverableAccount(secret));
      const tx = mockTransaction(recoveryKeyHash);

      const res = await request(app).post('/api/auth/recover').send({ ...body, code: generateSync({ secret }) });

      expect(res.status).toBe(200);
      expect(tx.account.update).toHaveBeenCalled();
    }, 30000);

    it('loses a race to a concurrent recovery that already replaced the key', async () => {
      const secret = generateSecret();
      (prisma.account.findUnique as any).mockResolvedValue(recoverableAccount(secret));
      const tx = mockTransaction('hash-written-by-the-other-request');

      const res = await request(app).post('/api/auth/recover').send({ ...body, code: generateSync({ secret }) });

      expect(res.status).toBe(401);
      expect(tx.account.update).not.toHaveBeenCalled();
    }, 30000);
  });

  describe('DELETE /api/auth/2fa', () => {
    it('needs a valid authenticator or backup code as well as the password', async () => {
      const secret = generateSecret();
      const account = twoFAAccount(secret);
      (prisma.account.findUnique as any).mockResolvedValue(account);

      const noCode = await request(app).delete('/api/auth/2fa').send({ password: 'pw' });
      expect(noCode.status).toBe(400);

      const wrong = await request(app).delete('/api/auth/2fa').send({ password: 'pw', code: '000000' });
      expect(wrong.status).toBe(401);
      expect(prisma.account.update).not.toHaveBeenCalled();

      const ok = await request(app).delete('/api/auth/2fa').send({ password: 'pw', code: generateSync({ secret }) });
      expect(ok.status).toBe(200);
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { totpSecret: null, totpEnabled: false, totpBackupCodes: [] },
      });
    });
  });

  describe('DELETE /api/auth/account', () => {
    it('refuses a wrong password', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({ ...twoFAAccount(generateSecret()), totpEnabled: false, totpSecret: null });
      (bcrypt.compare as any).mockResolvedValue(false);

      const res = await request(app).delete('/api/auth/account').send({ password: 'nope' });
      expect(res.status).toBe(401);
      expect(deleteAccountById).not.toHaveBeenCalled();
    });

    it('asks for a 2FA code when 2FA is on, then deletes', async () => {
      const secret = generateSecret();
      const account = twoFAAccount(secret);
      (prisma.account.findUnique as any).mockResolvedValue(account);

      const noCode = await request(app).delete('/api/auth/account').send({ password: 'pw' });
      expect(noCode.status).toBe(401);
      expect(noCode.body.requires2FA).toBe(true);
      expect(deleteAccountById).not.toHaveBeenCalled();

      const ok = await request(app).delete('/api/auth/account').send({ password: 'pw', code: generateSync({ secret }) });
      expect(ok.status).toBe(200);
      expect(deleteAccountById).toHaveBeenCalledWith(account.id);
    });
  });

  describe('per-email sign-in limit', () => {
    it('locks an email after 10 wrong passwords, whether or not the account exists', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);
      for (let i = 0; i < 10; i++) {
        const r = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'x' });
        expect(r.status).toBe(401);
      }
      const locked = await request(app).post('/api/auth/login').send({ email: 'Ghost@example.com', password: 'x' });
      expect(locked.status).toBe(429);
      expect(prisma.account.findUnique).toHaveBeenCalledTimes(10);
    }, 30000);
  });
});
