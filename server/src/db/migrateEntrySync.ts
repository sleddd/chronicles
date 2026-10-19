/**
 * One-off, after deploying entry sync: add change tracking to every account
 * now, one at a time, instead of on each account's first request. Each
 * account's setup is a few DDL statements, and DDL makes every database
 * connection rebuild its catalog cache, so hundreds of accounts doing it at
 * once under load is slow. Safe to re-run; accounts already set up cost one
 * catalog read.
 *
 *   npm run migrate:entry-sync     (with the same SHARD_DATABASE_URLS as the server)
 */
import { prisma } from './prisma.js';
import { ensurePostSync, ensurePostSyncFunction } from './tenantQueries.js';
import { shardIds, shardClient, disconnectShards } from './shards.js';

async function main(): Promise<void> {
  for (const id of shardIds()) await ensurePostSyncFunction(shardClient(id));
  const accounts = await prisma.account.findMany({ select: { tenantSchemaName: true }, orderBy: { id: 'asc' } });
  const started = Date.now();
  let failed = 0;
  for (const [i, { tenantSchemaName }] of accounts.entries()) {
    try {
      await ensurePostSync(tenantSchemaName);
    } catch (err) {
      failed++;
      console.error(`${tenantSchemaName}: ${err instanceof Error ? err.message : err}`);
    }
    if ((i + 1) % 500 === 0) console.log(`${i + 1} of ${accounts.length}…`);
  }
  console.log(`Entry sync ready for ${accounts.length - failed} of ${accounts.length} account(s) in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => disconnectShards());
