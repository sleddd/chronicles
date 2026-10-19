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
 * The app no longer reads any of these legacy forms (plaintext topic names,
 * plaintext dose logs, unsealed switches, no-AAD key wraps), so run this
 * before deploying: anything above 0 is data that account can no longer open.
 * The taxonomies name/icon columns stay (always NULL) — the topic queries
 * still select them.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';
import { tenantDb, disconnectShards } from './shards.js';
import { escapeSchema } from './escapeSchema.js';

const PRIVATE_FLAG_KEYS = [
  'foodEnabled', 'medicationEnabled', 'goalsEnabled', 'milestonesEnabled', 'exerciseEnabled', 'allergiesEnabled',
  'entertainmentEnabled', 'inspirationEnabled', 'financeEnabled', 'reconcileEnabled', 'cycleTrackingEnabled',
];

async function exists(db: PrismaClient, schema: string, table: string, column?: string): Promise<boolean> {
  const rows = column
    ? await db.$queryRawUnsafe<{ e: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS e`, schema, table, column)
    : await db.$queryRawUnsafe<{ e: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS e`, schema, table);
  return !!rows[0]?.e;
}

async function count(db: PrismaClient, sql: string, ...params: unknown[]): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(sql, ...params);
  return Number(rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const drop = process.argv.includes('--drop');
  const accounts = await prisma.account.findMany({ select: { id: true, tenantSchemaName: true }, orderBy: { id: 'asc' } });
  // Accounts confirmed on the AAD key wrap (marked at registration or by the
  // old upgrade step); the table stays in the database as that record
  const marked = (await exists(prisma, 'public', 'key_wrap_status'))
    ? new Set((await prisma.$queryRaw<{ account_id: number }[]>`SELECT account_id FROM public.key_wrap_status`).map(r => r.account_id))
    : new Set<number>();
  const totals = { topics: 0, doses: 0, flags: 0, keyWraps: 0 };

  for (const { id, tenantSchemaName } of accounts) {
    const s = escapeSchema(tenantSchemaName);
    const db = await tenantDb(s);
    const topics = await count(db, `SELECT COUNT(*) AS n FROM ${s}.taxonomies WHERE name IS NOT NULL`);
    const legacyDoses = (await exists(db, s, 'medication_dose_logs')) ? await count(db, `SELECT COUNT(*) AS n FROM ${s}.medication_dose_logs`) : 0;
    const flags = await count(db,
      `SELECT COUNT(*) AS n FROM ${s}.settings WHERE key = ANY($1::text[]) AND jsonb_typeof(value) = 'boolean'`, PRIVATE_FLAG_KEYS);
    const keyWrap = marked.has(id) ? 0 : 1;
    totals.topics += topics; totals.doses += legacyDoses; totals.flags += flags; totals.keyWraps += keyWrap;
    if (topics || legacyDoses || flags || keyWrap) {
      console.log(`account ${id}: ${topics} plaintext topic name(s), ${legacyDoses} legacy dose log(s), ${flags} unsealed switch(es)${keyWrap ? ', key wrap not yet confirmed current' : ''}`);
    }
    if (drop && legacyDoses === 0 && (await exists(db, s, 'medication_dose_logs'))) {
      await db.$executeRawUnsafe(`DROP TABLE ${s}.medication_dose_logs`);
      console.log(`account ${id}: dropped the emptied legacy dose table`);
    }
  }

  console.log(`\n${accounts.length} account(s). Still to migrate: ${totals.topics} topic name(s), ${totals.doses} dose log(s), ${totals.flags} switch(es), ${totals.keyWraps} key wrap(s).`);
  if (!totals.topics && !totals.doses && !totals.flags && !totals.keyWraps) {
    console.log('All done: every account is on the current formats.');
  }
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => disconnectShards());
