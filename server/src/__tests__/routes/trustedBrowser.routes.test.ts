import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { generateSecret, generateSync } from 'otplib';

process.env.SECRETS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    account: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    session: { updateMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));
vi.mock('../../db/schemaManager.js', () => ({ registerTenant: vi.fn(), deleteAccountById: vi.fn() }));
vi.mock('../../services/googleRevoke.js', () => ({ revokeGoogleAccess: vi.fn() }));
vi.mock('../../db/betaQueries.js', () => ({ isApproved: async () => false, hasPendingInvite: async () => false, spendInvite: async () => undefined }));
vi.mock('../../db/passkeyQueries.js', () => ({ removeAllPasskeys: async () => 0 }));

// The trusted_devices table, in memory — hashes only, like the real one
vi.mock('../../db/trustedDeviceQueries.js', async () => {
  const { createHash, randomBytes } = await import('crypto');
  const hash = (t: string) => createHash('sha256').update(t).digest('hex');
  let rows: { id: number; accountId: number; tokenHash: string; label: string; expiresAt: number; lastUsedAt: Date | null; createdAt: Date }[] = [];
  let nextId = 1;
  return {
    TRUST_DAYS: 30,
    _reset: () => { rows = []; nextId = 1; },
    _rows: () => rows,
    _expire: () => { for (const r of rows) r.expiresAt = Date.now() - 1; },
    trustDevice: async (accountId: number, label: string) => {
      const token = randomBytes(32).toString('base64url');
      rows.push({ id: nextId++, accountId, tokenHash: hash(token), label, expiresAt: Date.now() + 30 * 86400_000, lastUsedAt: null, createdAt: new Date() });
      return token;
    },
    useTrustedDevice: async (accountId: number, token?: string) => {
      if (typeof token !== 'string') return false;
      const r = rows.find(x => x.tokenHash === hash(token) && x.accountId === accountId && x.expiresAt > Date.now());
      if (r) r.lastUsedAt = new Date();
      return !!r;
    },
    forgetTrustToken: async (token?: string) => { if (token) rows = rows.filter(x => x.tokenHash !== hash(token)); },
    forgetAllTrustedDevices: async (accountId: number) => { rows = rows.filter(x => x.accountId !== accountId); },
    listTrustedDevices: async (accountId: number, current?: string) => rows.filter(x => x.accountId === accountId)
      .map(x => ({ id: x.id, label: x.label, createdAt: x.createdAt, expiresAt: new Date(x.expiresAt), lastUsedAt: x.lastUsedAt, isCurrent: !!current && x.tokenHash === hash(current) })),
    forgetTrustedDevice: async (accountId: number, id: number) => {
      const n = rows.length;
      rows = rows.filter(x => !(x.id === id && x.accountId === accountId));
      return rows.length < n;
    },
  };
});

vi.mock('../../middleware/auth.js', () => ({
  revokeBrowserSession: vi.fn().mockResolvedValue(null),
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = { accountId: currentAccountId, tenantSchemaName: 'usr_1_a1b2c3', sessionId: 42, selector: 'aabbccddee11' };
    next();
  },
  createSession: vi.fn(async () => 'aabbccddee11' + 'v'.repeat(32)),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  revokeAllSessions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../middleware/rateLimiter.js', () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return { authLimiter: pass, strictLimiter: pass, apiLimiter: pass, registerLimiter: pass };
});
vi.mock('../../utils/securityLogger.js', () => ({ logSecurityEvent: vi.fn() }));
vi.mock('../../services/passwordHasher.js', () => ({
  default: { hash: vi.fn().mockResolvedValue('$2a$12$hash'), compare: vi.fn(async (secret: string) => secret === 'a'.repeat(64)) },
  HasherBusyError: class HasherBusyError extends Error {},
}));

import authRouter, { resetAuthStateForTests, browserLabel } from '../../routes/auth.js';
import { prisma } from '../../db/prisma.js';
import * as trustDb from '../../db/trustedDeviceQueries.js';
import * as authMw from '../../middleware/auth.js';

const GOOD = 'a'.repeat(64);
const WRONG = 'b'.repeat(64);
let currentAccountId = 100;
let nextAccountId = 100;

