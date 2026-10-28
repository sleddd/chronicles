import type { Prisma } from '@prisma/client';
import { tenantDb } from './shards.js';
import { escapeSchema } from './escapeSchema.js';
import { ROW_OVERHEAD_BYTES } from '../utils/storageLimits.js';

// =============================================================================
// Tenant Query Helpers
// =============================================================================

// =============================================================================
// Types
// =============================================================================

export interface TenantSetting {
  key: string;
  value: unknown;
  updatedAt: Date;
}

export interface TenantTaxonomy {
  id: number;
  /** Legacy plaintext (null once the browser has encrypted the topic) */
  name: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  /** Encrypted { name, icon } (base64), or null for a legacy row */
  payload: string | null;
  iv: string | null;
}

export interface TenantPost {
  id: number;
  content: string | null;
  metadata: Record<string, unknown> | null;
  contentEncrypted: Buffer | null;
  contentIv: Buffer | null;
  metadataEncrypted: Buffer | null;
  metadataIv: Buffer | null;
  isEncrypted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** What a query runs on: a shard's pool, or the transaction withTenantLock opened. */
export type TenantClient = Prisma.TransactionClient;

const clientFor = async (schemaName: string, client?: TenantClient): Promise<TenantClient> => client ?? tenantDb(schemaName);

/**
 * Run `fn` in one transaction holding the account's advisory lock. A storage
 * cap is a read then a write: two requests at once could each see room and
 * both write, so every capped write runs its check and its write in here,
 * on the transaction client it's handed.
 *
 * Writes for one account also queue here in the process before taking a
 * connection: a transaction waiting on the advisory lock holds its connection
 * the whole time, so a burst of saves from one account (check-in autosave,
 * doses, a journal save) could fill the small pool and starve every other
 * request, sign-in checks included. The advisory lock still covers other
 * instances.
 */
const tenantWriteQueues = new Map<string, Promise<unknown>>();

export async function withTenantLock<T>(schemaName: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
  const s = escapeSchema(schemaName);
  const run = (tenantWriteQueues.get(s) ?? Promise.resolve()).then(() => lockedWrite(schemaName, s, fn));
  const tail = run.catch(() => undefined);
  tenantWriteQueues.set(s, tail);
  void tail.then(() => { if (tenantWriteQueues.get(s) === tail) tenantWriteQueues.delete(s); });
  return run;
}

async function lockedWrite<T>(schemaName: string, s: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
  const db = await tenantDb(schemaName);
  // Prisma gives a transaction only 2 s to get a connection by default (plain
  // queries wait 10 s), so a save that came in while the pool was busy or just
  // recycled failed and had to be sent again. Wait as long as a query does, and
  // try once more when it failed before `fn` ran — nothing was written yet.
  for (let attempt = 0; ; attempt++) {
    let started = false;
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text', s);
        started = true;
        return fn(tx);
      }, { maxWait: 10_000, timeout: 15_000 });
    } catch (err) {
      if (started || attempt > 0) throw err;
      console.warn('Tenant write could not start, retrying:', err instanceof Error ? err.message : err);
    }
  }
}

// =============================================================================
// Settings
// =============================================================================

export async function getSetting(schemaName: string, key: string): Promise<TenantSetting | null> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const result = await db.$queryRawUnsafe<TenantSetting[]>(
    `SELECT key, value, updated_at as "updatedAt" FROM ${s}.settings WHERE key = $1`,
    key
  );
  return result[0] || null;
}

export async function getAllSettings(schemaName: string): Promise<TenantSetting[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  return db.$queryRawUnsafe<TenantSetting[]>(
    `SELECT key, value, updated_at as "updatedAt" FROM ${s}.settings ORDER BY key`
  );
}

export async function countSettings(schemaName: string, client?: TenantClient): Promise<number> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ${s}.settings`);
  return Number(rows[0]?.n ?? 0);
}

export async function settingExists(schemaName: string, key: string, client?: TenantClient): Promise<boolean> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ e: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM ${s}.settings WHERE key = $1) AS e`, key);
  return !!rows[0]?.e;
}

/** Bytes stored in the account's settings, leaving out one key (the one about to be replaced). */
export async function settingsStorageBytes(schemaName: string, excludeKey: string, client?: TenantClient): Promise<number> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ n: bigint | number | null }[]>(
    `SELECT COALESCE(SUM(octet_length(value::text)), 0) AS n FROM ${s}.settings WHERE key <> $1`, excludeKey);
  return Number(rows[0]?.n ?? 0);
}

export async function upsertSetting(schemaName: string, key: string, value: unknown, client?: TenantClient): Promise<TenantSetting> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const result = await db.$queryRawUnsafe<TenantSetting[]>(
    `INSERT INTO ${s}.settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()
     RETURNING key, value, updated_at as "updatedAt"`,
    key,
    JSON.stringify(value)
  );
  return result[0];
}

