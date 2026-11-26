/**
 * The capped saves and the remembered storage figure (db/storageUsage.ts), run
 * against a real Postgres: a save that counts and one that doesn't are two
 * different statements, and the route tests only ever see them mocked.
 *
 * Skipped unless TEST_DATABASE_URL names a database on this machine (see
 * assistantHistory.db.test.ts). It makes one schema of its own and drops it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const url = process.env.TEST_DATABASE_URL ?? '';
const local = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

vi.hoisted(() => {
  const test = process.env.TEST_DATABASE_URL ?? '';
  if (/^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1)(:\d+)?\//.test(test)) {
    process.env.DATABASE_URL = test;
    delete process.env.SHARD_DATABASE_URLS;
  }
});

const SCHEMA = `usr_8_${Math.random().toString(16).slice(2, 8)}`;
const iv = (n: number) => Buffer.alloc(12, n);
const OVERHEAD = 512;

describe.skipIf(!local)('Capped saves and the remembered storage figure (real Postgres)', () => {
  type Queries = typeof import('../../db/tenantQueries.js');
  type UsageModule = typeof import('../../db/storageUsage.js');
  let q: Queries;
  let u: UsageModule;
  let db: { $executeRawUnsafe: (sql: string, ...v: unknown[]) => Promise<number>; $disconnect: () => Promise<void> };

  const fields = (bytes: number, n = 1) => ({
    contentEncrypted: Buffer.alloc(bytes, n), contentIv: iv(n), metadataEncrypted: Buffer.alloc(16, n), metadataIv: iv(n + 100),
  });
  const sizeOf = (bytes: number) => bytes + 16 + OVERHEAD;
  const create = async (bytes: number, cap: number) => {
    const [id] = await q.reservePostIds(SCHEMA, 1);
    return { id, result: await q.createPostCapped(SCHEMA, { id, ...fields(bytes) }, sizeOf(bytes), cap) };
  };

  beforeAll(async () => {
    q = await import('../../db/tenantQueries.js');
    u = await import('../../db/storageUsage.js');
    const { prisma } = await import('../../db/prisma.js');
    const { generateTenantSchemaStatements } = await import('../../db/schemaManager.js');
    db = prisma as unknown as typeof db;
    await q.ensurePostSyncFunction(db);
    for (const sql of generateTenantSchemaStatements(SCHEMA)) await db.$executeRawUnsafe(sql);
  });

  afterAll(async () => {
    if (!db) return;
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.$disconnect();
  });

  it('a first save counts the journal and remembers what it holds, and hands back the entry alone', async () => {
    const { id, result } = await create(1000, 1e9);
    expect(result).toMatchObject({ id });
    expect(result).not.toHaveProperty('usedBytes');
    expect(u.knownUsage(SCHEMA, 'posts')?.bytes).toBe(await q.postStorageBytes(SCHEMA));
  });

  it('a save far below the cap is made without counting, and its size goes on the figure', async () => {
    const { id } = await create(1000, 1e9);
    const before = u.knownUsage(SCHEMA, 'posts')!.bytes;
    const saved = await q.updatePostCapped(SCHEMA, id, fields(2000, 2), sizeOf(2000), 1e9);
    expect(saved).toMatchObject({ id });
    expect(Buffer.from((await q.getPost(SCHEMA, id))!.contentEncrypted as Buffer).length).toBe(2000);
    // The whole new size was added: the figure never falls below what is stored
    expect(u.knownUsage(SCHEMA, 'posts')!.bytes).toBe(before + sizeOf(2000));
    expect(u.knownUsage(SCHEMA, 'posts')!.bytes).toBeGreaterThanOrEqual(await q.postStorageBytes(SCHEMA));
  });

  it('without counting, a missing entry is still "no such entry" and an unreserved id is still refused', async () => {
    await create(100, 1e9);
    expect(u.knownUsage(SCHEMA, 'posts')).not.toBeNull();
    expect(await q.updatePostCapped(SCHEMA, 999_999, fields(10), sizeOf(10), 1e9)).toBeNull();
    expect(await q.createPostCapped(SCHEMA, { id: 999_998, ...fields(10) }, sizeOf(10), 1e9)).toBeNull();
  });

  it('past half the cap a save counts again, and a full journal is refused whatever the figure said', async () => {
    const used = await q.postStorageBytes(SCHEMA);
    // A figure that says the journal is nearly empty (as another instance's writes would leave it)
    u.setUsage(SCHEMA, 'posts', { bytes: 0, rows: 0 });
    const cap = used + 3000;
    // Over half the cap with the write: counted, and there is no room
    const tooBig = await create(4000, cap);
    expect(tooBig.result).toBe('full');
    // The reservation was left alone, so the same id can be tried again with something smaller
    const fits = await q.createPostCapped(SCHEMA, { id: tooBig.id, ...fields(1000) }, sizeOf(1000), cap);
    expect(fits).toMatchObject({ id: tooBig.id });
    expect(u.knownUsage(SCHEMA, 'posts')!.bytes).toBe(await q.postStorageBytes(SCHEMA));
  });

  it('an update with no room is refused as full, not as missing', async () => {
    const { id } = await create(100, 1e9);
    u.forgetUsage(SCHEMA);
    const used = await q.postStorageBytes(SCHEMA);
    expect(await q.updatePostCapped(SCHEMA, id, fields(50_000), sizeOf(50_000), used + 1000)).toBe('full');
  });

  it('a multi-row write forgets the figure', async () => {
    await create(100, 1e9);
    expect(u.knownUsage(SCHEMA, 'posts')).not.toBeNull();
    await q.withTenantLock(SCHEMA, async () => undefined);
    expect(u.knownUsage(SCHEMA, 'posts')).toBeNull();
  });

  it('several entries go in one statement, and ids that are not entries are passed over', async () => {
    const a = await create(10, 1e9);
    const b = await create(10, 1e9);
    const keep = await create(10, 1e9);
    expect(await q.deletePosts(SCHEMA, [a.id, b.id, 999_997])).toBe(2);
    expect(await q.getPost(SCHEMA, a.id)).toBeNull();
    expect(await q.getPost(SCHEMA, b.id)).toBeNull();
    expect(await q.getPost(SCHEMA, keep.id)).not.toBeNull();
    // Each is on the list of deleted ids, so a browser's sync drops it and its id is never used again
    const changes = await q.getPostChanges(SCHEMA, '0');
    expect('deleted' in changes ? changes.deleted : []).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(await q.deletePosts(SCHEMA, [])).toBe(0);
  });

  it('a new account has no AI tables, and reading or clearing them makes none', async () => {
    const h = await import('../../db/assistantHistory.js');
    expect(await q.aiPrivacyTablesExist(SCHEMA)).toBe(false);
    expect(await q.getAiHiddenIds(SCHEMA)).toEqual([]);
    await q.pruneAiHidden(SCHEMA);
    await q.setAiHidden(SCHEMA, [1], false);
    await h.expireAssistantChanges(SCHEMA);
    expect(await h.listAssistantChanges(SCHEMA)).toEqual({ changes: [], more: false });
    await h.forgetAssistantChangesFor(SCHEMA, 'entry', ['1', '2']);
    await h.clearAssistantChanges(SCHEMA);
    await h.deleteAssistantChange(SCHEMA, 1);
    expect(await h.restoreAssistantChange(SCHEMA, 1)).toEqual({ ok: false, reason: 'unknown' });
    expect(await q.aiPrivacyTablesExist(SCHEMA)).toBe(false);
    // Hiding an entry is what makes them
    const { id } = await create(10, 1e9);
    await q.setAiHidden(SCHEMA, [id], true);
    expect(await q.aiPrivacyTablesExist(SCHEMA)).toBe(true);
    expect(await q.getAiHiddenIds(SCHEMA)).toEqual([id]);
    // …and deleting several entries at once still clears what was kept of them
    await h.forgetAssistantChangesFor(SCHEMA, 'entry', [String(id)]);
  });

  it('settings: counts once, then saves without counting, and both caps still hold', async () => {
    const caps = { maxKeys: 500, maxBytes: 1_000_000 };
    expect(await q.upsertSettingCapped(SCHEMA, 'habitLog', { a: 'x'.repeat(100) }, caps)).toMatchObject({ key: 'habitLog' });
    const first = u.knownUsage(SCHEMA, 'settings')!.bytes;
    expect(first).toBeGreaterThan(100);
    const again = await q.upsertSettingCapped(SCHEMA, 'habitLog', { a: 'y'.repeat(200) }, caps);
    expect(again).toMatchObject({ key: 'habitLog', value: { a: 'y'.repeat(200) } });
    expect(again).not.toHaveProperty('usedBytes');
    expect(u.knownUsage(SCHEMA, 'settings')!.bytes).toBeGreaterThan(first);
    // The key cap is checked on every save, counted or not
    expect(await q.upsertSettingCapped(SCHEMA, 'other', 1, { maxKeys: 1, maxBytes: 1_000_000 })).toBe('Too many settings');
    // …and a save that would pass half the cap counts, and is refused when there is no room
    u.setUsage(SCHEMA, 'settings', { bytes: 0, rows: 0 });
    expect(await q.upsertSettingCapped(SCHEMA, 'big', { a: 'z'.repeat(900) }, { maxKeys: 500, maxBytes: 1000 })).toBe('Settings storage is full');
  });

  it('dose records: counts once, then ticks without counting, and both caps still hold', async () => {
    await q.ensureDoseRecordsTable(SCHEMA);
    const caps = { maxRows: 1000, maxBytes: 1_000_000 };
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    expect(await q.upsertDoseRecordCapped(SCHEMA, id(1), '2026-11-26', Buffer.alloc(40, 1), iv(1), caps)).toMatchObject({ id: id(1) });
    expect(u.knownUsage(SCHEMA, 'doses')).toEqual(expect.objectContaining({ rows: 1, bytes: 40 }));
    const second = await q.upsertDoseRecordCapped(SCHEMA, id(2), '2026-11-26', Buffer.alloc(40, 2), iv(2), caps);
    expect(second).toMatchObject({ id: id(2) });
    expect(second).not.toHaveProperty('usedRows');
    expect(u.knownUsage(SCHEMA, 'doses')).toEqual(expect.objectContaining({ rows: 2, bytes: 80 }));
    // A figure that is too low doesn't let a full table take another row: past half the cap it counts
    u.setUsage(SCHEMA, 'doses', { bytes: 0, rows: 1 });
    expect(await q.upsertDoseRecordCapped(SCHEMA, id(3), '2026-11-26', Buffer.alloc(40, 3), iv(3), { maxRows: 2, maxBytes: 1_000_000 })).toBeNull();
    // …while one that exists can still be replaced
    expect(await q.upsertDoseRecordCapped(SCHEMA, id(2), '2026-11-26', Buffer.alloc(41, 4), iv(4), { maxRows: 2, maxBytes: 1_000_000 })).toMatchObject({ id: id(2) });
  });
});
