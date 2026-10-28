import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// vi.mock is hoisted — use vi.hoisted to create mocks accessible in the factory
const mockPrisma = vi.hoisted(() => ({
  session: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../db/prisma.js', () => ({
  prisma: mockPrisma,
}));

import {
  authMiddleware,
  createSession,
  revokeSession,
  revokeAllSessions,
  cleanupSessions,
} from '../middleware/auth.js';

function createMockReq(overrides: Record<string, any> = {}) {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as any;
}

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects requests without cookie or bearer token', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects token that is too short', async () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer short' },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('requires CSRF header for cookie-based auth', async () => {
    const req = createMockReq({
      cookies: { '__Host-chronicle_session': 'a'.repeat(44) },
      headers: {},
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing CSRF header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('ignores a plain-named session cookie outside development (a sibling subdomain could plant one)', async () => {
    const req = createMockReq({ cookies: { chronicle_session: 'a'.repeat(44) }, headers: { 'x-requested-with': 'XMLHttpRequest' } });
    const res = createMockRes();
    const next = vi.fn();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('skips CSRF check for Bearer auth', async () => {
    const selector = 'a'.repeat(12);
    const verifier = 'b'.repeat(32);
    const verifierHash = crypto.createHash('sha256').update(verifier).digest('hex');

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash,
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: new Date(),
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${selector}${verifier}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toEqual({
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      sessionId: 1,
      selector,
    });
  });

  it('rejects when session is not found in database', async () => {
    const token = 'a'.repeat(44);
    mockPrisma.session.findUnique.mockResolvedValue(null);

    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid session' });
  });

  it('rejects revoked sessions', async () => {
    const selector = 'a'.repeat(12);
    const verifier = 'b'.repeat(32);

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash: crypto.createHash('sha256').update(verifier).digest('hex'),
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: new Date(),
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${selector}${verifier}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session revoked' });
  });

  it('says nothing about a revoked or expired session until the verifier matches', async () => {
    const selector = 'a'.repeat(12);
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash: crypto.createHash('sha256').update('c'.repeat(32)).digest('hex'),
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
      lastActiveAt: new Date(),
    });
    const req = createMockReq({ headers: { authorization: `Bearer ${selector}${'b'.repeat(32)}` } });
    const res = createMockRes();
    await authMiddleware(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid session' });
  });

  it('rejects expired sessions', async () => {
    const selector = 'a'.repeat(12);
    const verifier = 'b'.repeat(32);

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash: crypto.createHash('sha256').update(verifier).digest('hex'),
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000), // expired
      lastActiveAt: new Date(),
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${selector}${verifier}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expired' });
  });

  it('rejects when verifier hash does not match', async () => {
    const selector = 'a'.repeat(12);
    const verifier = 'b'.repeat(32);

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash: 'c'.repeat(64), // wrong hash
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: new Date(),
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${selector}${verifier}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid session' });
  });

  it('accepts valid cookie auth with CSRF header', async () => {
    const selector = 'a'.repeat(12);
    const verifier = 'b'.repeat(32);
    const verifierHash = crypto.createHash('sha256').update(verifier).digest('hex');

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 5,
      selector,
      verifierHash,
      accountId: 10,
      tenantSchemaName: 'usr_2_def456',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: new Date(),
    });

    const req = createMockReq({
      cookies: { '__Host-chronicle_session': `${selector}${verifier}` },
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toEqual({
      accountId: 10,
      tenantSchemaName: 'usr_2_def456',
      sessionId: 5,
      selector,
    });
  });

  it('debounces lastActiveAt update when session is recently active', async () => {
    const selector = 'a'.repeat(12);
    const verifier = 'b'.repeat(32);
    const verifierHash = crypto.createHash('sha256').update(verifier).digest('hex');

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash,
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: new Date(), // just now — should NOT trigger update
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${selector}${verifier}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(mockPrisma.session.update).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('triggers lastActiveAt update when session is stale', async () => {
    const selector = 'a'.repeat(12);
    const verifier = 'b'.repeat(32);
    const verifierHash = crypto.createHash('sha256').update(verifier).digest('hex');

    mockPrisma.session.update.mockResolvedValue({});

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash,
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago — should trigger
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${selector}${verifier}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastActiveAt: expect.any(Date) },
    });
    expect(next).toHaveBeenCalled();
  });

  it('ends a session unused for more than 24 hours', async () => {
    const selector = 'a'.repeat(12);
    const verifier = 'b'.repeat(32);
    const verifierHash = crypto.createHash('sha256').update(verifier).digest('hex');

    mockPrisma.session.update.mockResolvedValue({});
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash,
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3 * 86400000),
      lastActiveAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const req = createMockReq({ headers: { authorization: `Bearer ${selector}${verifier}` } });
    const res = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expired' });
    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { selector },
      data: { revokedAt: expect.any(Date), revokedReason: 'idle' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not end an idle session for a wrong verifier', async () => {
    const selector = 'a'.repeat(12);
    const verifierHash = crypto.createHash('sha256').update('b'.repeat(32)).digest('hex');

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 1,
      selector,
      verifierHash,
      accountId: 42,
      tenantSchemaName: 'usr_1_abc123',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3 * 86400000),
      lastActiveAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const req = createMockReq({ headers: { authorization: `Bearer ${selector}${'c'.repeat(32)}` } });
    const res = createMockRes();

    await authMiddleware(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.session.update).not.toHaveBeenCalled();
  });
});

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a token with selector (12 chars) + verifier (32 chars) = 44 chars', async () => {
    mockPrisma.session.create.mockResolvedValue({});

    const token = await createSession(1, 'usr_1_abc123');

    expect(token).toHaveLength(44);
    expect(typeof token).toBe('string');
  });

  it('calls prisma.session.create with correct data', async () => {
    mockPrisma.session.create.mockResolvedValue({});

    await createSession(1, 'usr_1_abc123', {
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(mockPrisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 1,
        tenantSchemaName: 'usr_1_abc123',
        deviceInfo: 'Chrome',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        selector: expect.any(String),
        verifierHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
  });

  it('stores SHA-256 hash of verifier, not the raw verifier', async () => {
    mockPrisma.session.create.mockResolvedValue({});

    const token = await createSession(1, 'usr_1_abc123');
    const verifier = token.slice(12);

    const expectedHash = crypto.createHash('sha256').update(verifier).digest('hex');
    const createCall = mockPrisma.session.create.mock.calls[0][0];
    expect(createCall.data.verifierHash).toBe(expectedHash);
  });

  it('sets expiry to 7 days from now', async () => {
    mockPrisma.session.create.mockResolvedValue({});

    await createSession(1, 'usr_1_abc123');

    const createCall = mockPrisma.session.create.mock.calls[0][0];
    const expiresAt = createCall.data.expiresAt as Date;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const diff = expiresAt.getTime() - Date.now();
    // Allow 5 second tolerance
    expect(diff).toBeGreaterThan(sevenDaysMs - 5000);
    expect(diff).toBeLessThanOrEqual(sevenDaysMs);
  });

  it('retries on unique constraint violation (selector collision)', async () => {
    const uniqueError = new Error('Unique constraint failed');
    (uniqueError as any).code = 'P2002';

    mockPrisma.session.create
      .mockRejectedValueOnce(uniqueError)
      .mockResolvedValueOnce({});

    const token = await createSession(1, 'usr_1_abc123');
    expect(token).toHaveLength(44);
    expect(mockPrisma.session.create).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries on repeated collisions', async () => {
    const uniqueError = new Error('Unique constraint failed');
    (uniqueError as any).code = 'P2002';

    mockPrisma.session.create
      .mockRejectedValueOnce(uniqueError)
      .mockRejectedValueOnce(uniqueError)
      .mockRejectedValueOnce(uniqueError);

    await expect(createSession(1, 'usr_1_abc123')).rejects.toThrow();
  });
});

describe('revokeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a function', () => {
    expect(typeof revokeSession).toBe('function');
  });

  it('calls prisma.session.update with selector and revokedAt', async () => {
    mockPrisma.session.update.mockResolvedValue({});

    await revokeSession('abc123def456', 'user_logout');

    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { selector: 'abc123def456' },
      data: {
        revokedAt: expect.any(Date),
        revokedReason: 'user_logout',
      },
    });
  });
});

describe('revokeAllSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a function', () => {
    expect(typeof revokeAllSessions).toBe('function');
  });

  it('revokes all sessions for an account', async () => {
    mockPrisma.session.updateMany.mockResolvedValue({ count: 3 });

    await revokeAllSessions(42);

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        accountId: 42,
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
        revokedReason: 'password_change',
      },
    });
  });

  it('can exclude a specific selector', async () => {
    mockPrisma.session.updateMany.mockResolvedValue({ count: 2 });

    await revokeAllSessions(42, 'keep_this_one', 'manual_revoke');

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        accountId: 42,
        revokedAt: null,
        NOT: { selector: 'keep_this_one' },
      },
      data: {
        revokedAt: expect.any(Date),
        revokedReason: 'manual_revoke',
      },
    });
  });
});

describe('cleanupSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a function', () => {
    expect(typeof cleanupSessions).toBe('function');
  });

  it('deletes expired and revoked sessions and returns count', async () => {
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 5 });

    const count = await cleanupSessions();

    expect(count).toBe(5);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: expect.any(Date) } },
          { revokedAt: { not: null, lt: expect.any(Date) } },
        ],
      },
    });
  });
});
