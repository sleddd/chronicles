/**
 * Bring every account's schema up to date now, one account at a time, instead
 * of on each account's first request (where hundreds at once under load are
 * slow: DDL makes every database connection rebuild its catalog cache). Safe
 * to re-run; a step that's already done costs a catalog read or a no-op.
 *
 *   npm run migrate:tenants             every step below
 *   npm run migrate:entry-sync          just entry-sync change tracking
 *   npm run migrate:tenants -- finance  any one step by name
 *
 * Uses the same environment as the server (server/.env), including
 * SHARD_DATABASE_URLS when there are several databases.
 */
import './scriptEnv.js';
import { prisma } from './prisma.js';
import {
  ensureTopicEncryptionColumns, ensureFinanceTables, ensureDoseRecordsTable, ensurePostSync, ensurePostSyncFunction,
} from './tenantQueries.js';
import { shardIds, shardClient, disconnectShards } from './shards.js';

const STEPS: Record<string, (schemaName: string) => Promise<void>> = {
  'topic-columns': ensureTopicEncryptionColumns,
  'finance': ensureFinanceTables,
  'dose-records': ensureDoseRecordsTable,
  'entry-sync': ensurePostSync,
};

async function main(): Promise<void> {
  const only = process.argv[2];
  if (only && !STEPS[only]) {
    console.error(`Unknown step "${only}". Steps: ${Object.keys(STEPS).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const steps = only ? [only] : Object.keys(STEPS);

  // The entry-sync trigger function lives once per database
  if (steps.includes('entry-sync')) for (const id of shardIds()) await ensurePostSyncFunction(shardClient(id));

  const accounts = await prisma.account.findMany({ select: { tenantSchemaName: true }, orderBy: { id: 'asc' } });
  console.log(`Running ${steps.join(', ')} for ${accounts.length} account(s)…`);
  const started = Date.now();
  let failed = 0;
  for (const [i, { tenantSchemaName }] of accounts.entries()) {
    for (const step of steps) {
      try {
        await STEPS[step](tenantSchemaName);
      } catch (err) {
        failed++;
        console.error(`${tenantSchemaName} (${step}): ${err instanceof Error ? err.message : err}`);
      }
    }
    if ((i + 1) % 500 === 0) console.log(`${i + 1} of ${accounts.length}…`);
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(failed ? `Done in ${secs}s with ${failed} failure(s) — re-run to retry them.` : `Done in ${secs}s: every account is up to date.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => disconnectShards());