/** Returns true when a row was deleted. */
export async function deleteSetting(schemaName: string, key: string): Promise<boolean> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  return (await db.$executeRawUnsafe(`DELETE FROM ${s}.settings WHERE key = $1`, key)) > 0;
}

// =============================================================================
// Taxonomies
// =============================================================================

const TAXONOMY_COLUMNS = 'id, name, icon, color, sort_order, payload_encrypted, payload_iv';

type TaxonomyRow = Omit<TenantTaxonomy, 'payload' | 'iv'> & { payload_encrypted: Buffer | null; payload_iv: Buffer | null };

function toTaxonomy(r: TaxonomyRow): TenantTaxonomy {
  return {
    id: Number(r.id),
    name: r.name,
    icon: r.icon,
    color: r.color,
    sort_order: Number(r.sort_order ?? 0),
    payload: r.payload_encrypted ? Buffer.from(r.payload_encrypted).toString('base64') : null,
    iv: r.payload_iv ? Buffer.from(r.payload_iv).toString('base64') : null,
  };
}

const topicColumnsReady = new Set<string>();

/** Whether a schema's taxonomies table already has everything ensureTopicEncryptionColumns adds. */
async function topicColumnsMigrated(s: string): Promise<boolean> {
  const db = await tenantDb(s);
  const rows = await db.$queryRawUnsafe<{ ready: boolean }[]>(
    `SELECT (SELECT count(*) FROM pg_attribute a
              WHERE a.attrelid = t.oid AND NOT a.attisdropped
                AND a.attname IN ('sort_order', 'payload_encrypted', 'payload_iv')) = 3
        AND (SELECT NOT a.attnotnull FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'name')
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = t.oid AND c.conname = 'taxonomies_name_key') AS ready
     FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = $1 AND t.relname = 'taxonomies'`,
    s
  );
  return rows[0]?.ready === true;
}

