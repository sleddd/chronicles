import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { bugReportSchema, type BugReportInput } from '@chronicles/shared';
import { bugReportLimiter } from '../middleware/rateLimiter.js';
import { sendEmail } from '../services/resend.js';

/* POST /api/bug-report — public (works signed in or out). Feedback or a bug report, sent on
   to support by email through Resend and never stored or logged: no account,
   no IP, no content in the logs. Posts need X-Requested-With (a plain
   cross-site form can't send it) and pass the per-IP bugReportLimiter. A filled
   honeypot gets the normal answer and sends nothing.

   Env: RESEND_API_KEY (unset = 503, and the form falls back to the reporter's
   own email app), BUG_REPORT_FROM (a sender on a domain verified in Resend),
   BUG_REPORT_TO (default support@mydailychronicles.com). */

const DEFAULT_TO = 'support@mydailychronicles.com';
const DEFAULT_FROM = 'Chronicles bug reports <bugs@mydailychronicles.com>';

const router = Router();

function requireXhr(req: Request, res: Response, next: NextFunction) {
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

/** The email support gets: subject + a plain-text body (no HTML, so nothing typed can render) */
export function bugReportEmail(r: BugReportInput): { subject: string; text: string } {
  const feedback = r.kind === 'feedback';
  const lines = [
    `Where: ${r.area}`,
    '',
    feedback ? 'Feedback:' : 'What happened:',
    r.happened,
    ...(r.steps ? ['', 'What I was doing:', r.steps] : []),
    ...(r.device ? ['', `Device and browser: ${r.device}`] : []),
    '',
    r.replyTo ? `Reply to: ${r.replyTo}` : 'No reply address given.',
  ];
  return { subject: `${feedback ? 'Feedback' : 'Bug report'}: ${r.area}`, text: lines.join('\n') };
}

router.post('/', requireXhr, bugReportLimiter, express.json({ limit: '64kb' }), async (req, res) => {
  const parsed = bugReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the form and try again' });
    return;
  }
  const r = parsed.data;
  if (r.website) { res.json({ ok: true }); return; }

  const { subject, text } = bugReportEmail(r);
  const sent = await sendEmail({
    from: process.env.BUG_REPORT_FROM || DEFAULT_FROM,
    to: process.env.BUG_REPORT_TO || DEFAULT_TO,
    subject,
    text,
    ...(r.replyTo ? { replyTo: r.replyTo } : {}),
  });
  if (sent.ok) { res.json({ ok: true }); return; }
  if (sent.reason === 'not-configured') { res.status(503).json({ error: 'Sending reports isn’t set up here' }); return; }
  // Status only — Resend's answer can echo the report back
  console.error(`Bug report: Resend ${sent.reason === 'refused' ? `answered ${sent.status}` : 'could not be reached'}`);
  res.status(502).json({ error: 'The report didn’t send' });
});

export default router;
