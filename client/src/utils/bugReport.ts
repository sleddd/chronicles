/* Bug reports go by email to support (no server storage, no telemetry): the
   form builds a mailto: link the reporter's own email app sends. */

export const SUPPORT_EMAIL = 'support@mydailychronicles.com';

export const BUG_AREAS = [
  'Dashboard', 'Journal', 'Topics', 'Health', 'Planning', 'Calendar', 'Kitchen', 'Finance',
  'In-App AI', 'Settings', 'Signing in or signing up', 'Home page', 'Something else',
] as const;

export interface BugReport {
  area: string;
  happened: string;
  steps: string;
  device: string;
  replyTo: string;
}

/** "Safari on iPhone" from a user-agent string — a readable guess the reporter can edit */
export function deviceLabel(ua: string): string {
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua)) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
            : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari' : '';
  if (browser && os) return `${browser} on ${os}`;
  return browser || os;
}

/** The email the reporter's app opens with: subject + a plain-text body */
export function bugEmail(r: BugReport): { subject: string; body: string; href: string } {
  const subject = `Bug report: ${r.area}`;
  const lines = [
    `Where: ${r.area}`,
    '',
    'What happened:',
    r.happened.trim(),
    ...(r.steps.trim() ? ['', 'What I was doing:', r.steps.trim()] : []),
    ...(r.device.trim() ? ['', `Device and browser: ${r.device.trim()}`] : []),
    ...(r.replyTo.trim() ? ['', `Reply to: ${r.replyTo.trim()}`] : []),
  ];
  const body = lines.join('\n');
  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, href };
}
