import { tenantDb } from './shards.js';
import { escapeSchema } from './escapeSchema.js';

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

export async function countSettings(schemaName: string): Promise<number> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ${s}.settings`);
  return Number(rows[0]?.n ?? 0);
}

export async function settingExists(schemaName: string, key: string): Promise<boolean> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ e: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM ${s}.settings WHERE key = $1) AS e`, key);
  return !!rows[0]?.e;
}

export async function upsertSetting(schemaName: string, key: string, value: unknown): Promise<TenantSetting> {
  const db = await tenantDb(schemaName);
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

export async function deleteSetting(schemaName: string, key: string): Promise<void> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  await db.$executeRawUnsafe(`DELETE FROM ${s}.settings WHERE key = $1`, key);
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
  data: { id: number; payload: string; iv: string; color?: string }
): Promise<TenantTaxonomy | null> {
  const db = await tenantDb(schemaName);
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

export async function getAllTaxonomies(schemaName: string): Promise<TenantTaxonomy[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<TaxonomyRow[]>(`SELECT ${TAXONOMY_COLUMNS} FROM ${s}.taxonomies ORDER BY sort_order, id`);
  return rows.map(toTaxonomy);
}

/** Update a topic. Writing the encrypted payload clears any legacy plaintext name and icon. */
export async function updateTaxonomy(
  schemaName: string,
  id: number,
  updates: { payload?: string; iv?: string; color?: string }
): Promise<TenantTaxonomy> {
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

  if (setClauses.length === 0) {
    const current = await getTaxonomy(schemaName, id);
    if (!current) throw new Error('Taxonomy not found');
    return current;
  }

  values.push(id);
  const result = await db.$queryRawUnsafe<TaxonomyRow[]>(
    `UPDATE ${s}.taxonomies SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING ${TAXONOMY_COLUMNS}`,
    ...values
  );
  return toTaxonomy(result[0]);
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
     ON CONFLICT (id) DO NOTHING
     RETURNING ${POST_SELECT}`;
}

const insertPostArgs = (input: CreatePostInput) => [
  input.id, input.contentEncrypted, input.contentIv, input.metadataEncrypted, input.metadataIv, input.createdAt ?? null,
];

/**
 * Create an encrypted entry under a reserved id. Returns null when the id was
 * never handed out (beyond the sequence) or is taken. Server and client both
 * refuse plaintext posts, so there is no plaintext path.
 */
export async function createPost(schemaName: string, input: CreatePostInput): Promise<TenantPost | null> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const result = await db.$queryRawUnsafe<TenantPost[]>(insertPostSql(s), ...insertPostArgs(input));
  return result[0] ?? null;
}

/**
 * Create several entries at once, all or none: null (and nothing saved) when
 * any id was never reserved or is taken.
 */
export async function createPosts(schemaName: string, inputs: CreatePostInput[]): Promise<TenantPost[] | null> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const sql = insertPostSql(s);
  try {
    return await db.$transaction(async (tx) => {
      const made: TenantPost[] = [];
      for (const input of inputs) {
        const rows = await tx.$queryRawUnsafe<TenantPost[]>(sql, ...insertPostArgs(input));
        if (!rows[0]) throw new BatchConflict();
        made.push(rows[0]);
      }
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
export async function resealPosts(schemaName: string, posts: (EncryptedPostFields & { id: number; updatedAt: Date })[]): Promise<number> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  // Only while the entry is unchanged since the client loaded it: an edit in
  // between was saved id-bound already and must not be overwritten
  const counts = await db.$transaction(posts.map(p => db.$executeRawUnsafe(
    `UPDATE ${s}.posts SET content_encrypted = $1, content_iv = $2, metadata_encrypted = $3, metadata_iv = $4
     WHERE id = $5 AND is_encrypted = TRUE AND date_trunc('milliseconds', updated_at) = $6`,
    p.contentEncrypted, p.contentIv, p.metadataEncrypted, p.metadataIv, p.id, p.updatedAt
  )));
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

export async function getAllPosts(
  schemaName: string,
  options?: { limit?: number; offset?: number }
): Promise<TenantPost[]> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  return db.$queryRawUnsafe<TenantPost[]>(
    // id breaks created_at ties so pages never overlap or skip
    `SELECT ${POST_SELECT} FROM ${s}.posts ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
    options?.limit || 1000,
    options?.offset || 0
  );
}

export async function updatePost(
  schemaName: string,
  id: number,
  updates: Partial<EncryptedPostFields>
): Promise<TenantPost | undefined> {
  const db = await tenantDb(schemaName);
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

/** Bytes of encrypted content + metadata over all entries (leaving out the ones being replaced). */
export async function postStorageBytes(schemaName: string, exclude: number | number[] = []): Promise<number> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const rows = await db.$queryRawUnsafe<{ n: bigint | number | null }[]>(
    `SELECT COALESCE(SUM(COALESCE(octet_length(content_encrypted), 0) + COALESCE(octet_length(metadata_encrypted), 0)), 0) AS n
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
  iv: Buffer
): Promise<FinanceRecordRow> {
  const db = await tenantDb(schemaName);
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

/** Bytes of encrypted payloads over every finance table (optionally leaving one row out). */
export async function financeStorageBytes(schemaName: string, exclude?: { kind: FinanceTableKind; id: string }): Promise<number> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const parts = (Object.keys(FINANCE_TABLES) as FinanceTableKind[]).map(kind =>
    `SELECT COALESCE(SUM(octet_length(payload_encrypted)), 0) AS n FROM ${s}.${FINANCE_TABLES[kind]}`
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

export async function upsertDoseRecord(schemaName: string, id: string, date: string, payload: Buffer, iv: Buffer): Promise<DoseRecordRow> {
  const db = await tenantDb(schemaName);
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
export async function resealDoseRecords(schemaName: string, records: { id: string; date: string; payload: Buffer; iv: Buffer }[]): Promise<number> {
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  const counts = await db.$transaction(records.map(r => db.$executeRawUnsafe(
    `UPDATE ${s}.medication_dose_records SET payload_encrypted = $1, payload_iv = $2 WHERE id = $3 AND date = $4::date`,
    r.payload, r.iv, r.id, r.date
  )));
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
