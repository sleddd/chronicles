/**
 * What the Chronicles AI app changed, so the owner can put it back.
 *
 * The server can't see inside an encrypted save, so it can't tell a ticked
 * task from an emptied one. Instead, before an AI-app session overwrites
 * anything — an entry, a dose record, a bill, the habit log — the version it
 * replaces is copied here, still encrypted. The owner (a browser session)
 * can list these, put one back, or throw them away. The AI app may only put
 * back an entry it deleted itself, within ASSISTANT_UNDO_MS (its own undo).
 *
 * The AI app may also delete any entry it can see (assistantDeletePost). The
 * server can't tell a task from a journal entry, so this covers every entry
 * that isn't hidden from AI; keeping to tasks is the app's own rule. Each
 * delete first keeps a full copy of the entry here, kind 'entry' with
 * `extra.deleted` (EntryDeletionExtra): its encrypted text and metadata, when
 * it was made and its topic links, so putting it back re-creates it under the
 * same id. At most ASSISTANT_DELETES_PER_DAY a day, and a full list refuses
 * the delete just as it refuses a write.
 *
 * Kept for ASSISTANT_HISTORY_DAYS (the copy of a deleted entry until the owner
 * puts it back or removes it: it is the entry's only copy), at most ASSISTANT_HISTORY_ROWS versions and
 * ASSISTANT_HISTORY_BYTES of them. It has its own cap, apart from the
 * journal's, so the AI app can never use up room for entries.
 *
 * A version is never pushed out to make room for a newer one: only its days
 * running out, or the owner, removes it. When the list is full the AI app's
 * write is refused instead (AssistantHistoryFull) — otherwise a few hundred
 * writes would push the originals out and nothing could be put back.
 *
 * Only the owner's versions are kept. A version the AI app wrote itself is not
 * (assistant_wrote remembers a SHA-256 of what it last wrote to each record:
 * its IVs and ciphertext), so the app ticking the same task ten times keeps
 * one version: the one from before it started. The mark covers the ciphertext,
 * never the IVs alone: the app chooses its IVs, and could otherwise write
 * under the owner's and have the owner's version taken for its own.
 *
 * Keeping and writing are one transaction under the account's lock
 * (assistantWrite): what is kept is exactly what is overwritten, and a write
 * that is refused keeps nothing.
 *
 * Deleting the record deletes every version kept of it (forgetAssistantChangesFor).
 * Not when the AI app deletes an entry: its copy is what the owner puts back,
 * and the versions from before stay with it (an entry the app changed and
 * then deleted can be put back as it was before either).
 *
 * Putting a version back swaps: what is there now is kept in its place, so a
 * restore can itself be undone, and the record's mark is forgotten (what is
 * there now is the owner's choice, kept again before the app's next write). A
 * record made new by the AI app has no earlier version and isn't here.
 */
import crypto from 'crypto';
import { tenantDb } from './shards.js';
import { escapeSchema } from './escapeSchema.js';
import {
  ensureAiPrivacyTables, aiPrivacyTablesExist, ensureFinanceTables, ensureDoseRecordsTable, ensurePostReservations, withTenantLock,
  createPost, postStorageBytes, pruneDeletedPosts, ensurePostSync, ASSISTANT_CREATES_PER_DAY, ASSISTANT_DELETES_PER_DAY, ASSISTANT_UNDO_MS,
  type CreatePostInput, type TenantClient, type TenantPost,
} from './tenantQueries.js';
import { AI_PRIVACY_KEY, parseAiPrivacy } from '@chronicles/shared';

export const ASSISTANT_HISTORY_DAYS = 14;
export const ASSISTANT_HISTORY_ROWS = 300;
export const ASSISTANT_HISTORY_BYTES = 20 * 1024 * 1024;
/** One list answer holds at most this much ciphertext. */
const PAGE_BYTES = 8 * 1024 * 1024;
const PAGE_ROWS = 50;

export type AssistantChangeKind = 'entry' | 'dose' | 'bill' | 'setting';

export interface AssistantChange {
  id: number;
  kind: AssistantChangeKind;
  /** The entry id, the dose record's or bill's uuid, or the setting's key. */
  ref: string;
  savedAt: Date;
  /** An entry's content, or a record's payload. */
  body: Buffer | null;
  bodyIv: Buffer | null;
  /** An entry's metadata. */
  meta: Buffer | null;
  metaIv: Buffer | null;
  /** A dose record's day (`{ date }`), a setting's sealed value (`{ value }`), or a deleted entry's (EntryDeletionExtra). */
  extra: Record<string, unknown> | null;
}

/**
 * What a copy of an entry the AI app deleted holds besides its encrypted text
 * and metadata: everything else the entry's row and links had, so putting it
 * back re-creates it as it was.
 */
