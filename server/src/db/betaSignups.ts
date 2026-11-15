/**
 * See and manage beta applications, the waitlist and who may sign up.
 *
 *   npm run beta                          # seats, the waitlist and invites, with who's approved / signed up
 *   npm run beta -- --approve <email>     # may create an account now (no restart); adds them if they never applied;
 *                                         # emails them the welcome email with their one-time sign-up link (Resend)
 *                                         # and prints the link (running it again issues a new one)
 *        [--name <first name>]            #   the name in "Welcome to Chronicles, Sam." (default: the first word they applied with)
 *        [--no-email]                     #   just print the link, send nothing
 *   npm run beta -- --unapprove <email>   # takes that back (an account already made stays)
 *   npm run beta -- --csv                 # everything as CSV (redirect to a file)
 *   npm run beta -- --remove <email>      # delete someone (on request, or after launch)
 *
 * Sign-up is closed to everyone not approved here (or listed in the optional
 * REGISTRATION_WHITELIST), unless the server sets REGISTRATION_OPEN=true.
 * --approve emails the person their sign-up link (services/welcomeEmail.ts,
 * through Resend: RESEND_API_KEY, from WELCOME_EMAIL_FROM, signed
 * WELCOME_EMAIL_SIGNOFF, replies to support) and prints it too, so it can be
 * sent by hand when the email can't go. The link carries their invite code,
 * which sign-up needs (only its hash is stored, so it can't be shown again —
 * approve again for a new one). The link is built on APP_URL (else CLIENT_URL,
 * else the site, https://mydailychronicles.com).
 */
import './scriptEnv.js';
import { BETA_DETAILS } from '@chronicles/shared';
import { prisma } from './prisma.js';
import { approve, initBetaTable, listSignups, printable, removeSignup, unapprove, type BetaSignup } from './betaQueries.js';
import { sendEmail } from '../services/resend.js';
import { firstName, welcomeEmail } from '../services/welcomeEmail.js';

const WELCOME_FROM = 'Chronicles <hello@mydailychronicles.com>';
const SUPPORT = 'support@mydailychronicles.com';
const SITE = 'https://mydailychronicles.com';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Applicants type these fields on a public form, so everything printed goes
// through printable(), and a cell starting with a formula character gets a
// leading ' so a spreadsheet shows it as text
const csvCell = (v: string | null) => {
  if (v == null) return '';
  const clean = printable(v);
  const safe = /^[=+\-@|]/.test(clean) ? `'${clean}` : clean;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** "approved", "signed up" or nothing — how far this person has got */
const progress = (r: BetaSignup) => (r.signedUp ? ' · signed up' : r.approvedAt ? ' · approved' : '');

async function main(): Promise<void> {
  await initBetaTable();
  const toApprove = arg('approve');
  if (toApprove) {
    const { how, inviteCode } = await approve(toApprove);
    const email = toApprove.trim().toLowerCase();
    // The site itself when neither is set: an invitation always goes to the
    // real app, and without an address the link was incomplete and no email went
    const base = (process.env.APP_URL || process.env.CLIENT_URL || SITE).replace(/\/$/, '');
    // After the #: a browser never sends that part, so the code stays out of
    // the host's access logs (the sign-up page still reads older ?… links)
    const link = `${base}/sign-up#${new URLSearchParams({ email, invite: inviteCode }).toString()}`;
    console.log(how === 'invited'
      ? `Approved ${email} (added as an invite — they hadn't applied).`
      : `Approved ${email}.`);
    if (!base) {
      console.log(`Their sign-up link (incomplete — set APP_URL to the app's address; no email sent):\n  ${link}`);
      return;
    }
    if (process.argv.includes('--no-email')) {
      console.log(`Send them this sign-up link (it only works for this email, lasts 30 days, and isn't stored — approve again for a new one):\n  ${link}`);
      return;
    }
    const applied = (await listSignups()).find(r => r.email === email);
    const name = firstName(arg('name') ?? applied?.name);
    const mail = welcomeEmail({ name, email, link, sig: process.env.WELCOME_EMAIL_SIGNOFF || 'Chronicles', site: base });
    const sent = await sendEmail({
      from: process.env.WELCOME_EMAIL_FROM || WELCOME_FROM,
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: process.env.BUG_REPORT_TO || SUPPORT,
    });
    if (sent.ok) {
      console.log(`Emailed them the welcome email${name ? ` (to ${printable(name)})` : ''} with their sign-up link. The link, in case they ask (only works for this email, lasts 30 days):\n  ${link}`);
    } else {
      const why = sent.reason === 'not-configured' ? 'RESEND_API_KEY isn\'t set' : sent.reason === 'refused' ? `Resend answered ${sent.status}` : 'Resend couldn\'t be reached';
      console.log(`The welcome email didn't send (${why}). Send them this sign-up link yourself (only works for this email, lasts 30 days):\n  ${link}`);
      process.exitCode = 1;
    }
    return;
  }
  const toUnapprove = arg('unapprove');
  if (toUnapprove) {
    const ok = await unapprove(toUnapprove);
    console.log(ok ? `${toUnapprove} is no longer approved. An account they already made is not affected.` : `${toUnapprove} isn't on the list.`);
    return;
  }
  const remove = arg('remove');
  if (remove) {
    const n = await removeSignup(remove);
    console.log(n ? `Removed ${remove}.` : `${remove} isn't on the list.`);
    return;
  }
  const rows = await listSignups();
  if (process.argv.includes('--csv')) {
    console.log('status,email,name,track_first,device,applied_at,created_at,approved_at,signed_up');
    for (const r of rows) {
      console.log([r.status, r.email, r.name, r.trackFirst, r.device, r.appliedAt?.toISOString() ?? null, r.createdAt.toISOString(),
        r.approvedAt?.toISOString() ?? null, r.signedUp ? 'yes' : 'no'].map(csvCell).join(','));
    }
    return;
  }
  const seats = rows.filter(r => r.status === 'seat');
  const waiting = rows.filter(r => r.status === 'waitlist');
  const invited = rows.filter(r => r.status === 'invited');
  console.log(`Beta seats: ${seats.length} of ${BETA_DETAILS.seats}`);
  seats.forEach((r, i) => console.log(`  ${i + 1}. ${printable(r.name ?? '')} <${printable(r.email)}> — ${printable(r.trackFirst ?? '')}, ${printable(r.device ?? '')}${progress(r)}`));
  console.log(`\nWaitlist: ${waiting.length}`);
  waiting.forEach(r => console.log(`  ${printable(r.email)}${r.name ? ` (${printable(r.name)})` : ''}${progress(r)}`));
  if (invited.length) {
    console.log(`\nInvited (approved without applying): ${invited.length}`);
    invited.forEach(r => console.log(`  ${printable(r.email)}${progress(r)}`));
  }
  const pending = rows.filter(r => r.approvedAt && !r.signedUp).length;
  if (pending) console.log(`\n${pending} approved but not signed up yet — send them their sign-up link (--approve <email> issues a new one).`);
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
