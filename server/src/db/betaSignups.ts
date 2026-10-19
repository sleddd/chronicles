/**
 * See and manage beta applications and the waitlist from the landing page.
 *
 *   npm run beta                      # list seats, then the waitlist
 *   npm run beta -- --csv             # the same as CSV (redirect to a file)
 *   npm run beta -- --remove <email>  # delete someone (on request, or after launch)
 *
 * A seat doesn't create an account: add the email to REGISTRATION_WHITELIST so
 * they can sign up at /sign-up.
 */
import { BETA_DETAILS } from '@chronicles/shared';
import { prisma } from './prisma.js';
import { initBetaTable, listSignups, removeSignup } from './betaQueries.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const csvCell = (v: string | null) => (v == null ? '' : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

async function main(): Promise<void> {
  await initBetaTable();
  const remove = arg('remove');
  if (remove) {
    const n = await removeSignup(remove);
    console.log(n ? `Removed ${remove}.` : `${remove} isn't on the list.`);
    return;
  }
  const rows = await listSignups();
  if (process.argv.includes('--csv')) {
    console.log('status,email,name,track_first,device,applied_at,created_at');
    for (const r of rows) {
      console.log([r.status, r.email, r.name, r.trackFirst, r.device, r.appliedAt?.toISOString() ?? null, r.createdAt.toISOString()].map(csvCell).join(','));
    }
    return;
  }
  const seats = rows.filter(r => r.status === 'seat');
  const waiting = rows.filter(r => r.status === 'waitlist');
  console.log(`Beta seats: ${seats.length} of ${BETA_DETAILS.seats}`);
  seats.forEach((r, i) => console.log(`  ${i + 1}. ${r.name} <${r.email}> — ${r.trackFirst}, ${r.device}`));
  console.log(`\nWaitlist: ${waiting.length}`);
  waiting.forEach(r => console.log(`  ${r.email}${r.name ? ` (${r.name}, applied)` : ''}`));
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
