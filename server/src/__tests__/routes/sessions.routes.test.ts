import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

// Mock prisma
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    session: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Mock auth helpers
vi.mock('../../middleware/auth.js', () => ({
  revokeAllSessions: vi.fn().mockResolvedValue(undefined),
}));

// Mock parseId (real implementation)
vi.mock('../../middleware/parseId.js', async () => ({
  parseId: (value: string) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) return NaN;
    return id;
  },
}));

import sessionsRouter from '../../routes/sessions.js';
import { prisma } from '../../db/prisma.js';
import { revokeAllSessions } from '../../middleware/auth.js';

const app = createTestApp('/api/sessions', sessionsRouter);

const mockSession = {
  id: 42,
  selector: 'aabbccddee11',
  deviceInfo: null,
  ipAddress: '127.0.0.1',
  userAgent: 'TestAgent/1.0',
  lastActiveAt: new Date('2025-01-01T12:00:00Z'),
  createdAt: new Date('2025-01-01T10:00:00Z'),
};

describe('Session Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /api/sessions
  // =========================================================================
  describe('GET /api/sessions', () => {
    it('returns list of active sessions', async () => {
      (prisma.session.findMany as any).mockResolvedValue([mockSession]);

      const res = await request(app).get('/api/sessions');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(42);
      expect(res.body[0].isCurrent).toBe(true); // selector matches TEST_AUTH.selector
      expect(res.body[0].lastActiveAt).toBe('2025-01-01T12:00:00.000Z');
      expect(res.body[0].createdAt).toBe('2025-01-01T10:00:00.000Z');
    });

    it('marks non-current sessions correctly', async () => {
      const otherSession = { ...mockSession, id: 99, selector: 'differentsel1' };
      (prisma.session.findMany as any).mockResolvedValue([mockSession, otherSession]);

      const res = await request(app).get('/api/sessions');

      expect(res.body[0].isCurrent).toBe(true);
      expect(res.body[1].isCurrent).toBe(false);
    });

    it('returns empty array when no sessions', async () => {
      (prisma.session.findMany as any).mockResolvedValue([]);

      const res = await request(app).get('/api/sessions');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      (prisma.session.findMany as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/sessions');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to list sessions');
    });
  });

  // =========================================================================
  // POST /api/sessions/revoke-all
  // =========================================================================
  describe('POST /api/sessions/revoke-all', () => {
    it('revokes all sessions except current', async () => {
      const res = await request(app).post('/api/sessions/revoke-all');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(revokeAllSessions).toHaveBeenCalledWith(
        TEST_AUTH.accountId,
        TEST_AUTH.selector,
        'user_logout',
      );
    });

    it('returns 500 on database error', async () => {
      (revokeAllSessions as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).post('/api/sessions/revoke-all');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to revoke sessions');
    });
  });

  // =========================================================================
  // POST /api/sessions/:id/revoke
  // =========================================================================
  describe('POST /api/sessions/:id/revoke', () => {
    it('revokes a specific session', async () => {
      (prisma.session.updateMany as any).mockResolvedValue({ count: 1 });

      const res = await request(app).post('/api/sessions/42/revoke');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Ownership check and revocation happen in one atomic statement
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 42, accountId: TEST_AUTH.accountId, revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'user_logout' },
      });
    });

    it('returns 404 when session not found', async () => {
      (prisma.session.updateMany as any).mockResolvedValue({ count: 0 });

      const res = await request(app).post('/api/sessions/999/revoke');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });

    it('returns 400 for invalid session ID', async () => {
      const res = await request(app).post('/api/sessions/abc/revoke');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid session ID');
    });

    it('returns 500 on database error', async () => {
      (prisma.session.updateMany as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).post('/api/sessions/42/revoke');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to revoke session');
    });
  });
});
