import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// What the routes themselves enforce for an assistant session (the Chronicles
// AI app): hidden entries left out, no removing beyond undoing its own new
// entry, settings filtered, bills only and existing ones only.

vi.mock('../../db/tenantQueries.js', () => ({
  getPostPage: vi.fn().mockResolvedValue({ posts: [], more: false }),
  getPost: vi.fn(),
  getPostChanges: vi.fn().mockResolvedValue({ reset: true }),
  createPostCapped: vi.fn(),
  updatePostCapped: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  ensurePostSync: vi.fn().mockResolvedValue(undefined),
  ensurePostReservations: vi.fn().mockResolvedValue(undefined),
  isAiHidden: vi.fn().mockResolvedValue(false),
  getPostUpdatedAt: vi.fn().mockResolvedValue([]),
  reservePostIds: vi.fn().mockResolvedValue([]),
  ensureAiPrivacyTables: vi.fn().mockResolvedValue(undefined),
  assistantTopicAllowed: vi.fn().mockResolvedValue(true),
  recordAssistantTopic: vi.fn().mockResolvedValue(undefined),
  ASSISTANT_TOPICS_PER_DAY: 5,
  createTaxonomy: vi.fn(),
  ensureTaxonomyReservations: vi.fn().mockResolvedValue(undefined),
  reserveTaxonomyIds: vi.fn().mockResolvedValue([9]),
  taxonomyCount: vi.fn().mockResolvedValue(0),
  updateTaxonomy: vi.fn(),
  deleteTaxonomy: vi.fn(),
  reorderTaxonomies: vi.fn(),
  getAiVisibleIds: vi.fn().mockResolvedValue([1, 2]),
  getAiHiddenIds: vi.fn().mockResolvedValue([3]),
  setAiHidden: vi.fn().mockResolvedValue(undefined),
  pruneAiHidden: vi.fn().mockResolvedValue(undefined),
  getAllTaxonomies: vi.fn(),
  ensureDoseRecordsTable: vi.fn().mockResolvedValue(undefined),
  upsertDoseRecordCapped: vi.fn(),
  deleteDoseRecord: vi.fn().mockResolvedValue(true),
  deleteFinanceRecord: vi.fn().mockResolvedValue(true),
  ensureTopicEncryptionColumns: vi.fn().mockResolvedValue(undefined),
  getAllSettings: vi.fn(),
  upsertSettingCapped: vi.fn(),
  deleteSetting: vi.fn(),
  FINANCE_TABLES: { bills: 'finance_bills', budget: 'b', expenses: 'e', goals: 'g', savings: 's' },
  ensureFinanceTables: vi.fn().mockResolvedValue(undefined),
  financeRecordBytes: vi.fn().mockResolvedValue(0),
  financeStorageBytes: vi.fn().mockResolvedValue(0),
  upsertFinanceRecord: vi.fn(),
  withTenantLock: vi.fn((_s: string, fn: (tx: unknown) => unknown) => fn('TX')),
  postStorageBytes: vi.fn().mockResolvedValue(0),
  postExists: vi.fn().mockResolvedValue(true),
  doseRecordStorage: vi.fn().mockResolvedValue({ count: 0, bytes: 0 }),
  upsertDoseRecord: vi.fn(),
  upsertSetting: vi.fn(),
  settingExists: vi.fn().mockResolvedValue(true),
  countSettings: vi.fn().mockResolvedValue(1),
  settingsStorageBytes: vi.fn().mockResolvedValue(0),
}));
vi.mock('../../db/shareQueries.js', () => ({ deleteSharesForEntry: vi.fn().mockResolvedValue(0) }));
vi.mock('../../db/assistantHistory.js', () => ({
  // Runs the route's write on a stand-in transaction (the real one: assistantHistory.db.test.ts)
  assistantWrite: vi.fn(async (_schema: string, _kind: string, _ref: string, _mark: Buffer, write: (tx: unknown) => unknown) => write('TX')),
  assistantNewRecordAllowed: vi.fn().mockResolvedValue(true),
  ASSISTANT_NEW_DOSES_PER_DAY: 100,
  assistantCreatePost: vi.fn(),
  assistantMayDelete: vi.fn().mockResolvedValue(false),
  assistantDeletePost: vi.fn().mockResolvedValue('unseen'),
  assistantMark: { entry: (...parts: Buffer[]) => Buffer.concat(parts), record: (...parts: Buffer[]) => Buffer.concat(parts), setting: () => Buffer.from('iv') },
  AssistantHistoryFull: class AssistantHistoryFull extends Error {},
  ASSISTANT_HISTORY_FULL: { error: 'The list is full' },
  expireAssistantChanges: vi.fn().mockResolvedValue(undefined),
  forgetAssistantChangesFor: vi.fn().mockResolvedValue(undefined),
  listAssistantChanges: vi.fn().mockResolvedValue({ changes: [], more: false }),
  restoreAssistantChange: vi.fn(),
  deleteAssistantChange: vi.fn().mockResolvedValue(undefined),
  clearAssistantChanges: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../middleware/auth.js', () => ({ revokeAssistantSessions: vi.fn().mockResolvedValue(undefined) }));

import entriesRouter from '../../routes/entries.js';
import settingsRouter from '../../routes/settings.js';
import financeRouter from '../../routes/finance.js';
import topicsRouter from '../../routes/topics.js';
import dosesRouter from '../../routes/doses.js';
import historyRouter from '../../routes/assistantHistory.js';
import { assistantWrite, assistantCreatePost, assistantMayDelete, assistantDeletePost, assistantNewRecordAllowed, AssistantHistoryFull, forgetAssistantChangesFor, listAssistantChanges, restoreAssistantChange, deleteAssistantChange, clearAssistantChanges } from '../../db/assistantHistory.js';
import { revokeAssistantSessions } from '../../middleware/auth.js';
import { deleteSharesForEntry } from '../../db/shareQueries.js';
import type { AiPrivacy } from '@chronicles/shared';
import {
  getPostPage, getPost, getPostChanges, createPostCapped, updatePostCapped, deletePost, isAiHidden, getPostUpdatedAt,
  assistantTopicAllowed, recordAssistantTopic, createTaxonomy, reserveTaxonomyIds, reservePostIds,
  updatePost, postStorageBytes, upsertDoseRecord, upsertSetting, getAllSettings, upsertSettingCapped, financeRecordBytes, upsertFinanceRecord, setAiHidden, getAllTaxonomies, deleteSetting,
} from '../../db/tenantQueries.js';

const SCHEMA = 'usr_1_a1b2c3';
const ON: AiPrivacy = { appEnabled: true, hiddenTopicIds: [], hiddenFeatures: [] };
function appFor(assistant: boolean, privacy: AiPrivacy = ON) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { accountId: 1, tenantSchemaName: SCHEMA, sessionId: 1, selector: 'aabbccddee11', ...(assistant && { assistant: true, aiPrivacy: privacy }) };
    next();
  });
  app.use('/api/topics', topicsRouter);
  app.use('/api/doses', dosesRouter);
  app.use('/api/assistant-changes', historyRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/finance', financeRouter);
  return app;
}
const smith = appFor(true);
const browser = appFor(false);

const post = {
  id: 5, content: null, metadata: null, contentEncrypted: Buffer.from('c'), contentIv: Buffer.alloc(12), metadataEncrypted: Buffer.from('m'),
  metadataIv: Buffer.alloc(12), isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
};
const b64 = (n: number) => Buffer.alloc(n, 1).toString('base64');
const fullSave = { format: 3, contentEncrypted: b64(20), contentIv: b64(12), metadataEncrypted: b64(20), metadataIv: b64(12) };

describe('Entries, for the AI app', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves hidden entries out of the list, the change feed and single reads', async () => {
    await request(smith).get('/api/entries?v=2');
    expect(getPostPage).toHaveBeenCalledWith(SCHEMA, expect.objectContaining({ excludeAiHidden: true }));
    await request(smith).get('/api/entries/changes?since=10');
    expect(getPostChanges).toHaveBeenCalledWith(SCHEMA, '10', 5000, expect.any(Number), { excludeAiHidden: true });
    (getPost as any).mockResolvedValue(null);
    const one = await request(smith).get('/api/entries/5');
    expect(getPost).toHaveBeenCalledWith(SCHEMA, 5, { excludeAiHidden: true });
    expect(one.status).toBe(404);
  });

  it('a browser session still sees everything', async () => {
    await request(browser).get('/api/entries?v=2');
    expect(getPostPage).toHaveBeenCalledWith(SCHEMA, expect.not.objectContaining({ excludeAiHidden: true }));
  });

  it('creates through the one locked path that counts and records it, so it can undo it', async () => {
    (assistantCreatePost as any).mockResolvedValue(post);
    const res = await request(smith).post('/api/entries').send({ id: 5, ...fullSave, isEncrypted: true });
    expect(res.status).toBe(201);
    expect(assistantCreatePost).toHaveBeenCalledWith(SCHEMA, expect.objectContaining({ id: 5 }), expect.any(Number), expect.any(Number), { owned: false });
    expect(createPostCapped).not.toHaveBeenCalled();
  });

  it('records its own data (assistantOwned) in the same locked create, out of the same day’s budget', async () => {
    (assistantCreatePost as any).mockResolvedValue(post);
    const res = await request(smith).post('/api/entries').send({ id: 5, ...fullSave, isEncrypted: true, assistantOwned: true });
    expect(res.status).toBe(201);
    expect(assistantCreatePost).toHaveBeenCalledWith(SCHEMA, expect.objectContaining({ id: 5 }), expect.any(Number), expect.any(Number), { owned: true });
    // The flag is never stored as part of the entry
    expect((assistantCreatePost as any).mock.calls[0][1]).not.toHaveProperty('assistantOwned');
    expect((await request(smith).post('/api/entries').send({ id: 5, ...fullSave, isEncrypted: true, assistantOwned: 'yes' })).status).toBe(400);
  });

  it('a browser sending assistantOwned is refused, single or in an import; without it nothing changes', async () => {
    (createPostCapped as any).mockResolvedValue(post);
    for (const assistantOwned of [true, false]) {
      const res = await request(browser).post('/api/entries').send({ id: 5, ...fullSave, isEncrypted: true, assistantOwned });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only for the Chronicles AI app/);
    }
    const batch = await request(browser).post('/api/entries/batch').send({ entries: [{ id: 5, ...fullSave, isEncrypted: true, assistantOwned: true }] });
    expect(batch.status).toBe(400);
    expect(createPostCapped).not.toHaveBeenCalled();
    expect((await request(browser).post('/api/entries').send({ id: 5, ...fullSave, isEncrypted: true })).status).toBe(201);
    expect(assistantCreatePost).not.toHaveBeenCalled();
  });

  it('can’t change an entry hidden from AI', async () => {
    (isAiHidden as any).mockResolvedValue(true);
    const res = await request(smith).put('/api/entries/5').send(fullSave);
    expect(res.status).toBe(404);
    expect(updatePostCapped).not.toHaveBeenCalled();
    expect(updatePost).not.toHaveBeenCalled();
    // Looked up on the write's own transaction, under the lock: one hidden a moment ago isn't written over
    expect(isAiHidden).toHaveBeenCalledWith(SCHEMA, 5, 'TX');
  });

  it('when entries were last saved is for browsers only', async () => {
    (getPostUpdatedAt as any).mockResolvedValue([{ id: 5, updatedAt: new Date('2026-11-20T10:00:00.000Z') }]);
    const res = await request(browser).get('/api/entries/updated-at?ids=5,6');
    expect(res.status).toBe(200);
    expect(getPostUpdatedAt).toHaveBeenCalledWith(SCHEMA, [5, 6]);
    expect(res.body.entries).toEqual([{ id: 5, updatedAt: '2026-11-20T10:00:00.000Z' }]);
    expect((await request(browser).get('/api/entries/updated-at?ids=5,x')).status).toBe(400);
    expect((await request(browser).get('/api/entries/updated-at')).status).toBe(400);
  });

  it('must send a full save', async () => {
    (isAiHidden as any).mockResolvedValue(false);
    const res = await request(smith).put('/api/entries/5').send({});
    expect(res.status).toBe(400);
  });

  it('deletes outright only what the one check allows: its own new entry or its own data, while the version there is its own', async () => {
    (assistantMayDelete as any).mockResolvedValue(true);
    const removed = await request(smith).delete('/api/entries/5');
    expect(removed.status).toBe(200);
    // The same delete as any other, and the same answer: kept versions forgotten, the entry gone, no copy
    expect(removed.body).toEqual({ success: true });
    expect(forgetAssistantChangesFor).toHaveBeenCalledWith(SCHEMA, 'entry', '5');
    expect(deletePost).toHaveBeenCalledWith(SCHEMA, 5);
    expect(assistantDeletePost).not.toHaveBeenCalled();
  });

  it('deletes any other entry it can see only with a copy kept first, and says which', async () => {
    (assistantMayDelete as any).mockResolvedValue(false);
    (assistantDeletePost as any).mockImplementation(async (_s: string, _id: number, _session: number, beforeDelete: () => Promise<unknown>) => {
      await beforeDelete();
      return { keptChangeId: 42 };
    });
    const res = await request(smith).delete('/api/entries/5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ keptChangeId: 42 });
    // The session is recorded with the copy (only it may undo the delete)
    expect(assistantDeletePost).toHaveBeenCalledWith(SCHEMA, 5, 1, expect.any(Function));
    // Public links go, inside the locked delete and once more after it
    expect(deleteSharesForEntry).toHaveBeenCalledTimes(2);
    expect(deleteSharesForEntry).toHaveBeenCalledWith(1, 5);
    // Never the plain delete, which would forget the copy just kept
    expect(deletePost).not.toHaveBeenCalled();
    expect(forgetAssistantChangesFor).not.toHaveBeenCalled();
  });

  it('a hidden or missing entry is refused as before; so is a delete past the day’s budget or with the list full, deleting nothing', async () => {
    (assistantMayDelete as any).mockResolvedValue(false);
    (assistantDeletePost as any).mockResolvedValue('unseen');
    expect((await request(smith).delete('/api/entries/5')).status).toBe(403);
    (assistantDeletePost as any).mockResolvedValue('limit');
    const limit = await request(smith).delete('/api/entries/5');
    expect(limit.status).toBe(429);
    expect(limit.body.error).toMatch(/as many entries as it may in a day/);
    (assistantDeletePost as any).mockRejectedValue(new AssistantHistoryFull());
    const full = await request(smith).delete('/api/entries/5');
    expect(full.status).toBe(429);
    expect(full.body).toEqual({ error: 'The list is full' });
    expect(deletePost).not.toHaveBeenCalled();
    expect(deleteSharesForEntry).not.toHaveBeenCalled();
  });

  it('takes a few entry ids at a time, whatever it asks for; a browser gets what it asks for', async () => {
    (reservePostIds as any).mockResolvedValue([1]);
    await request(smith).post('/api/entries/ids').send({ count: 50 });
    expect(reservePostIds).toHaveBeenLastCalledWith(SCHEMA, 10);
    await request(browser).post('/api/entries/ids').send({ count: 50 });
    expect(reservePostIds).toHaveBeenLastCalledWith(SCHEMA, 50);
  });

  it('edits its own data at any age, through the kept-first write (no undo window involved)', async () => {
    (assistantWrite as any).mockImplementation(async (_s: string, _k: string, _r: string, _m: Buffer, write: (tx: unknown) => unknown) => write('TX'));
    (isAiHidden as any).mockResolvedValue(false);
    (postStorageBytes as any).mockResolvedValue(0);
    (updatePost as any).mockResolvedValue(post);
    const res = await request(smith).put('/api/entries/5').send(fullSave);
    expect(res.status).toBe(200);
    expect(assistantWrite).toHaveBeenCalledWith(SCHEMA, 'entry', '5', expect.any(Buffer), expect.any(Function), expect.any(Function));
    expect(assistantMayDelete).not.toHaveBeenCalled();
  });

  it('a browser deletes as before, never asking whether the app owns the entry', async () => {
    const res = await request(browser).delete('/api/entries/5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(assistantMayDelete).not.toHaveBeenCalled();
    expect(assistantDeletePost).not.toHaveBeenCalled();
    expect(deletePost).toHaveBeenCalledWith(SCHEMA, 5);
  });

  it('the browser marks entries hidden from AI', async () => {
    const res = await request(browser).put('/api/entries/ai-hidden').send({ ids: [3, 4], hidden: true });
    expect(res.status).toBe(200);
    expect(setAiHidden).toHaveBeenCalledWith(SCHEMA, [3, 4], true);
    const bad = await request(browser).put('/api/entries/ai-hidden').send({ ids: [], hidden: true });
    expect(bad.status).toBe(400);
  });

  it('lists the ids the AI app may see', async () => {
    const res = await request(smith).get('/api/entries/visible-ids');
    expect(res.body).toEqual({ ids: [1, 2] });
  });
});

