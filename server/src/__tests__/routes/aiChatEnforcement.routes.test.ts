import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

// The AI-chat routes behind the real authMiddleware: a browser session and an
// assistant session (the Chronicles AI app) may each read the status, give
// consent and report a declined request — each only as its own app.

const mockPrisma = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), update: vi.fn().mockReturnValue({ catch: () => {} }), updateMany: vi.fn() },
  account: { findUnique: vi.fn() },
}));
vi.mock('../../db/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../db/tenantQueries.js', () => ({ getSetting: vi.fn() }));
vi.mock('../../db/rekeyQueries.js', () => ({ getRekey: vi.fn().mockResolvedValue(null) }));
vi.mock('../../db/aiChatQueries.js', () => ({
  getAiChatStatus: vi.fn(),
  recordAiRefusal: vi.fn(),
  saveAiChatConsent: vi.fn().mockResolvedValue(undefined),
  withdrawAiChatConsent: vi.fn().mockResolvedValue(undefined),
}));

import { authMiddleware } from '../../middleware/auth.js';
import aiChatRouter from '../../routes/aiChat.js';
import { getSetting } from '../../db/tenantQueries.js';
import { getAiChatStatus, recordAiRefusal, saveAiChatConsent, withdrawAiChatConsent } from '../../db/aiChatQueries.js';

const STATUS = {
  consentAt: null, consentVersion: null, blocked: false, aiUserId: '0123456789abcdef0123456789abcdef',
  enforcement: { level: 'ok', pausedUntil: null, refusals24h: 0, refusals30d: 0 },
};

const verifier = 'a'.repeat(32);
const token = 'aabbccddee11' + verifier;
const sessionFor = (deviceInfo: string | null) => ({
  id: 9, selector: 'aabbccddee11', accountId: 1, tenantSchemaName: 'usr_1_a1b2c3',
  verifierHash: crypto.createHash('sha256').update(verifier).digest('hex'),
  revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000), lastActiveAt: new Date(), deviceInfo,
});

const app = express();
app.use(express.json());
app.use('/api/ai-chat', authMiddleware, aiChatRouter);
const call = (method: 'get' | 'post' | 'delete', path: string) => request(app)[method](path).set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASSISTANT_CLIENT_EMAILS = 'me@example.com';
  mockPrisma.account.findUnique.mockResolvedValue({ email: 'me@example.com' });
  (getSetting as any).mockResolvedValue({ key: 'aiPrivacy', value: { appEnabled: true } });
  (getAiChatStatus as any).mockResolvedValue(STATUS);
  (recordAiRefusal as any).mockResolvedValue({ ...STATUS, enforcement: { ...STATUS.enforcement, refusals24h: 1, refusals30d: 1 } });
});

describe('an assistant session (the Chronicles AI app)', () => {
  beforeEach(() => mockPrisma.session.findUnique.mockResolvedValue(sessionFor('assistant')));

  it('reads the status, with the anonymous id and the enforcement level', async () => {
    const res = await call('get', '/api/ai-chat');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(STATUS);
  });

  it('gives consent', async () => {
    const res = await call('post', '/api/ai-chat/consent').send({ version: 1, ageConfirmed: true });
    expect(res.status).toBe(200);
    expect(saveAiChatConsent).toHaveBeenCalledWith(1, 1);
  });

  it('reports a declined request only as smith', async () => {
    const ok = await call('post', '/api/ai-chat/refusal').send({ app: 'smith' });
    expect(ok.status).toBe(200);
    expect(ok.body.enforcement.refusals24h).toBe(1);
    expect(recordAiRefusal).toHaveBeenCalledWith(1, 'smith');
    expect(recordAiRefusal).toHaveBeenCalledTimes(1);

    for (const body of [{ app: 'chronicles' }, {}, { app: 'other' }, { app: 'smith', prompt: 'what was asked' }]) {
      expect((await call('post', '/api/ai-chat/refusal').send(body)).status).toBe(400);
    }
    expect(recordAiRefusal).toHaveBeenCalledTimes(1);
  });

  it('can’t withdraw consent (not on its list)', async () => {
    const res = await call('delete', '/api/ai-chat/consent');
    expect(res.status).toBe(403);
    expect(withdrawAiChatConsent).not.toHaveBeenCalled();
  });

  it('is refused all of them once the app is switched off', async () => {
    (getSetting as any).mockResolvedValue({ key: 'aiPrivacy', value: { appEnabled: false } });
    expect((await call('get', '/api/ai-chat')).status).toBe(403);
    expect((await call('post', '/api/ai-chat/refusal').send({ app: 'smith' })).status).toBe(403);
    expect(recordAiRefusal).not.toHaveBeenCalled();
  });
});

describe('a browser session', () => {
  beforeEach(() => mockPrisma.session.findUnique.mockResolvedValue(sessionFor(null)));

  it('reports a declined request only as chronicles', async () => {
    const res = await call('post', '/api/ai-chat/refusal').send({ app: 'chronicles' });
    expect(res.status).toBe(200);
    expect(recordAiRefusal).toHaveBeenCalledWith(1, 'chronicles');
    expect((await call('post', '/api/ai-chat/refusal').send({ app: 'smith' })).status).toBe(400);
    expect(recordAiRefusal).toHaveBeenCalledTimes(1);
  });

  it('still gives consent while paused, and is refused while blocked', async () => {
    (getAiChatStatus as any).mockResolvedValue({ ...STATUS, enforcement: { ...STATUS.enforcement, level: 'paused', pausedUntil: '2026-11-26T12:00:00.000Z' } });
    expect((await call('post', '/api/ai-chat/consent').send({ version: 1, ageConfirmed: true })).status).toBe(200);
    (getAiChatStatus as any).mockResolvedValue({ ...STATUS, blocked: true, enforcement: { ...STATUS.enforcement, level: 'blocked' } });
    expect((await call('post', '/api/ai-chat/consent').send({ version: 1, ageConfirmed: true })).status).toBe(403);
    expect(saveAiChatConsent).toHaveBeenCalledTimes(1);
  });
});
