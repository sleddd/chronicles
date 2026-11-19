import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { analyticsEventSchema } from '@chronicles/shared';
import { recordCrisisCard, recordMinorDetected } from '../db/analyticsQueries.js';
import { sharedRateLimitStore } from '../services/sharedState.js';

/* App analytics. Mounted behind quietAuthMiddleware only so strangers can't
   stuff the counts — the session check here never moves lastActiveAt (a
   session row written in the same moment as a count would tie the two), the
   handler never reads req.auth beyond the limiter's keyed hash and never logs.
   There is ONE address for every event, POST /api/analytics/event, with the
   event in the body: an access log shows only that "an analytics event" was
   sent, never which. The browser also holds each event back a random while
   (useAnalyticsQueue), so the request's time says nothing about the moment. */

const router = Router();

// The limiter's key: an HMAC of the account and the current hour under a
// server key that never touches the database (SECRETS_ENCRYPTION_KEY, else
// derived from DATABASE_URL), so every instance agrees on it — the count lives
// in the shared store per "Several server instances" — while a copy of the
// database alone can't turn a key back into an account, and a key changes
// every hour, so even with the secret it links at most an hour of events.
function limiterKey(): Buffer {
  const label = 'chronicles:analytics-limit:v1';
  const configured = process.env.SECRETS_ENCRYPTION_KEY || process.env.CALENDAR_TOKEN_KEY;
  if (configured) return crypto.createHmac('sha256', Buffer.from(configured, 'base64')).update(label).digest();
  if (process.env.DATABASE_URL) return crypto.createHmac('sha256', process.env.DATABASE_URL).update(label).digest();
  return crypto.randomBytes(32);
}
const LIMIT_KEY = limiterKey();
const HOUR_MS = 60 * 60 * 1000;

// One account can't run the counts up either: a handful of events an hour.
// (The app shows a crisis card at most a few times a session.)
router.use(rateLimit({
  store: sharedRateLimitStore('analytics'),
  windowMs: HOUR_MS,
  max: 6,
  standardHeaders: false,
  legacyHeaders: false,
  // Only events that were counted use up the allowance (a refused body records nothing)
  skipFailedRequests: true,
  keyGenerator: (req) => crypto.createHmac('sha256', LIMIT_KEY)
    .update(`${req.auth?.accountId ?? ''}:${Math.floor(Date.now() / HOUR_MS)}`).digest('hex'),
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
