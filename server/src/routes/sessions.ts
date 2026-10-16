import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { revokeAllSessions } from '../middleware/auth.js';
import { revokeGrantsForSession } from '../services/rememberGrants.js';
import { parseId } from '../middleware/parseId.js';
import type { SessionInfo } from '@chronicles/shared';

const router = Router();

// GET /api/sessions — List all sessions for current user
router.get('/', async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        accountId: req.auth!.accountId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        selector: true,
        deviceInfo: true,
        ipAddress: true,
        userAgent: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });

    const result: SessionInfo[] = sessions.map(s => ({
      id: s.id,
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      lastActiveAt: s.lastActiveAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.selector === req.auth!.selector,
    }));

    res.json(result);
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// POST /api/sessions/revoke-all — Revoke all sessions except current
// IMPORTANT: Must be defined BEFORE /:id/revoke to avoid Express matching "revoke-all" as :id
router.post('/revoke-all', async (req, res) => {
  try {
    await revokeAllSessions(req.auth!.accountId, req.auth!.selector, 'user_logout');
    res.json({ success: true });
  } catch (err) {
    console.error('Revoke all error:', err);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// POST /api/sessions/:id/revoke — Revoke a specific session
// Ownership check and revocation are atomic via updateMany WHERE accountId — eliminates TOCTOU.
router.post('/:id/revoke', async (req, res) => {
  try {
    const sessionId = parseId(req.params.id);
    if (Number.isNaN(sessionId)) { res.status(400).json({ error: 'Invalid session ID' }); return; }

    const result = await prisma.session.updateMany({
      where: { id: sessionId, accountId: req.auth!.accountId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_logout' },
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Its "remember me" grant goes with it
    const revoked = await prisma.session.findUnique({ where: { id: sessionId }, select: { selector: true } });
    if (revoked) revokeGrantsForSession(revoked.selector);

    res.json({ success: true });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

export default router;