describe('Settings, for the AI app', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads only the few settings it needs', async () => {
    (getAllSettings as any).mockResolvedValue([
      { key: 'displayName', value: 'Alex' }, { key: 'aiConfig', value: { ciphertext: 'x', iv: 'y', v: 2 } },
      { key: 'habitLog', value: { ciphertext: 'x', iv: 'y', v: 2 } }, { key: 'themeMode', value: 'dark' },
    ]);
    const res = await request(smith).get('/api/settings');
    expect(res.body.map((s: { key: string }) => s.key)).toEqual(['displayName', 'aiConfig', 'habitLog']);
    const all = await request(browser).get('/api/settings');
    expect(all.body).toHaveLength(4);
  });

  it('never the habit log or the vision while those are kept from AI', async () => {
    (getAllSettings as any).mockResolvedValue([
      { key: 'displayName', value: 'Alex' }, { key: 'habitLog', value: {} }, { key: 'goalCategories', value: {} },
    ]);
    const res = await request(appFor(true, { ...ON, hiddenFeatures: ['habits', 'vision'] })).get('/api/settings');
    expect(res.body.map((s: { key: string }) => s.key)).toEqual(['displayName']);
  });

  it('switching the AI app off ends its sessions', async () => {
    (upsertSettingCapped as any).mockResolvedValue({ key: 'aiPrivacy', value: {} });
    await request(browser).put('/api/settings').send({ key: 'aiPrivacy', value: { appEnabled: true, hiddenTopicIds: [], hiddenFeatures: [] } });
    expect(revokeAssistantSessions).not.toHaveBeenCalled();
    await request(browser).put('/api/settings').send({ key: 'aiPrivacy', value: { appEnabled: false, hiddenTopicIds: [], hiddenFeatures: [] } });
    expect(revokeAssistantSessions).toHaveBeenCalledWith(1);
    (deleteSetting as any).mockResolvedValue(undefined);
    await request(browser).delete('/api/settings/aiPrivacy');
    expect(revokeAssistantSessions).toHaveBeenCalledTimes(2);
  });

  it('writes habit check-ins and nothing else', async () => {
    const refused = await request(smith).put('/api/settings').send({ key: 'aiPrivacy', value: { appEnabled: true } });
    expect(refused.status).toBe(403);
    expect(upsertSettingCapped).not.toHaveBeenCalled();
  });
});

