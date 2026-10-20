/**
 * Switch the app-wide notice banner on or off (e.g. a security incident
 * notice — emailed breach notices must be paired with one in the app).
 *
 *   npm run notice -- --set "We're investigating a security issue…" [--link https://…]
 *   npm run notice -- --clear
 *   npm run notice                  # shows the current notice
 */
import './scriptEnv.js';
import { prisma } from './prisma.js';
import { clearNotice, getActiveNotice, initAppNoticeTable, setNotice } from './appNoticeQueries.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await initAppNoticeTable();
  if (process.argv.includes('--clear')) {
    await clearNotice();
    console.log('Notice cleared.');
    return;
  }
  const message = arg('set');
  if (message) {
    const link = arg('link') ?? null;
    if (link && !/^https:\/\//.test(link)) throw new Error('The link must start with https://');
    await setNotice(message.slice(0, 500), link);
    console.log('Notice is on.');
    return;
  }
  const current = await getActiveNotice();
  console.log(current ? `Current notice: ${current.message}${current.linkUrl ? ` (${current.linkUrl})` : ''}` : 'No notice is on.');
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
