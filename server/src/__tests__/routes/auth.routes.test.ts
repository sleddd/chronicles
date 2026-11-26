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
// Plain functions, not vi.fn: a test's resetAllMocks must not leave them returning undefined
vi.mock('../../db/trustedDeviceQueries.js', () => ({
  TRUST_DAYS: 30,
  trustDevice: async () => 't'.repeat(43),
  useTrustedDevice: async () => false,
  forgetTrustToken: async () => undefined,
  forgetAllTrustedDevices: async () => undefined,
  listTrustedDevices: async () => [],
  forgetTrustedDevice: async () => true,
}));
vi.mock('../../db/passkeyQueries.js', () => ({ removeAllPasskeys: async () => 0 }));

vi.mock('../../db/schemaManager.js', () => ({
  registerTenant: vi.fn(),
}));

// Mock auth middleware and helpers
vi.mock('../../middleware/auth.js', () => ({
  revokeBrowserSession: vi.fn().mockResolvedValue(undefined),
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

// The Chronicles AI app's switch (read from the account's settings)
vi.mock('../../services/assistant.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/assistant.js')>()),
  loadAiPrivacy: vi.fn(),
}));

// Mock security logger
vi.mock('../../utils/securityLogger.js', () => ({
  logSecurityEvent: vi.fn(),
}));

