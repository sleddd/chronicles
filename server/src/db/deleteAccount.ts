/**
 * Delete an account for someone who can't do it in the app (locked out, or an
 * account believed to belong to someone under 18). Revokes Google Calendar
 * access at Google first, then drops the tenant schema and the account row
 * (sessions, shares, calendar integration and AI consent cascade).
 * Verify the request by replying to the account's email address first.
 *
 *   npm run account:delete -- person@example.com          # dry run
 *   npm run account:delete -- person@example.com --yes    # deletes (irreversible)
 */
import './scriptEnv.js';
import { normalizeEmail } from '@chronicles/shared';
import { prisma } from './prisma.js';
import { deleteAccountById } from './schemaManager.js';
import { disconnectShards } from './shards.js';
import { revokeGoogleAccess } from '../services/googleRevoke.js';

async function main(): Promise<void> {
  const email = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!email) throw new Error('Usage: npm run account:delete -- <email> [--yes]');
  const account = await prisma.account.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, createdAt: true, calendarIntegration: { select: { googleRefreshToken: true } } },
  });
  if (!account) throw new Error('No account with that email');
  const hasGoogle = !!account.calendarIntegration?.googleRefreshToken;
  if (!process.argv.includes('--yes')) {
    console.log(`Found the account (created ${account.createdAt.toISOString().slice(0, 10)}${hasGoogle ? ', Google Calendar connected' : ''}).`);
    console.log('Dry run — re-run with --yes to delete it. This cannot be undone.');
    return;
  }
  const revoked = await revokeGoogleAccess(account.id);
  await deleteAccountById(account.id);
  console.log(`Account deleted${hasGoogle ? (revoked ? '; Google access revoked' : '; Google revoke FAILED — revoke it at myaccount.google.com or ask the person to') : ''}.`);
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => disconnectShards());