export interface EntryDeletionExtra {
  deleted: true;
  /** The assistant session that deleted it: only that session may undo it */
  session: number;
  /** The row's own times, to the microsecond */
  createdAt: string;
  updatedAt: string;
  isEncrypted: boolean;
  /** Older entries' plaintext columns (null for every encrypted entry) */
  content: string | null;
  metadata: unknown;
  /** Its topic links (post_taxonomies; older entries only) */
  topicIds: number[];
  /** The topics kept from AI when it was deleted: one hidden since makes it come back hidden (hiddenSinceSql) */
  hiddenTopics?: number[];
}

/** Whether a kept version is the copy of an entry the AI app deleted. */
export const isEntryDeletion = (c: Pick<AssistantChange, 'kind' | 'extra'>): boolean =>
  c.kind === 'entry' && c.extra?.deleted === true;

/** The SQL test for the same, on an assistant_changes row `c`. */
const DELETION_SQL = (c: string) => `(${c}.kind = 'entry' AND ${c}.extra->'deleted' = 'true'::jsonb)`;

const COLUMNS = `id::int AS id, kind, ref, saved_at AS "savedAt", body, body_iv AS "bodyIv", meta, meta_iv AS "metaIv", extra`;
const SIZE = `COALESCE(octet_length(body), 0) + COALESCE(octet_length(meta), 0) + COALESCE(octet_length(extra::text), 0)`;

/** A record's ref as its own table's id: an entry's is a number, the rest are text. */
const refParam = (kind: AssistantChangeKind, ref: string): string | number => (kind === 'entry' ? Number(ref) : ref);

/** The record's own table, and how its row is found (`$1` is refParam). */
function recordTable(s: string, kind: AssistantChangeKind): string {
  switch (kind) {
    case 'entry': return `${s}.posts WHERE id = $1`;
    case 'dose': return `${s}.medication_dose_records WHERE id = $1`;
    case 'bill': return `${s}.finance_bills WHERE id = $1`;
    case 'setting': return `${s}.settings WHERE key = $1`;
  }
}

/** The version as it stands, read from the record's own table. */
function currentVersionSql(s: string, kind: AssistantChangeKind): string {
  switch (kind) {
    case 'entry':
      return `SELECT 'entry', id::text, content_encrypted, content_iv, metadata_encrypted, metadata_iv, NULL::jsonb FROM ${recordTable(s, kind)}`;
    case 'dose':
      return `SELECT 'dose', id, payload_encrypted, payload_iv, NULL::bytea, NULL::bytea, jsonb_build_object('date', TO_CHAR(date, 'YYYY-MM-DD')) FROM ${recordTable(s, kind)}`;
    case 'bill':
      return `SELECT 'bill', id, payload_encrypted, payload_iv, NULL::bytea, NULL::bytea, NULL::jsonb FROM ${recordTable(s, kind)}`;
    case 'setting':
      return `SELECT 'setting', key, NULL::bytea, NULL::bytea, NULL::bytea, NULL::bytea, jsonb_build_object('value', value) FROM ${recordTable(s, kind)}`;
  }
}

/**
 * Which version a record holds, and how much room keeping it would take. The
 * mark is a SHA-256 over the version's IVs and ciphertext, so two versions
 * share a mark only when they are the same bytes. The same bytes assistantMark
 * builds from a request.
 */
function currentMarkSql(s: string, kind: AssistantChangeKind): string {
  const nn = (col: string) => `COALESCE(${col}, ''::bytea)`;
  switch (kind) {
    case 'entry':
      return `SELECT sha256(${nn('content_iv')} || ${nn('content_encrypted')} || ${nn('metadata_iv')} || ${nn('metadata_encrypted')}) AS mark,
                COALESCE(octet_length(content_encrypted), 0) + COALESCE(octet_length(metadata_encrypted), 0) AS bytes FROM ${recordTable(s, kind)}`;
    case 'dose':
    case 'bill':
      return `SELECT sha256(${nn('payload_iv')} || ${nn('payload_encrypted')}) AS mark, COALESCE(octet_length(payload_encrypted), 0) AS bytes FROM ${recordTable(s, kind)}`;
    case 'setting':
      return `SELECT sha256(convert_to(COALESCE(value->>'iv', '') || ':' || COALESCE(value->>'ciphertext', ''), 'UTF8')) AS mark,
                octet_length(value::text) AS bytes FROM ${recordTable(s, kind)}`;
  }
}