describe('Bills, for the AI app', () => {
  beforeEach(() => vi.clearAllMocks());
  const id = '0b5c8f4e-8a51-4c3f-9d55-3a1f7c2e9b10';

  it('records a payment on an existing bill only', async () => {
    (financeRecordBytes as any).mockResolvedValue(0);
    const missing = await request(smith).put(`/api/finance/bills/${id}`).send({ payload: b64(40), iv: b64(12) });
    expect(missing.status).toBe(404);
    expect(upsertFinanceRecord).not.toHaveBeenCalled();
  });
});

describe('Topics, for the AI app', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves out topics kept from AI (it holds the key, so their names would be readable)', async () => {
    (getAllTaxonomies as any).mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = await request(appFor(true, { ...ON, hiddenTopicIds: [2] })).get('/api/topics');
    expect(res.body.map((t: { id: number }) => t.id)).toEqual([1, 3]);
    const all = await request(browser).get('/api/topics');
    expect(all.body).toHaveLength(3);
  });

  it('lists nothing when the choices weren’t handed over (never every topic)', async () => {
    (getAllTaxonomies as any).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const app = express();
    app.use((req, _res, next) => { req.auth = { accountId: 1, tenantSchemaName: SCHEMA, sessionId: 1, selector: 'aabbccddee11', assistant: true }; next(); });
    app.use('/api/topics', topicsRouter);
    const res = await request(app).get('/api/topics');
    expect(res.status).toBe(403);
  });

  const topic = { id: 4, format: 2, payload: 'c2VhbGVkLXRvcGljLWNpcGhlcnRleHQh', iv: 'dG9waWMtaXYtMTJi' };

  it('creates a topic the sealed way, counted for its day’s budget under the same lock', async () => {
    (assistantTopicAllowed as any).mockResolvedValue(true);
    (createTaxonomy as any).mockResolvedValue({ id: 4 });
    expect((await request(smith).post('/api/topics/ids').send({ count: 1 })).body).toEqual({ ids: [9] });
    const res = await request(smith).post('/api/topics').send(topic);
    expect(res.status).toBe(201);
    expect(assistantTopicAllowed).toHaveBeenCalledWith(SCHEMA, 'TX');
    expect(createTaxonomy).toHaveBeenCalledWith(SCHEMA, { id: 4, payload: topic.payload, iv: topic.iv }, 'TX');
    expect(recordAssistantTopic).toHaveBeenCalledWith(SCHEMA, 4, 'TX');
  });

  it('past its day’s budget: 429, no topic and no ids', async () => {
    (assistantTopicAllowed as any).mockResolvedValue(false);
    const res = await request(smith).post('/api/topics').send(topic);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/up to 5 topics a day/);
    expect(createTaxonomy).not.toHaveBeenCalled();
    expect(recordAssistantTopic).not.toHaveBeenCalled();
    expect((await request(smith).post('/api/topics/ids').send({ count: 1 })).status).toBe(429);
    expect(reserveTaxonomyIds).not.toHaveBeenCalled();
  });

  it('an id that wasn’t reserved isn’t counted', async () => {
    (assistantTopicAllowed as any).mockResolvedValue(true);
    (createTaxonomy as any).mockResolvedValue(null);
    expect((await request(smith).post('/api/topics').send(topic)).status).toBe(409);
    expect(recordAssistantTopic).not.toHaveBeenCalled();
  });

  it('the owner’s topics have no budget', async () => {
    (assistantTopicAllowed as any).mockResolvedValue(false);
    (createTaxonomy as any).mockResolvedValue({ id: 4 });
    expect((await request(browser).post('/api/topics').send(topic)).status).toBe(201);
    expect((await request(browser).post('/api/topics/ids').send({ count: 1 })).status).toBe(200);
    expect(assistantTopicAllowed).not.toHaveBeenCalled();
    expect(recordAssistantTopic).not.toHaveBeenCalled();
  });
});

