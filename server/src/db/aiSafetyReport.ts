/**
 * AI chat safety report — run only when one is requested. Counts how often
 * the crisis card was shown, by rating and kind of risk, between two days.
 * The analytics rows hold no account, so neither does the report.
 *
 *   npm run report:ai-safety -- --from 2026-01-01 --to 2026-12-31
 */
import { prisma } from './prisma.js';
import { countCrisisCards } from './analyticsQueries.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const year = new Date().getFullYear() - 1;
  const from = arg('from') ?? `${year}-01-01`;
  const to = arg('to') ?? `${year}-12-31`;
  if (![from, to].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('Dates must be YYYY-MM-DD');
  const rows = await countCrisisCards(from, to);
  const total = rows.reduce((n, r) => n + r.count, 0);
  console.log(`Crisis card shown, ${from} to ${to}: ${total}`);
  for (const r of rows) console.log(`  ${r.rating.padEnd(9)} ${r.riskKind.padEnd(16)} ${r.count}`);
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