/** JIT migration: encrypted payload columns, and a name that may be empty and repeat (it lives in the payload). */
export async function ensureTopicEncryptionColumns(schemaName: string): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  if (topicColumnsReady.has(s)) return;
  // A read first: each ALTER below takes an exclusive lock even when there's
  // nothing to change, and every restart used to run all five per user
  if (await topicColumnsMigrated(s)) { topicColumnsReady.add(s); return; }
  await db.$executeRawUnsafe(`ALTER TABLE ${s}.taxonomies ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
  await db.$executeRawUnsafe(`ALTER TABLE ${s}.taxonomies ADD COLUMN IF NOT EXISTS payload_encrypted BYTEA`);
  await db.$executeRawUnsafe(`ALTER TABLE ${s}.taxonomies ADD COLUMN IF NOT EXISTS payload_iv BYTEA`);
  await db.$executeRawUnsafe(`ALTER TABLE ${s}.taxonomies ALTER COLUMN name DROP NOT NULL`);
  await db.$executeRawUnsafe(`ALTER TABLE ${s}.taxonomies DROP CONSTRAINT IF EXISTS taxonomies_name_key`);
  topicColumnsReady.add(s);
}

/** Reserve ids for new topics (a topic's payload is bound to its id, so it's needed first). */
export async function reserveTaxonomyIds(schemaName: string, count: number): Promise<number[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ id: number }[]>(
    `SELECT nextval('${s}.taxonomies_id_seq')::int AS id FROM generate_series(1, $1)`,
    count
  );
  return rows.map(r => r.id);
}

/** Create a topic under a reserved id. Null when the id was never handed out or is taken. */
export async function createTaxonomy(
  schemaName: string,
  data: { id: number; payload: string; iv: string; color?: string },
  client?: TenantClient
): Promise<TenantTaxonomy | null> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  // Auto-assign sort_order as max + 1
  const maxResult = await db.$queryRawUnsafe<{ max_order: number | null }[]>(
    `SELECT MAX(sort_order) as max_order FROM ${s}.taxonomies`
  );
  const nextOrder = (maxResult[0]?.max_order ?? -1) + 1;
  const result = await db.$queryRawUnsafe<TaxonomyRow[]>(
    `INSERT INTO ${s}.taxonomies (id, color, sort_order, payload_encrypted, payload_iv)
     SELECT $1, $2, $3, $4, $5
     WHERE $1 <= (SELECT last_value FROM ${s}.taxonomies_id_seq)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${TAXONOMY_COLUMNS}`,
    data.id,
    data.color ?? null,
    nextOrder,
    Buffer.from(data.payload, 'base64'),
    Buffer.from(data.iv, 'base64'),
  );
  return result[0] ? toTaxonomy(result[0]) : null;
}

export async function getTaxonomy(schemaName: string, id: number): Promise<TenantTaxonomy | null> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const result = await db.$queryRawUnsafe<TaxonomyRow[]>(`SELECT ${TAXONOMY_COLUMNS} FROM ${s}.taxonomies WHERE id = $1`, id);
  return result[0] ? toTaxonomy(result[0]) : null;
}

/** How many topics an account has (for the per-account cap). */
export async function taxonomyCount(schemaName: string, client?: TenantClient): Promise<number> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(`SELECT count(*) AS n FROM ${s}.taxonomies`);
  return Number(rows[0]?.n ?? 0);
}

export async function getAllTaxonomies(schemaName: string): Promise<TenantTaxonomy[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<TaxonomyRow[]>(`SELECT ${TAXONOMY_COLUMNS} FROM ${s}.taxonomies ORDER BY sort_order, id`);
  return rows.map(toTaxonomy);
}

/** Update a topic. Writing the encrypted payload clears any legacy plaintext name and icon. Null when there's no such topic. */
export async function updateTaxonomy(
  schemaName: string,
  id: number,
  updates: { payload?: string; iv?: string; color?: string }
): Promise<TenantTaxonomy | null> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.payload !== undefined && updates.iv !== undefined) {
    setClauses.push(`payload_encrypted = $${paramIndex++}`); values.push(Buffer.from(updates.payload, 'base64'));
    setClauses.push(`payload_iv = $${paramIndex++}`); values.push(Buffer.from(updates.iv, 'base64'));
    setClauses.push('name = NULL', 'icon = NULL');
  }
  if (updates.color !== undefined) { setClauses.push(`color = $${paramIndex++}`); values.push(updates.color); }

  if (setClauses.length === 0) return getTaxonomy(schemaName, id);

  values.push(id);
  const result = await db.$queryRawUnsafe<TaxonomyRow[]>(
    `UPDATE ${s}.taxonomies SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING ${TAXONOMY_COLUMNS}`,
    ...values
  );
  return result[0] ? toTaxonomy(result[0]) : null;
}

export async function deleteTaxonomy(schemaName: string, id: number): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  await db.$executeRawUnsafe(`DELETE FROM ${s}.taxonomies WHERE id = $1`, id);
}

export async function reorderTaxonomies(schemaName: string, orderedIds: number[]): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  // One statement: each id's position in the list becomes its sort order
  await db.$executeRawUnsafe(
    `UPDATE ${s}.taxonomies t SET sort_order = o.pos - 1
     FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos)
     WHERE t.id = o.id`,
    orderedIds
  );
}

// =============================================================================
// Posts
// =============================================================================

/** A new encrypted entry under an id reserved by reservePostIds (its ciphertext is bound to it). */
export interface CreatePostInput {
  id: number;
  contentEncrypted: Buffer;
  contentIv: Buffer;
  metadataEncrypted: Buffer;
  metadataIv: Buffer;
  createdAt?: Date;
}

/** The four encrypted fields an update replaces together. */
export interface EncryptedPostFields {
  contentEncrypted: Buffer;
  contentIv: Buffer;
  metadataEncrypted: Buffer;
  metadataIv: Buffer;
}

const POST_SELECT = `id, content, metadata,
  content_encrypted as "contentEncrypted", content_iv as "contentIv",
  metadata_encrypted as "metadataEncrypted", metadata_iv as "metadataIv",
  is_encrypted as "isEncrypted", created_at as "createdAt", updated_at as "updatedAt"`;

/**
 * Reserve ids for new entries. The client encrypts an entry bound to its id
 * (the id is in the AAD), so it needs the id before the entry exists.
 */
export async function reservePostIds(schemaName: string, count: number): Promise<number[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ id: number }[]>(
    `SELECT nextval('${s}.posts_id_seq')::int AS id FROM generate_series(1, $1)`,
    count
  );
  return rows.map(r => r.id);
}

function insertPostSql(s: string): string {
  return `INSERT INTO ${s}.posts (id, content_encrypted, content_iv, metadata_encrypted, metadata_iv, is_encrypted, created_at, updated_at)
     SELECT $1, $2, $3, $4, $5, TRUE, COALESCE($6, NOW()), COALESCE($6, NOW())
     WHERE $1 <= (SELECT last_value FROM ${s}.posts_id_seq)
       -- a deleted entry's id stays spent, so it can't come back under sync
       AND NOT EXISTS (SELECT 1 FROM ${s}.deleted_posts d WHERE d.id = $1)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${POST_SELECT}`;
}

const insertPostArgs = (input: CreatePostInput) => [
  input.id, input.contentEncrypted, input.contentIv, input.metadataEncrypted, input.metadataIv, input.createdAt ?? null,
];

/**
 * Create an encrypted entry under a reserved id. Returns null when the id was
 * never handed out (beyond the sequence), is taken, or belonged to a deleted
 * entry. Server and client both
 * refuse plaintext posts, so there is no plaintext path.
 */
export async function createPost(schemaName: string, input: CreatePostInput, client?: TenantClient): Promise<TenantPost | null> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const result = await db.$queryRawUnsafe<TenantPost[]>(insertPostSql(s), ...insertPostArgs(input));
  return result[0] ?? null;
}

/**
 * Create several entries at once, all or none: null (and nothing saved) when
 * any id was never reserved or is taken.
 */
export async function createPosts(schemaName: string, inputs: CreatePostInput[], client?: TenantClient): Promise<TenantPost[] | null> {
  const s = escapeSchema(schemaName);
  const sql = insertPostSql(s);
  const insertEach = async (tx: TenantClient): Promise<TenantPost[] | null> => {
    const made: TenantPost[] = [];
    for (const input of inputs) {
      const rows = await tx.$queryRawUnsafe<TenantPost[]>(sql, ...insertPostArgs(input));
      if (!rows[0]) return null;
      made.push(rows[0]);
    }
    return made;
  };
  if (client) {
    // Inside the caller's transaction: a savepoint keeps it all or none
    await client.$executeRawUnsafe('SAVEPOINT create_posts');
    const made = await insertEach(client);
    await client.$executeRawUnsafe(made ? 'RELEASE SAVEPOINT create_posts' : 'ROLLBACK TO SAVEPOINT create_posts');
    return made;
  }
  const db = await tenantDb(schemaName);
  try {
    return await db.$transaction(async (tx) => {
      const made = await insertEach(tx);
      if (!made) throw new BatchConflict();
      return made;
    });
  } catch (err) {
    if (err instanceof BatchConflict) return null;
    throw err;
  }
}

class BatchConflict extends Error {}

/**
 * Replace the encrypted fields of several entries at once, keeping their
 * updated_at (a re-seal changes the format, not the entry). Returns how many
 * were re-sealed.
 */
export async function resealPosts(schemaName: string, posts: (EncryptedPostFields & { id: number; updatedAt: Date })[], client?: TenantClient): Promise<number> {
  const s = escapeSchema(schemaName);
  // Only while the entry is unchanged since the client loaded it: an edit in
  // between was saved id-bound already and must not be overwritten
  const sql = `UPDATE ${s}.posts SET content_encrypted = $1, content_iv = $2, metadata_encrypted = $3, metadata_iv = $4
     WHERE id = $5 AND is_encrypted = TRUE AND date_trunc('milliseconds', updated_at) = $6`;
  const args = (p: (typeof posts)[number]) => [p.contentEncrypted, p.contentIv, p.metadataEncrypted, p.metadataIv, p.id, p.updatedAt];
  let counts: number[];
  if (client) {
    counts = [];
    for (const p of posts) counts.push(await client.$executeRawUnsafe(sql, ...args(p)));
  } else {
    const db = await tenantDb(schemaName);
    counts = await db.$transaction(posts.map(p => db.$executeRawUnsafe(sql, ...args(p))));
  }
  return counts.reduce((a, b) => a + b, 0);
}

export async function getPost(schemaName: string, id: number): Promise<TenantPost | null> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const result = await db.$queryRawUnsafe<TenantPost[]>(
    `SELECT ${POST_SELECT} FROM ${s}.posts WHERE id = $1`,
    id
  );
  return result[0] || null;
}

/** Whether an entry exists (without loading its ciphertext). */
export async function postExists(schemaName: string, id: number): Promise<boolean> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ id: number }[]>(`SELECT id FROM ${s}.posts WHERE id = $1`, id);
  return rows.length > 0;
}

/** One entry's stored size: both encrypted halves. */
const POST_BYTES = `COALESCE(octet_length(content_encrypted), 0) + COALESCE(octet_length(metadata_encrypted), 0)`;

/**
 * A page of entries (newest first) that also stops at `maxBytes` of
 * ciphertext — always at least one entry — so one response can't hold an
 * account's whole storage cap in memory. `more` says another page may follow.
 */
export async function getPostPage(
  schemaName: string,
  options: { limit: number; offset: number; maxBytes: number },
): Promise<{ posts: TenantPost[]; more: boolean }> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  // Sizes first (no ciphertext read), to see how many rows fit
  const sizes = await db.$queryRawUnsafe<{ n: number | bigint }[]>(
    `SELECT ${POST_BYTES} AS n FROM ${s}.posts ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
    options.limit, options.offset
  );
  let take = 0;
  let bytes = 0;
  for (const row of sizes) {
    const n = Number(row.n);
    if (take > 0 && bytes + n > options.maxBytes) break;
    bytes += n;
    take++;
  }
  if (take === 0) return { posts: [], more: false };
  const posts = await db.$queryRawUnsafe<TenantPost[]>(
    `SELECT ${POST_SELECT} FROM ${s}.posts ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
    take, options.offset
  );
  return { posts, more: take < sizes.length || sizes.length === options.limit };
}

export async function updatePost(
  schemaName: string,
  id: number,
  updates: Partial<EncryptedPostFields>,
  client?: TenantClient
): Promise<TenantPost | undefined> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.contentEncrypted !== undefined) { setClauses.push(`content_encrypted = $${paramIndex++}`); values.push(updates.contentEncrypted); }
  if (updates.contentIv !== undefined) { setClauses.push(`content_iv = $${paramIndex++}`); values.push(updates.contentIv); }
  if (updates.metadataEncrypted !== undefined) { setClauses.push(`metadata_encrypted = $${paramIndex++}`); values.push(updates.metadataEncrypted); }
  if (updates.metadataIv !== undefined) { setClauses.push(`metadata_iv = $${paramIndex++}`); values.push(updates.metadataIv); }

  setClauses.push('updated_at = NOW()');
  values.push(id);

  const result = await db.$queryRawUnsafe<TenantPost[]>(
    `UPDATE ${s}.posts SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING ${POST_SELECT}`,
    ...values
  );
  return result[0];
}

/** Bytes of encrypted content + metadata (+ the per-row overhead) over all entries (leaving out the ones being replaced). */
export async function postStorageBytes(schemaName: string, exclude: number | number[] = [], client?: TenantClient): Promise<number> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ n: bigint | number | null }[]>(
    `SELECT COALESCE(SUM(COALESCE(octet_length(content_encrypted), 0) + COALESCE(octet_length(metadata_encrypted), 0) + ${ROW_OVERHEAD_BYTES}), 0) AS n
     FROM ${s}.posts WHERE NOT (id = ANY($1::int[]))`,
    Array.isArray(exclude) ? exclude : [exclude]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function deletePost(schemaName: string, id: number): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  await db.$executeRawUnsafe(`DELETE FROM ${s}.posts WHERE id = $1`, id);
}

// =============================================================================
// Entry sync: what changed since a client last loaded
// =============================================================================
//
// The browser keeps its entries (still encrypted) between visits and asks only
// for what changed. A trigger stamps every inserted or updated post with the
// writing transaction's id (change_xid) and records every deleted id in
// deleted_posts, so no write path can be missed. A client's cursor is the
// snapshot xmin taken *before* it read: every transaction below it had
// finished, so nothing is skipped; anything at or above it may be sent twice,
// which the client handles by id.

/** The trigger function, once per database (each shard's public schema). */
const SYNC_FUNCTION_SQL = `CREATE OR REPLACE FUNCTION public.chronicles_post_changed() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    EXECUTE format('INSERT INTO %I.deleted_posts (id, change_xid) VALUES ($1, pg_current_xact_id())', TG_TABLE_SCHEMA) USING OLD.id;
    RETURN OLD;
  END IF;
  NEW.change_xid := pg_current_xact_id();
  RETURN NEW;
END
$fn$`;

/** Create the trigger function in a database if it isn't there yet. */
export async function ensurePostSyncFunction(db: { $queryRawUnsafe: <T>(sql: string, ...v: unknown[]) => Promise<T>; $executeRawUnsafe: (sql: string, ...v: unknown[]) => Promise<number> }): Promise<void> {
  const [{ present }] = await db.$queryRawUnsafe<{ present: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'chronicles_post_changed') AS present`
  );
  if (!present) await db.$executeRawUnsafe(SYNC_FUNCTION_SQL);
}

