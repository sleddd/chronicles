import { Router } from 'express';
import { crisisCardEventSchema } from '@chronicles/shared';
import { recordCrisisCard, recordMinorDetected } from '../db/analyticsQueries.js';

/* App analytics. Mounted behind authMiddleware only so strangers can't stuff
   the counts — the handlers never read req.auth and never log, so nothing
   recorded here is tied to an account. */

const router = Router();

// POST /api/analytics/crisis-card — the AI chat showed its crisis card
router.post('/crisis-card', async (req, res) => {
  const parsed = crisisCardEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid event' });
    return;
  }
  try {
    await recordCrisisCard(parsed.data.rating, parsed.data.kind);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// POST /api/analytics/minor-detected — the AI chat paused for a likely minor (no body)
router.post('/minor-detected', async (_req, res) => {
  try {
    await recordMinorDetected();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to record event' });
  }
});

export default router;