// It can't delete a dose record, and a new one has no earlier version to put
// back: so new ones come out of a day's budget, like new entries
describe('Dose records, for the AI app', () => {
  const uuid = '0b5c8f4e-8a51-4c3f-9d55-3a1f7c2e9b10';
  const body = { date: '2026-11-20', payload: b64(40), iv: b64(12), format: 2 };
  beforeEach(() => {
    vi.clearAllMocks();
    (assistantNewRecordAllowed as any).mockResolvedValue(true);
    (upsertDoseRecord as any).mockResolvedValue({ id: uuid, date: '2026-11-20', payloadEncrypted: Buffer.from('p'), payloadIv: Buffer.alloc(12), createdAt: new Date(), updatedAt: new Date() });
  });

  it('saves within the budget, asked inside the same locked write', async () => {
    const res = await request(smith).put(`/api/doses/${uuid}`).send(body);
    expect(res.status).toBe(200);
    expect(assistantNewRecordAllowed).toHaveBeenCalledWith('TX', SCHEMA, 'dose', uuid, 100);
  });

  it('refuses a new one past the day’s budget, and writes nothing', async () => {
    (assistantNewRecordAllowed as any).mockResolvedValue(false);
    const res = await request(smith).put(`/api/doses/${uuid}`).send(body);
    expect(res.status).toBe(429);
    expect(upsertDoseRecord).not.toHaveBeenCalled();
    // …and it counts as nothing written, so nothing is kept or remembered either
    const written = (assistantWrite as any).mock.calls[0][5] as (r: unknown) => boolean;
    expect(written('limit')).toBe(false);
  });

  it('the owner’s own doses have no budget', async () => {
    await request(browser).put(`/api/doses/${uuid}`).send(body);
    expect(assistantNewRecordAllowed).not.toHaveBeenCalled();
  });
});