const deletedPostsIndex = (s: string) => `idx_${s}_deleted_change`;
// /changes reads deletions by change_xid; without it every sync scans them all
const deletedPostsIndexSql = (s: string) => `CREATE INDEX IF NOT EXISTS ${deletedPostsIndex(s)} ON ${s}.deleted_posts (change_xid)`;

/** Change tracking for a schema's posts (new schemas get these at creation). */
export function postSyncStatements(s: string): string[] {
  return [
    // A constant default: no table rewrite; older rows sort before any cursor
    `ALTER TABLE ${s}.posts ADD COLUMN IF NOT EXISTS change_xid xid8 NOT NULL DEFAULT '0'`,
    `CREATE INDEX IF NOT EXISTS idx_${s}_posts_change ON ${s}.posts (change_xid)`,
    `CREATE TABLE IF NOT EXISTS ${s}.deleted_posts (id INTEGER NOT NULL, change_xid xid8 NOT NULL)`,
    deletedPostsIndexSql(s),
    `DROP TRIGGER IF EXISTS posts_sync_write ON ${s}.posts`,
    `CREATE TRIGGER posts_sync_write BEFORE INSERT OR UPDATE ON ${s}.posts FOR EACH ROW EXECUTE FUNCTION public.chronicles_post_changed()`,
    `DROP TRIGGER IF EXISTS posts_sync_delete ON ${s}.posts`,
    `CREATE TRIGGER posts_sync_delete AFTER DELETE ON ${s}.posts FOR EACH ROW EXECUTE FUNCTION public.chronicles_post_changed()`,
  ];
}

