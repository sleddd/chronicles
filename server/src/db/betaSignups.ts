/**
 * See and manage beta applications, the waitlist and who may sign up.
 *
 *   npm run beta                          # seats, the waitlist and invites, with who's approved / signed up
 *   npm run beta -- --approve <email>     # may create an account now (no restart); adds them if they never applied
 *   npm run beta -- --unapprove <email>   # takes that back (an account already made stays)
 *   npm run beta -- --csv                 # everything as CSV (redirect to a file)
 *   npm run beta -- --remove <email>      # delete someone (on request, or after launch)
 *
 * Sign-up is closed to everyone not approved here (or listed in the optional
 * REGISTRATION_WHITELIST), unless the server sets REGISTRATION_OPEN=true. Send
 * approved testers the /sign-up link yourself.
 */
import './scriptEnv.js';
import { BETA_DETAILS } from '@chronicles/shared';
import { prisma } from './prisma.js';
import { approve, initBetaTable, listSignups, removeSignup, unapprove, type BetaSignup } from './betaQueries.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Applicants type these fields on a public form: a cell starting with a
// formula character gets a leading ' so a spreadsheet shows it as text
const csvCell = (v: string | null) => {
  if (v == null) return '';
  const safe = /^[=+\-@\t\r|]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** "approved", "signed up" or nothing — how far this person has got */
const progress = (r: BetaSignup) => (r.signedUp ? ' · signed up' : r.approvedAt ? ' · approved' : '');

async function main(): Promise<void> {
  await initBetaTable();
  const toApprove = arg('approve');
  if (toApprove) {
    const how = await approve(toApprove);
    console.log(how === 'invited'
      ? `Approved ${toApprove.trim().toLowerCase()} (added as an invite — they hadn't applied). They can sign up now.`
      : `Approved ${toApprove.trim().toLowerCase()}. They can sign up now.`);
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
  seats.forEach((r, i) => console.log(`  ${i + 1}. ${r.name} <${r.email}> — ${r.trackFirst}, ${r.device}${progress(r)}`));
  console.log(`\nWaitlist: ${waiting.length}`);
  waiting.forEach(r => console.log(`  ${r.email}${r.name ? ` (${r.name})` : ''}${progress(r)}`));
  if (invited.length) {
    console.log(`\nInvited (approved without applying): ${invited.length}`);
    invited.forEach(r => console.log(`  ${r.email}${progress(r)}`));
  }
  const pending = rows.filter(r => r.approvedAt && !r.signedUp).length;
  if (pending) console.log(`\n${pending} approved but not signed up yet — send them the /sign-up link.`);
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