const sha256 = (...parts: (Buffer | string)[]): Buffer => {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The mark of a version the AI app is about to write, from its request (see currentMarkSql). */
export const assistantMark = {
  entry: (contentIv: Buffer, content: Buffer, metadataIv: Buffer, metadata: Buffer) => sha256(contentIv, content, metadataIv, metadata),
  /** A dose record or a bill: its payload and the payload's IV */
  record: (iv: Buffer, payload: Buffer) => sha256(iv, payload),
  /** A sealed setting: its `iv` and `ciphertext`, as text */
  setting: (value: unknown) => {
    const v = (value && typeof value === 'object' ? value : {}) as { iv?: unknown; ciphertext?: unknown };
    return sha256(`${str(v.iv)}:${str(v.ciphertext)}`);
  },
};

const keepSql = (s: string, kind: AssistantChangeKind) =>
  `INSERT INTO ${s}.assistant_changes (kind, ref, body, body_iv, meta, meta_iv, extra) ${currentVersionSql(s, kind)}`;

/** Past their days. The only thing that removes a version without the owner asking. */
/* Past their days, versions go. Never the copy of an entry the AI app deleted:
   it is the only copy of that entry, so it stays until the owner puts it back
   or removes it (it still counts toward the list's cap, so a full list stops
   the app's writes and deletes until the owner looks). */
const expireSql = (s: string) =>
  `DELETE FROM ${s}.assistant_changes c WHERE c.saved_at < NOW() - make_interval(days => ${ASSISTANT_HISTORY_DAYS})
     AND ${DELETION_SQL('c')} IS NOT TRUE`; /* IS NOT TRUE, never NOT: a version with no extra makes the test NULL */

async function ensureTables(schemaName: string, kind: AssistantChangeKind): Promise<void> {
  await ensureAiPrivacyTables(schemaName);
  if (kind === 'bill') await ensureFinanceTables(schemaName);
  if (kind === 'dose') await ensureDoseRecordsTable(schemaName);
}

/** The list is full: the AI app's write is refused rather than an earlier version pushed out. */
export class AssistantHistoryFull extends Error {
  constructor() { super('The list of changes the AI app made is full'); }
}

/** What the AI app is told when its write is refused because the list is full. */
export const ASSISTANT_HISTORY_FULL = {
  error: 'The Chronicles AI app has changed a lot lately. In Chronicles, look over “Changes the app made” (Settings → In-App AI) and clear the list so it can change more.',
};

/**
 * Keep the version a record holds now, inside the caller's transaction (which
 * holds the account's lock). Nothing is kept when there is no record yet, or
 * when the version there is one the AI app wrote itself.
 */
async function keepCurrent(tx: TenantClient, s: string, kind: AssistantChangeKind, ref: string): Promise<void> {
  const id = refParam(kind, ref);
  const [now] = await tx.$queryRawUnsafe<{ mark: Buffer | null; bytes: number | bigint }[]>(currentMarkSql(s, kind), id);
  if (!now) return;
  const [wrote] = await tx.$queryRawUnsafe<{ mark: Buffer }[]>(
    `SELECT mark FROM ${s}.assistant_wrote WHERE kind = $1 AND ref = $2`, kind, ref);
  if (wrote && now.mark && Buffer.from(wrote.mark).equals(Buffer.from(now.mark))) return;
  // The version there is the owner's: an entry the app made as its own data
  // (assistant_owned) is the owner's from here on, and the app's right to
  // delete it ends (rolled back with the write if nothing is saved)
  if (kind === 'entry') await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_owned WHERE post_id = $1`, id);
  await tx.$executeRawUnsafe(expireSql(s));
  const [used] = await tx.$queryRawUnsafe<{ n: number | bigint; bytes: number | bigint | null }[]>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(${SIZE}), 0) AS bytes FROM ${s}.assistant_changes`);
  if (Number(used.n) >= ASSISTANT_HISTORY_ROWS || Number(used.bytes ?? 0) + Number(now.bytes) > ASSISTANT_HISTORY_BYTES) {
    throw new AssistantHistoryFull();
  }
  await tx.$executeRawUnsafe(keepSql(s, kind), id);
}

