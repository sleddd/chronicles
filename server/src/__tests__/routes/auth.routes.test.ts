import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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
  registerLimiter: (_req: any, _res: any, next: any) => next(),
}));

// Mock security logger
vi.mock('../../utils/securityLogger.js', () => ({
  logSecurityEvent: vi.fn(),
}));

vi.mock('../../db/betaQueries.js', () => ({ isApproved: vi.fn().mockResolvedValue(false) }));

// Mock the password hasher (bcryptjs in worker threads)
vi.mock('../../services/passwordHasher.js', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
  HasherBusyError: class HasherBusyError extends Error {},
}));

import authRouter, { checkStoredCredentials, resetAuthStateForTests } from '../../routes/auth.js';
import * as authMw from '../../middleware/auth.js';
import bcryptMock from '../../services/passwordHasher.js';
import { prisma } from '../../db/prisma.js';
import { registerTenant } from '../../db/schemaManager.js';
import { isApproved } from '../../db/betaQueries.js';
import { createSession, revokeSession } from '../../middleware/auth.js';
import bcrypt from '../../services/passwordHasher.js';
import { createHash } from 'crypto';

// Derived secrets (64 hex) — the server never receives a password or recovery key
const SECRET = 'a'.repeat(64);
const NEW_SECRET = 'b'.repeat(64);
const PROOF = 'c'.repeat(64);
const sealed = (proof: string) => 'v2$' + createHash('sha256').update(proof).digest('hex');
// A sign-in hash of the derived secret, and an old one of the password itself
const AUTH_HASH = 'auth1$$2a$12$hashedsecret';
const LEGACY_HASH = '$2a$12$hashedpassword';

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
  authSecret: SECRET,
  encryptedMasterKey: Buffer.from('masterkey').toString('base64'),
  kekSalt: Buffer.from('saltsaltsaltsalt').toString('base64'),
  kekWrapIv: Buffer.from('iviviviviviv').toString('base64'),
  recoveryWrappedMK: Buffer.from('recoverymk').toString('base64'),
  recoveryWrapIv: Buffer.from('recoveryiv12').toString('base64'),
  recoveryKeyHash: PROOF,
  recoveryKeySalt: 'd'.repeat(32),
};

// Valid login payload
const validLoginBody = {
  email: 'test@example.com',
  authSecret: SECRET,
};


/** Every mock starts each test fresh: reset implementations too (clearAllMocks
 *  keeps the last test's results), then put back the defaults the file relies on. */
function applyMockDefaults() {
  vi.resetAllMocks();
  (authMw.authMiddleware as any).mockImplementation((req: any, _res: any, next: any) => {
    req.auth = { accountId: 1, tenantSchemaName: 'usr_1_a1b2c3', sessionId: 42, selector: 'aabbccddee11' };
    next();
  });
  (authMw.createSession as any).mockResolvedValue('aabbccddee11' + 'verifier1234567890123456789012');
  (authMw.revokeSession as any).mockResolvedValue(undefined);
  (authMw.revokeAllSessions as any).mockResolvedValue(undefined);
  (bcryptMock.hash as any).mockResolvedValue('$2a$12$hashedpassword');
  (bcryptMock.compare as any).mockResolvedValue(true);
}

