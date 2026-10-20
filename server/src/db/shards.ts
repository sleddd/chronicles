import type { PrismaClient } from '@prisma/client';
import { prisma, createPooledClient } from './prisma.js';
import { escapeSchema } from './escapeSchema.js';
import { ensurePostSyncFunction } from './tenantQueries.js';

// Each user is a Postgres schema; a database comfortably holds a few thousand
// (see docs/SCALE_TEST_REPORT.md). Past that, user schemas go on further
// databases ("shards"). The main database (DATABASE_URL) keeps accounts,
// sessions and the shared tables, and is also shard 1 — so with no extra
// shards configured nothing changes. Each account's shard is
// accounts.shard_id; new accounts go to the first shard with room.
//
//   SHARD_DATABASE_URLS  extra shards, "2=postgresql://…  3=postgresql://…"
//                        (space, newline or ; separated). Connection strings
//                        stay in the environment, never in the database.
//   SHARD_CAPACITY       accounts per shard before new ones go to the next (5000)
//
// A shard id, once used, must keep pointing at the same database.

export const MAIN_SHARD = 1;

function parseShardUrls(raw: string | undefined): Map<number, string> {
  const urls = new Map<number, string>();
  for (const part of (raw ?? '').split(/[\s;]+/).filter(Boolean)) {
    const m = /^(\d+)=(postgres(?:ql)?:\/\/.+)$/.exec(part);
    if (!m) throw new Error('SHARD_DATABASE_URLS: each entry must be <id>=postgresql://…');
    const id = Number(m[1]);
    if (id === MAIN_SHARD) throw new Error('SHARD_DATABASE_URLS: shard 1 is DATABASE_URL; number extra shards from 2');
    if (urls.has(id)) throw new Error(`SHARD_DATABASE_URLS: shard ${id} is listed twice`);
    if (process.env.NODE_ENV === 'production' && !m[2].includes('sslmode=require')) {
      throw new Error(`SHARD_DATABASE_URLS: shard ${id} must include sslmode=require in production`);
    }
    urls.set(id, m[2]);
  }
  return urls;
}

const shardUrls = parseShardUrls(process.env.SHARD_DATABASE_URLS);
const capacity = (() => {
  const n = Number(process.env.SHARD_CAPACITY);
  return Number.isInteger(n) && n > 0 ? n : 5000;
})();

/** Every configured shard id, the main database first. */
export function shardIds(): number[] {
  return [MAIN_SHARD, ...[...shardUrls.keys()].sort((a, b) => a - b)];
}

const clients = new Map<number, PrismaClient>([[MAIN_SHARD, prisma]]);

/** The client for a shard (each extra shard gets its own capped, recycled pool). */
export function shardClient(id: number): PrismaClient {
  let client = clients.get(id);
  if (!client) {
    const url = shardUrls.get(id);
    if (!url) throw new Error(`Shard ${id} is not configured (SHARD_DATABASE_URLS)`);
    client = createPooledClient(url);
    clients.set(id, client);
  }
  return client;
}

// Schema → shard never changes for a live account, so it's looked up once
// per process
const shardOfSchema = new Map<string, number>();

/** The database holding a user's schema. */
export async function tenantDb(schemaName: string): Promise<PrismaClient> {
  if (shardUrls.size === 0) return prisma; // one database: no lookup at all
  const s = escapeSchema(schemaName);
  let id = shardOfSchema.get(s);
  if (id === undefined) {
    const row = await prisma.account.findUnique({ where: { tenantSchemaName: s }, select: { shardId: true } });
    if (!row) throw new Error('No account for this schema');
    id = row.shardId;
    shardOfSchema.set(s, id);
  }
  return shardClient(id);
}

/** Forget a deleted account's schema. */
export function forgetTenant(schemaName: string): void {
  shardOfSchema.delete(schemaName);
}

/**
 * Where a new account's schema goes: the first shard (by id) under
 * SHARD_CAPACITY; when every shard is full, the least full one, with a
 * warning to add another.
 */
export async function shardForNewAccount(): Promise<number> {
  if (shardUrls.size === 0) return MAIN_SHARD;
  const counts = await prisma.account.groupBy({ by: ['shardId'], _count: { _all: true } });
  const countOf = (id: number) => counts.find(c => c.shardId === id)?._count._all ?? 0;
  const ids = shardIds();
  const open = ids.find(id => countOf(id) < capacity);
  if (open !== undefined) return open;
  const least = ids.reduce((a, b) => (countOf(b) < countOf(a) ? b : a));
  console.warn(`WARNING: every database shard has ${capacity}+ accounts — add one to SHARD_DATABASE_URLS`);
  return least;
}

/**
 * Startup: the accounts.shard_id column (an older database has none; every
 * existing account is on the main database). Reads the catalog first so a
 * migrated database takes no lock. Also checks every configured shard answers.
 */
export async function initShards(): Promise<void> {
  const [{ present }] = await prisma.$queryRawUnsafe<{ present: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'shard_id') AS present`
  );
  if (!present) {
    await prisma.$executeRawUnsafe(`ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS shard_id INTEGER NOT NULL DEFAULT 1`);
  }
  // Every database answers and has the entry-sync trigger function
  for (const id of shardIds()) {
    await ensurePostSyncFunction(shardClient(id));
  }
  const used = await prisma.account.groupBy({ by: ['shardId'], _count: { _all: true } });
  const missing = used.filter(u => !clients.has(u.shardId) && !shardUrls.has(u.shardId)).map(u => u.shardId);
  if (missing.length) {
    throw new Error(`Accounts live on shard(s) ${missing.join(', ')}, which SHARD_DATABASE_URLS doesn't list`);
  }
}

/** Close every pool (scripts, before exiting). */
export async function disconnectShards(): Promise<void> {
  await Promise.all([...clients.values()].map(c => c.$disconnect()));
}