function account(secret: string, backupCodes: string[] = []) {
  const id = nextAccountId++;
  currentAccountId = id;
  return {
    id, email: `u${id}@example.com`, username: `u${id}`, passwordHash: 'auth1$$2a$12$hash', tenantSchemaName: 'usr_1_a1b2c3',
    totpEnabled: true, totpSecret: secret as string | null, totpBackupCodes: backupCodes,
    encryptionEnabled: true, kekSalt: null, encryptedMasterKey: null, kekWrapIv: null, kekIterations: 600000,
    recoveryWrappedMK: null, recoveryWrapIv: null,
  };
}

const trustCookie = (res: request.Response): string | undefined =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith('__Host-chronicle_trust=') && !/chronicle_trust=;/.test(c))?.split(';')[0];
const clearsTrust = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).some(c => /^__Host-chronicle_trust=;/.test(c));

describe('Remember this browser (skip the 2FA code)', () => {
  let app: express.Express;
  beforeEach(() => {
    (trustDb as any)._reset();
    resetAuthStateForTests();
    vi.mocked(authMw.createSession).mockClear();
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
  });

  const login = (acct: ReturnType<typeof account>, cookie?: string, authSecret = GOOD) => {
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    const req = request(app).post('/api/auth/login');
    if (cookie) req.set('Cookie', cookie);
    return req.send({ email: acct.email, authSecret });
  };
  /** Password, then the authenticator code with the box ticked: the browser's trust cookie */
  async function trust(acct: ReturnType<typeof account>, secret: string, extra: Record<string, unknown> = { trustBrowser: true }) {
    const pending = await login(acct);
    expect(pending.body.requires2FA).toBe(true);
    return request(app).post('/api/auth/login/2fa').send({ pendingToken: pending.body.pendingToken, code: generateSync({ secret }), ...extra });
  }

  it('is issued only with the box ticked, after the authenticator code', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    const plain = await trust(acct, secret, {});
    expect(plain.status).toBe(200);
    expect(trustCookie(plain)).toBeUndefined();
    expect((trustDb as any)._rows()).toHaveLength(0);
  });

  it('the cookie is HttpOnly, SameSite=Strict, 30 days, and only its hash is stored', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    const res = await trust(acct, secret);
    const raw = ([] as string[]).concat(res.headers['set-cookie']).find(c => c.startsWith('__Host-chronicle_trust='))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/Max-Age=2592000/);
    const token = trustCookie(res)!.split('=')[1];
    const row = (trustDb as any)._rows()[0];
    expect(row.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('then skips the code — but never the password', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    const cookie = trustCookie(await trust(acct, secret))!;

    const again = await login(acct, cookie);
    expect(again.status).toBe(200);
    expect(again.body.requires2FA).toBeUndefined();
    expect(again.body.user.email).toBe(acct.email);
    expect(vi.mocked(authMw.createSession).mock.calls.at(-1)![2]).toMatchObject({ deviceInfo: 'trusted' });

    vi.mocked(authMw.createSession).mockClear();
    const wrong = await login(acct, cookie, WRONG);
    expect(wrong.status).toBe(401);
    expect(wrong.body.requires2FA).toBeUndefined();
    expect(authMw.createSession).not.toHaveBeenCalled();
  });

  it('is not issued after a backup code', async () => {
    const secret = generateSecret();
    const code = 'abc123-def456';
    const salt = crypto.randomBytes(16);
    const stored = `scrypt$${salt.toString('hex')}$${crypto.scryptSync(code, salt, 32).toString('hex')}`;
    const acct = account(secret, [stored]);
    const pending = await login(acct);
    const res = await request(app).post('/api/auth/login/2fa').send({ pendingToken: pending.body.pendingToken, code, trustBrowser: true });
    expect(res.status).toBe(200);
    expect(trustCookie(res)).toBeUndefined();
    expect((trustDb as any)._rows()).toHaveLength(0);
  });

  it('one account’s trust does nothing for another account', async () => {
    const s1 = generateSecret();
    const first = account(s1);
    const cookie = trustCookie(await trust(first, s1))!;
    const second = account(generateSecret());
    const res = await login(second, cookie);
    expect(res.body.requires2FA).toBe(true);
  });

  it('a made-up or expired token asks for the code as usual', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    expect((await login(acct, `__Host-chronicle_trust=${'x'.repeat(43)}`)).body.requires2FA).toBe(true);
    const cookie = trustCookie(await trust(acct, secret))!;
    (trustDb as any)._expire();
    expect((await login(acct, cookie)).body.requires2FA).toBe(true);
  });

  it('ends with a password change', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    const cookie = trustCookie(await trust(acct, secret))!;
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    const changed = await request(app).post('/api/auth/change-password').set('Cookie', cookie).send({
      currentAuthSecret: GOOD, code: generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }),
      newAuthSecret: 'c'.repeat(64), newEncryptedMasterKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', newKekSalt: 'AAAAAAAAAAAAAAAAAAAAAA==', newKekWrapIv: 'AAAAAAAAAAAAAAAA',
    });
    expect(changed.status).toBe(200);
    expect(clearsTrust(changed)).toBe(true);
    expect((trustDb as any)._rows()).toHaveLength(0);
    expect((await login(acct, cookie)).body.requires2FA).toBe(true);
  });

  it('ends with an email change (the sign-in secret changes with it)', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    const cookie = trustCookie(await trust(acct, secret))!;
    (prisma.account.findUnique as any).mockImplementation(async ({ where }: any) => (where.email && where.email !== acct.email ? null : acct));
    const email = await request(app).post('/api/auth/change-email').set('Cookie', cookie)
      .send({ newEmail: 'new@example.com', currentAuthSecret: GOOD, newAuthSecret: 'c'.repeat(64), code: generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }) });
    expect(email.status).toBe(200);
    expect(clearsTrust(email)).toBe(true);
    expect((trustDb as any)._rows()).toHaveLength(0);
  });

  it('ends with a new recovery key', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    const cookie = trustCookie(await trust(acct, secret))!;
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    const key = await request(app).post('/api/auth/recovery-key').set('Cookie', cookie).send({
      currentAuthSecret: GOOD, code: generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }),
      recoveryWrappedMK: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', recoveryWrapIv: 'AAAAAAAAAAAAAAAA', recoveryKeyHash: 'd'.repeat(64), recoveryKeySalt: 'e'.repeat(32),
    });
    expect(key.status).toBe(200);
    expect(clearsTrust(key)).toBe(true);
    expect((trustDb as any)._rows()).toHaveLength(0);
  });

  it('ends when 2FA is turned off', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    const cookie = trustCookie(await trust(acct, secret))!;
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    const off = await request(app).delete('/api/auth/2fa').set('Cookie', cookie)
      .send({ authSecret: GOOD, code: generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }) });
    expect(off.status).toBe(200);
    expect((trustDb as any)._rows()).toHaveLength(0);
  });

  it('pressing Sign out ends this browser’s trust. A session that just ends keeps it', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    const cookie = trustCookie(await trust(acct, secret))!;

    const idle = await request(app).post('/api/auth/logout').set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookie).send({});
    expect(idle.status).toBe(200);
    expect(clearsTrust(idle)).toBe(false);
    expect((trustDb as any)._rows()).toHaveLength(1);

    const pressed = await request(app).post('/api/auth/logout').set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookie).send({ forgetBrowser: true });
    expect(clearsTrust(pressed)).toBe(true);
    expect((trustDb as any)._rows()).toHaveLength(0);
    expect((await login(acct, cookie)).body.requires2FA).toBe(true);
  });

  it('is listed in Settings without its token, and Forget ends it', async () => {
    const secret = generateSecret();
    const acct = account(secret);
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    const pending = await login(acct);
    const res = await request(app).post('/api/auth/login/2fa')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')
      .send({ pendingToken: pending.body.pendingToken, code: generateSync({ secret }), trustBrowser: true });
    const cookie = trustCookie(res)!;

    const list = await request(app).get('/api/auth/trusted-browsers').set('Cookie', cookie);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ label: 'Safari on macOS', isCurrent: true });
    expect(JSON.stringify(list.body)).not.toMatch(/token/i);

    const gone = await request(app).delete(`/api/auth/trusted-browsers/${list.body[0].id}`).set('Cookie', cookie);
    expect(gone.status).toBe(200);
    expect(clearsTrust(gone)).toBe(true);
    expect((await login(acct, cookie)).body.requires2FA).toBe(true);
  });

  it('names a browser without keeping its user agent', () => {
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0')).toBe('Edge on Windows');
    expect(browserLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS');
    expect(browserLabel(undefined)).toBe('Browser');
  });
});