const postSyncReady = new Set<string>();

/** JIT migration for change tracking: one catalog read once it's in place. */
export async function ensurePostSync(schemaName: string): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  if (postSyncReady.has(s)) return;
  const [{ ready, indexed }] = await db.$queryRawUnsafe<{ ready: boolean; indexed: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid JOIN pg_namespace n ON n.oid = t.relnamespace
                    WHERE n.nspname = $1 AND t.relname = 'posts' AND a.attname = 'change_xid' AND NOT a.attisdropped)
        AND EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = $1 AND t.relname = 'deleted_posts')
        AND (SELECT count(*) FROM pg_trigger g JOIN pg_class t ON t.oid = g.tgrelid JOIN pg_namespace n ON n.oid = t.relnamespace
              WHERE n.nspname = $1 AND g.tgname IN ('posts_sync_write', 'posts_sync_delete')) = 2 AS ready,
            EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2) AS indexed`,
    s, deletedPostsIndex(s)
  );
  if (!ready) {
    await ensurePostSyncFunction(db);
    await db.$transaction(postSyncStatements(s).map(sql => db.$executeRawUnsafe(sql)));
  } else if (!indexed) {
    // Tracking from before the deletions index: add just that (a CREATE INDEX
    // IF NOT EXISTS still locks the table, hence the catalog read first)
    await db.$executeRawUnsafe(deletedPostsIndexSql(s));
  }
  postSyncReady.add(s);
}

/** A cursor taken before reading: every transaction below it has finished. */
export async function getSyncCursor(schemaName: string): Promise<string> {
  const db = await tenantDb(schemaName);
  const [{ cursor }] = await db.$queryRawUnsafe<{ cursor: string }[]>(
    `SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS cursor`
  );
  return cursor;
}

export type PostChanges =
  | { reset: true }
  | { reset: false; cursor: string; entries: TenantPost[]; deleted: number[] };

/**
 * Entries written and ids deleted since `since` (a cursor from this database).
 * `reset` when the client should load everything instead: more than `limit`
 * changes or `maxBytes` of them, or a cursor from the future (the database
 * was restored).
 */
export async function getPostChanges(schemaName: string, since: string, limit = 5000, maxBytes = Infinity): Promise<PostChanges> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const [{ cursor, future }] = await db.$queryRawUnsafe<{ cursor: string; future: boolean }[]>(
    `SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS cursor,
            $1::xid8 > pg_snapshot_xmax(pg_current_snapshot()) AS future`,
    since
  );
  if (future) return { reset: true };
  // Too much changed to send in one response: a full (paged) load instead
  if (Number.isFinite(maxBytes)) {
    const [{ n }] = await db.$queryRawUnsafe<{ n: number | bigint | null }[]>(
      `SELECT COALESCE(SUM(${POST_BYTES}), 0) AS n FROM ${s}.posts WHERE change_xid >= $1::xid8`,
      since
    );
    if (Number(n) > maxBytes) return { reset: true };
  }
  const entries = await db.$queryRawUnsafe<TenantPost[]>(
    `SELECT ${POST_SELECT} FROM ${s}.posts WHERE change_xid >= $1::xid8 ORDER BY change_xid, id LIMIT $2`,
    since, limit + 1
  );
  if (entries.length > limit) return { reset: true };
  const deleted = await db.$queryRawUnsafe<{ id: number }[]>(
    `SELECT DISTINCT id FROM ${s}.deleted_posts WHERE change_xid >= $1::xid8`,
    since
  );
  return { reset: false, cursor, entries, deleted: deleted.map(d => d.id) };
}

// =============================================================================
// Finance records (one encrypted JSON payload per row)
// =============================================================================

/** Finance kind → table. Table names only ever come from this map. */
export const FINANCE_TABLES = {
  paydays: 'finance_paydays',
  bills: 'finance_bills',
  budget: 'finance_budget_categories',
  expenses: 'finance_expenses',
  goals: 'finance_goals',
  savings: 'finance_savings',
} as const;

export type FinanceTableKind = keyof typeof FINANCE_TABLES;

export interface FinanceRecordRow {
  id: string;
  payloadEncrypted: Buffer;
  payloadIv: Buffer;
  createdAt: Date;
  updatedAt: Date;
}

/** DDL for the finance tables (shared by new-tenant setup and the JIT migration). */
export function financeTableStatements(s: string): string[] {
  return Object.values(FINANCE_TABLES).map(table => `CREATE TABLE IF NOT EXISTS ${s}.${table} (
      id TEXT PRIMARY KEY,
      payload_encrypted BYTEA NOT NULL,
      payload_iv BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
}

