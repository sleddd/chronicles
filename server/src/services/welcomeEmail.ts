/* The beta welcome email (the owner's "Chronicles welcome email" design): sent by
   `npm run beta -- --approve <email>` through Resend with the person's one-time
   sign-up link. Table layout with inline styles, so Gmail / Outlook / Apple Mail
   draw it the same; fonts fall back to Helvetica / Arial (no web fonts in email).
   Everything typed by an applicant (their name) is escaped. */

const SUPPORT = 'support@mydailychronicles.com';
export const WELCOME_SUBJECT = 'Welcome to Chronicles';

const INTRO = 'Thank you for signing up. I built this app out of personal necessity to track my health, budget, fitness, journal, and media all in one secure place. I use it every day, and your feedback means a lot as I continue building.';
const STEPS: [string, string][] = [
  ['Save your recovery key.', 'Your entries are encrypted directly on your device before touching the server. Nobody else can read them or reset your password. If you lose access, your recovery key is the only way back in.'],
  ['Make it yours.', 'Turn modules on and off in settings and arrange your dashboard widgets in any order. Keep only what you use.'],
  ['Tell me what breaks.', 'Use the built-in bug report form or simply reply directly to this email. Every message gets read.'],
];
const BILLING = 'The beta is completely free. Billing will begin when Chronicles officially releases at no more than twenty dollars a month. No ads, no tracking, and no marketing emails.';

const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The first word of the name an applicant typed ("Sam Lee" → "Sam"); '' for none */
export function firstName(name: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  const clean = (name ?? '').replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').trim();
  const first = clean.split(/\s+/)[0]?.slice(0, 60) ?? '';
  // Anyone can apply under any name, and the greeting goes to the address they
  // typed: only something that reads as a name is used — never a web address
  // or anything a mail app would turn into a link
  return /^[\p{L}\p{M}'’-]+$/u.test(first) ? first : '';
}

const F = "font-family:'Open Sans',Helvetica,Arial,sans-serif;";
const LABEL = F + 'font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#575d68;padding:0 0 12px;border-bottom:1px solid #e6e8ec;';

function step(n: number, title: string, body: string): string {
  return `<tr>
    <td valign="top" width="34" style="padding:18px 0 0;">
      <div style="${F}width:24px;height:24px;line-height:24px;border-radius:12px;background:#e4f3f2;color:#1d6563;font-size:12px;font-weight:600;text-align:center;">${n}</div>
    </td>
    <td valign="top" style="padding:18px 0 0;${F}font-size:15px;line-height:1.6;color:#2e333b;">
      <strong style="color:#1f2128;font-weight:600;">${title}</strong><br>${body}
    </td></tr>`;
}

export interface WelcomeEmailInput {
  /** Their first name, or '' */
  name: string;
  email: string;
  /** Their one-time sign-up link */
  link: string;
  /** The sign-off under "Happy writing," */
  sig: string;
  /** The app's address, e.g. https://mydailychronicles.com (the logo and links) */
  site: string;
}

export function welcomeEmail({ name, email, link, sig, site }: WelcomeEmailInput): { subject: string; html: string; text: string } {
  const hello = name ? `Welcome to Chronicles, ${esc(name)}.` : 'Welcome to Chronicles.';
  const href = esc(link);
  const logo = esc(`${site}/icons/icon-192x192.png`);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(WELCOME_SUBJECT)}</title></head><body style="margin:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
  <tr><td style="padding:0 4px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><img src="${logo}" width="40" height="40" alt="" style="display:block;border:0;border-radius:9px;"></td>
      <td valign="middle" style="padding-left:12px;${F}font-size:19px;font-weight:600;color:#1f2128;letter-spacing:-.01em;">Chronicles</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:14px;padding:40px 40px 36px;">
    <div style="${LABEL}">Beta invite</div>
    <h1 style="margin:22px 0 14px;${F}font-size:26px;line-height:1.25;font-weight:600;color:#1f2128;">${hello}</h1>
    <p style="margin:0 0 14px;${F}font-size:16px;line-height:1.6;color:#2e333b;">${esc(INTRO)}</p>
    <p style="margin:0 0 28px;${F}font-size:16px;line-height:1.6;color:#2e333b;">Your account is ready whenever you are.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" style="border-radius:999px;background:#2b8784;">
        <a href="${href}" target="_blank" style="display:inline-block;padding:14px 30px;${F}font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">Create your account</a>
      </td></tr></table>
    <p style="margin:16px 0 0;${F}font-size:13px;line-height:1.5;color:#575d68;">This link is made for <span style="color:#1f2128;">${esc(email)}</span> and works for 30 days.</p>

    <div style="${LABEL}margin-top:36px;">Three quick things before you start</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${step(1, STEPS[0][0], esc(STEPS[0][1]))}
      ${step(2, STEPS[1][0], esc(STEPS[1][1]))}
      ${step(3, STEPS[2][0], `Use the built-in <a href="${esc(site)}/report-a-bug" style="color:#2b8784;text-decoration:underline;">bug report form</a> or simply reply directly to this email. Every message gets read.`)}
    </table>

    <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e6e8ec;${F}font-size:13px;line-height:1.55;color:#575d68;">${esc(BILLING)}</p>
    <p style="margin:24px 0 0;${F}font-size:16px;line-height:1.6;color:#2e333b;">Happy writing,<br><span style="color:#1f2128;font-weight:600;">${esc(sig || 'Chronicles')}</span></p>
  </td></tr>
  <tr><td align="center" style="padding:22px 16px 0;${F}font-size:12px;line-height:1.6;color:#7a808a;">
    You're receiving this because you applied for the Chronicles beta.<br>
    <a href="${esc(site)}" style="color:#575d68;text-decoration:none;">mydailychronicles.com</a> &nbsp;·&nbsp; <a href="mailto:${SUPPORT}" style="color:#575d68;text-decoration:none;">${SUPPORT}</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [
    name ? `Welcome to Chronicles, ${name}.` : 'Welcome to Chronicles.',
    INTRO,
    'Your account is ready whenever you are.',
    `Create your account here:\n${link}`,
    `This link is made for ${email} and works for 30 days.`,
    'Three quick things before you start:',
    ...STEPS.map(([t, b]) => `${t}\n${b}`),
    BILLING,
    `Happy writing,\n${sig || 'Chronicles'}`,
  ].join('\n\n');
  return { subject: WELCOME_SUBJECT, html, text };
}