/** What the AI app wrote to a record just now: that version is its own, and isn't kept when it next writes there. */
async function rememberWrote(tx: TenantClient, s: string, kind: AssistantChangeKind, ref: string, mark: Buffer): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO ${s}.assistant_wrote (kind, ref, mark) VALUES ($1, $2, $3)
     ON CONFLICT (kind, ref) DO UPDATE SET mark = EXCLUDED.mark`, kind, ref, mark);
}

/** Carries a write's answer out of a transaction that is rolled back because nothing was written. */
class NothingWritten<T> extends Error {
  constructor(readonly result: T) { super('Nothing written'); }
}

/**
 * An AI-app session overwriting a record: under the account's lock, the
 * version it replaces is kept, then `write` runs on the same transaction, then
 * what the app wrote is remembered (`mark`, from assistantMark). `written`
 * says whether `write` saved anything: when it didn't (no room, no such
 * record) the transaction is rolled back, so nothing is kept either, and the
 * answer is handed back as it is.
 *
 * Throws AssistantHistoryFull when the list has no room: the write is not made.
 */
export async function assistantWrite<T>(
  schemaName: string, kind: AssistantChangeKind, ref: string, mark: Buffer,
  write: (tx: TenantClient) => Promise<T>, written: (result: T) => boolean,
): Promise<T> {
  await ensureTables(schemaName, kind);
  const s = escapeSchema(schemaName);
  try {
    return await withTenantLock(schemaName, async (tx) => {
      await keepCurrent(tx, s, kind, ref);
      const result = await write(tx);
      if (!written(result)) throw new NothingWritten(result);
      await rememberWrote(tx, s, kind, ref, mark);
      return result;
    });
  } catch (err) {
    if (err instanceof NothingWritten) return (err as NothingWritten<T>).result;
    throw err;
  }
}

export type AssistantCreate = TenantPost | 'full' | 'limit' | null;

/**
 * An AI-app session creating an entry, all under the account's lock: its
 * day's budget (it can't delete entries later), the journal's storage cap, the
 * create itself, the record that lets it undo this entry for a short while,
 * and its mark — so the app changing an entry it just made keeps nothing (the
 * version it replaces is its own) and doesn't fill the list with its own work.
 *
 * With `owned`, the entry is the app's own data (a memory, a letter, a
 * conversation summary) and is recorded in assistant_owned in the same
 * transaction: the app may then edit and delete it at any age, for as long as
 * the version there is its own (assistantMayDelete). It still comes out of the
 * day's budget.
 *
 * `limit`: the day's budget is spent. `full`: no room in the journal. Null:
 * the id was never reserved or is taken.
 */
export async function assistantCreatePost(
  schemaName: string, input: CreatePostInput, size: number, capBytes: number, options: { owned?: boolean } = {},
): Promise<AssistantCreate> {
  await ensureAiPrivacyTables(schemaName);
  await ensurePostReservations(schemaName);
  const s = escapeSchema(schemaName);
  return withTenantLock<AssistantCreate>(schemaName, async (tx) => {
    const [{ n }] = await tx.$queryRawUnsafe<{ n: number | bigint }[]>(
      `SELECT COUNT(*) AS n FROM ${s}.assistant_creations WHERE created_at > NOW() - interval '1 day'`);
    if (Number(n) >= ASSISTANT_CREATES_PER_DAY) return 'limit';
    if (await postStorageBytes(schemaName, [], tx) + size > capBytes) return 'full';
    const post = await createPost(schemaName, input, tx);
    if (!post) return null;
    await tx.$executeRawUnsafe(
      `INSERT INTO ${s}.assistant_creations (post_id) VALUES ($1) ON CONFLICT (post_id) DO UPDATE SET created_at = NOW()`, post.id);
    // Old rows have no further use
    await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_creations WHERE created_at < NOW() - interval '2 days'`);
    if (options.owned) {
      await tx.$executeRawUnsafe(`INSERT INTO ${s}.assistant_owned (post_id) VALUES ($1) ON CONFLICT (post_id) DO NOTHING`, post.id);
    }
    await rememberWrote(tx, s, 'entry', String(post.id),
      assistantMark.entry(input.contentIv, input.contentEncrypted, input.metadataIv, input.metadataEncrypted));
    return post;
  });
}

/**
 * Whether an AI-app session may delete this entry: one it created within the
 * undo window, or its own data (assistant_owned) at any age — and in both
 * cases only while
 *  - it can see it (an entry hidden from AI is "not found" to it), and
 *  - the version there is the one the app itself last wrote.
 * An entry the owner has edited since (or put back from the list of changes)
 * is the owner's: the app may not delete it, and if it was the app's own data
 * that ends for good — the row leaves assistant_owned here, so a later write
 * by the app can't win the right back. Read under the account's lock, like
 * the app's writes, so the two can't cross.
 */
export async function assistantMayDelete(schemaName: string, id: number, undoMs: number = ASSISTANT_UNDO_MS): Promise<boolean> {
  await ensureAiPrivacyTables(schemaName);
  const s = escapeSchema(schemaName);
  return withTenantLock(schemaName, async (tx) => {
    const [now] = await tx.$queryRawUnsafe<{ mark: Buffer | null }[]>(currentMarkSql(s, 'entry'), id);
    if (!now) return false;
    const [wrote] = await tx.$queryRawUnsafe<{ mark: Buffer }[]>(
      `SELECT mark FROM ${s}.assistant_wrote WHERE kind = 'entry' AND ref = $1`, String(id));
    const appsOwn = !!wrote && !!now.mark && Buffer.from(wrote.mark).equals(Buffer.from(now.mark));
    if (!appsOwn) {
      await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_owned WHERE post_id = $1`, id);
      return false;
    }
    const [{ ok }] = await tx.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT NOT EXISTS (SELECT 1 FROM ${s}.ai_hidden_posts WHERE post_id = $1)
          AND (EXISTS (SELECT 1 FROM ${s}.assistant_owned WHERE post_id = $1)
            OR EXISTS (SELECT 1 FROM ${s}.assistant_creations
                       WHERE post_id = $1 AND created_at > NOW() - make_interval(secs => $2::double precision / 1000))) AS ok`,
      id, undoMs);
    return !!ok;
  });
}

