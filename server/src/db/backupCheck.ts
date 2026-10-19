import { prisma } from './prisma.js';

// pg_dump locks every table it dumps in one transaction. Each user is a schema
// of ~12-16 tables, and the lock table holds about max_locks_per_transaction ×
// (max_connections + max_prepared_transactions) entries, plus some slack. In
// the load test on default settings (6,400) dumps failed with "out of shared
// memory" from ~13,000 tables, i.e. around 1,000 users. Physical backups
// (point-in-time recovery) aren't affected; anything that runs pg_dump is.

export interface LockCapacity {
  tables: number;
  maxLocks: number;
  maxConnections: number;
  maxPrepared: number;
}

/** Warn from 1.5× the nominal capacity: dumps failed at about 2× in testing. */
export function dumpLockAdvice(c: LockCapacity): string | null {
  const capacity = c.maxLocks * (c.maxConnections + c.maxPrepared);
  if (c.tables <= capacity * 1.5) return null;
  // Room for twice today's tables, in steps of 64
  const suggested = Math.ceil((c.tables * 2) / (c.maxConnections + c.maxPrepared) / 64) * 64;
  return `Backups: the database has ${c.tables} tables but room for about ${capacity} locks `
    + `(max_locks_per_transaction ${c.maxLocks} × ${c.maxConnections + c.maxPrepared} connections). `
    + `pg_dump will soon fail with "out of shared memory" (it locks every table). `
    + `Set max_locks_per_transaction to at least ${suggested}, or rely on physical backups, and test a restore.`;
}

/** Read the numbers from the database and log a warning when backups are at risk. */
export async function checkBackupLockCapacity(): Promise<string | null> {
  const [row] = await prisma.$queryRawUnsafe<{ tables: bigint; max_locks: string; max_connections: string; max_prepared: string }[]>(
    `SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                AND n.nspname NOT LIKE 'pg_toast%') AS tables,
            current_setting('max_locks_per_transaction') AS max_locks,
            current_setting('max_connections') AS max_connections,
            current_setting('max_prepared_transactions') AS max_prepared`
  );
  const advice = dumpLockAdvice({
    tables: Number(row.tables),
    maxLocks: Number(row.max_locks),
    maxConnections: Number(row.max_connections),
    maxPrepared: Number(row.max_prepared),
  });
  if (advice) console.warn(`WARNING: ${advice}`);
  return advice;
}