// The server can't see inside an encrypted save, so before the AI app
// overwrites anything the version it replaces is kept for the owner to put back
describe('What the AI app overwrites is kept first', () => {
  const runsTheWrite = async (_s: string, _k: string, _r: string, _m: Buffer, write: (tx: unknown) => unknown) => write('TX');
  beforeEach(() => {
    vi.clearAllMocks();
    (assistantWrite as any).mockImplementation(runsTheWrite);
    (isAiHidden as any).mockResolvedValue(false);
    (postStorageBytes as any).mockResolvedValue(0);
  });
  const uuid = '0b5c8f4e-8a51-4c3f-9d55-3a1f7c2e9b10';

  it('an entry: kept and saved under one lock, never through the unkept path', async () => {
    (updatePost as any).mockResolvedValue(post);
    const res = await request(smith).put('/api/entries/5').send(fullSave);
    expect(res.status).toBe(200);
    expect(assistantWrite).toHaveBeenCalledWith(SCHEMA, 'entry', '5', expect.any(Buffer), expect.any(Function), expect.any(Function));
    // The write ran on the transaction that kept the earlier version
    expect(updatePost).toHaveBeenCalledWith(SCHEMA, 5, expect.anything(), 'TX');
    expect(updatePostCapped).not.toHaveBeenCalled();
    // What it wrote is remembered by its IVs and ciphertext together (never the IVs alone, which the app chooses)
    const mark = (assistantWrite as any).mock.calls[0][3] as Buffer;
    const b = (v: string) => Buffer.from(v, 'base64');
    expect(mark.equals(Buffer.concat([b(fullSave.contentIv), b(fullSave.contentEncrypted), b(fullSave.metadataIv), b(fullSave.metadataEncrypted)]))).toBe(true);
  });

  it('a save with no room says so, and counts as nothing written (so nothing is kept)', async () => {
    (postStorageBytes as any).mockResolvedValue(Number.MAX_SAFE_INTEGER);
    const res = await request(smith).put('/api/entries/5').send(fullSave);
    expect(res.status).toBe(413);
    expect(updatePost).not.toHaveBeenCalled();
    const written = (assistantWrite as any).mock.calls[0][5] as (r: unknown) => boolean;
    expect(written('full')).toBe(false);
    expect(written(null)).toBe(false);
    expect(written(post)).toBe(true);
  });

  it('refuses the save when the earlier version can’t be kept', async () => {
    (assistantWrite as any).mockRejectedValue(new Error('db down'));
    const res = await request(smith).put('/api/entries/5').send(fullSave);
    expect(res.status).toBe(500);
    expect(updatePost).not.toHaveBeenCalled();
    expect(updatePostCapped).not.toHaveBeenCalled();
  });

  it('refuses the save when the list is full, rather than pushing an earlier version out', async () => {
    (assistantWrite as any).mockRejectedValue(new AssistantHistoryFull());
    const entry = await request(smith).put('/api/entries/5').send(fullSave);
    expect(entry.status).toBe(429);
    expect(updatePost).not.toHaveBeenCalled();
    (financeRecordBytes as any).mockResolvedValue(600);
    expect((await request(smith).put(`/api/finance/bills/${uuid}`).send({ payload: b64(40), iv: b64(12) })).status).toBe(429);
    expect((await request(smith).put('/api/settings').send({ key: 'habitLog', value: { ciphertext: 'eA==', iv: 'eA==', v: 2 } })).status).toBe(429);
    expect((await request(smith).put(`/api/doses/${uuid}`).send({ date: '2026-11-20', payload: b64(40), iv: b64(12), format: 2 })).status).toBe(429);
  });

  it('a bill, the habit log', async () => {
    (financeRecordBytes as any).mockResolvedValue(600);
    (upsertFinanceRecord as any).mockResolvedValue({ id: uuid, payloadEncrypted: Buffer.from('p'), payloadIv: Buffer.alloc(12), createdAt: new Date(), updatedAt: new Date() });
    const bill = await request(smith).put(`/api/finance/bills/${uuid}`).send({ payload: b64(40), iv: b64(12) });
    expect(bill.status).toBe(200);
    expect(assistantWrite).toHaveBeenCalledWith(SCHEMA, 'bill', uuid, expect.any(Buffer), expect.any(Function), expect.any(Function));
    expect(upsertFinanceRecord).toHaveBeenCalledWith(SCHEMA, 'bills', uuid, expect.any(Buffer), expect.any(Buffer), 'TX');

    (upsertSetting as any).mockResolvedValue({ key: 'habitLog', value: {} });
    const log = await request(smith).put('/api/settings').send({ key: 'habitLog', value: { ciphertext: 'eA==', iv: 'eA==', v: 2 } });
    expect(log.status).toBe(200);
    expect(assistantWrite).toHaveBeenCalledWith(SCHEMA, 'setting', 'habitLog', expect.any(Buffer), expect.any(Function), expect.any(Function));
    expect(upsertSetting).toHaveBeenCalledWith(SCHEMA, 'habitLog', expect.anything(), 'TX');
    expect(upsertSettingCapped).not.toHaveBeenCalled();
  });

  it('nothing is kept for the owner’s own saves', async () => {
    (updatePostCapped as any).mockResolvedValue(post);
    await request(browser).put('/api/entries/5').send(fullSave);
    (upsertSettingCapped as any).mockResolvedValue({ key: 'themeMode', value: 'dark' });
    await request(browser).put('/api/settings').send({ key: 'themeMode', value: 'dark' });
    expect(assistantWrite).not.toHaveBeenCalled();
  });

  it('adds only so many entries a day', async () => {
    (assistantCreatePost as any).mockResolvedValue('limit');
    const res = await request(smith).post('/api/entries').send({ id: 5, ...fullSave, isEncrypted: true });
    expect(res.status).toBe(429);
    expect(createPostCapped).not.toHaveBeenCalled();
    // The owner's own creates are never counted
    (createPostCapped as any).mockResolvedValue(post);
    expect((await request(browser).post('/api/entries').send({ id: 5, ...fullSave, isEncrypted: true })).status).toBe(201);
  });
});