vi.mock('../../db/betaQueries.js', () => ({
  isApproved: vi.fn().mockResolvedValue(false),
  onBetaList: vi.fn().mockResolvedValue(false),
  spendInvite: vi.fn().mockResolvedValue(undefined),
}));

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
import { loadAiPrivacy } from '../../services/assistant.js';
import { generateSecret, generateSync } from 'otplib';
import { prisma } from '../../db/prisma.js';
import { registerTenant } from '../../db/schemaManager.js';
import { isApproved, onBetaList, spendInvite } from '../../db/betaQueries.js';
import { createSession, revokeSession, revokeBrowserSession } from '../../middleware/auth.js';
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
  encryptedMasterKey: Buffer.alloc(48, 1).toString('base64'),
  kekSalt: Buffer.from('saltsaltsaltsalt').toString('base64'),
  kekWrapIv: Buffer.alloc(12, 3).toString('base64'),
  recoveryWrappedMK: Buffer.alloc(48, 1).toString('base64'),
  recoveryWrapIv: Buffer.alloc(12, 3).toString('base64'),
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
    // Sign-up is closed by default; most tests here aren't about who may register
    process.env.REGISTRATION_OPEN = 'true';
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

    describe('who may sign up', () => {
      const ok = () => (registerTenant as any).mockResolvedValue({
        account: { id: 1, email: 'test@example.com', username: 'testuser' }, schemaName: 'usr_1_a1b2c3',
      });
      beforeEach(() => { delete process.env.REGISTRATION_OPEN; });
      afterEach(() => { delete process.env.REGISTRATION_WHITELIST; });

      it('is closed by default: no list, not approved → refused', async () => {
        (isApproved as any).mockResolvedValue(false);
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(403);
        expect(registerTenant).not.toHaveBeenCalled();
      });

      it('lets in an approved email with no REGISTRATION_WHITELIST at all', async () => {
        (isApproved as any).mockResolvedValue(true);
        ok();
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(201);
      });

      it('stays closed if the approval check fails', async () => {
        (isApproved as any).mockRejectedValue(new Error('db down'));
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(403);
      });

      it('lets anyone in only with REGISTRATION_OPEN=true', async () => {
        process.env.REGISTRATION_OPEN = 'true';
        (isApproved as any).mockResolvedValue(false);
        ok();
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(201);
      });

      it('refuses an email that is neither listed nor approved', async () => {
        process.env.REGISTRATION_WHITELIST = 'owner@example.com';
        (isApproved as any).mockResolvedValue(false);
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(403);
        expect(registerTenant).not.toHaveBeenCalled();
      });

      it('lets in an email approved on the beta list, with its invite code, without a restart', async () => {
        process.env.REGISTRATION_WHITELIST = 'owner@example.com';
        (isApproved as any).mockResolvedValue(true);
        ok();
        const res = await request(app).post('/api/auth/register').send({ ...validRegisterBody, inviteCode: 'A'.repeat(22) });
        expect(res.status).toBe(201);
        expect(isApproved).toHaveBeenCalledWith('test@example.com', 'A'.repeat(22));
        // the code is spent once the account exists
        expect(spendInvite).toHaveBeenCalledWith('test@example.com');
      });

      it('refuses an approved email without its code exactly like an unapproved one', async () => {
        (isApproved as any).mockResolvedValue(false); // approval needs the code
        const noCode = await request(app).post('/api/auth/register').send(validRegisterBody);
        process.env.REGISTRATION_WHITELIST = '';
        const stranger = await request(app).post('/api/auth/register').send({ ...validRegisterBody, email: 'nobody@example.com' });
        expect(noCode.status).toBe(403);
        expect(noCode.body).toEqual(stranger.body);
        expect(registerTenant).not.toHaveBeenCalled();
      });

      it('needs no code for an email on REGISTRATION_WHITELIST, in development', async () => {
        const env = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        process.env.REGISTRATION_WHITELIST = 'test@example.com';
        try {
          ok();
          const res = await request(app).post('/api/auth/register').send(validRegisterBody);
          expect(res.status).toBe(201);
          expect(spendInvite).not.toHaveBeenCalled();
        } finally { process.env.NODE_ENV = env; }
      });

      it.each(['production', 'staging', undefined])('ignores REGISTRATION_WHITELIST when NODE_ENV is %s', async (nodeEnv) => {
        const env = process.env.NODE_ENV;
        if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
        process.env.REGISTRATION_WHITELIST = 'test@example.com';
        try {
          (isApproved as any).mockResolvedValue(false);
          const res = await request(app).post('/api/auth/register').send(validRegisterBody);
          expect(res.status).toBe(403);
          expect(registerTenant).not.toHaveBeenCalled();
        } finally { process.env.NODE_ENV = env; }
      });

      it('answers a taken username the same whether or not the email is approved', async () => {
        (prisma.account.findUnique as any).mockResolvedValue({ id: 99, username: 'testuser' });
        (isApproved as any).mockResolvedValue(false);
        const unapproved = await request(app).post('/api/auth/register').send(validRegisterBody);
        (isApproved as any).mockResolvedValue(true);
        const approved = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(unapproved.status).toBe(409);
        expect(approved.status).toBe(409);
        expect(unapproved.body).toEqual(approved.body);
        expect(registerTenant).not.toHaveBeenCalled();
      });

      it('says "restricted" to an unapproved email even when it already has an account', async () => {
        (prisma.account.findUnique as any)
          .mockResolvedValueOnce(null) // username free
          .mockResolvedValueOnce({ id: 99, email: 'test@example.com' });
        (isApproved as any).mockResolvedValue(false);
        const res = await request(app).post('/api/auth/register').send(validRegisterBody);
        expect(res.status).toBe(403);
        expect(bcrypt.hash).toHaveBeenCalled(); // pays for a hash like a sign-up
      });

      it('still lets in an email on the list', async () => {
        const env = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        process.env.REGISTRATION_WHITELIST = 'Test@Example.com, owner@example.com';
        try {
          ok();
          const res = await request(app).post('/api/auth/register').send(validRegisterBody);
          expect(res.status).toBe(201);
        } finally { process.env.NODE_ENV = env; }
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
      (prisma.account.findUnique as any)
        .mockResolvedValueOnce(null) // username free
        .mockResolvedValueOnce({ id: 99, email: 'test@example.com' });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegisterBody);

      expect(res.status).toBe(409);
      expect(res.body.field).toBe('email');
      expect(registerTenant).not.toHaveBeenCalled();
    });

    it('returns 409 when the username is taken', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ id: 99, username: 'testuser' });

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

    it('refuses a sign-in that "Sign out everywhere" cancelled while its session was being made', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockResolvedValue(true);
      // Sign out everywhere lands between the password check and the session
      (authMw.createSession as any).mockImplementationOnce(async () => {
        await (await import('../../routes/authState.js')).cancelSignIns(mockAccount.id);
        return 'aabbccddee11' + 'verifier1234567890123456789012';
      });

      const res = await request(app).post('/api/auth/login').send(validLoginBody);

      expect(res.status).toBe(401);
      expect(authMw.revokeSession).toHaveBeenCalledWith('aabbccddee11', 'credentials_changed');
      expect((res.headers['set-cookie'] as unknown as string[] | undefined ?? []).some(c => /chronicle_session=/.test(c))).toBe(false);
    });

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
      // The recovery wrap leaves only from /recovery-wrap, for a checked recovery proof
      expect(res.body.encryption).not.toHaveProperty('recoveryWrappedMK');
      expect(res.body.encryption).not.toHaveProperty('recoveryWrapIv');
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
      // A dummy compare (same timing), never against the old hash
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect((bcrypt.compare as any).mock.calls[0][1]).not.toBe(LEGACY_HASH);
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

    it('locks for a day once a day’s wrong passwords add up, even when each window stops one short of its cap', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
      (bcrypt.compare as any).mockResolvedValue(false);
      const realNow = Date.now.bind(Date);
      let shift = 0;
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + shift);
      try {
        // 9 wrong passwords, then wait out the 15-minute window: never a 429, never a strike
        for (let round = 0; round < 3; round++) {
          const statuses = await Promise.all(Array.from({ length: 9 }, () => request(app).post('/api/auth/login').send(validLoginBody).then(r => r.status)));
          expect(statuses.every(st => st === 401)).toBe(true);
          shift += 16 * 60 * 1000;
        }
        // The 30th wrong password of the day locks the email for a day
        for (let i = 0; i < 3; i++) expect((await request(app).post('/api/auth/login').send(validLoginBody)).status).toBe(401);
        shift += 16 * 60 * 1000;
        (bcrypt.compare as any).mockResolvedValue(true);
        expect((await request(app).post('/api/auth/login').send(validLoginBody)).status).toBe(429);
      } finally {
        clock.mockRestore();
      }
    }, 20000);

    describe('strangers count per network', () => {
      // Behind a proxy, so each request can come from its own address
      const proxied = () => { const a = buildApp(); a.set('trust proxy', true); return a; };
      const from = (a: express.Express, ip: string) => request(a).post('/api/auth/login').set('X-Forwarded-For', ip).send(validLoginBody);

      it('one IP filling the email’s bucket can’t lock the owner out from another network', async () => {
        const a = proxied();
        (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
        (bcrypt.compare as any).mockResolvedValue(false);
        for (let i = 0; i < 10; i++) expect((await from(a, '203.0.113.7')).status).toBe(401);
        // That network is locked — every address in its /24 with it…
        expect((await from(a, '203.0.113.200')).status).toBe(429);
        // …but the owner on another network still gets to try, and in
        (bcrypt.compare as any).mockResolvedValue(true);
        expect((await from(a, '198.51.100.4')).status).toBe(200);
      });

      it('an IPv6 /48 is one network', async () => {
        const a = proxied();
        (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
        (bcrypt.compare as any).mockResolvedValue(false);
        for (let i = 0; i < 10; i++) expect((await from(a, `2001:db8:1:${i}::1`)).status).toBe(401);
        expect((await from(a, '2001:db8:1:ffff::9')).status).toBe(429);
        (bcrypt.compare as any).mockResolvedValue(true);
        expect((await from(a, '2001:db8:2::1')).status).toBe(200);
      });

      it('once 20 networks have each locked the email today, every stranger waits', async () => {
        const a = proxied();
        (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
        (bcrypt.compare as any).mockResolvedValue(false);
        await Promise.all(Array.from({ length: 20 }, (_, n) =>
          Promise.all(Array.from({ length: 10 }, () => from(a, `10.0.${n}.1`)))));
        (bcrypt.compare as any).mockResolvedValue(true);
        expect((await from(a, '192.0.2.50')).status).toBe(429);
      }, 20000);

      it('the brake never stops the owner on a network they have signed in from', async () => {
        const a = proxied();
        (prisma.account.findUnique as any).mockResolvedValue(mockAccount);
        // The owner signed in from home once
        (bcrypt.compare as any).mockResolvedValue(true);
        expect((await from(a, '198.51.100.4')).status).toBe(200);
        // Then 20 other networks each lock the email
        const { logSecurityEvent } = await import('../../utils/securityLogger.js');
        (logSecurityEvent as any).mockClear();
        (bcrypt.compare as any).mockResolvedValue(false);
        await Promise.all(Array.from({ length: 20 }, (_, n) =>
          Promise.all(Array.from({ length: 10 }, () => from(a, `10.0.${n}.1`)))));
        // Logged once, as the brake engages
        const engaged = (logSecurityEvent as any).mock.calls.filter((c: unknown[]) => c[0] === 'signin_brake_engaged');
        expect(engaged).toHaveLength(1);
        expect(engaged[0][1]).toMatchObject({ accountId: mockAccount.id, details: { brake: 'password', networks: 20 } });
        (bcrypt.compare as any).mockResolvedValue(true);
        // A stranger still waits…
        expect((await from(a, '192.0.2.50')).status).toBe(429);
        // …the owner, on a new browser at home (another address in the same /24), gets in
        expect((await from(a, '198.51.100.77')).status).toBe(200);
      }, 20000);
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
      expect(revokeBrowserSession).toHaveBeenCalledWith(expect.anything(), 'user_logout');
      expect(String(res.headers['set-cookie'])).toMatch(/chronicle_session=;/);
    });

    it('clears the cookie even when the session is already gone', async () => {
      (revokeBrowserSession as any).mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/auth/logout')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'chronicle_session=deadbeef0000expiredverifier12345678901234');
      expect(res.status).toBe(200);
      expect(String(res.headers['set-cookie'])).toMatch(/chronicle_session=;/);
    });

    it('needs the CSRF header from a browser', async () => {
      const res = await request(app).post('/api/auth/logout').set('Cookie', 'chronicle_session=x');
      expect(res.status).toBe(403);
      expect(revokeBrowserSession).not.toHaveBeenCalledWith(expect.anything(), 'user_logout');
    });
  });

  // =========================================================================
  // GET /api/auth/me
  // =========================================================================
  describe('GET /api/auth/me', () => {
    it('returns the user, never the wrapped key', async () => {
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
      // Who is signed in, and nothing that opens the journal: a session alone
      // never gets the wrapped key (it was enough to guess the password offline)
      expect(res.body.encryption).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/encryptedMasterKey|kekSalt|recoveryWrappedMK/);
      const selected = (prisma.account.findUnique as any).mock.calls.at(-1)[0].select;
      expect(selected.encryptedMasterKey).toBeUndefined();
      expect(selected.recoveryWrappedMK).toBeUndefined();
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
        .mockResolvedValueOnce({ id: 1, passwordHash: AUTH_HASH }) // secret check
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
      // Every other session is signed out (grants with them); this one stays
      expect(authMw.revokeAllSessions).toHaveBeenCalledWith(1, 'aabbccddee11', 'email_change');
      // and this browser stays a known device under the new email
      expect((res.headers['set-cookie'] as unknown as string[]).some(c => /chronicle_device=/.test(c))).toBe(true);
    });

    it('refuses an email approved for someone else’s beta invite, like a taken one', async () => {
      (prisma.account.findUnique as any)
        .mockResolvedValueOnce({ id: 1, passwordHash: AUTH_HASH })
        .mockResolvedValueOnce(null);
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      (onBetaList as any).mockResolvedValueOnce(true);

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already in use');
      expect(onBetaList).toHaveBeenCalledWith('new@example.com');
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('allows 5 tries an hour per account, wrong passwords included, before answering 429', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({ id: 1, passwordHash: AUTH_HASH });
      (bcrypt.compare as any).mockResolvedValue(false);
      for (let i = 0; i < 5; i++) {
        expect((await request(app).post('/api/auth/change-email').send(body)).status).toBe(401);
      }
      (bcrypt.compare as any).mockResolvedValue(true);
      const res = await request(app).post('/api/auth/change-email').send(body);
      expect(res.status).toBe(429);
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('refuses a pre-upgrade password hash', async () => {
      (prisma.account.findUnique as any).mockResolvedValueOnce({ passwordHash: LEGACY_HASH });

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(401);
      expect((bcrypt.compare as any).mock.calls[0][1]).not.toBe(LEGACY_HASH);
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
        .mockResolvedValueOnce({ id: 1, passwordHash: AUTH_HASH })
        .mockResolvedValueOnce({ id: 99 });
      (bcrypt.compare as any).mockResolvedValueOnce(true);

      const res = await request(app).post('/api/auth/change-email').send(body);

      expect(res.status).toBe(409);
      expect(prisma.account.update).not.toHaveBeenCalled();
      expect(authMw.revokeAllSessions).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // POST /api/auth/recovery-key
  // =========================================================================
  describe('POST /api/auth/recovery-key', () => {
    const body = {
      currentAuthSecret: SECRET,
      recoveryWrappedMK: Buffer.alloc(48, 1).toString('base64'),
      recoveryWrapIv: Buffer.alloc(12, 3).toString('base64'),
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
      newEncryptedMasterKey: Buffer.alloc(48, 1).toString('base64'),
      newKekSalt: Buffer.from('newsalt123456789').toString('base64'),
      newKekWrapIv: Buffer.alloc(12, 3).toString('base64'),
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
      newEncryptedMasterKey: Buffer.alloc(48, 1).toString('base64'),
      newKekSalt: Buffer.from('newsalt123456789').toString('base64'),
      newKekWrapIv: Buffer.alloc(12, 3).toString('base64'),
      // Recovery rotates in a fresh recovery key so it can be used again
      newRecoveryWrappedMK: Buffer.alloc(48, 1).toString('base64'),
      newRecoveryWrapIv: Buffer.alloc(12, 3).toString('base64'),
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
      expect(res.body.encryption.recoveryWrappedMK).toBeUndefined();
    });
  });

  // =========================================================================
  // GET /api/auth/recovery-params
  // =========================================================================
  describe('GET /api/auth/recovery-params', () => {
    it('returns the salt for an existing user, and never the wrapped key', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        recoveryWrappedMK: Buffer.from('wrappedmk'),
        recoveryKeySalt: 'd'.repeat(32),
        encryptionEnabled: true,
      });

      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      // The client computes the recovery proof itself, so it needs the salt
      expect(res.body).toEqual({ recoveryKeySalt: 'd'.repeat(32) });
      // An email alone must never be answered with the wrap (it comes from /recovery-wrap, for a proof)
      expect(JSON.stringify(res.body)).not.toMatch(/recoveryWrappedMK|recoveryWrapIv/);
    });

    it('returns a decoy salt for a non-existing user, shaped like a real one', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['recoveryKeySalt']);
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

      expect(a.body.recoveryKeySalt).not.toBe(b.body.recoveryKeySalt);
    });

    it('returns a decoy when encryption is not enabled', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({
        recoveryWrappedMK: null,
        recoveryKeySalt: null,
        encryptionEnabled: false,
      });

      const res = await request(app)
        .get('/api/auth/recovery-params')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.recoveryKeySalt).toMatch(/^[a-f0-9]{32}$/);
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


// =============================================================================
// The Chronicles AI app (Smith) signing in: an assistant session, token in the body
// =============================================================================
describe('Assistant sign-in (client: smith)', () => {
  let app: express.Express;
  const account = {
    id: 1, email: 'test@example.com', username: 'testuser', passwordHash: AUTH_HASH, tenantSchemaName: 'usr_1_a1b2c3',
    encryptionEnabled: true, kekSalt: Buffer.from('salt'), encryptedMasterKey: Buffer.from('key'), kekWrapIv: Buffer.from('iv'),
    kekIterations: 600000, totpEnabled: false, totpSecret: null,
  };
  const on = { appEnabled: true, hiddenTopicIds: [], hiddenFeatures: [] };

  beforeEach(() => {
    applyMockDefaults();
    resetAuthStateForTests();
    app = buildApp();
    process.env.ASSISTANT_CLIENT_EMAILS = 'test@example.com';
    (prisma.account.findUnique as any).mockResolvedValue(account);
    (bcrypt.compare as any).mockResolvedValue(true);
    (loadAiPrivacy as any).mockResolvedValue(on);
  });
  afterEach(() => { delete process.env.ASSISTANT_CLIENT_EMAILS; });

  it('makes an assistant session and returns its token in the body, with no cookies', async () => {
    const res = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'smith' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('aabbccddee11' + 'verifier1234567890123456789012');
    expect(res.body.encryption.encryptedMasterKey).toBe(Buffer.from('key').toString('base64'));
    expect(createSession).toHaveBeenCalledWith(1, 'usr_1_a1b2c3', expect.objectContaining({ deviceInfo: 'assistant' }));
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(revokeBrowserSession).not.toHaveBeenCalled();
  });

  it('refuses accounts not on the list, after the password checked out', async () => {
    process.env.ASSISTANT_CLIENT_EMAILS = 'someone@else.com';
    const res = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'smith' });

    expect(res.status).toBe(403);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('refuses while the app is switched off in Chronicles', async () => {
    (loadAiPrivacy as any).mockResolvedValue({ ...on, appEnabled: false });
    const res = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'smith' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/In-App AI/);
    expect(createSession).not.toHaveBeenCalled();
  });

  describe('with 2FA: the two steps must agree', () => {
    beforeEach(() => {
      (prisma.account.findUnique as any).mockResolvedValue({ ...account, totpEnabled: true, totpSecret: 'S' });
    });

    it('a sign-in begun in a browser can’t be finished as the AI app', async () => {
      const first = await request(app).post('/api/auth/login').send(validLoginBody);
      expect(first.body.requires2FA).toBe(true);
      const res = await request(app).post('/api/auth/login/2fa').send({ pendingToken: first.body.pendingToken, code: '123456', client: 'smith' });
      expect(res.status).toBe(400);
      expect(createSession).not.toHaveBeenCalled();
    });

    it('a sign-in begun as the AI app can’t be finished as a browser (no cookie session from it)', async () => {
      const first = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'smith' });
      expect(first.body.requires2FA).toBe(true);
      const res = await request(app).post('/api/auth/login/2fa').send({ pendingToken: first.body.pendingToken, code: '123456' });
      expect(res.status).toBe(400);
      expect(createSession).not.toHaveBeenCalled();
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  // A password alone must not learn whether the account uses the AI app:
  // with 2FA on, "not available" / "switched off" is said only after the code
  describe('with 2FA: a refusal waits for the code', () => {
    const secret = generateSecret();
    beforeEach(() => {
      (prisma.account.findUnique as any).mockResolvedValue({ ...account, totpEnabled: true, totpSecret: secret, totpBackupCodes: [] });
      (loadAiPrivacy as any).mockResolvedValue({ ...on, appEnabled: false });
    });

    it('the password step asks for the code and says nothing about the app', async () => {
      const first = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'smith' });
      expect(first.status).toBe(200);
      expect(first.body.requires2FA).toBe(true);
      expect(loadAiPrivacy).not.toHaveBeenCalled();
    });

    it('a wrong code is just a wrong code', async () => {
      const first = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'smith' });
      const res = await request(app).post('/api/auth/login/2fa').send({ pendingToken: first.body.pendingToken, code: '000000', client: 'smith' });
      expect(res.status).toBe(401);
      expect(loadAiPrivacy).not.toHaveBeenCalled();
    });

    it('the right code is told the app is off, and gets no session', async () => {
      const first = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'smith' });
      const res = await request(app).post('/api/auth/login/2fa')
        .send({ pendingToken: first.body.pendingToken, code: generateSync({ secret }), client: 'smith' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/In-App AI/);
      expect(createSession).not.toHaveBeenCalled();
      // The pending sign-in is over: it can't be tried again with another code
      const again = await request(app).post('/api/auth/login/2fa')
        .send({ pendingToken: first.body.pendingToken, code: generateSync({ secret }), client: 'smith' });
      expect(again.status).toBe(401);
    });
  });

  it('a wrong password is still just a wrong password', async () => {
    (bcrypt.compare as any).mockResolvedValue(false);
    const res = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'smith' });

    expect(res.status).toBe(401);
    expect(loadAiPrivacy).not.toHaveBeenCalled();
  });

  it('rejects any other client name', async () => {
    const res = await request(app).post('/api/auth/login').send({ ...validLoginBody, client: 'other' });
    expect(res.status).toBe(400);
  });

  it('a normal sign-in is unchanged: a cookie, no token in the body', async () => {
    const res = await request(app).post('/api/auth/login').send(validLoginBody);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(createSession).toHaveBeenCalledWith(1, 'usr_1_a1b2c3', expect.objectContaining({ deviceInfo: 'password' }));
  });
});