const financeReady = new Set<string>();

/** JIT migration: create the finance tables if missing (once per schema per process). */
export async function ensureFinanceTables(schemaName: string): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  if (financeReady.has(s)) return;
  for (const stmt of financeTableStatements(s)) {
    await db.$executeRawUnsafe(stmt);
  }
  financeReady.add(s);
}

export async function getFinanceRecords(schemaName: string, kind: FinanceTableKind): Promise<FinanceRecordRow[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  return db.$queryRawUnsafe<FinanceRecordRow[]>(
    `SELECT id, payload_encrypted as "payloadEncrypted", payload_iv as "payloadIv",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM ${s}.${FINANCE_TABLES[kind]}
     ORDER BY created_at ASC`
  );
}

export async function upsertFinanceRecord(
  schemaName: string,
  kind: FinanceTableKind,
  id: string,
  payload: Buffer,
  iv: Buffer,
  client?: TenantClient
): Promise<FinanceRecordRow> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<FinanceRecordRow[]>(
    `INSERT INTO ${s}.${FINANCE_TABLES[kind]} (id, payload_encrypted, payload_iv)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET payload_encrypted = EXCLUDED.payload_encrypted,
       payload_iv = EXCLUDED.payload_iv, updated_at = NOW()
     RETURNING id, payload_encrypted as "payloadEncrypted", payload_iv as "payloadIv",
               created_at as "createdAt", updated_at as "updatedAt"`,
    id, payload, iv
  );
  return rows[0];
}

