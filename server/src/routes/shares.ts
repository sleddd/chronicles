import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter, shareLimiter } from '../middleware/rateLimiter.js';
import { createShare, getShareByToken, revokeShare, getSharesByAccount, type Share } from '../db/shareQueries.js';
import { createShareSchema } from '@chronicles/shared';

const router = Router();

// Public payload — never expose accountId or internal id to viewers
function publicShare(share: Share) {
  return {
    token: share.token,
    content: share.content,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
  };
}

// Owner list payload — metadata only, no content
function ownedShare(share: Share) {
  return {
    token: share.token,
    entryId: share.entryId,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
  };
}

// GET /api/shares/:token — Public, no auth required
router.get('/:token', shareLimiter, async (req, res) => {
  try {
    const share = await getShareByToken(String(req.params.token));
    // Shares from the retired encrypted-share scheme have no plaintext content
    // and were never viewable — treat them as gone
    if (!share || !share.content) {
      res.status(404).json({ error: 'Share not found or expired' });
      return;
    }
    res.json(publicShare(share));
  } catch (err) {
    console.error('Get share error:', err);
    res.status(500).json({ error: 'Failed to fetch share' });
  }
});

// POST /api/shares — Create a share (protected)
router.post('/', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { content, entryId, expiresAt } = parsed.data;

    const share = await createShare({
      accountId: req.auth!.accountId,
      entryId,
      content,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    res.status(201).json(ownedShare(share));
  } catch (err) {
    console.error('Create share error:', err);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

// DELETE /api/shares/:token — Revoke a share (protected)
router.delete('/:token', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const revoked = await revokeShare(String(req.params.token), req.auth!.accountId);
    if (!revoked) {
      res.status(404).json({ error: 'Share not found or not owned by you' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Revoke share error:', err);
    res.status(500).json({ error: 'Failed to revoke share' });
  }
});

// GET /api/shares — List my shares (protected)
router.get('/', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const shares = await getSharesByAccount(req.auth!.accountId);
    res.json(shares.map(ownedShare));
  } catch (err) {
    console.error('List shares error:', err);
    res.status(500).json({ error: 'Failed to list shares' });
  }
});

export default router;
