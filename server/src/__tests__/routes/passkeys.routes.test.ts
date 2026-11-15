import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.APP_URL = 'https://chronicles.test';
delete process.env.CLIENT_URL;
delete process.env.WEBAUTHN_RP_ID;

const ACCOUNT = {
  id: 1, email: 'olivia@example.com', username: 'olivia', tenantSchemaName: 'usr_1_a1b2c3',
  passwordHash: 'auth1$hash', totpEnabled: false, totpSecret: null, totpBackupCodes: [] as string[],
};
let selector = 'aabbccddee11';

vi.mock('../../db/prisma.js', () => ({
  prisma: { account: { findUnique: vi.fn(async () => ACCOUNT) }, $executeRaw: vi.fn().mockResolvedValue(1) },
}));
vi.mock('../../db/schemaManager.js', () => ({ registerTenant: vi.fn(), deleteAccountById: vi.fn() }));
vi.mock('../../services/googleRevoke.js', () => ({ revokeGoogleAccess: vi.fn() }));
vi.mock('../../db/betaQueries.js', () => ({ isApproved: async () => false, hasPendingInvite: async () => false, spendInvite: async () => undefined }));
vi.mock('../../db/trustedDeviceQueries.js', () => ({
  TRUST_DAYS: 30, trustDevice: async () => 't'.repeat(43), useTrustedDevice: async () => false, forgetTrustToken: async () => undefined,
  forgetAllTrustedDevices: async () => undefined, listTrustedDevices: async () => [], forgetTrustedDevice: async () => true,
}));

// The passkeys table, in memory
vi.mock('../../db/passkeyQueries.js', () => {
  let rows: any[] = [];
  let nextId = 1;
  return {
    MAX_PASSKEYS: 10,
    _reset: () => { rows = []; nextId = 1; },
    _rows: () => rows,
    listPasskeys: async (accountId: number) => rows.filter(r => r.accountId === accountId),
    findPasskey: async (credentialId: string) => rows.find(r => r.credentialId === credentialId) ?? null,
    addPasskey: async (p: any) => {
      if (rows.some(r => r.credentialId === p.credentialId) || rows.filter(r => r.accountId === p.accountId).length >= 10) return false;
      rows.push({ ...p, id: nextId++, createdAt: new Date(), lastUsedAt: null });
      return true;
    },
    notePasskeyUsed: async (id: number, signCount: number, backedUp: boolean) => {
      const r = rows.find(x => x.id === id);
      if (r) Object.assign(r, { signCount, backedUp, lastUsedAt: new Date() });
    },
    renamePasskey: async (accountId: number, id: number, name: string) => {
      const r = rows.find(x => x.id === id && x.accountId === accountId);
      if (r) r.name = name;
      return !!r;
    },
    removePasskey: async (accountId: number, id: number) => {
      const n = rows.length;
      rows = rows.filter(x => !(x.id === id && x.accountId === accountId));
      return rows.length < n;
    },
    removeAllPasskeys: async (accountId: number) => {
      const n = rows.length;
      rows = rows.filter(x => x.accountId !== accountId);
      return n - rows.length;
    },
    passkeyExists: async (id: number, accountId: number) => rows.some(x => x.id === id && x.accountId === accountId),
  };
});

