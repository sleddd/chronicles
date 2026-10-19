/**
 * Will pg_dump backups work? Prints the same warning the server logs (per
 * database) when the tables outgrow max_locks_per_transaction, else says so.
 *
 *   npm run check:backups
 */
import './scriptEnv.js';
import { checkBackupLockCapacity } from './backupCheck.js';
import { disconnectShards } from './shards.js';

checkBackupLockCapacity()
  .then(warning => { if (!warning) console.log('Backups OK: every database has room to lock all its tables for pg_dump.'); })
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => disconnectShards());
