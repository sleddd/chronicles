import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Mock shareQueries
vi.mock('../../db/shareQueries.js', () => ({
  getShareByToken: vi.fn(),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
  getSharesByAccount: vi.fn(),
}));

// Mock auth middleware
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
}));

// Mock rate limiters
vi.mock('../../middleware/rateLimiter.js', () => ({
  shareLimiter: (_req: any, _res: any, next: any) => next(),
}));

import sharesRouter from '../../routes/shares.js';
import { getShareByToken, createShare, revokeShare, getSharesByAccount } from '../../db/shareQueries.js';

// Build test app — shares has mixed auth (some routes public, some use authMiddleware inline)
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/shares', sharesRouter);
  return app;
}

const mockShare = {
  id: 1,
  token: 'abc123token',
  accountId: 1,
  entryId: 7,
  content: '<p>Shared entry</p>',
  createdAt: new Date('2025-01-01'),
  expiresAt: null,
  isActive: true,
};

const AUTH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  Cookie: 'chronicle_session=aabbccddee11verifier1234567890123456789012',
};

describe('Share Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // =========================================================================
  // GET /api/shares/:token (public)
  // =========================================================================
  describe('GET /api/shares/:token', () => {
    it('returns only the public share payload', async () => {
      (getShareByToken as any).mockResolvedValue(mockShare);

      const res = await request(app).get('/api/shares/abc123token');

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('abc123token');
      expect(res.body.content).toBe('<p>Shared entry</p>');
      // Viewers must never learn who owns the share or which entry it came from
      expect(res.body).not.toHaveProperty('accountId');
      expect(res.body).not.toHaveProperty('id');
      expect(res.body).not.toHaveProperty('entryId');
      expect(getShareByToken).toHaveBeenCalledWith('abc123token');
    });

    it('returns 404 when share not found', async () => {
      (getShareByToken as any).mockResolvedValue(null);

      const res = await request(app).get('/api/shares/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Share not found or expired');
    });

    it('returns 404 for retired encrypted shares with no content', async () => {
      (getShareByToken as any).mockResolvedValue({ ...mockShare, content: null });

      const res = await request(app).get('/api/shares/abc123token');

      expect(res.status).toBe(404);
    });

    it('returns 500 on database error', async () => {
      (getShareByToken as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/shares/abc123token');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch share');
    });
  });

  // =========================================================================
  // POST /api/shares (auth required)
  // =========================================================================
  describe('POST /api/shares', () => {
    const validShareBody = { content: '<p>Shared entry</p>', entryId: 7 };

    it('creates a share and returns 201', async () => {
      (createShare as any).mockResolvedValue(mockShare);

      const res = await request(app).post('/api/shares').set(AUTH_HEADERS).send(validShareBody);

      expect(res.status).toBe(201);
      expect(res.body.token).toBe('abc123token');
      expect(res.body).not.toHaveProperty('content');
      expect(createShare).toHaveBeenCalledWith({
        accountId: 1,
        entryId: 7,
        content: '<p>Shared entry</p>',
        expiresAt: null,
      });
    });

    it('creates a share with expiration', async () => {
      (createShare as any).mockResolvedValue({ ...mockShare, expiresAt: new Date('2025-12-31') });

      const res = await request(app)
        .post('/api/shares')
        .set(AUTH_HEADERS)
        .send({ ...validShareBody, expiresAt: '2025-12-31T00:00:00.000Z' });

      expect(res.status).toBe(201);
      expect(createShare).toHaveBeenCalledWith({
        accountId: 1,
        entryId: 7,
        content: '<p>Shared entry</p>',
        expiresAt: expect.any(Date),
      });
    });

    it('returns 400 when content is missing', async () => {
      const res = await request(app).post('/api/shares').set(AUTH_HEADERS).send({ entryId: 7 });

      expect(res.status).toBe(400);
      expect(createShare).not.toHaveBeenCalled();
    });

    it('returns 400 when entryId is missing', async () => {
      const res = await request(app).post('/api/shares').set(AUTH_HEADERS).send({ content: 'x' });

      expect(res.status).toBe(400);
      expect(createShare).not.toHaveBeenCalled();
    });

    it('ignores a client-supplied accountId', async () => {
      (createShare as any).mockResolvedValue(mockShare);

      await request(app).post('/api/shares').set(AUTH_HEADERS).send({ ...validShareBody, accountId: 999 });

      expect((createShare as any).mock.calls[0][0].accountId).toBe(1);
    });

    it('returns 500 on database error', async () => {
      (createShare as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).post('/api/shares').set(AUTH_HEADERS).send(validShareBody);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create share');
    });
  });

  // =========================================================================
  // DELETE /api/shares/:token (auth required)
  // =========================================================================
  describe('DELETE /api/shares/:token', () => {
    it('revokes a share successfully', async () => {
      (revokeShare as any).mockResolvedValue(true);

      const res = await request(app).delete('/api/shares/abc123token').set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(revokeShare).toHaveBeenCalledWith('abc123token', 1);
    });

    it('returns 404 when share not found or not owned', async () => {
      (revokeShare as any).mockResolvedValue(false);

      const res = await request(app).delete('/api/shares/nonexistent').set(AUTH_HEADERS);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Share not found or not owned by you');
    });

    it('returns 500 on database error', async () => {
      (revokeShare as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).delete('/api/shares/abc123token').set(AUTH_HEADERS);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to revoke share');
    });
  });

  // =========================================================================
  // GET /api/shares (auth required — list user's shares)
  // =========================================================================
  describe('GET /api/shares (list)', () => {
    it('returns share metadata without content', async () => {
      (getSharesByAccount as any).mockResolvedValue([mockShare]);

      const res = await request(app).get('/api/shares').set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual({
        token: 'abc123token',
        entryId: 7,
        createdAt: mockShare.createdAt.toISOString(),
        expiresAt: null,
      });
      expect(getSharesByAccount).toHaveBeenCalledWith(1);
      expect(getShareByToken).not.toHaveBeenCalled();
    });

    it('returns empty array when no shares', async () => {
      (getSharesByAccount as any).mockResolvedValue([]);

      const res = await request(app).get('/api/shares').set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      (getSharesByAccount as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/shares').set(AUTH_HEADERS);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to list shares');
    });
  });
});