describe('The list of what the AI app changed', () => {
  beforeEach(() => vi.clearAllMocks());
  const change = { id: 7, kind: 'entry', ref: '5', savedAt: new Date(), body: Buffer.from('c'), bodyIv: Buffer.alloc(12), meta: Buffer.from('m'), metaIv: Buffer.alloc(12), extra: null };

  it('is never for the AI app itself, but for its own undo', async () => {
    expect((await request(smith).get('/api/assistant-changes')).status).toBe(403);
    expect((await request(smith).delete('/api/assistant-changes/7')).status).toBe(403);
    expect((await request(smith).delete('/api/assistant-changes')).status).toBe(403);
    expect(listAssistantChanges).not.toHaveBeenCalled();
    expect(deleteAssistantChange).not.toHaveBeenCalled();
    expect(clearAssistantChanges).not.toHaveBeenCalled();
  });

  it('the AI app may put back only what its own session deleted, in the window (checked under the lock)', async () => {
    (restoreAssistantChange as any).mockResolvedValue({ ok: true, change: { ...change, extra: { deleted: true, session: 1 } } });
    const ok = await request(smith).post('/api/assistant-changes/7/restore');
    expect(ok.status).toBe(200);
    expect(ok.body.restored).toMatchObject({ id: 7, ref: '5', extra: { deleted: true } });
    expect(restoreAssistantChange).toHaveBeenCalledWith(SCHEMA, 7, { sessionId: 1 });
    (restoreAssistantChange as any).mockResolvedValue({ ok: false, reason: 'not-yours' });
    const refused = await request(smith).post('/api/assistant-changes/7/restore');
    expect(refused.status).toBe(403);
    // The owner's restore carries no such limit
    (restoreAssistantChange as any).mockResolvedValue({ ok: true, change });
    await request(browser).post('/api/assistant-changes/7/restore');
    expect(restoreAssistantChange).toHaveBeenLastCalledWith(SCHEMA, 7, undefined);
  });

  it('an entry already back is never written over', async () => {
    (restoreAssistantChange as any).mockResolvedValue({ ok: false, reason: 'taken' });
    expect((await request(browser).post('/api/assistant-changes/7/restore')).status).toBe(409);
  });

  it('lists them for the owner, still encrypted', async () => {
    (listAssistantChanges as any).mockResolvedValue({ changes: [change], more: true });
    const res = await request(browser).get('/api/assistant-changes?before=9');
    expect(listAssistantChanges).toHaveBeenCalledWith(SCHEMA, 9);
    expect(res.body.more).toBe(true);
    expect(res.body.changes[0]).toMatchObject({ id: 7, kind: 'entry', ref: '5', body: Buffer.from('c').toString('base64') });
  });

  it('puts one back, says so when the item is gone, and throws one away', async () => {
    (restoreAssistantChange as any).mockResolvedValue({ ok: true, change });
    const ok = await request(browser).post('/api/assistant-changes/7/restore');
    expect(ok.status).toBe(200);
    expect(ok.body.restored.id).toBe(7);
    (restoreAssistantChange as any).mockResolvedValue({ ok: false, reason: 'gone' });
    expect((await request(browser).post('/api/assistant-changes/7/restore')).status).toBe(410);
    (restoreAssistantChange as any).mockResolvedValue({ ok: false, reason: 'unknown' });
    expect((await request(browser).post('/api/assistant-changes/7/restore')).status).toBe(404);
    expect((await request(browser).post('/api/assistant-changes/abc/restore')).status).toBe(400);
    await request(browser).delete('/api/assistant-changes/7');
    expect(deleteAssistantChange).toHaveBeenCalledWith(SCHEMA, 7);
  });
});

