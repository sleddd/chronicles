/**
 * An account's passkeys, straight from the database: list them, or remove
 * them all so the account starts clean (it signs in with its password and
 * adds a passkey again in Settings → Security).
 *
 *   npm run passkeys -- person@example.com            # list (changes nothing)
 *   npm run passkeys -- person@example.com --clear    # remove every one
 *
 * Removing them here also signs the account out everywhere, like Remove all
 * passkeys in Settings. Passkeys saved on a device or in a password manager
 * are not touched: delete those there, or they are offered at sign-in and
 * refused ("isn't on your account").
 */
import './scriptEnv.js';
import { normalizeEmail } from '@chronicles/shared';
import { prisma } from './prisma.js';
import { initPasskeysTable, listPasskeys, removeAllPasskeys } from './passkeyQueries.js';
import { revokeAllSessions } from '../middleware/auth.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : 'never');

async function main(): Promise<void> {
  const email = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!email) throw new Error('Usage: npm run passkeys -- <email> [--clear]');
  const account = await prisma.account.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
  if (!account) throw new Error('No account with that email');
  await initPasskeysTable();

  const passkeys = await listPasskeys(account.id);
  if (passkeys.length === 0) { console.log('That account has no passkeys stored.'); return; }
  console.log(`${passkeys.length} passkey${passkeys.length === 1 ? '' : 's'} stored:`);
  for (const p of passkeys) {
    console.log(`  #${p.id}  "${p.name}"  added ${day(p.createdAt)}  last used ${day(p.lastUsedAt)}  ${p.backedUp ? 'synced' : 'this device only'}  counter ${p.signCount}  id ${p.credentialId.slice(0, 12)}…`);
  }
  if (!process.argv.includes('--clear')) { console.log('Nothing changed. Add --clear to remove them all.'); return; }

  const removed = await removeAllPasskeys(account.id);
  await revokeAllSessions(account.id, undefined, 'passkey_removed');
  console.log(`Removed ${removed}. The account is signed out everywhere; sign in with the password and add a passkey again.`);
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
