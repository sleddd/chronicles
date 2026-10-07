import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// ---- Mocks must be set up before importing the router ----

// Mock prisma
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    account: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock schemaManager
vi.mock('../../db/schemaManager.js', () => ({
  registerTenant: vi.fn(),
}));

// Mock auth middleware and helpers
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((req: any, _res: any, next: any) => {
    req.auth = {
      accountId: 1,
      tenantSchemaName: 'usr_1_a1b2c3',
      sessionId: 42,
      selector: 'aabbccddee11',
    };
    next();
  }),
  createSession: vi.fn().mockResolvedValue('aabbccddee11' + 'verifier1234567890123456789012'),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  revokeAllSessions: vi.fn().mockResolvedValue(undefined),
}));

// Mock rate limiters (pass-through)
vi.mock('../../middleware/rateLimiter.js', () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  strictLimiter: (_req: any, _res: any, next: any) => next(),
  apiLimiter: (_req: any, _res: any, next: any) => next(),
}));

// Mock security logger
vi.mock('../../utils/securityLogger.js', () => ({
  logSecurityEvent: vi.fn(),
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import authRouter from '../../routes/auth.js';
import { prisma } from '../../db/prisma.js';
import { registerTenant } from '../../db/schemaManager.js';
import { createSession, revokeSession } from '../../middleware/auth.js';
import bcrypt from 'bcryptjs';

// Build the test app (auth routes handle their own authMiddleware internally)
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  return app;
}

// Valid registration payload
const validRegisterBody = {
  email: 'test@example.com',
  username: 'testuser',
  password: 'StrongPass1!xyz',
  encryptedMasterKey: Buffer.from('masterkey').toString('base64'),
  kekSalt: Buffer.from('saltsaltsaltsalt').toString('base64'),
  kekWrapIv: Buffer.from('iviviviviviv').toString('base64'),
  recoveryWrappedMK: Buffer.from('recoverymk').toString('base64'),
  recoveryWrapIv: Buffer.from('recoveryiv12').toString('base64'),
  recoveryKeyHash: 'abc123hash',
  recoveryKeySalt: 'abc123salt',
};

// Valid login payload
const validLoginBody = {
  email: 'test@example.com',
  password: 'anypassword1',
};

describe('Auth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // =========================================================================
  // POST /api/auth/register
  // =========================================================================
  describe('POST /api/auth/register', () => {
    it('returns 201 on successful registration', async () => {
      (prisma.account.findFirst as any).mockResolvedValue(null);
      (registerTenant as any).mockResolvedValue({
        account: { id: 1, email: 'test@example.com', username: 'testuser' },
        schemaName: 'usr_1_a1b2c3',
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegisterBody);

      expect(res.status).toBe(201);
      expect(res.body.user).toEqual({ email: 'test@example.com', username: 'testuser' });
      expect(createSession).toHaveBeenCalledWith(1, 'usr_1_a1b2c3', expect.any(Object));
    });

    it('returns 409 when the email already exists', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ id: 99, email: 'test@example.com' });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegisterBody);

      expect(res.status).toBe(409);
      expect(res.body.field).toBe('email');
      expect(registerTenant).not.toHaveBeenCalled();
    });

    it('returns 409 when the username is taken', async () => {
      (prisma.account.findUnique as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 99, username: 'testuser' });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegisterBody);

      expect(res.status).toBe(409);
      expect(res.body.field).toBe('username');
      expect(registerTenant).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid password (too short)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegisterBody, password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Password does not meet requirements');
    });

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
    });

    it('returns 500 when registerTenant throws', async () => {
      (prisma.account.findFirst as any).mockResolvedValue(null);
      (registerTenant as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegisterBody);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Registration failed');
    });
  });

  // =========================================================================
  // POST /api/auth/login
  // =========================================================================
  describe('POST /api/auth/login', () => {
    const mockAccount = {
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      passwordHash: '$2a$12$hashedpassword',
      tenantSchemaName: 'usr_1_a1b2c3',
      encryptionEnabled: true,
      kekSalt: Buffer.from('salt'),
      encryptedMasterKey: Buffer.from('key'),
      kekWrapIv: Buffer.from('iv'),
      kekIterations: 600000,
      recoveryWrappedMK: Buffer.from('rmk'),
      recoveryWrapIv: Buffer.from('riv'),
    };

    it('returns 200 with user and encryption data on valid login', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockResolvedValue(true);

      const res = await request(app)
        .post('/api/auth/login')
        .send(validLoginBody);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ email: 'test@example.com', username: 'testuser' });
      expect(res.body.encryption).toBeDefined();
      expect(res.body.encryption.encryptionEnabled).toBe(true);
      expect(res.body.encryption.kekSalt).toBe(Buffer.from('salt').toString('base64'));
    });

    it('returns 401 when user not found', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send(validLoginBody);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 401 when password is wrong', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockResolvedValue(false);

      const res = await request(app)
        .post('/api/auth/login')
        .send(validLoginBody);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 400 for invalid body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid credentials');
    });
  });

  // =========================================================================
  // POST /api/auth/logout
  // =========================================================================
  describe('POST /api/auth/logout', () => {
    it('returns success and revokes session', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=aabbccddee11verifier1234567890123456789012');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(revokeSession).toHaveBeenCalledWith('aabbccddee11', 'user_logout');
    });
  });

  // =========================================================================
  // GET /api/auth/me
  // =========================================================================
  describe('GET /api/auth/me', () => {
    it('returns user and encryption data when authenticated', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        email: 'test@example.com',
        username: 'testuser',
        encryptionEnabled: true,
        kekSalt: Buffer.from('salt'),
        encryptedMasterKey: Buffer.from('key'),
        kekWrapIv: Buffer.from('iv'),
        kekIterations: 600000,
        recoveryWrappedMK: Buffer.from('rmk'),
        recoveryWrapIv: Buffer.from('riv'),
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=aabbccddee11verifier1234567890123456789012');

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.encryption.encryptionEnabled).toBe(true);
    });

    it('returns 404 when account not found', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/auth/me')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=aabbccddee11verifier1234567890123456789012');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Account not found');
    });
  });

  // =========================================================================
  // GET /api/auth/salt (removed)
  // =========================================================================
  describe('GET /api/auth/salt', () => {
    it('no longer exists — the wrapped master key is never handed out before auth', async () => {
      const res = await request(app)
        .get('/api/auth/salt')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(404);
      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // POST /api/auth/change-email
  // =========================================================================
  describe('POST /api/auth/change-email', () => {
    const body = { newEmail: 'New@Example.com', currentPassword: 'StrongPass1!xyz' };

    it('changes the email when the current password is correct', async () => {
      (prisma.account.findUnique as any)
        .mockResolvedValueOnce({ passwordHash: '$2a$12$hash' }) // password check
        .mockResolvedValueOnce(null); // email not taken
      (bcrypt.compare as any).mockResolvedValueOnce(true);

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('new@example.com');
      expect(prisma.account.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { email: 'new@example.com' } });
    });

    it('rejects a wrong password without changing anything', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ passwordHash: '$2a$12$hash' });
      (bcrypt.compare as any).mockResolvedValueOnce(false);

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(401);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('requires the current password', async () => {
      const res = await request(app).post('/api/auth/change-email').send({ newEmail: 'new@example.com' });

      expect(res.status).toBe(400);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('returns 409 when the email belongs to another account', async () => {
      (prisma.account.findUnique as any)
        .mockResolvedValueOnce({ passwordHash: '$2a$12$hash' })
        .mockResolvedValueOnce({ id: 99 });
      (bcrypt.compare as any).mockResolvedValueOnce(true);

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(409);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // POST /api/auth/recovery-key
  // =========================================================================
  describe('POST /api/auth/recovery-key', () => {
    const body = {
      currentPassword: 'StrongPass1!xyz',
      recoveryWrappedMK: Buffer.from('wrapped').toString('base64'),
      recoveryWrapIv: Buffer.from('iv12345678ab').toString('base64'),
      recoveryKeyHash: 'a'.repeat(64),
      recoveryKeySalt: 'b'.repeat(32),
    };

    it('saves the new recovery key when the current password is correct', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ passwordHash: '$2a$12$hash' });
      (bcrypt.compare as any).mockResolvedValueOnce(true);

      const res = await request(app).post('/api/auth/recovery-key').send(body);

      expect(res.status).toBe(200);
      expect(prisma.account.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ recoveryKeyHash: 'a'.repeat(64), recoveryKeySalt: 'b'.repeat(32) }),
      }));
    });

    it('rejects a wrong password — a session alone cannot replace the recovery key', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ passwordHash: '$2a$12$hash' });
      (bcrypt.compare as any).mockResolvedValueOnce(false);

      const res = await request(app).post('/api/auth/recovery-key').send(body);

      expect(res.status).toBe(401);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('requires the current password', async () => {
      const { currentPassword, ...rest } = body;
      const res = await request(app).post('/api/auth/recovery-key').send(rest);

      expect(res.status).toBe(400);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('rejects malformed hash material', async () => {
      const res = await request(app).post('/api/auth/recovery-key').send({ ...body, recoveryKeyHash: { $ne: null } });

      expect(res.status).toBe(400);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // POST /api/auth/change-password
  // =========================================================================
  describe('POST /api/auth/change-password', () => {
    const changePasswordBody = {
      currentPassword: 'OldPassword1!xyz',
      newPassword: 'NewPassword2!xyz',
      newEncryptedMasterKey: Buffer.from('newkey').toString('base64'),
      newKekSalt: Buffer.from('newsalt1234567890').toString('base64'),
      newKekWrapIv: Buffer.from('newiv1234567').toString('base64'),
      // Recovery rotates in a fresh recovery key so it can be used again
      newRecoveryWrappedMK: Buffer.from('newrecoverymk').toString('base64'),
      newRecoveryWrapIv: Buffer.from('newrecoveryiv').toString('base64'),
      newRecoveryKeyHash: 'newrecoveryhash',
      newRecoveryKeySalt: 'newrecoverysalt',
    };

    const mockAccount = {
      id: 1,
      passwordHash: '$2a$12$hashedpassword',
      tenantSchemaName: 'usr_1_a1b2c3',
    };

    it('returns success on valid password change', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockResolvedValue(true);
      (prisma.$transaction as any).mockResolvedValue([{}, { count: 1 }]);

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=aabbccddee11verifier1234567890123456789012')
        .send(changePasswordBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(createSession).toHaveBeenCalled();
    });

    it('returns 401 when current password is wrong', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockResolvedValue(false);

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=aabbccddee11verifier1234567890123456789012')
        .send(changePasswordBody);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Current password incorrect');
    });

    it('returns 404 when account not found', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=aabbccddee11verifier1234567890123456789012')
        .send(changePasswordBody);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Account not found');
    });

    it('returns 400 when new password is weak', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=aabbccddee11verifier1234567890123456789012')
        .send({ ...changePasswordBody, newPassword: 'weak' });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /api/auth/recover
  // =========================================================================
  describe('POST /api/auth/recover', () => {
    const recoverBody = {
      email: 'test@example.com',
      recoveryKey: 'my-recovery-key-value',
      newPassword: 'NewRecovered1!xyz',
      newEncryptedMasterKey: Buffer.from('newkey').toString('base64'),
      newKekSalt: Buffer.from('newsalt1234567890').toString('base64'),
      newKekWrapIv: Buffer.from('newiv1234567').toString('base64'),
      // Recovery rotates in a fresh recovery key so it can be used again
      newRecoveryWrappedMK: Buffer.from('newrecoverymk').toString('base64'),
      newRecoveryWrapIv: Buffer.from('newrecoveryiv').toString('base64'),
      newRecoveryKeyHash: 'newrecoveryhash',
      newRecoveryKeySalt: 'newrecoverysalt',
    };

    it('returns 401 when account not found', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/recover')
        .send(recoverBody);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Recovery failed');
    });

    it('returns 401 when account has no recovery key hash', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        recoveryKeyHash: null,
        recoveryKeySalt: null,
      });

      const res = await request(app)
        .post('/api/auth/recover')
        .send(recoverBody);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Recovery failed');
    });

    it('returns 401 when recovery key does not match', async () => {
      // Create a real hash for a different key to test mismatch
      const crypto = await import('crypto');
      const salt = crypto.randomBytes(16);
      const correctHash = crypto.pbkdf2Sync('correct-key', salt, 600000, 32, 'sha256').toString('hex');

      (prisma.account.findUnique as any).mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        recoveryKeyHash: correctHash,
        recoveryKeySalt: salt.toString('hex'),
        tenantSchemaName: 'usr_1_a1b2c3',
      });

      const res = await request(app)
        .post('/api/auth/recover')
        .send({ ...recoverBody, recoveryKey: 'wrong-key' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Recovery failed');
    }, 30000);

    it('returns 400 for invalid body', async () => {
      const res = await request(app)
        .post('/api/auth/recover')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Password does not meet requirements');
    });

    it('returns user data on successful recovery', async () => {
      const crypto = await import('crypto');
      const salt = crypto.randomBytes(16);
      const correctHash = crypto.pbkdf2Sync('my-recovery-key-value', salt, 600000, 32, 'sha256').toString('hex');

      (prisma.account.findUnique as any).mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        recoveryKeyHash: correctHash,
        recoveryKeySalt: salt.toString('hex'),
        tenantSchemaName: 'usr_1_a1b2c3',
        encryptionEnabled: true,
        kekIterations: 600000,
      });
      const tx = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 1, recovery_key_hash: correctHash }]),
        account: { update: vi.fn().mockResolvedValue({}) },
        session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const res = await request(app)
        .post('/api/auth/recover')
        .send(recoverBody);

      expect(res.status).toBe(200);
      // Old recovery key is replaced by the new one, and every old session is revoked
      expect(tx.account.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          recoveryKeyHash: 'newrecoveryhash',
          recoveryKeySalt: 'newrecoverysalt',
          recoveryKeyUsedAt: expect.any(Date),
        }),
      }));
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { accountId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'recovery' },
      });
      expect(res.body.user).toEqual({ email: 'test@example.com', username: 'testuser' });
      expect(res.body.encryption).toBeDefined();
      expect(res.body.encryption.recoveryWrappedMK).toBeNull();
    }, 30000);
  });

  // =========================================================================
  // GET /api/auth/recovery-params
  // =========================================================================
  describe('GET /api/auth/recovery-params', () => {
    it('returns recovery params for existing user', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        recoveryWrappedMK: Buffer.from('wrappedmk'),
        recoveryWrapIv: Buffer.from('wrapiv'),
        encryptionEnabled: true,
      });

      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.recoveryWrappedMK).toBe(Buffer.from('wrappedmk').toString('base64'));
      expect(res.body.recoveryWrapIv).toBe(Buffer.from('wrapiv').toString('base64'));
    });

    it('returns fake params for non-existing user', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.recoveryWrappedMK).toBeDefined();
      expect(res.body.recoveryWrapIv).toBeDefined();
    });

    it('returns fake params when encryption is not enabled', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        recoveryWrappedMK: null,
        recoveryWrapIv: null,
        encryptionEnabled: false,
      });

      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.recoveryWrappedMK).toBeDefined();
    });

    it('returns 400 when email is missing', async () => {
      const res = await request(app).get('/api/auth/recovery-params');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email required');
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid email');
    });
  });
});
