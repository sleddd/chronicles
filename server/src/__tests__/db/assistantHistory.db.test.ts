/**
 * The AI app's change history and the hidden-from-AI list, run against a real
 * Postgres: the statements in db/assistantHistory.ts and the ai_hidden_posts
 * queries are SQL, and the route tests only ever see them mocked.
 *
 * Skipped unless TEST_DATABASE_URL names a database on this machine:
 *
 *   TEST_DATABASE_URL=postgresql://test@127.0.0.1:5432/chronicles_test \
 *     npx vitest run src/__tests__/db/assistantHistory.db.test.ts
 *
 * It makes one schema of its own and drops it afterwards. It refuses any host
 * but localhost, so it can never be pointed at a real database by mistake.
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

const SCHEMA = `usr_9_${Math.random().toString(16).slice(2, 8)}`;
const iv = (n: number) => Buffer.alloc(12, n);
const bytes = (text: string) => Buffer.from(text);

describe.skipIf(!local)('AI app change history and hidden list (real Postgres)', () => {
  type Queries = typeof import('../../db/tenantQueries.js');
  type History = typeof import('../../db/assistantHistory.js');
  let q: Queries;
  let h: History;
  let db: { $executeRawUnsafe: (sql: string, ...v: unknown[]) => Promise<number>; $queryRawUnsafe: <T>(sql: string, ...v: unknown[]) => Promise<T>; $disconnect: () => Promise<void> };

  const newEntry = async (content: string, n: number): Promise<number> => {
    const [id] = await q.reservePostIds(SCHEMA, 1);
    const post = await q.createPostCapped(SCHEMA,
      { id, contentEncrypted: bytes(content), contentIv: iv(n), metadataEncrypted: bytes('meta'), metadataIv: iv(n + 100) }, 100, 1e9);
    expect(post).toMatchObject({ id });
    return id;
  };
  /** A save the way the entries route makes one for the AI app. */
  const appSavesEntry = (id: number, content: string, n: number) => h.assistantWrite(SCHEMA, 'entry', String(id),
    h.assistantMark.entry(iv(n), bytes(content), iv(n + 100), bytes('meta')),
    tx => q.updatePost(SCHEMA, id, { contentEncrypted: bytes(content), contentIv: iv(n), metadataEncrypted: bytes('meta'), metadataIv: iv(n + 100) }, tx),
    saved => !!saved);
  /** …and the way a browser saves one. */
  const ownerSavesEntry = (id: number, content: string, n: number) =>
    q.updatePostCapped(SCHEMA, id, { contentEncrypted: bytes(content), contentIv: iv(n), metadataEncrypted: bytes('meta'), metadataIv: iv(n + 100) }, 100, 1e9);
  const contentOf = async (id: number) => Buffer.from((await q.getPost(SCHEMA, id))!.contentEncrypted as Buffer).toString();
  const kept = async () => (await h.listAssistantChanges(SCHEMA)).changes;
  const text = (b: Buffer | null) => (b ? Buffer.from(b).toString() : null);

  beforeAll(async () => {
    q = await import('../../db/tenantQueries.js');
    h = await import('../../db/assistantHistory.js');
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

  it('keeps the owner’s version once, and never the app’s own', async () => {
    const id = await newEntry('owner v1', 1);
    await appSavesEntry(id, 'app v1', 2);
    await appSavesEntry(id, 'app v2', 3);
    await appSavesEntry(id, 'app v3', 4);
    const versions = (await kept()).filter(c => c.ref === String(id));
    expect(versions.map(c => text(c.body))).toEqual(['owner v1']);
    expect(await contentOf(id)).toBe('app v3');
  });

  it('keeps the owner’s version again after the owner saves in between', async () => {
    const id = await newEntry('owner v1', 5);
    await appSavesEntry(id, 'app v1', 6);
    await ownerSavesEntry(id, 'owner v2', 7);
    await appSavesEntry(id, 'app v2', 8);
    const versions = (await kept()).filter(c => c.ref === String(id));
    // Newest first
    expect(versions.map(c => text(c.body))).toEqual(['owner v2', 'owner v1']);
  });

  it('a write that saves nothing keeps nothing', async () => {
    const id = await newEntry('owner v1', 9);
    const result = await h.assistantWrite(SCHEMA, 'entry', String(id), h.assistantMark.entry(iv(10), bytes('x'), iv(110), bytes('meta')), async () => 'full' as const, r => r !== 'full');
    expect(result).toBe('full');
    expect((await kept()).filter(c => c.ref === String(id))).toEqual([]);
    expect(await contentOf(id)).toBe('owner v1');
  });

  it('a write that fails keeps nothing and writes nothing', async () => {
    const id = await newEntry('owner v1', 11);
    await expect(h.assistantWrite(SCHEMA, 'entry', String(id), h.assistantMark.entry(iv(12), bytes('half done'), iv(112), bytes('meta')), async (tx) => {
      await q.updatePost(SCHEMA, id, { contentEncrypted: bytes('half done'), contentIv: iv(12), metadataEncrypted: bytes('meta'), metadataIv: iv(112) }, tx);
      throw new Error('boom');
    }, () => true)).rejects.toThrow('boom');
    expect((await kept()).filter(c => c.ref === String(id))).toEqual([]);
    expect(await contentOf(id)).toBe('owner v1');
  });

  it('nothing is kept for a record the app makes new', async () => {
    const before = (await kept()).length;
    await h.assistantWrite(SCHEMA, 'dose', 'dose-new', h.assistantMark.record(iv(13), bytes('d1')),
      tx => q.upsertDoseRecord(SCHEMA, 'dose-new', '2026-11-20', bytes('d1'), iv(13), tx), r => !!r);
    expect((await kept()).length).toBe(before);
  });

  it('puts a version back by swapping, for every kind', async () => {
    // An entry
    const id = await newEntry('owner v1', 20);
    await appSavesEntry(id, 'app v1', 21);
    let [change] = (await kept()).filter(c => c.ref === String(id));
    expect(await h.restoreAssistantChange(SCHEMA, change.id)).toMatchObject({ ok: true });
    expect(await contentOf(id)).toBe('owner v1');
    // The app's version took its place, so the restore can be undone
    [change] = (await kept()).filter(c => c.ref === String(id));
    expect(text(change.body)).toBe('app v1');
    await h.restoreAssistantChange(SCHEMA, change.id);
    expect(await contentOf(id)).toBe('app v1');

    // A dose record, with its day
    await q.ensureDoseRecordsTable(SCHEMA);
    await q.upsertDoseRecord(SCHEMA, 'dose-1', '2026-11-20', bytes('owner dose'), iv(22));
    await h.assistantWrite(SCHEMA, 'dose', 'dose-1', h.assistantMark.record(iv(23), bytes('app dose')),
      tx => q.upsertDoseRecord(SCHEMA, 'dose-1', '2026-11-21', bytes('app dose'), iv(23), tx), r => !!r);
    const dose = (await kept()).find(c => c.kind === 'dose' && c.ref === 'dose-1')!;
    expect(dose.extra).toEqual({ date: '2026-11-20' });
    expect(await h.restoreAssistantChange(SCHEMA, dose.id)).toMatchObject({ ok: true });
    const row = (await q.getDoseRecords(SCHEMA, '2026-11-20')).find(r => r.id === 'dose-1')!;
    expect(text(row.payloadEncrypted as Buffer)).toBe('owner dose');

    // A bill
    await q.ensureFinanceTables(SCHEMA);
    await q.upsertFinanceRecord(SCHEMA, 'bills', 'bill-1', bytes('owner bill'), iv(24));
    await h.assistantWrite(SCHEMA, 'bill', 'bill-1', h.assistantMark.record(iv(25), bytes('app bill')),
      tx => q.upsertFinanceRecord(SCHEMA, 'bills', 'bill-1', bytes('app bill'), iv(25), tx), r => !!r);
    const bill = (await kept()).find(c => c.kind === 'bill')!;
    expect(text(bill.body)).toBe('owner bill');
    expect(await h.restoreAssistantChange(SCHEMA, bill.id)).toMatchObject({ ok: true });
    expect(await q.financeRecordBytes(SCHEMA, 'bills', ['bill-1'])).toBeGreaterThan(0);

    // The habit log (a sealed setting)
    const sealed = (n: string) => ({ ciphertext: `ct-${n}`, iv: `iv-${n}`, v: 2 });
    await q.upsertSetting(SCHEMA, 'habitLog', sealed('owner'));
    const appLog = (n: string) => h.assistantWrite(SCHEMA, 'setting', 'habitLog', h.assistantMark.setting(sealed(n)),
      tx => q.upsertSetting(SCHEMA, 'habitLog', sealed(n), tx), r => !!r);
    await appLog('app1');
    await appLog('app2');
    const logs = (await kept()).filter(c => c.kind === 'setting');
    expect(logs.map(c => c.extra)).toEqual([{ value: sealed('owner') }]);
    expect(await h.restoreAssistantChange(SCHEMA, logs[0].id)).toMatchObject({ ok: true });
    expect((await q.getSetting(SCHEMA, 'habitLog'))!.value).toEqual(sealed('owner'));
  });

  it('says “gone” when the record was deleted, and deleting a record forgets its versions and its mark', async () => {
    const id = await newEntry('owner v1', 30);
    await appSavesEntry(id, 'app v1', 31);
    const [change] = (await kept()).filter(c => c.ref === String(id));
    await h.forgetAssistantChangesFor(SCHEMA, 'entry', String(id));
    expect((await kept()).filter(c => c.ref === String(id))).toEqual([]);
    const marks = await db.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${SCHEMA}.assistant_wrote WHERE kind = 'entry' AND ref = $1`, String(id));
    expect(marks).toEqual([]);
    expect(await h.restoreAssistantChange(SCHEMA, change.id)).toEqual({ ok: false, reason: 'unknown' });

    // A version whose entry went without the delete route: restore finds nothing to put it over, and the list drops it
    const other = await newEntry('owner v1', 32);
    await appSavesEntry(other, 'app v1', 33);
    const [orphan] = (await kept()).filter(c => c.ref === String(other));
    await q.deletePost(SCHEMA, other);
    expect(await h.restoreAssistantChange(SCHEMA, orphan.id)).toEqual({ ok: false, reason: 'gone' });
    expect((await kept()).filter(c => c.ref === String(other))).toEqual([]);
  });

  it('versions past their days go, and nothing else does', async () => {
    const id = await newEntry('owner v1', 40);
    await appSavesEntry(id, 'app v1', 41);
    const [change] = (await kept()).filter(c => c.ref === String(id));
    await db.$executeRawUnsafe(`UPDATE ${SCHEMA}.assistant_changes SET saved_at = NOW() - interval '${h.ASSISTANT_HISTORY_DAYS + 1} days' WHERE id = $1`, change.id);
    const others = (await kept()).length; // listing expires it
    await h.expireAssistantChanges(SCHEMA);
    expect((await kept()).length).toBe(others);
    expect((await kept()).some(c => c.id === change.id)).toBe(false);
  });

  it('a full list refuses the app’s write and pushes nothing out', async () => {
    await h.clearAssistantChanges(SCHEMA);
    const first = await newEntry('the original', 50);
    await appSavesEntry(first, 'app v1', 51);
    // Fill the rest of the list
    await db.$executeRawUnsafe(
      `INSERT INTO ${SCHEMA}.assistant_changes (kind, ref, body) SELECT 'dose', 'filler-' || g, 'x'::bytea FROM generate_series(1, ${h.ASSISTANT_HISTORY_ROWS - 1}) g`);
    const victim = await newEntry('owner writing', 52);
    await expect(appSavesEntry(victim, 'overwritten', 53)).rejects.toBeInstanceOf(h.AssistantHistoryFull);
    // Not written, and the oldest version is still there
    expect(await contentOf(victim)).toBe('owner writing');
    const all = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ${SCHEMA}.assistant_changes`);
    expect(Number(all[0].n)).toBe(h.ASSISTANT_HISTORY_ROWS);
    const original = await db.$queryRawUnsafe<{ body: Buffer }[]>(`SELECT body FROM ${SCHEMA}.assistant_changes WHERE kind = 'entry' AND ref = $1`, String(first));
    expect(text(original[0].body)).toBe('the original');
    // The app can still save over its own version: that keeps nothing
    await appSavesEntry(first, 'app v2', 54);
    expect(await contentOf(first)).toBe('app v2');
    // Once the owner clears the list there is room again
    await h.clearAssistantChanges(SCHEMA);
    await appSavesEntry(victim, 'overwritten', 55);
    expect(await contentOf(victim)).toBe('overwritten');
  });

  it('the byte cap refuses too', async () => {
    await h.clearAssistantChanges(SCHEMA);
    await db.$executeRawUnsafe(
      `INSERT INTO ${SCHEMA}.assistant_changes (kind, ref, body) VALUES ('dose', 'big', decode(repeat('00', ${h.ASSISTANT_HISTORY_BYTES}), 'hex'))`);
    const id = await newEntry('owner writing', 60);
    await expect(appSavesEntry(id, 'overwritten', 61)).rejects.toBeInstanceOf(h.AssistantHistoryFull);
    await h.clearAssistantChanges(SCHEMA);
  });

  it('hidden entries: only real or reserved ids are marked, and an AI-app read never returns one', async () => {
    const shown = await newEntry('shown', 70);
    const hidden = await newEntry('hidden', 71);
    const [reserved] = await q.reservePostIds(SCHEMA, 1);
    await q.setAiHidden(SCHEMA, [hidden, reserved, 2_000_000_000], true);
    expect(await q.getAiHiddenIds(SCHEMA)).toEqual([hidden, reserved].sort((a, b) => a - b));
    expect(await q.isAiHidden(SCHEMA, hidden)).toBe(true);

    expect(await q.getPost(SCHEMA, hidden, { excludeAiHidden: true })).toBeNull();
    expect(await q.getPost(SCHEMA, hidden)).not.toBeNull();
    const page = await q.getPostPage(SCHEMA, { limit: 5000, offset: 0, maxBytes: 1e9, excludeAiHidden: true });
    expect(page.posts.map(p => p.id)).toContain(shown);
    expect(page.posts.map(p => p.id)).not.toContain(hidden);
    const visible = await q.getAiVisibleIds(SCHEMA);
    expect(visible).toContain(shown);
    expect(visible).not.toContain(hidden);
    const changes = await q.getPostChanges(SCHEMA, '0', 5000, 1e9, { excludeAiHidden: true });
    if ('reset' in changes && changes.reset) throw new Error('unexpected reset');
    expect(changes.entries.map(e => e.id)).not.toContain(hidden);

    // An entry created under an id marked beforehand is hidden from its first moment
    await q.createPostCapped(SCHEMA, { id: reserved, contentEncrypted: bytes('born hidden'), contentIv: iv(72), metadataEncrypted: bytes('m'), metadataIv: iv(172) }, 100, 1e9);
    expect(await q.getPost(SCHEMA, reserved, { excludeAiHidden: true })).toBeNull();

    // A deleted entry's mark is pruned; sharing again takes the mark off
    await q.deletePost(SCHEMA, hidden);
    await q.pruneAiHidden(SCHEMA);
    expect(await q.getAiHiddenIds(SCHEMA)).toEqual([reserved]);
    await q.setAiHidden(SCHEMA, [reserved], false);
    expect(await q.getPost(SCHEMA, reserved, { excludeAiHidden: true })).not.toBeNull();
  });

  it('keeps the owner’s version when the app wrote under the owner’s IVs, and again after a restore', async () => {
    // The app chooses its IVs. Writing under the owner's must not make the
    // owner's version look like the app's own — above all once it is put back
    const id = await newEntry('owner v1', 60);
    await appSavesEntry(id, 'app v1', 60); // the same IVs as the owner's version
    let versions = (await kept()).filter(c => c.ref === String(id));
    expect(versions.map(c => text(c.body))).toEqual(['owner v1']);
    expect(await h.restoreAssistantChange(SCHEMA, versions[0].id)).toMatchObject({ ok: true });
    expect(await contentOf(id)).toBe('owner v1');
    // The app writes again: the owner's version, just put back, is kept once more
    await appSavesEntry(id, 'app v2', 61);
    versions = (await kept()).filter(c => c.ref === String(id));
    expect(versions.map(c => text(c.body))).toEqual(['owner v1', 'app v1']);
    expect(await contentOf(id)).toBe('app v2');
  });

  it('putting the app’s own version back makes it the owner’s choice: it is kept before the next write', async () => {
    const id = await newEntry('owner v1', 62);
    await appSavesEntry(id, 'app v1', 63);
    await ownerSavesEntry(id, 'owner v2', 64);
    await appSavesEntry(id, 'app v2', 65);
    // Newest first: owner v2, then owner v1. The owner goes back to… the app's first version isn't kept (its own)
    const [ownerV2] = (await kept()).filter(c => c.ref === String(id));
    await h.restoreAssistantChange(SCHEMA, ownerV2.id); // now: owner v2; kept: app v2, owner v1
    const appV2 = (await kept()).find(c => c.ref === String(id) && text(c.body) === 'app v2')!;
    await h.restoreAssistantChange(SCHEMA, appV2.id); // now: app v2 again, by the owner's choice
    await appSavesEntry(id, 'app v3', 66);
    expect((await kept()).filter(c => c.ref === String(id)).map(c => text(c.body)).sort()).toEqual(['app v2', 'owner v1', 'owner v2']);
  });

  it('the app creates under one lock: counted, undoable for a short while, and its own entry isn’t kept when it changes it', async () => {
    const [id] = await q.reservePostIds(SCHEMA, 1);
    const input = { id, contentEncrypted: bytes('made by the app'), contentIv: iv(80), metadataEncrypted: bytes('meta'), metadataIv: iv(180) };
    const count = async () => Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ${SCHEMA}.assistant_creations`))[0].n);
    const before = await count();
    expect(await h.assistantCreatePost(SCHEMA, input, 100, 1e9)).toMatchObject({ id });
    expect(await count()).toBe(before + 1);
    // The same id again: taken, and nothing more is counted
    expect(await h.assistantCreatePost(SCHEMA, input, 100, 1e9)).toBeNull();
    expect(await count()).toBe(before + 1);
    // No room in the journal
    const [other] = await q.reservePostIds(SCHEMA, 1);
    expect(await h.assistantCreatePost(SCHEMA, { ...input, id: other }, 100, 1)).toBe('full');
    // Ticking the task it just made keeps nothing: the version it replaces is its own
    await appSavesEntry(id, 'made by the app, ticked', 81);
    expect((await kept()).filter(c => c.ref === String(id))).toEqual([]);

    expect(await q.assistantMayUndo(SCHEMA, id)).toBe(true);
    await db.$executeRawUnsafe(`UPDATE ${SCHEMA}.assistant_creations SET created_at = NOW() - interval '3 minutes' WHERE post_id = $1`, id);
    expect(await q.assistantMayUndo(SCHEMA, id)).toBe(false);
    expect(await q.assistantMayUndo(SCHEMA, id + 12345)).toBe(false);

    // The day's budget
    await db.$executeRawUnsafe(
      `INSERT INTO ${SCHEMA}.assistant_creations (post_id) SELECT g FROM generate_series(900000, 900000 + $1::int - 1) g`, q.ASSISTANT_CREATES_PER_DAY);
    expect(await h.assistantCreatePost(SCHEMA, { ...input, id: other }, 100, 1e9)).toBe('limit');
    expect(await q.getPost(SCHEMA, other)).toBeNull();
  });

  it('deleting a record forgets its kept versions and its mark in one go, and when entries were last saved', async () => {
    const id = await newEntry('owner v1', 90);
    await appSavesEntry(id, 'app v1', 91);
    await h.forgetAssistantChangesFor(SCHEMA, 'entry', String(id));
    expect((await kept()).filter(c => c.ref === String(id))).toEqual([]);
    const marks = await db.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${SCHEMA}.assistant_wrote WHERE kind = 'entry' AND ref = $1`, String(id));
    expect(marks).toEqual([]);
    const times = await q.getPostUpdatedAt(SCHEMA, [id, id + 54321]);
    expect(times.map(t => t.id)).toEqual([id]);
    expect(times[0].updatedAt).toBeInstanceOf(Date);
    // Inside a transaction too (the entries route asks under the write's lock)
    await q.setAiHidden(SCHEMA, [id], true);
    expect(await q.withTenantLock(SCHEMA, tx => q.isAiHidden(SCHEMA, id, tx))).toBe(true);
  });

  it('new dose records come out of a day’s budget; ticking one that is there costs nothing; a refused write isn’t counted', async () => {
    await q.ensureDoseRecordsTable(SCHEMA);
    await db.$executeRawUnsafe(`DELETE FROM ${SCHEMA}.assistant_new_records`);
    /** The doses route's write for the AI app, with a budget of two new records a day. */
    const appSavesDose = (id: string, payload: string, n: number, save = true) =>
      h.assistantWrite<unknown>(SCHEMA, 'dose', id, h.assistantMark.record(iv(n), bytes(payload)), async (tx) => {
        if (!(await h.assistantNewRecordAllowed(tx, SCHEMA, 'dose', id, 2))) return 'limit';
        return save ? q.upsertDoseRecord(SCHEMA, id, '2026-11-22', bytes(payload), iv(n), tx) : null;
      }, r => r !== null && r !== 'limit');
    const counted = async () => Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ${SCHEMA}.assistant_new_records`))[0].n);

    expect(await appSavesDose('budget-1', 'a', 40)).toMatchObject({ id: 'budget-1' });
    // A write that saved nothing is rolled back, its count with it
    expect(await appSavesDose('budget-none', 'x', 41, false)).toBeNull();
    expect(await counted()).toBe(1);
    expect(await appSavesDose('budget-2', 'b', 42)).toMatchObject({ id: 'budget-2' });
    // The day's budget is spent: a third new one is refused…
    expect(await appSavesDose('budget-3', 'c', 43)).toBe('limit');
    expect((await q.getDoseRecords(SCHEMA, '2026-11-22')).map(r => r.id).sort()).toEqual(['budget-1', 'budget-2']);
    // …while one that is already there can still be ticked
    expect(await appSavesDose('budget-1', 'a2', 44)).toMatchObject({ id: 'budget-1' });
    expect(await counted()).toBe(2);
  });
});
