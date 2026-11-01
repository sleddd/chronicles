/**
 * One-off cleanup: drop each account's finance_paydays table, left from the
 * Reconcile feature (removed — Budget & bills' Current balance replaced it).
 * Nothing reads or writes it any more, and new accounts don't get one.
 *
 *   npm run finance:drop-paydays            # dry run — counts rows per tenant
 *   npm run finance:drop-paydays -- --apply # drops the tables (irreversible)
 *
 * Take a database backup first.
 */
import './scriptEnv.js';
import { prisma } from './prisma.js';
import { escapeSchema } from './escapeSchema.js';
import { tenantDb, disconnectShards } from './shards.js';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const accounts = await prisma.account.findMany({ select: { tenantSchemaName: true } });
  let tables = 0;
  let rows = 0;
  for (const { tenantSchemaName } of accounts) {
    const s = escapeSchema(tenantSchemaName);
    const db = await tenantDb(s);
    const [{ exists }] = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`, `${s}.finance_paydays`,
    );
    if (!exists) continue;
    const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM ${s}.finance_paydays`);
    const n = Number(count);
    tables++;
    rows += n;
    if (apply) await db.$executeRawUnsafe(`DROP TABLE IF EXISTS ${s}.finance_paydays`);
    console.log(`${s}: ${n} payday(s)${apply ? ', table dropped' : ''}`);
  }
  console.log(apply
    ? `Dropped ${tables} table(s) holding ${rows} payday(s).`
    : `Dry run: ${tables} table(s) holding ${rows} payday(s) would be dropped. Re-run with --apply to drop them.`);
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => disconnectShards());
