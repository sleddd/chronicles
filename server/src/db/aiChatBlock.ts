/**
 * Turn the In-App AI chat off for an account believed to belong to someone
 * under 18 (clears its consent), or back on.
 *
 *   npm run ai:block -- person@example.com
 *   npm run ai:block -- person@example.com --unblock
 */
import { normalizeEmail } from '@chronicles/shared';
import { prisma } from './prisma.js';
import { initAiChatTable, setAiChatBlocked } from './aiChatQueries.js';

async function main(): Promise<void> {
  const email = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!email) throw new Error('Usage: npm run ai:block -- <email> [--unblock]');
  const unblock = process.argv.includes('--unblock');
  const account = await prisma.account.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
  if (!account) throw new Error('No account with that email');
  await initAiChatTable();
  await setAiChatBlocked(account.id, !unblock);
  console.log(unblock ? 'AI chat turned back on for that account.' : 'AI chat turned off for that account.');
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
