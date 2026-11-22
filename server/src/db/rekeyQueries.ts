import { prisma } from './prisma.js';

/*
 * A journal being re-encrypted under a new master key (Settings → change
 * password → "Also re-encrypt my journal"). The password and recovery wraps
 * already hold the NEW key; this row keeps the OLD key, sealed under the new
 * one (the server can't open it), until the browser has re-encrypted every
 * record and calls finish, which deletes the row. One row per account at most.
 */

export interface PendingRekey { rekeyId: string; oldKey: string; oldKeyIv: string; startedAt: string }

async function createRekeyTable(): Promise<void> {
  // `runner` / `runner_at`: which browser is running the job, and when it last
  // said so (claimRekey). `finished_at` is no longer written: a finished
  // re-key's row is deleted (finishRekey). The column stays for tables made
  // while a finished row was kept
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.account_rekey (
      account_id  INT PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
      rekey_id    TEXT NOT NULL,
      old_key     BYTEA NOT NULL,
      old_key_iv  BYTEA NOT NULL,
      started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      runner      TEXT,
      runner_at   TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `;
  // A table from before those columns: read first, an ALTER takes a lock even when there is nothing to add
  const cols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'account_rekey'
  `;
  const has = new Set(cols.map(c => c.column_name));
  if (!has.has('runner') || !has.has('runner_at') || !has.has('finished_at')) {
    await prisma.$executeRaw`ALTER TABLE public.account_rekey ADD COLUMN IF NOT EXISTS runner TEXT, ADD COLUMN IF NOT EXISTS runner_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ`;
  }
  // Rows of re-keys that finished while a finished row was still kept: their old key goes now
  await prisma.$executeRaw`DELETE FROM public.account_rekey WHERE finished_at IS NOT NULL`;
}

/**
 * The table, made once per process and again on the next call if that failed.
 * Every query here waits for it: each sign-in asks whether a re-key is pending,
 * so a table that failed to be made at startup must not turn every one of
 * those into an error.
 */
let tableReady: Promise<void> | null = null;
export function ensureRekeyTable(): Promise<void> {
  tableReady ??= createRekeyTable().catch(err => { tableReady = null; throw err; });
  return tableReady;
}
export const initRekeyTable = ensureRekeyTable;

/**
 * The statement that records a re-key (run inside the password change's
 * transaction). A plain INSERT: with one already under way it fails, and the
 * whole password change with it — replacing the row would drop the only copy
 * of the key the unmoved records are still under. The caller has awaited
 * `ensureRekeyTable` (through `getRekey`) before the transaction.
 */
export function insertRekey(accountId: number, rekeyId: string, oldKey: Uint8Array, oldKeyIv: Uint8Array) {
  return prisma.$executeRaw`
    INSERT INTO public.account_rekey (account_id, rekey_id, old_key, old_key_iv)
    VALUES (${accountId}, ${rekeyId}, ${oldKey}, ${oldKeyIv})
  `;
}

export async function getRekey(accountId: number): Promise<PendingRekey | null> {
  await ensureRekeyTable();
  const rows = await prisma.$queryRaw<{ rekey_id: string; old_key: Uint8Array; old_key_iv: Uint8Array; started_at: Date }[]>`
    SELECT rekey_id, old_key, old_key_iv, started_at FROM public.account_rekey WHERE account_id = ${accountId} AND finished_at IS NULL
  `;
  const r = rows[0];
  return r ? {
    rekeyId: r.rekey_id,
    oldKey: Buffer.from(r.old_key).toString('base64'),
    oldKeyIv: Buffer.from(r.old_key_iv).toString('base64'),
    startedAt: r.started_at.toISOString(),
  } : null;
}

/**
 * The statement that clears a leftover finished row (run in the password
 * change's transaction, before `insertRekey`), should one ever be there. One
 * still under way is never touched, so the insert after it still fails.
 */
export function dropFinishedRekey(accountId: number) {
  return prisma.$executeRaw`DELETE FROM public.account_rekey WHERE account_id = ${accountId} AND finished_at IS NOT NULL`;
}

/**
 * Every record is under the new key: the old key is done with, and its row is
 * deleted. Only the re-key named, and only for the browser that holds the job
 * (`claimRekey`) — the one that has just read everything and found nothing
 * left under the old key. Another session of the account can't drop the key
 * from under a run in progress.
 */
export async function finishRekey(accountId: number, rekeyId: string, runner: string): Promise<boolean> {
  await ensureRekeyTable();
  return (await prisma.$executeRaw`
    DELETE FROM public.account_rekey
    WHERE account_id = ${accountId} AND rekey_id = ${rekeyId} AND runner = ${runner} AND finished_at IS NULL
  `) === 1;
}

/** A runner that hasn't said so for this long has stopped (a closed tab, a sleeping laptop) */
export const RUNNER_STALE_SECONDS = 120;

/**
 * One browser at a time re-encrypts: `runner` takes (or keeps) the job when
 * nobody holds it, it holds it already, or the holder has gone quiet. One
 * atomic statement, so two can't both be told yes.
 */
export async function claimRekey(accountId: number, rekeyId: string, runner: string): Promise<{ pending: boolean; claimed: boolean }> {
  await ensureRekeyTable();
  const claimed = (await prisma.$executeRaw`
    UPDATE public.account_rekey SET runner = ${runner}, runner_at = NOW()
    WHERE account_id = ${accountId} AND rekey_id = ${rekeyId} AND finished_at IS NULL
      AND (runner IS NULL OR runner = ${runner} OR runner_at IS NULL OR runner_at < NOW() - make_interval(secs => ${RUNNER_STALE_SECONDS}::int))
  `) === 1;
  if (claimed) return { pending: true, claimed: true };
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM public.account_rekey WHERE account_id = ${accountId} AND rekey_id = ${rekeyId} AND finished_at IS NULL`;
  return { pending: rows.length > 0, claimed: false };
}