describe('Auth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    applyMockDefaults();
    // No sign-in state (failure counters, pending 2FA) carries over between tests
    resetAuthStateForTests();
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

    describe('with REGISTRATION_WHITELIST set', () => {
      const ok = () => (registerTenant as any).mockResolvedValue({
        account: { id: 1, email: 'test@example.com', username: 'testuser' }, schemaName: 'usr_1_a1b2c3',
      });
      afterEach(() => { delete process.env.REGISTRATION_WHITELIST; });

      it('refuses an email that is neither listed nor approved', async () => {
        process.env.REGISTRATION_WHITELIST = 'owner@example.com';
        (isApproved as any).mockResolvedValue(false);
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(403);
        expect(registerTenant).not.toHaveBeenCalled();
      });

      it('lets in an email approved on the beta list, without a restart', async () => {
        process.env.REGISTRATION_WHITELIST = 'owner@example.com';
        (isApproved as any).mockResolvedValue(true);
        ok();
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(201);
        expect(isApproved).toHaveBeenCalledWith('test@example.com');
      });

      it('still lets in an email on the list', async () => {
        process.env.REGISTRATION_WHITELIST = 'Test@Example.com, owner@example.com';
        ok();
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(201);
      });
    });

    it('stores a hash of the derived secret and a sealed recovery check', async () => {
      (registerTenant as any).mockResolvedValue({
        account: { id: 1, email: 'test@example.com', username: 'testuser' },
        schemaName: 'usr_1_a1b2c3',
      });

      await request(app).post('/api/auth/register').send(validRegisterBody);

      const [, , passwordHash, enc] = (registerTenant as any).mock.calls[0];
      expect(passwordHash).toBe('auth1$$2a$12$hashedpassword');
      expect(bcrypt.hash).toHaveBeenCalledWith(SECRET, 12);
      expect(enc.recoveryKeyHash).toBe(sealed(PROOF));
    });

    it('refuses a raw password in place of the derived secret', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegisterBody, authSecret: 'StrongPass1!xyz' });

      expect(res.status).toBe(400);
      expect(registerTenant).not.toHaveBeenCalled();
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

    it('returns 400 for a malformed secret', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegisterBody, authSecret: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid registration details');
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
      passwordHash: AUTH_HASH,
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
      expect(bcrypt.compare).toHaveBeenCalledWith(SECRET, '$2a$12$hashedsecret');
    });

    it('answers 503 with Retry-After when the hashing queue is full', async () => {
      const { HasherBusyError } = await import('../../services/passwordHasher.js');
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockRejectedValueOnce(new HasherBusyError());

      const res = await request(app).post('/api/auth/login').send(validLoginBody);

      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('5');
      expect(createSession).not.toHaveBeenCalled();
    });

    it('answers an unknown email exactly like a wrong password, never asking for the password', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);
      const unknown = await request(app).post('/api/auth/login').send(validLoginBody);

      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockResolvedValue(false);
      const wrong = await request(app).post('/api/auth/login').send(validLoginBody);

      expect(unknown.status).toBe(401);
      expect(unknown.body).toEqual({ error: 'Invalid credentials' });
      expect(wrong.body).toEqual(unknown.body);
      expect(createSession).not.toHaveBeenCalled();
    });

    it('refuses a pre-upgrade password hash and never asks for the password', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({ ...mockAccount, passwordHash: LEGACY_HASH });
      (bcrypt.compare as any).mockResolvedValue(true);

      const res = await request(app).post('/api/auth/login').send(validLoginBody);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid credentials' });
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    });

    it('rejects a body carrying the password', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({ ...mockAccount, passwordHash: LEGACY_HASH });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ ...validLoginBody, legacyPassword: 'OldPassword1!xyz' });

      expect(res.status).toBe(400);
      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });

    it('counts parallel wrong passwords before checking them, so a burst cannot pass the cap', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockImplementation(() => new Promise(r => setTimeout(() => r(false), 20)));

      const results = await Promise.all(
        Array.from({ length: 15 }, () => request(app).post('/api/auth/login').send(validLoginBody)),
      );

      const checked = (bcrypt.compare as any).mock.calls.length;
      expect(checked).toBeLessThanOrEqual(10);
      expect(results.filter(r => r.status === 429).length).toBeGreaterThanOrEqual(5);
    });

    it('returns 401 when the secret is wrong', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockResolvedValue(false);

      const res = await request(app)
        .post('/api/auth/login')
        .send(validLoginBody);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid credentials' });
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
    const body = { newEmail: 'New@Example.com', currentAuthSecret: SECRET, newAuthSecret: NEW_SECRET };

    it('changes the email — and the email-salted secret — when the current secret is correct', async () => {
      (prisma.account.findUnique as any)
        .mockResolvedValueOnce({ passwordHash: AUTH_HASH }) // secret check
        .mockResolvedValueOnce(null); // email not taken
      (bcrypt.compare as any).mockResolvedValueOnce(true);

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('new@example.com');
      expect(bcrypt.hash).toHaveBeenCalledWith(NEW_SECRET, 12);
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { email: 'new@example.com', passwordHash: 'auth1$$2a$12$hashedpassword' },
      });
    });

    it('refuses a pre-upgrade password hash', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ passwordHash: LEGACY_HASH });

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(401);
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong password without changing anything', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ passwordHash: AUTH_HASH });
      (bcrypt.compare as any).mockResolvedValueOnce(false);

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(401);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('requires the current and new secrets', async () => {
      const res = await request(app).post('/api/auth/change-email').send({ newEmail: 'new@example.com', currentAuthSecret: SECRET });

      expect(res.status).toBe(400);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('returns 409 when the email belongs to another account', async () => {
      (prisma.account.findUnique as any)
        .mockResolvedValueOnce({ passwordHash: AUTH_HASH })
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
      currentAuthSecret: SECRET,
      recoveryWrappedMK: Buffer.from('wrapped').toString('base64'),
      recoveryWrapIv: Buffer.from('iv12345678ab').toString('base64'),
      recoveryKeyHash: 'a'.repeat(64),
      recoveryKeySalt: 'b'.repeat(32),
    };

    it('saves the new recovery key, sealed, when the current secret is correct', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ passwordHash: AUTH_HASH });
      (bcrypt.compare as any).mockResolvedValueOnce(true);

      const res = await request(app).post('/api/auth/recovery-key').send(body);

      expect(res.status).toBe(200);
      expect(prisma.account.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ recoveryKeyHash: sealed('a'.repeat(64)), recoveryKeySalt: 'b'.repeat(32) }),
      }));
    });

    it('rejects a wrong password — a session alone cannot replace the recovery key', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ passwordHash: AUTH_HASH });
      (bcrypt.compare as any).mockResolvedValueOnce(false);

      const res = await request(app).post('/api/auth/recovery-key').send(body);

      expect(res.status).toBe(401);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('requires the current secret', async () => {
      const { currentAuthSecret, ...rest } = body;
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
      currentAuthSecret: SECRET,
      newAuthSecret: NEW_SECRET,
      newEncryptedMasterKey: Buffer.from('newkey').toString('base64'),
      newKekSalt: Buffer.from('newsalt123456789').toString('base64'),
      newKekWrapIv: Buffer.from('newiv1234567').toString('base64'),
    };

    const mockAccount = {
      id: 1,
      passwordHash: AUTH_HASH,
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
      expect(bcrypt.compare).toHaveBeenCalledWith(SECRET, '$2a$12$hashedsecret');
      expect(bcrypt.hash).toHaveBeenCalledWith(NEW_SECRET, 12);
      expect(prisma.account.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ passwordHash: 'auth1$$2a$12$hashedpassword' }),
      }));
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

    it('refuses a raw new password in place of the derived secret', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=aabbccddee11verifier1234567890123456789012')
        .send({ ...changePasswordBody, newAuthSecret: 'NewPassword2!xyz' });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /api/auth/recover
  // =========================================================================
  describe('POST /api/auth/recover', () => {
    const recoverBody = {
      email: 'test@example.com',
      recoveryProof: PROOF,
      newAuthSecret: NEW_SECRET,
      newEncryptedMasterKey: Buffer.from('newkey').toString('base64'),
      newKekSalt: Buffer.from('newsalt123456789').toString('base64'),
      newKekWrapIv: Buffer.from('newiv1234567').toString('base64'),
      // Recovery rotates in a fresh recovery key so it can be used again
      newRecoveryWrappedMK: Buffer.from('newrecoverymk').toString('base64'),
      newRecoveryWrapIv: Buffer.from('newrecoveryiv').toString('base64'),
      newRecoveryKeyHash: 'e'.repeat(64),
      newRecoveryKeySalt: 'f'.repeat(32),
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

    it('returns 401 when the recovery proof does not match', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        recoveryKeyHash: sealed('9'.repeat(64)),
        recoveryKeySalt: 'd'.repeat(32),
        tenantSchemaName: 'usr_1_a1b2c3',
      });

      const res = await request(app).post('/api/auth/recover').send(recoverBody);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Recovery failed');
    });

    it('does not accept the stored (sealed) value itself as the proof', async () => {
      const stored = sealed(PROOF);
      (prisma.account.findUnique as any).mockResolvedValue({
        id: 1, email: 'test@example.com', recoveryKeyHash: stored, recoveryKeySalt: 'd'.repeat(32), tenantSchemaName: 'usr_1_a1b2c3',
      });

      const res = await request(app).post('/api/auth/recover').send({ ...recoverBody, recoveryProof: stored.slice(3) });

      expect(res.status).toBe(401);
    });

    it('refuses the raw recovery key in place of the proof', async () => {
      const res = await request(app)
        .post('/api/auth/recover')
        .send({ ...recoverBody, recoveryProof: 'my-recovery-key-value' });

      expect(res.status).toBe(400);
      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid body', async () => {
      const res = await request(app)
        .post('/api/auth/recover')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Recovery failed');
    });

    it('refuses a recovery check stored as the bare proof (sealed at startup instead)', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        id: 1, email: 'test@example.com', username: 'testuser', recoveryKeyHash: PROOF, recoveryKeySalt: 'd'.repeat(32),
        tenantSchemaName: 'usr_1_a1b2c3', encryptionEnabled: true, kekIterations: 600000,
      });
      const tx = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 1, recovery_key_hash: PROOF }]),
        account: { update: vi.fn().mockResolvedValue({}) },
        session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const res = await request(app).post('/api/auth/recover').send(recoverBody);

      expect(res.status).toBe(401);
      expect(tx.account.update).not.toHaveBeenCalled();
    });

    it('returns user data on successful recovery', async () => {
      const correctHash = sealed(PROOF);

      (prisma.account.findUnique as any).mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        recoveryKeyHash: correctHash,
        recoveryKeySalt: 'd'.repeat(32),
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
          passwordHash: 'auth1$$2a$12$hashedpassword',
          recoveryKeyHash: sealed('e'.repeat(64)),
          recoveryKeySalt: 'f'.repeat(32),
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
    });
  });

  // =========================================================================
  // GET /api/auth/recovery-params
  // =========================================================================
  describe('GET /api/auth/recovery-params', () => {
    it('returns recovery params for existing user', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        recoveryWrappedMK: Buffer.from('wrappedmk'),
        recoveryWrapIv: Buffer.from('wrapiv'),
        recoveryKeySalt: 'd'.repeat(32),
        encryptionEnabled: true,
      });

      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.recoveryWrappedMK).toBe(Buffer.from('wrappedmk').toString('base64'));
      expect(res.body.recoveryWrapIv).toBe(Buffer.from('wrapiv').toString('base64'));
      // The client computes the recovery proof itself, so it needs the salt
      expect(res.body.recoveryKeySalt).toBe('d'.repeat(32));
    });

    it('returns decoy params for a non-existing user, shaped like real ones', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      // Same sizes as a real AES-GCM-wrapped 32-byte key and its 12-byte IV
      expect(Buffer.from(res.body.recoveryWrappedMK, 'base64')).toHaveLength(48);
      expect(Buffer.from(res.body.recoveryWrapIv, 'base64')).toHaveLength(12);
      expect(res.body.recoveryKeySalt).toMatch(/^[a-f0-9]{32}$/);
    });

    it('returns the SAME decoy every time for the same unknown email', async () => {
      // Random-per-request decoys revealed which emails have no account
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const first = await request(app).get('/api/auth/recovery-params').query({ email: 'nobody@example.com' });
      const second = await request(app).get('/api/auth/recovery-params').query({ email: 'NOBODY@example.com' });

      expect(second.body).toEqual(first.body);
    });

    it('returns different decoys for different unknown emails', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const a = await request(app).get('/api/auth/recovery-params').query({ email: 'a@example.com' });
      const b = await request(app).get('/api/auth/recovery-params').query({ email: 'b@example.com' });

      expect(a.body.recoveryWrappedMK).not.toBe(b.body.recoveryWrappedMK);
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
  // =========================================================================
  // Startup credential check
  // =========================================================================
  describe('checkStoredCredentials', () => {
    it('seals bare recovery proofs and signs out pre-upgrade password hashes', async () => {
      (prisma.account.findMany as any)
        .mockResolvedValueOnce([{ id: 4, recoveryKeyHash: 'b'.repeat(64) }])
        .mockResolvedValueOnce([{ id: 7 }]);
      (prisma.account.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.session.updateMany as any).mockResolvedValue({ count: 2 });

      const r = await checkStoredCredentials();

      expect(r).toEqual({ recoverySealed: 1, outdated: [7], sessionsRevoked: 2 });
      expect((prisma.account.updateMany as any).mock.calls[0][0].data.recoveryKeyHash).toMatch(/^v2\$[0-9a-f]{64}$/);
      expect((prisma.session.updateMany as any).mock.calls[0][0].where).toEqual({ revokedAt: null, accountId: { in: [7] } });
    });

    it('touches no sessions when every account is current', async () => {
      (prisma.account.findMany as any).mockResolvedValue([]);
      const r = await checkStoredCredentials();
      expect(r).toEqual({ recoverySealed: 0, outdated: [], sessionsRevoked: 0 });
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  it('no longer serves the key-wrap upgrade endpoint', async () => {
    const res = await request(app).post('/api/auth/key-wrap').send({});
    expect(res.status).toBe(404);
  });
});
