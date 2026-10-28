import { Router, type Request, type Response, type NextFunction } from 'express';
import { betaApplicationSchema } from '@chronicles/shared';
import { applyForBeta } from '../db/betaQueries.js';
import { betaLimiter } from '../middleware/rateLimiter.js';

/* Public landing page: beta applications. A seat while one is open, else the
   application waits on the waitlist. No account involved, and nothing here
   says how many seats are left. Posts need the X-Requested-With header (a plain cross-site
   form can't send it) and pass the per-IP betaLimiter. A filled honeypot gets
   the normal answer and saves nothing. */

const router = Router();

function requireXhr(req: Request, res: Response, next: NextFunction) {
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

// POST /api/beta/apply — a seat while one is open, else the waitlist
router.post('/apply', requireXhr, betaLimiter, async (req, res) => {
  const parsed = betaApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the form and try again' });
    return;
  }
  const d = parsed.data;
  try {
    // The same answer whatever happened — seat, waitlist, already applied or
    // caught by the honeypot — so the reply says nothing about seats or who applied
    if (!d.website) await applyForBeta({ email: d.email, name: d.name, trackFirst: d.trackFirst, device: d.device });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not send your application. Please try again.' });
  }
});


export default router;