export type AssistantDelete = { keptChangeId: number } | 'unseen' | 'limit';

/**
 * An AI-app session deleting an entry that isn't its own to remove outright
 * (assistantMayDelete said no): any entry it can see. All under the account's
 * lock, in one transaction:
 *  - the entry must be there and not hidden from AI (`unseen` otherwise: to
 *    the app, a hidden entry doesn't exist),
 *  - the day's budget (ASSISTANT_DELETES_PER_DAY; `limit` when spent),
 *  - room in the list (AssistantHistoryFull otherwise, and nothing deleted),
 *  - a full copy of the entry is kept (EntryDeletionExtra),
 *  - `beforeDelete` runs (the route removes the entry's public links: they
 *    hold it as plaintext). It is a write to the main database, so it isn't
 *    part of this transaction: if it fails nothing here is kept and the entry
 *    stays; if something after it fails the links are gone and the entry
 *    stays (the safe way round — never a link outliving its entry). It runs
 *    under the lock, before the delete, for that reason, and holds the
 *    account's connection for one short indexed delete,
 *  - the entry is deleted. Its topic links and assistant_owned row go with it
 *    by foreign key, and the app's mark goes too, so once it is put back the
 *    entry is the owner's.
 *
 * Earlier versions kept of the entry stay: the copy is what is put back, and
 * those can then be put back over it in turn.
 */