/** Bytes of encrypted payloads (+ the per-row overhead) over every finance table (optionally leaving one row out). */
export async function financeStorageBytes(schemaName: string, exclude?: { kind: FinanceTableKind; id: string }, client?: TenantClient): Promise<number> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const parts = (Object.keys(FINANCE_TABLES) as FinanceTableKind[]).map(kind =>
    `SELECT COALESCE(SUM(octet_length(payload_encrypted) + ${ROW_OVERHEAD_BYTES}), 0) AS n FROM ${s}.${FINANCE_TABLES[kind]}`
    + (exclude?.kind === kind ? ' WHERE id <> $1' : ''));
  const rows = await db.$queryRawUnsafe<{ n: bigint | number | null }[]>(
    `SELECT COALESCE(SUM(n), 0) AS n FROM (${parts.join(' UNION ALL ')}) t`,
    ...(exclude ? [exclude.id] : [])
  );
  return Number(rows[0]?.n ?? 0);
}

/** Returns true when a row was deleted. */
export async function deleteFinanceRecord(schemaName: string, kind: FinanceTableKind, id: string): Promise<boolean> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const n = await db.$executeRawUnsafe(`DELETE FROM ${s}.${FINANCE_TABLES[kind]} WHERE id = $1`, id);
  return n > 0;
}

// =============================================================================
// Medication dose records (encrypted, one payload per dose)
// =============================================================================
// The payload (medication, scheduled time, status, taken at) is encrypted in the
// browser with AAD bound to the row id; only the day stays readable, for the
// "today's doses" query. No foreign key, so nothing marks which posts are
// medications. Replaces medication_dose_logs (legacy, plaintext), which the
// browser migrates on unlock (GET/DELETE /api/doses/legacy).

export interface DoseRecordRow {
  id: string;
  date: string;
  payloadEncrypted: Buffer;
  payloadIv: Buffer;
  createdAt: Date;
  updatedAt: Date;
}

