import { z } from 'zod';

/* Feedback or a bug report from /report-a-bug or Settings → Feedback/Report a Bug, sent on by the
   server to support through Resend. Nothing is stored. Lengths match the form. */

// No control characters or bidi overrides in the one-line fields (they go into an email subject / header)
// eslint-disable-next-line no-control-regex
const ONE_LINE = /^[^\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]*$/;

export const BUG_REPORT_KINDS = ['feedback', 'bug'] as const;

export const bugReportSchema = z.object({
  /** Feedback (an idea, a suggestion) or a bug report; older clients send neither */
  kind: z.enum(BUG_REPORT_KINDS).optional().default('bug'),
  area: z.string().trim().min(1).max(60).regex(ONE_LINE),
  happened: z.string().trim().min(1, 'Write something first').max(4000),
  steps: z.string().trim().max(4000).optional().default(''),
  device: z.string().trim().max(120).regex(ONE_LINE).optional().default(''),
  replyTo: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email address').max(254)]).optional().default(''),
  /** Honeypot: people never fill it */
  website: z.string().max(200).optional(),
}).strict();

export type BugReportInput = z.infer<typeof bugReportSchema>;