describe('Deleting a record deletes the versions kept of it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (forgetAssistantChangesFor as any).mockResolvedValue(undefined);
  });
  const uuid = '0b5c8f4e-8a51-4c3f-9d55-3a1f7c2e9b10';

  it('an entry, before the entry itself goes', async () => {
    const res = await request(browser).delete('/api/entries/5');
    expect(res.status).toBe(200);
    expect(forgetAssistantChangesFor).toHaveBeenCalledWith(SCHEMA, 'entry', '5');
    expect((forgetAssistantChangesFor as any).mock.invocationCallOrder[0]).toBeLessThan((deletePost as any).mock.invocationCallOrder[0]);
  });

  it('if the kept versions can’t be deleted the entry isn’t either (the delete is tried again)', async () => {
    (forgetAssistantChangesFor as any).mockRejectedValue(new Error('db down'));
    const res = await request(browser).delete('/api/entries/5');
    expect(res.status).toBe(500);
    expect(deletePost).not.toHaveBeenCalled();
  });

  it('a dose record, a bill and a setting', async () => {
    await request(browser).delete(`/api/doses/${uuid}`);
    expect(forgetAssistantChangesFor).toHaveBeenCalledWith(SCHEMA, 'dose', uuid);
    await request(browser).delete(`/api/finance/bills/${uuid}`);
    expect(forgetAssistantChangesFor).toHaveBeenCalledWith(SCHEMA, 'bill', uuid);
    await request(browser).delete('/api/settings/habitLog');
    expect(forgetAssistantChangesFor).toHaveBeenCalledWith(SCHEMA, 'setting', 'habitLog');
  });
});