vi.mock('../../middleware/auth.js', () => ({
  revokeBrowserSession: vi.fn().mockResolvedValue(null),
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = { accountId: 1, tenantSchemaName: 'usr_1_a1b2c3', sessionId: 42, selector };
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

import passkeyRouter from '../../routes/passkeys.js';
import authRouter, { resetAuthStateForTests } from '../../routes/auth.js';
import * as passkeyDb from '../../db/passkeyQueries.js';
import * as authMw from '../../middleware/auth.js';
import { softPasskey } from './softAuthenticator.js';

const RP = 'chronicles.test';
const ORIGIN = 'https://chronicles.test';
const GOOD = 'a'.repeat(64);
const WRONG = 'b'.repeat(64);
const WRAP = { wrappedMK: 'A'.repeat(64), wrapIv: 'B'.repeat(16) };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  app.use('/api/auth', passkeyRouter);
  return app;
}

/** Add a passkey the proper way (password-confirmed) and return it. */
async function addPasskey(app: express.Express, name = 'MacBook') {
  const key = softPasskey(RP, ORIGIN);
  const { body } = await request(app).post('/api/auth/passkeys/register/options').send({});
  const res = await request(app).post('/api/auth/passkeys/register/verify')
    .send({ response: key.attestation(body.options.challenge), ...WRAP, name, currentAuthSecret: GOOD });
  return { key, res };
}

describe('passkeys', () => {
  let app: express.Express;
  beforeEach(() => {
    (passkeyDb as any)._reset();
    resetAuthStateForTests();
    selector = 'aabbccddee11';
    ACCOUNT.totpEnabled = false;
    vi.mocked(authMw.createSession).mockClear();
    vi.mocked(authMw.revokeSession).mockClear();
    app = makeApp();
  });

  describe('adding one', () => {
    it('stores the passkey and its wrap once the password confirms it', async () => {
      const { key, res } = await addPasskey(app);
      expect(res.status).toBe(201);
      expect(res.body.passkeys).toHaveLength(1);
      expect(res.body.passkeys[0].name).toBe('MacBook');
      // The list never carries the public key or the wrap
      expect(JSON.stringify(res.body)).not.toMatch(/wrappedMK|publicKey|credentialId/);
      const stored = (passkeyDb as any)._rows()[0];
      expect(stored.credentialId).toBe(key.credentialId);
      expect(Buffer.from(stored.wrappedMK).toString('base64')).toBe(WRAP.wrappedMK);
    });

    it('asks for options that need a discoverable, user-verified passkey and a handle that names no one', async () => {
      const { body } = await request(app).post('/api/auth/passkeys/register/options').send({});
      expect(body.options.rp.id).toBe(RP);
      expect(body.options.authenticatorSelection.residentKey).toBe('required');
      expect(body.options.authenticatorSelection.userVerification).toBe('required');
      const handle = Buffer.from(body.options.user.id, 'base64url').toString('latin1');
      expect(handle).not.toContain('olivia');
      expect(body.options.user.id).not.toBe(Buffer.from('1').toString('base64url'));
    });

    it('refuses a wrong password, and stores nothing', async () => {
      const key = softPasskey(RP, ORIGIN);
      const { body } = await request(app).post('/api/auth/passkeys/register/options').send({});
      const res = await request(app).post('/api/auth/passkeys/register/verify')
        .send({ response: key.attestation(body.options.challenge), ...WRAP, name: 'X', currentAuthSecret: WRONG });
      expect(res.status).toBe(401);
      expect((passkeyDb as any)._rows()).toHaveLength(0);
    });

    it('refuses with no confirmation at all', async () => {
      const key = softPasskey(RP, ORIGIN);
      const { body } = await request(app).post('/api/auth/passkeys/register/options').send({});
      const res = await request(app).post('/api/auth/passkeys/register/verify')
        .send({ response: key.attestation(body.options.challenge), ...WRAP, name: 'X' });
      expect(res.status).toBe(400);
    });

    it('refuses a challenge this server never issued, one from another session, and a replay', async () => {
      const key = softPasskey(RP, ORIGIN);
      const made = Buffer.from('made-up-challenge').toString('base64url');
      const forged = await request(app).post('/api/auth/passkeys/register/verify')
        .send({ response: key.attestation(made), ...WRAP, name: 'X', currentAuthSecret: GOOD });
      expect(forged.status).toBe(400);

      const { body } = await request(app).post('/api/auth/passkeys/register/options').send({});
      selector = 'ffffffffffff';
      const otherSession = await request(app).post('/api/auth/passkeys/register/verify')
        .send({ response: key.attestation(body.options.challenge), ...WRAP, name: 'X', currentAuthSecret: GOOD });
      expect(otherSession.status).toBe(400);

      selector = 'aabbccddee11';
      const fresh = (await request(app).post('/api/auth/passkeys/register/options').send({})).body.options.challenge;
      const answer = key.attestation(fresh);
      expect((await request(app).post('/api/auth/passkeys/register/verify').send({ response: answer, ...WRAP, name: 'X', currentAuthSecret: GOOD })).status).toBe(201);
      const key2 = softPasskey(RP, ORIGIN);
      expect((await request(app).post('/api/auth/passkeys/register/verify').send({ response: key2.attestation(fresh), ...WRAP, name: 'Y', currentAuthSecret: GOOD })).status).toBe(400);
    });

    it('refuses another site’s origin and a passkey made without the user check', async () => {
      const key = softPasskey(RP, ORIGIN);
      let c = (await request(app).post('/api/auth/passkeys/register/options').send({})).body.options.challenge;
      const phished = await request(app).post('/api/auth/passkeys/register/verify')
        .send({ response: key.attestation(c, { origin: 'https://chronicles.test.evil.example' }), ...WRAP, name: 'X', currentAuthSecret: GOOD });
      expect(phished.status).toBe(400);
      c = (await request(app).post('/api/auth/passkeys/register/options').send({})).body.options.challenge;
      const unverified = await request(app).post('/api/auth/passkeys/register/verify')
        .send({ response: key.attestation(c, { userVerified: false }), ...WRAP, name: 'X', currentAuthSecret: GOOD });
      expect(unverified.status).toBe(400);
      expect((passkeyDb as any)._rows()).toHaveLength(0);
    });

    it('refuses a wrap that is not a wrapped key, and a name with control characters', async () => {
      const key = softPasskey(RP, ORIGIN);
      const c = (await request(app).post('/api/auth/passkeys/register/options').send({})).body.options.challenge;
      const base = { response: key.attestation(c), name: 'X', currentAuthSecret: GOOD };
      expect((await request(app).post('/api/auth/passkeys/register/verify').send({ ...base, wrappedMK: 'short', wrapIv: WRAP.wrapIv })).status).toBe(400);
      expect((await request(app).post('/api/auth/passkeys/register/verify').send({ ...base, ...WRAP, name: 'a\nb' })).status).toBe(400);
    });
  });

  describe('signing in', () => {
    it('one touch gives a session and that passkey’s wrap', async () => {
      const { key } = await addPasskey(app);
      const { body } = await request(app).post('/api/auth/passkey/options').send({});
      // No email asked and no passkeys listed: the answer says nothing about any account
      expect(body.options.allowCredentials ?? []).toHaveLength(0);
      expect(body.options.userVerification).toBe('required');

      const res = await request(app).post('/api/auth/passkey/verify').send({ response: key.assertion(body.options.challenge) });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('olivia@example.com');
      expect(res.body.passkey).toEqual({ credentialId: key.credentialId, ...WRAP });
      // Never the password wrap
      expect(res.body.encryption).toBeUndefined();
      expect(String(res.headers['set-cookie'])).toContain('chronicle_session=');
      expect(vi.mocked(authMw.createSession).mock.calls[0][2]).toMatchObject({ deviceInfo: 'passkey' });
    });

    it('a challenge works once', async () => {
      const { key } = await addPasskey(app);
      const c = (await request(app).post('/api/auth/passkey/options').send({})).body.options.challenge;
      expect((await request(app).post('/api/auth/passkey/verify').send({ response: key.assertion(c) })).status).toBe(200);
      expect((await request(app).post('/api/auth/passkey/verify').send({ response: key.assertion(c) })).status).toBe(401);
    });

    it('refuses a made-up challenge, another origin, another site’s RP, no user check, and an unknown passkey — all the same way', async () => {
      const { key } = await addPasskey(app);
      const challenge = async () => (await request(app).post('/api/auth/passkey/options').send({})).body.options.challenge;
      const tries = [
        key.assertion(Buffer.from('nope').toString('base64url')),
        key.assertion(await challenge(), { origin: 'https://evil.example' }),
        key.assertion(await challenge(), { rpId: 'evil.example' }),
        key.assertion(await challenge(), { userVerified: false }),
        softPasskey(RP, ORIGIN).assertion(await challenge()),
      ];
      for (const response of tries) {
        const res = await request(app).post('/api/auth/passkey/verify').send({ response });
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/didn’t work/);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      expect(authMw.createSession).not.toHaveBeenCalled();
    });

    it('refuses a signature made by a different key for the same passkey id', async () => {
      const { key } = await addPasskey(app);
      const imposter = softPasskey(RP, ORIGIN);
      const c = (await request(app).post('/api/auth/passkey/options').send({})).body.options.challenge;
      const forged = imposter.assertion(c) as any;
      forged.id = key.credentialId;
      forged.rawId = key.credentialId;
      expect((await request(app).post('/api/auth/passkey/verify').send({ response: forged })).status).toBe(401);
    });

    it('drops the session if "Sign out everywhere" landed while the sign-in was in flight', async () => {
      const { key } = await addPasskey(app);
      const c = (await request(app).post('/api/auth/passkey/options').send({})).body.options.challenge;
      vi.mocked(authMw.createSession).mockImplementationOnce(async () => {
        await (await import('../../routes/authState.js')).cancelSignIns(1);
        return 'aabbccddee11' + 'v'.repeat(32);
      });
      const res = await request(app).post('/api/auth/passkey/verify').send({ response: key.assertion(c) });
      expect(res.status).toBe(401);
      expect(authMw.revokeSession).toHaveBeenCalledWith('aabbccddee11', 'credentials_changed');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('spends the challenge even when the passkey is unknown', async () => {
      const { key } = await addPasskey(app);
      const c = (await request(app).post('/api/auth/passkey/options').send({})).body.options.challenge;
      // A passkey this server has never seen answers the challenge first…
      expect((await request(app).post('/api/auth/passkey/verify').send({ response: softPasskey(RP, ORIGIN).assertion(c) })).status).toBe(401);
      // …and the real one can no longer use it
      expect((await request(app).post('/api/auth/passkey/verify').send({ response: key.assertion(c) })).status).toBe(401);
    });

    it('drops the session if the passkey was removed while the sign-in was in flight', async () => {
      const { key } = await addPasskey(app);
      const c = (await request(app).post('/api/auth/passkey/options').send({})).body.options.challenge;
      vi.mocked(authMw.createSession).mockImplementationOnce(async () => {
        await (passkeyDb as any).removeAllPasskeys(1);
        return 'aabbccddee11' + 'v'.repeat(32);
      });
      const res = await request(app).post('/api/auth/passkey/verify').send({ response: key.assertion(c) });
      expect(res.status).toBe(401);
      expect(authMw.revokeSession).toHaveBeenCalledWith('aabbccddee11', 'credentials_changed');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('never keeps what the browser says about extensions (the PRF secret must not reach the server)', async () => {
      const { key } = await addPasskey(app);
      const c = (await request(app).post('/api/auth/passkey/options').send({})).body.options.challenge;
      const response = { ...key.assertion(c), clientExtensionResults: { prf: { results: { first: 'c2VjcmV0' } } } };
      const { passkeyLoginSchema } = await import('@chronicles/shared');
      const parsed = passkeyLoginSchema.parse({ response });
      expect(parsed.response.clientExtensionResults).toEqual({});
    });
  });

  describe('confirming a sensitive action with a touch', () => {
    const confirm = async (key: ReturnType<typeof softPasskey>, action: string) => {
      const { body } = await request(app).post('/api/auth/confirm/options').send({ action });
      return request(app).post('/api/auth/confirm/verify').send({ action, response: key.assertion(body.options.challenge) });
    };

    it('gives a token and the passkey’s wrap, and the token removes a passkey with no password', async () => {
      const { key } = await addPasskey(app);
      const res = await confirm(key, 'passkey-remove');
      expect(res.status).toBe(200);
      expect(res.body.confirmToken).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.passkey.credentialId).toBe(key.credentialId);
      const id = (passkeyDb as any)._rows()[0].id;
      const removed = await request(app).post(`/api/auth/passkeys/${id}/remove`).send({ confirmToken: res.body.confirmToken });
      expect(removed.status).toBe(200);
      expect(removed.body.passkeys).toHaveLength(0);
    });

    it('a token confirms only the action it was made for, only once, only in its session', async () => {
      const { key } = await addPasskey(app);
      await addPasskey(app, 'Phone');
      const id = (passkeyDb as any)._rows()[1].id;

      const forDelete = (await confirm(key, 'delete-account')).body.confirmToken;
      expect((await request(app).post(`/api/auth/passkeys/${id}/remove`).send({ confirmToken: forDelete })).status).toBe(401);

      const forRemove = (await confirm(key, 'passkey-remove')).body.confirmToken;
      selector = 'ffffffffffff';
      expect((await request(app).post(`/api/auth/passkeys/${id}/remove`).send({ confirmToken: forRemove })).status).toBe(401);
      selector = 'aabbccddee11';
      // Spent by the refused try above? No: another session's bucket never held it
      expect((await request(app).post(`/api/auth/passkeys/${id}/remove`).send({ confirmToken: forRemove })).status).toBe(200);
      expect((await request(app).post('/api/auth/passkeys/remove-all').send({ confirmToken: forRemove })).status).toBe(401);
    });

    it('a challenge made for one action can’t be answered for another', async () => {
      const { key } = await addPasskey(app);
      const { body } = await request(app).post('/api/auth/confirm/options').send({ action: 'passkey-remove' });
      const res = await request(app).post('/api/auth/confirm/verify').send({ action: 'delete-account', response: key.assertion(body.options.challenge) });
      expect(res.status).toBe(401);
    });

    it('a sign-in challenge can’t be answered as a confirmation', async () => {
      const { key } = await addPasskey(app);
      const c = (await request(app).post('/api/auth/passkey/options').send({})).body.options.challenge;
      const res = await request(app).post('/api/auth/confirm/verify').send({ action: 'delete-account', response: key.assertion(c) });
      expect(res.status).toBe(401);
    });

    it('stands in for the password and the 2FA code at change password', async () => {
      const { key } = await addPasskey(app);
      ACCOUNT.totpEnabled = true;
      (ACCOUNT as any).totpSecret = 'JBSWY3DPEHPK3PXP';
      const { prisma } = await import('../../db/prisma.js');
      (prisma as any).$transaction = vi.fn().mockResolvedValue([]);
      (prisma as any).account.update = vi.fn();
      (prisma as any).session = { updateMany: vi.fn() };
      const token = (await confirm(key, 'change-password')).body.confirmToken;
      const res = await request(app).post('/api/auth/change-password').send({
        confirmToken: token, newAuthSecret: 'c'.repeat(64), newEncryptedMasterKey: 'A'.repeat(64),
        newKekSalt: 'AAAAAAAAAAAAAAAAAAAAAA==', newKekWrapIv: 'B'.repeat(16),
      });
      expect(res.status).toBe(200);
      (ACCOUNT as any).totpSecret = null;
    });

    it('wrong touches count like wrong passwords: ten lock confirmations for this session', async () => {
      const { key } = await addPasskey(app);
      const stranger = softPasskey(RP, ORIGIN);
      for (let i = 0; i < 10; i++) {
        const { body } = await request(app).post('/api/auth/confirm/options').send({ action: 'delete-account' });
        const res = await request(app).post('/api/auth/confirm/verify').send({ action: 'delete-account', response: stranger.assertion(body.options.challenge) });
        expect(res.status).toBe(401);
      }
      const { body } = await request(app).post('/api/auth/confirm/options').send({ action: 'delete-account' });
      const locked = await request(app).post('/api/auth/confirm/verify').send({ action: 'delete-account', response: key.assertion(body.options.challenge) });
      expect(locked.status).toBe(429);
      // …and the password path is locked with it, in this session only
      expect((await request(app).post('/api/auth/passkeys/remove-all').send({ currentAuthSecret: GOOD })).status).toBe(429);
      selector = 'ffffffffffff';
      expect((await request(app).post('/api/auth/passkeys/remove-all').send({ currentAuthSecret: GOOD })).status).toBe(200);
    });

    it('says so when the account has no passkey', async () => {
      const res = await request(app).post('/api/auth/confirm/options').send({ action: 'delete-account' });
      expect(res.status).toBe(409);
    });
  });

  describe('the list', () => {
    it('renames, and removes all with the password', async () => {
      await addPasskey(app);
      await addPasskey(app, 'Phone');
      const id = (passkeyDb as any)._rows()[0].id;
      expect((await request(app).patch(`/api/auth/passkeys/${id}`).send({ name: 'Work laptop' })).status).toBe(200);
      const list = await request(app).get('/api/auth/passkeys');
      expect(list.body.map((p: any) => p.name)).toEqual(['Work laptop', 'Phone']);

      expect((await request(app).post('/api/auth/passkeys/remove-all').send({ currentAuthSecret: WRONG })).status).toBe(401);
      const gone = await request(app).post('/api/auth/passkeys/remove-all').send({ currentAuthSecret: GOOD });
      expect(gone.status).toBe(200);
      expect(gone.body.passkeys).toHaveLength(0);
    });

    it('removing a passkey signs out every other session: one its device already made must not outlive it', async () => {
      await addPasskey(app);
      vi.mocked(authMw.revokeAllSessions).mockClear();
      const id = (passkeyDb as any)._rows()[0].id;
      expect((await request(app).post(`/api/auth/passkeys/${id}/remove`).send({ currentAuthSecret: GOOD })).status).toBe(200);
      expect(authMw.revokeAllSessions).toHaveBeenCalledWith(1, 'aabbccddee11', 'passkey_removed');
      // Nothing to remove: nobody is signed out
      vi.mocked(authMw.revokeAllSessions).mockClear();
      expect((await request(app).post('/api/auth/passkeys/remove-all').send({ currentAuthSecret: GOOD })).status).toBe(404);
      expect(authMw.revokeAllSessions).not.toHaveBeenCalled();
    });

    it('stops at ten', async () => {
      for (let i = 0; i < 10; i++) expect((await addPasskey(app, `Key ${i}`)).res.status).toBe(201);
      expect((await request(app).post('/api/auth/passkeys/register/options').send({})).status).toBe(409);
    });
  });
});
