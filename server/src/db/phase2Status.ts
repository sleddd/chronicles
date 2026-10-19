/**
 * Phase 2 migration status: what's still readable that the browser moves inside
 * the encryption on each user's next unlock. Per account (by tenant schema):
 * topic names still in plaintext, legacy plaintext dose logs, feature switches
 * or Cycle Tracking still saved unsealed, and whether the master key is known
 * to be on the current (AAD) wrap format. Prints no names or data — counts only.
 *
 *   npm run migrate:phase2-status           # report
 *   npm run migrate:phase2-status -- --drop # drop emptied legacy dose tables
 *
 * When everything reads 0: remove the "not opened since the update" line from
 * the privacy policy's readable items, and the no-AAD fallback in
 * shared/src/crypto/primitives.ts (unwrapKeyDetailed). The taxonomies name/icon
 * columns stay (always NULL) — the topic queries still select them.
 */
import { prisma } from './prisma.js';
import { escapeSchema } from './escapeSchema.js';
import { initKeyWrapTable } from './keyWrapQueries.js';

const PRIVATE_FLAG_KEYS = [
  'foodEnabled', 'medicationEnabled', 'goalsEnabled', 'milestonesEnabled', 'exerciseEnabled', 'allergiesEnabled',
  'entertainmentEnabled', 'inspirationEnabled', 'financeEnabled', 'reconcileEnabled', 'cycleTrackingEnabled',
];

async function exists(schema: string, table: string, column?: string): Promise<boolean> {
  const rows = column
    ? await prisma.$queryRawUnsafe<{ e: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS e`, schema, table, column)
    : await prisma.$queryRawUnsafe<{ e: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS e`, schema, table);
  return !!rows[0]?.e;
}

async function count(sql: string, ...params: unknown[]): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql, ...params);
  return Number(rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const drop = process.argv.includes('--drop');
  await initKeyWrapTable();
  const accounts = await prisma.account.findMany({ select: { id: true, tenantSchemaName: true }, orderBy: { id: 'asc' } });
  const marked = new Set((await prisma.$queryRaw<{ account_id: number }[]>`SELECT account_id FROM public.key_wrap_status`).map(r => r.account_id));
  const totals = { topics: 0, doses: 0, flags: 0, keyWraps: 0 };

  for (const { id, tenantSchemaName } of accounts) {
    const s = escapeSchema(tenantSchemaName);
    const topics = await count(`SELECT COUNT(*) AS n FROM ${s}.taxonomies WHERE name IS NOT NULL`);
    const legacyDoses = (await exists(s, 'medication_dose_logs')) ? await count(`SELECT COUNT(*) AS n FROM ${s}.medication_dose_logs`) : 0;
    const flags = await count(
      `SELECT COUNT(*) AS n FROM ${s}.settings WHERE key = ANY($1::text[]) AND jsonb_typeof(value) = 'boolean'`, PRIVATE_FLAG_KEYS);
    const keyWrap = marked.has(id) ? 0 : 1;
    totals.topics += topics; totals.doses += legacyDoses; totals.flags += flags; totals.keyWraps += keyWrap;
    if (topics || legacyDoses || flags || keyWrap) {
      console.log(`account ${id}: ${topics} plaintext topic name(s), ${legacyDoses} legacy dose log(s), ${flags} unsealed switch(es)${keyWrap ? ', key wrap not yet confirmed current' : ''}`);
    }
    if (drop && legacyDoses === 0 && (await exists(s, 'medication_dose_logs'))) {
      await prisma.$executeRawUnsafe(`DROP TABLE ${s}.medication_dose_logs`);
      console.log(`account ${id}: dropped the emptied legacy dose table`);
    }
  }

  console.log(`\n${accounts.length} account(s). Still to migrate: ${totals.topics} topic name(s), ${totals.doses} dose log(s), ${totals.flags} switch(es), ${totals.keyWraps} key wrap(s).`);
  if (!totals.topics && !totals.doses && !totals.flags && !totals.keyWraps) {
    console.log('All done: remove the policy\'s "not opened since the update" line and the no-AAD unwrap fallback.');
  }
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