export async function assistantDeletePost(
  schemaName: string, id: number, sessionId: number, beforeDelete: () => Promise<unknown> = async () => undefined,
): Promise<AssistantDelete> {
  await ensureAiPrivacyTables(schemaName);
  const s = escapeSchema(schemaName);
  const result = await withTenantLock<AssistantDelete>(schemaName, async (tx) => {
    const [post] = await tx.$queryRawUnsafe<{ bytes: number | bigint }[]>(
      `SELECT COALESCE(octet_length(content_encrypted), 0) + COALESCE(octet_length(metadata_encrypted), 0)
                + COALESCE(octet_length(content), 0) + COALESCE(octet_length(metadata::text), 0) AS bytes
       FROM ${s}.posts WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM ${s}.ai_hidden_posts WHERE post_id = $1)`, id);
    if (!post) return 'unseen';
    const [{ n }] = await tx.$queryRawUnsafe<{ n: number | bigint }[]>(
      `SELECT COUNT(*) AS n FROM ${s}.assistant_new_records WHERE kind = 'entry-deletion' AND created_at > NOW() - interval '1 day'`);
    if (Number(n) >= ASSISTANT_DELETES_PER_DAY) return 'limit';
    await tx.$executeRawUnsafe(expireSql(s));
    const [used] = await tx.$queryRawUnsafe<{ n: number | bigint; bytes: number | bigint | null }[]>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(${SIZE}), 0) AS bytes FROM ${s}.assistant_changes`);
    // The topics kept from AI now: the server can't see the entry's topic, so
    // one hidden after this makes the entry come back hidden (recreateDeletedEntry)
    const hiddenTopics = await hiddenTopicsNow(tx, s);
    // The copy's times and links add a little to the entry's own bytes
    if (Number(used.n) >= ASSISTANT_HISTORY_ROWS || Number(used.bytes ?? 0) + Number(post.bytes) + 512 > ASSISTANT_HISTORY_BYTES) {
      throw new AssistantHistoryFull();
    }
    const [kept] = await tx.$queryRawUnsafe<{ id: number }[]>(
      `INSERT INTO ${s}.assistant_changes (kind, ref, body, body_iv, meta, meta_iv, extra)
       SELECT 'entry', p.id::text, p.content_encrypted, p.content_iv, p.metadata_encrypted, p.metadata_iv,
              jsonb_build_object(
                'deleted', TRUE, 'session', $2::int,
                'createdAt', to_jsonb(p.created_at), 'updatedAt', to_jsonb(p.updated_at),
                'isEncrypted', COALESCE(p.is_encrypted, FALSE), 'content', p.content, 'metadata', p.metadata,
                'topicIds', (SELECT COALESCE(jsonb_agg(pt.tax_id ORDER BY pt.tax_id), '[]'::jsonb)
                             FROM ${s}.post_taxonomies pt WHERE pt.post_id = p.id),
                'hiddenTopics', to_jsonb($3::int[]))
       FROM ${s}.posts p WHERE p.id = $1
       RETURNING id::int AS id`, id, sessionId, hiddenTopics);
    // Counted for the day's budget, by the copy's id (each delete once)
    await tx.$executeRawUnsafe(`INSERT INTO ${s}.assistant_new_records (kind, ref) VALUES ('entry-deletion', $1)`, String(kept.id));
    // Old rows have no further use
    await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_new_records WHERE created_at < NOW() - interval '2 days'`);
    await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_wrote WHERE kind = 'entry' AND ref = $1`, String(id));
    await beforeDelete();
    // The sync trigger records the deletion, as for any other delete
    await tx.$executeRawUnsafe(`DELETE FROM ${s}.posts WHERE id = $1`, id);
    return { keptChangeId: kept.id };
  });
  if (typeof result === 'object') {
    // Never fails the delete: the list is trimmed again at the next one
    await pruneDeletedPosts(schemaName).catch(err => {
      console.error('Deleted-entries trim failed:', err instanceof Error ? err.message : 'Unknown error');
    });
  }
  return result;
}

/** How many dose records the AI app may make new in a day (ticking an existing one isn't counted). */
export const ASSISTANT_NEW_DOSES_PER_DAY = 100;

/**
 * An AI-app session writing a record that may not exist yet (a dose record):
 * inside the caller's transaction (assistantWrite's, under the account's
 * lock), whether this write is within the app's budget of new records for the
 * day. A record that is already there costs nothing. A new one is counted
 * here, and the count is rolled back with the write if nothing is saved.
 */
export async function assistantNewRecordAllowed(
  tx: TenantClient, schemaName: string, kind: Exclude<AssistantChangeKind, 'entry'>, ref: string, perDay: number,
): Promise<boolean> {
  const s = escapeSchema(schemaName);
  const there = await tx.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${recordTable(s, kind)}`, ref);
  if (there.length > 0) return true;
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number | bigint }[]>(
    `SELECT COUNT(*) AS n FROM ${s}.assistant_new_records WHERE kind = $1 AND created_at > NOW() - interval '1 day'`, kind);
  if (Number(n) >= perDay) return false;
  await tx.$executeRawUnsafe(
    `INSERT INTO ${s}.assistant_new_records (kind, ref) VALUES ($1, $2) ON CONFLICT (kind, ref) DO UPDATE SET created_at = NOW()`, kind, ref);
  // Old rows have no further use
  await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_new_records WHERE created_at < NOW() - interval '2 days'`);
  return true;
}

/** Versions past their days go (run when the owner's browser loads, so they don't wait for the list to be opened). */
export async function expireAssistantChanges(schemaName: string): Promise<void> {
  if (!(await aiPrivacyTablesExist(schemaName))) return;
  const db = await tenantDb(schemaName);
  await db.$executeRawUnsafe(expireSql(escapeSchema(schemaName)));
}

/** Newest first, a page at a time (`before`: the last id of the page before). */
export async function listAssistantChanges(schemaName: string, before?: number): Promise<{ changes: AssistantChange[]; more: boolean }> {
  // No tables: the AI app has never written for this account
  if (!(await aiPrivacyTablesExist(schemaName))) return { changes: [], more: false };
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  // Past their days: gone before anyone is shown them
  await db.$executeRawUnsafe(expireSql(s));
  // And any kept of an entry that no longer exists (a delete normally takes
  // them with it; this catches one that didn't). Not the copy of an entry the
  // AI app deleted, nor the versions from before it while that copy is here:
  // they are what puts it back. The CASE keeps the cast to entry rows: a
  // dose's or bill's ref is not a number
  await db.$executeRawUnsafe(
    `DELETE FROM ${s}.assistant_changes c WHERE c.kind = 'entry'
       AND NOT EXISTS (SELECT 1 FROM ${s}.posts p WHERE p.id = CASE WHEN c.kind = 'entry' THEN c.ref::int END)
       AND NOT EXISTS (SELECT 1 FROM ${s}.assistant_changes d WHERE d.ref = c.ref AND ${DELETION_SQL('d')})`);
  const rows = await db.$queryRawUnsafe<(AssistantChange & { bytes: number | bigint })[]>(
    `SELECT ${COLUMNS}, ${SIZE} AS bytes FROM ${s}.assistant_changes
     WHERE ($1::bigint IS NULL OR id < $1::bigint) ORDER BY id DESC LIMIT ${PAGE_ROWS + 1}`,
    before ?? null
  );
  const changes: AssistantChange[] = [];
  let total = 0;
  for (const { bytes, ...row } of rows.slice(0, PAGE_ROWS)) {
    total += Number(bytes);
    // Always at least one, however large
    if (changes.length > 0 && total > PAGE_BYTES) break;
    changes.push(row);
  }
  return { changes, more: changes.length < rows.length };
}

export type RestoreResult = { ok: true; change: AssistantChange } | { ok: false; reason: 'unknown' | 'gone' | 'taken' | 'not-yours' };

/** The AI app putting back an entry it deleted: only its own session's copy, and only for this long. */
export interface AppUndo { sessionId: number; undoMs?: number }

/** The statement that writes a kept version back over its record. Returns the rows it changed. */
function writeBackSql(s: string, kind: AssistantChangeKind): string {
  const from = `FROM ${s}.assistant_changes c WHERE c.id = $1::bigint`;
  switch (kind) {
    case 'entry':
      // The update trigger stamps it for sync, like any other save
      return `UPDATE ${s}.posts p SET content_encrypted = c.body, content_iv = c.body_iv, metadata_encrypted = c.meta,
                metadata_iv = c.meta_iv, updated_at = NOW() ${from} AND p.id = c.ref::int`;
    case 'dose':
      return `UPDATE ${s}.medication_dose_records d SET payload_encrypted = c.body, payload_iv = c.body_iv,
                date = (c.extra->>'date')::date, updated_at = NOW() ${from} AND d.id = c.ref`;
    case 'bill':
      return `UPDATE ${s}.finance_bills b SET payload_encrypted = c.body, payload_iv = c.body_iv, updated_at = NOW() ${from} AND b.id = c.ref`;
    case 'setting':
      return `UPDATE ${s}.settings t SET value = c.extra->'value', updated_at = NOW() ${from} AND t.key = c.ref`;
  }
}

/**
 * Re-create an entry the AI app deleted, from its copy, inside the caller's
 * transaction: the same id (its ciphertext is bound to it, so no other would
 * open), the same times, and its topic links to topics that are still there (a
 * topic deleted since is left off rather than the entry kept from coming
 * back). `taken`: an entry with that id is there, and is never written over.
 *
 * The id was used up when the entry was first made, so it goes straight in,
 * not through a reservation. Its row in deleted_posts goes: a browser whose
 * last sync was before the delete would otherwise be sent the entry and its
 * deletion together, and drop it. One whose sync was after it is sent the
 * entry as new (the insert trigger stamps it, like any other write).
 */
/** The topic ids the server's copy of the AI choices keeps from AI, read inside the caller's transaction. */
async function hiddenTopicsNow(tx: TenantClient, s: string): Promise<number[]> {
  const [row] = await tx.$queryRawUnsafe<{ value: unknown }[]>(`SELECT value FROM ${s}.settings WHERE key = $1`, AI_PRIVACY_KEY);
  return parseAiPrivacy(row?.value).hiddenTopicIds;
}

async function recreateDeletedEntry(tx: TenantClient, s: string, change: AssistantChange): Promise<boolean> {
  const made = await tx.$executeRawUnsafe(
    `INSERT INTO ${s}.posts (id, content, metadata, content_encrypted, content_iv, metadata_encrypted, metadata_iv, is_encrypted, created_at, updated_at)
     SELECT c.ref::int, c.extra->>'content', COALESCE(NULLIF(c.extra->'metadata', 'null'::jsonb), '{}'::jsonb),
            c.body, c.body_iv, c.meta, c.meta_iv, COALESCE((c.extra->>'isEncrypted')::boolean, TRUE),
            (c.extra->>'createdAt')::timestamptz, (c.extra->>'updatedAt')::timestamptz
     FROM ${s}.assistant_changes c WHERE c.id = $1::bigint
     ON CONFLICT (id) DO NOTHING`, change.id);
  if (!made) return false;
  const postId = Number(change.ref);
  await tx.$executeRawUnsafe(`DELETE FROM ${s}.deleted_posts WHERE id = $1`, postId);
  // A topic kept from AI since it was deleted may be this entry's (its topic is
  // sealed, and a browser can't mark an entry that doesn't exist): it comes
  // back hidden, so the app can't read it before a browser brings the list in
  // line. A copy with no record of the topics then counts every one as new.
  // Failing closed: a browser's next load shares it again if it should be
  const before = new Set(Array.isArray(change.extra?.hiddenTopics) ? (change.extra.hiddenTopics as unknown[]).filter(Number.isInteger) as number[] : []);
  if ((await hiddenTopicsNow(tx, s)).some(t => !before.has(t))) {
    await tx.$executeRawUnsafe(`INSERT INTO ${s}.ai_hidden_posts (post_id) VALUES ($1) ON CONFLICT DO NOTHING`, postId);
  }
  const topicIds = Array.isArray(change.extra?.topicIds) ? (change.extra.topicIds as unknown[]).filter(Number.isInteger) : [];
  if (topicIds.length > 0) {
    await tx.$executeRawUnsafe(
      `INSERT INTO ${s}.post_taxonomies (post_id, tax_id)
       SELECT $1, t.id FROM ${s}.taxonomies t WHERE t.id = ANY($2::int[])
       ON CONFLICT DO NOTHING`, postId, topicIds);
  }
  return true;
}

/**
 * Put a kept version back. What is there now takes its place in the list, so
 * this can be undone the same way. `gone`: the record itself was deleted
 * since, and there is nothing to put it back over.
 *
 * The copy of an entry the AI app deleted is put back by re-creating the
 * entry (recreateDeletedEntry), and leaves the list; there is nothing to swap.
 * `taken`: an entry with its id is there already.
 *
 * With `appUndo` (the AI app's own undo): only the copy of an entry that
 * session deleted, within the undo window. Anything else is `not-yours`.
 *
 * Not held to the journal's storage cap: the version fitted when it was
 * written, and this list has a cap of its own. Nor to this list's cap: one
 * version leaves it as the other joins.
 */
export async function restoreAssistantChange(schemaName: string, id: number, appUndo?: AppUndo): Promise<RestoreResult> {
  if (!(await aiPrivacyTablesExist(schemaName))) return { ok: false, reason: 'unknown' };
  const s = escapeSchema(schemaName);
  // Its kind first, so the record's own table is known to be there before the lock is taken
  const db = await tenantDb(schemaName);
  const [found] = await db.$queryRawUnsafe<{ kind: AssistantChangeKind }[]>(`SELECT kind FROM ${s}.assistant_changes WHERE id = $1::bigint`, id);
  if (!found) return { ok: false, reason: 'unknown' };
  await ensureTables(schemaName, found.kind);
  // A deleted entry's row in deleted_posts is cleared when it comes back
  if (found.kind === 'entry') await ensurePostSync(schemaName);
  return withTenantLock(schemaName, async (tx) => {
    const [change] = await tx.$queryRawUnsafe<(AssistantChange & { recent: boolean })[]>(
      `SELECT ${COLUMNS}, saved_at > NOW() - make_interval(secs => $2::double precision / 1000) AS recent
       FROM ${s}.assistant_changes WHERE id = $1::bigint`, id, appUndo?.undoMs ?? ASSISTANT_UNDO_MS);
    if (!change) return { ok: false as const, reason: 'unknown' as const };
    const { recent, ...version } = change;
    if (appUndo && !(isEntryDeletion(version) && version.extra?.session === appUndo.sessionId && recent)) {
      return { ok: false as const, reason: 'not-yours' as const };
    }
    if (isEntryDeletion(version)) {
      if (!(await recreateDeletedEntry(tx, s, version))) return { ok: false as const, reason: 'taken' as const };
      await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_changes WHERE id = $1::bigint`, id);
      // The owner's entry again: the app's next write keeps this version first
      await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_wrote WHERE kind = 'entry' AND ref = $1`, version.ref);
      return { ok: true as const, change: version };
    }
    // What is there now, kept first (nothing is inserted when the record is gone)
    const kept = await tx.$executeRawUnsafe(keepSql(s, change.kind), refParam(change.kind, change.ref));
    if (!kept) return { ok: false as const, reason: 'gone' as const };
    await tx.$executeRawUnsafe(writeBackSql(s, change.kind), id);
    await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_changes WHERE id = $1::bigint`, id);
    // The record now holds a version the owner chose. Whatever the app last
    // wrote there is no longer what it holds, so its mark goes: the app's next
    // write keeps this version, whatever bytes it carries
    await tx.$executeRawUnsafe(`DELETE FROM ${s}.assistant_wrote WHERE kind = $1 AND ref = $2`, change.kind, change.ref);
    return { ok: true as const, change: version };
  });
}

