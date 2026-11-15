/* Sending email through Resend's API (https://resend.com/docs/api-reference/emails/send-email).
   Used for bug reports (to support) and beta invitations (to the person approved).
   Never logs what an email says — only Resend's status when it refuses. */

const RESEND_URL = 'https://api.resend.com/emails';

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export type SendResult = { ok: true } | { ok: false; reason: 'not-configured' | 'refused' | 'unreachable'; status?: number };

/** True when RESEND_API_KEY is set */
export const resendConfigured = (): boolean => !!process.env.RESEND_API_KEY;

export async function sendEmail(mail: OutgoingEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: 'not-configured' };
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, reason: 'refused', status: res.status };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
