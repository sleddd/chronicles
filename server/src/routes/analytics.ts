import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { crisisCardEventSchema } from '@chronicles/shared';
import { recordCrisisCard, recordMinorDetected } from '../db/analyticsQueries.js';

/* App analytics. Mounted behind authMiddleware only so strangers can't stuff
   the counts — the handlers never read req.auth and never log, so nothing
   recorded here is tied to an account. */

const router = Router();

// One account can't run the counts up either: a handful of events an hour,
// counted in this process's memory only, under a key made with a secret that
// lives and dies with the process — never stored, never logged, and not the
// account id. (The app shows a crisis card at most a few times a session.)
const LIMIT_KEY = crypto.randomBytes(32);
router.use(rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => crypto.createHmac('sha256', LIMIT_KEY).update(String(req.auth?.accountId ?? '')).digest('hex'),
  // Answered like a recorded event: the chat never waits on, or shows, this
  handler: (_req, res) => { res.json({ ok: true }); },
}));

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