/**
 * The record itself is being deleted: every version kept of it goes too, so
 * nothing of a deleted entry, dose, bill or setting stays behind. Called
 * before the record is deleted (like its public links): if this fails the
 * delete fails, and is tried again, rather than leaving copies of something
 * the owner removed. And again after it: a write by the AI app that landed
 * between the two would otherwise leave a version of a record that is gone.
 */
export async function forgetAssistantChangesFor(schemaName: string, kind: AssistantChangeKind, ref: string | string[]): Promise<void> {
  const refs = Array.isArray(ref) ? ref : [ref];
  if (refs.length === 0) return;
  // Every delete in the app runs this, whether or not the account uses the AI
  // app. One that never has keeps no versions, and has no tables to look in
  if (!(await aiPrivacyTablesExist(schemaName))) return;
  const db = await tenantDb(schemaName);
  const s = escapeSchema(schemaName);
  // One trip, however many records
  await db.$executeRawUnsafe(
    `WITH kept AS (DELETE FROM ${s}.assistant_changes WHERE kind = $1 AND ref = ANY($2::text[]))
     DELETE FROM ${s}.assistant_wrote WHERE kind = $1 AND ref = ANY($2::text[])`, kind, refs);
}

/** Throw one kept version away. */
export async function deleteAssistantChange(schemaName: string, id: number): Promise<void> {
  if (!(await aiPrivacyTablesExist(schemaName))) return;
  const db = await tenantDb(schemaName);
  await db.$executeRawUnsafe(`DELETE FROM ${escapeSchema(schemaName)}.assistant_changes WHERE id = $1::bigint`, id);
}

/** Throw them all away (asked for, or the account moved to a new key: the old versions couldn't be opened any more). */
export async function clearAssistantChanges(schemaName: string): Promise<void> {
  if (!(await aiPrivacyTablesExist(schemaName))) return;
  const db = await tenantDb(schemaName);
  await db.$executeRawUnsafe(`DELETE FROM ${escapeSchema(schemaName)}.assistant_changes`);
}
