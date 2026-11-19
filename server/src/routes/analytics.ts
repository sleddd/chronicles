import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { analyticsEventSchema } from '@chronicles/shared';
import { recordCrisisCard, recordMinorDetected } from '../db/analyticsQueries.js';

/* App analytics. Mounted behind quietAuthMiddleware only so strangers can't
   stuff the counts — the session check here never moves lastActiveAt (a
   session row written in the same moment as a count would tie the two), the
   handler never reads req.auth beyond the limiter's in-memory keyed hash and never logs.
   There is ONE address for every event, POST /api/analytics/event, with the
   event in the body: an access log shows only that "an analytics event" was
   sent, never which. The browser also holds each event back a random while
   (queueAnalyticsEvent in client/src/services/analyticsQueue.ts), so the request's time says nothing about the moment. */

const router = Router();

// One account can't run the counts up either: a handful of events an hour.
// (The app shows a crisis card at most a few times a session.) Counted in this
// process's memory only, under a key made with a secret that lives and dies
// with the process — never stored, never logged, and not the account id. It
// is deliberately not shared between instances: a shared count would have to
// sit in the database under a stable key, and account ids are small numbers,
// so anyone with the server secret could test each one and see who sent which
// event when. With N instances an account gets up to N × 6 an hour — fine for
// an anonymous counter.
const LIMIT_KEY = crypto.randomBytes(32);

router.use(rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  standardHeaders: false,
  legacyHeaders: false,
  // Only events that were counted use up the allowance (a refused body records nothing)
  skipFailedRequests: true,
  keyGenerator: (req) => crypto.createHmac('sha256', LIMIT_KEY).update(String(req.auth?.accountId ?? '')).digest('hex'),
  // Answered like a recorded event: the chat never waits on, or shows, this
  handler: (_req, res) => { res.json({ ok: true }); },
}));

// POST /api/analytics/event — { event: 'crisis_card_shown', rating, kind } | { event: 'minor_detected' }
router.post('/event', async (req, res) => {
  const parsed = analyticsEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid event' });
    return;
  }
  try {
    if (parsed.data.event === 'crisis_card_shown') await recordCrisisCard(parsed.data.rating, parsed.data.kind);
    else await recordMinorDetected();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// The old per-event addresses named the event in the URL: gone for good
router.post(['/crisis-card', '/minor-detected'], (_req, res) => {
  res.status(410).json({ error: 'Gone' });
});

export default router;