export function doseRecordStatements(s: string): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS ${s}.medication_dose_records (
      id TEXT PRIMARY KEY,
      date DATE NOT NULL,
      payload_encrypted BYTEA NOT NULL,
      payload_iv BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_${s}_dose_records_date ON ${s}.medication_dose_records (date)`,
  ];
}

const doseRecordsReady = new Set<string>();

export async function ensureDoseRecordsTable(schemaName: string): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  if (doseRecordsReady.has(s)) return;
  for (const stmt of doseRecordStatements(s)) await db.$executeRawUnsafe(stmt);
  doseRecordsReady.add(s);
}

const DOSE_RECORD_COLUMNS = `id, TO_CHAR(date, 'YYYY-MM-DD') as "date", payload_encrypted as "payloadEncrypted",
  payload_iv as "payloadIv", created_at as "createdAt", updated_at as "updatedAt"`;

export async function getDoseRecords(schemaName: string, date?: string): Promise<DoseRecordRow[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  return date
    ? db.$queryRawUnsafe<DoseRecordRow[]>(`SELECT ${DOSE_RECORD_COLUMNS} FROM ${s}.medication_dose_records WHERE date = $1::date ORDER BY created_at ASC`, date)
    : db.$queryRawUnsafe<DoseRecordRow[]>(`SELECT ${DOSE_RECORD_COLUMNS} FROM ${s}.medication_dose_records ORDER BY date ASC, created_at ASC`);
}

export async function upsertDoseRecord(schemaName: string, id: string, date: string, payload: Buffer, iv: Buffer, client?: TenantClient): Promise<DoseRecordRow> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<DoseRecordRow[]>(
    `INSERT INTO ${s}.medication_dose_records (id, date, payload_encrypted, payload_iv)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (id) DO UPDATE SET date = EXCLUDED.date, payload_encrypted = EXCLUDED.payload_encrypted,
       payload_iv = EXCLUDED.payload_iv, updated_at = NOW()
     RETURNING ${DOSE_RECORD_COLUMNS}`,
    id, date, payload, iv
  );
  return rows[0];
}

/** Rows and payload bytes of an account's dose records (leaving out the ones being replaced). */
export async function doseRecordStorage(schemaName: string, exclude: string[] = [], client?: TenantClient): Promise<{ count: number; bytes: number }> {
  const db = await clientFor(schemaName, client);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ count: bigint | number; bytes: bigint | number | null }[]>(
    `SELECT count(*) AS count, COALESCE(SUM(octet_length(payload_encrypted)), 0) AS bytes
     FROM ${s}.medication_dose_records WHERE NOT (id = ANY($1::text[]))`,
    exclude
  );
  return { count: Number(rows[0]?.count ?? 0), bytes: Number(rows[0]?.bytes ?? 0) };
}

export async function deleteDoseRecord(schemaName: string, id: string): Promise<boolean> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  return (await db.$executeRawUnsafe(`DELETE FROM ${s}.medication_dose_records WHERE id = $1`, id)) > 0;
}

/**
 * Re-save dose records sealed the newer way (bound to their day as well as
 * their id). Only rows that exist, on the same day, are touched; updated_at
 * stays. Returns how many were re-sealed.
 */
export async function resealDoseRecords(schemaName: string, records: { id: string; date: string; payload: Buffer; iv: Buffer }[], client?: TenantClient): Promise<number> {
  const s = escapeSchema(schemaName);
  const sql = `UPDATE ${s}.medication_dose_records SET payload_encrypted = $1, payload_iv = $2 WHERE id = $3 AND date = $4::date`;
  let counts: number[];
  if (client) {
    counts = [];
    for (const r of records) counts.push(await client.$executeRawUnsafe(sql, r.payload, r.iv, r.id, r.date));
  } else {
    const db = await tenantDb(schemaName);
    counts = await db.$transaction(records.map(r => db.$executeRawUnsafe(sql, r.payload, r.iv, r.id, r.date)));
  }
  return counts.reduce((a, b) => a + b, 0);
}

// =============================================================================
// Post-Taxonomy Relationships
// =============================================================================

export async function addTaxonomyToPost(schemaName: string, postId: number, taxonomyId: number): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}.post_taxonomies (post_id, tax_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    postId,
    taxonomyId
  );
}

export async function removeTaxonomyFromPost(schemaName: string, postId: number, taxonomyId: number): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  await db.$executeRawUnsafe(
    `DELETE FROM ${s}.post_taxonomies WHERE post_id = $1 AND tax_id = $2`,
    postId,
    taxonomyId
  );
}

export async function getPostTaxonomies(schemaName: string, postId: number): Promise<TenantTaxonomy[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  return db.$queryRawUnsafe<TenantTaxonomy[]>(
    `SELECT t.id, t.name, t.icon, t.color
     FROM ${s}.taxonomies t
     JOIN ${s}.post_taxonomies pt ON t.id = pt.tax_id
     WHERE pt.post_id = $1
     ORDER BY t.name`,
    postId
  );
}

export async function setPostTaxonomies(schemaName: string, postId: number, taxonomyIds: number[]): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  // Wrap in transaction to prevent partial taxonomy state on failure
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM ${s}.post_taxonomies WHERE post_id = $1`, postId);
    for (const taxId of taxonomyIds) {
      await tx.$executeRawUnsafe(
        `INSERT INTO ${s}.post_taxonomies (post_id, tax_id) VALUES ($1, $2)`,
        postId,
        taxId
      );
    }
  });
}