describe('the password wrap: what opens the journal, confirmed like the action it is for', () => {
  let app: express.Express;
  const wrapped = (acct: ReturnType<typeof account>) => ({ ...acct, kekSalt: Buffer.from('0123456789abcdef'), encryptedMasterKey: Buffer.from('wrapped'), kekWrapIv: Buffer.from('iv0123456789'), recoveryWrappedMK: Buffer.from('recovery-wrap') });
  beforeEach(() => {
    resetAuthStateForTests();
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
  });

  it('needs the right password, and names the action', async () => {
    const acct = { ...wrapped(account(generateSecret())), totpEnabled: false, totpSecret: null };
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    const no = await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: WRONG, action: 'change-password' });
    expect(no.status).toBe(401);
    expect(no.body.encryption).toBeUndefined();
    expect((await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: GOOD })).status).toBe(400);
    expect((await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: GOOD, action: 'change-email' })).status).toBe(400);

    const yes = await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: GOOD, action: 'change-password' });
    expect(yes.status).toBe(200);
    expect(yes.body.encryption.encryptedMasterKey).toBe(Buffer.from('wrapped').toString('base64'));
    // Only the password wrap: never the recovery wrap
    expect(JSON.stringify(yes.body)).not.toMatch(/recovery/i);
    expect(yes.body.confirmToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('with 2FA on, a stolen session and a phished password get nothing: the code is needed too', async () => {
    const secret = generateSecret();
    const acct = wrapped(account(secret));
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    const noCode = await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: GOOD, action: 'recovery-key' });
    expect(noCode.status).toBe(401);
    expect(noCode.body.requires2FA).toBe(true);
    expect(noCode.body.encryption).toBeUndefined();
    const badCode = await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: GOOD, action: 'recovery-key', code: '000000' });
    expect(badCode.status).toBe(401);
    expect(badCode.body.encryption).toBeUndefined();
    const ok = await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: GOOD, action: 'recovery-key', code: generateSync({ secret }) });
    expect(ok.status).toBe(200);
    expect(ok.body.encryption.kekSalt).toBeTruthy();
  });

  it('its token then confirms that action once, with no second code (a code works only once)', async () => {
    const secret = generateSecret();
    const acct = wrapped(account(secret));
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    const { body } = await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: GOOD, action: 'change-password', code: generateSync({ secret }) });
    const change = { newAuthSecret: 'c'.repeat(64), newEncryptedMasterKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', newKekSalt: 'AAAAAAAAAAAAAAAAAAAAAA==', newKekWrapIv: 'AAAAAAAAAAAAAAAA' };
    // Not for another action
    const other = await request(app).delete('/api/auth/account').send({ confirmToken: body.confirmToken });
    expect(other.status).toBe(401);
    const changed = await request(app).post('/api/auth/change-password').send({ ...change, confirmToken: body.confirmToken });
    expect(changed.status).toBe(200);
    const again = await request(app).post('/api/auth/change-password').send({ ...change, confirmToken: body.confirmToken });
    expect(again.status).toBe(401);
  });

  it('ten wrong passwords lock it for this session, like every confirmed action', async () => {
    const acct = { ...wrapped(account(generateSecret())), totpEnabled: false, totpSecret: null };
    (prisma.account.findUnique as any).mockResolvedValue(acct);
    for (let i = 0; i < 10; i++) await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: WRONG, action: 'change-password' });
    expect((await request(app).post('/api/auth/password-wrap').send({ currentAuthSecret: GOOD, action: 'change-password' })).status).toBe(429);
  });
});
