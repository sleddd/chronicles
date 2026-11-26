/**
 * Turn In-App AI off for an account (believed to belong to someone under 18,
 * or for any other reason; clears its consent), or back on. Turning it back on
 * also ends a pause and forgets the account's declined requests, so a block
 * made by the declined-request ladder (20 in 30 days) starts afresh.
 *
 * A block made by hand (believed under 18, say) is only lifted with --force,
 * so it isn't lifted by mistake for one made by the ladder.
 *
 *   npm run ai:block -- person@example.com
 *   npm run ai:block -- person@example.com --unblock [--force]
 */
import './scriptEnv.js';
import { normalizeEmail } from '@chronicles/shared';
import { prisma } from './prisma.js';
import { getAiBlockReason, initAiChatTable, setAiChatBlocked, unblockAiChat } from './aiChatQueries.js';

async function main(): Promise<void> {
  const email = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!email) throw new Error('Usage: npm run ai:block -- <email> [--unblock [--force]]');
  const unblock = process.argv.includes('--unblock');
  const account = await prisma.account.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
  if (!account) throw new Error('No account with that email');
  await initAiChatTable();
  if (unblock) {
    const reason = await getAiBlockReason(account.id);
    if (reason === 'operator' && !process.argv.includes('--force')) {
      throw new Error('That account was turned off by hand (for example, believed to be under 18), not by declined requests. Add --force to turn it back on anyway.');
    }
    await unblockAiChat(account.id);
  } else {
    await setAiChatBlocked(account.id, true, 'operator');
  }
  console.log(unblock
    ? 'In-App AI turned back on for that account (pause cleared, declined requests forgotten).'
    : 'In-App AI turned off for that account.');
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
