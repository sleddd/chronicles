/**
 * Comprehensive unit tests for tenantQueries
 * Mocks prisma to verify SQL construction and parameter passing
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mock fns are available when vi.mock factory runs (hoisted to top)
const { mockQueryRawUnsafe, mockExecuteRawUnsafe, mockTransaction } = vi.hoisted(() => ({
  mockQueryRawUnsafe: vi.fn(),
  mockExecuteRawUnsafe: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $transaction: mockTransaction,
  },
}));

import {
  getSetting,
  getAllSettings,
  upsertSetting,
  deleteSetting,
  createTaxonomy,
  getTaxonomy,
  getAllTaxonomies,
  updateTaxonomy,
  deleteTaxonomy,
  reorderTaxonomies,
  postStorageBytes,
  financeStorageBytes,
  reservePostIds,
  resealPosts,
  createPost,
  getPost,
  getPostPage,
  createPosts,
  updatePost,
  deletePost,
  setPostTaxonomies,
  getPostTaxonomies,
  addTaxonomyToPost,
  removeTaxonomyFromPost,
  ensureDoseRecordsTable,
  ensureTopicEncryptionColumns,
  getDoseRecords,
  upsertDoseRecord,
  deleteDoseRecord,
  resealDoseRecords,
  reserveTaxonomyIds,
  withTenantLock,
  taxonomyCount,
  doseRecordStorage,
  postExists,
  ensurePostSync,
  postSyncStatements,
} from '../db/tenantQueries.js';

const SCHEMA = 'usr_1_abc123';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Settings
// =============================================================================
describe('Settings queries', () => {
  describe('getSetting', () => {
    it('returns the setting when found', async () => {
      const setting = { key: 'theme', value: 'dark', updatedAt: new Date() };
      mockQueryRawUnsafe.mockResolvedValue([setting]);

      const result = await getSetting(SCHEMA, 'theme');

      expect(result).toEqual(setting);
      expect(mockQueryRawUnsafe).toHaveBeenCalledOnce();
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('usr_1_abc123.settings');
      expect(sql).toContain('WHERE key = $1');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('theme');
    });

    it('returns null when setting not found', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);
      const result = await getSetting(SCHEMA, 'nonexistent');
      expect(result).toBeNull();
    });

    it('throws for invalid schema name', async () => {
      await expect(getSetting('invalid', 'key')).rejects.toThrow('Invalid schema name');
    });
  });

  describe('getAllSettings', () => {
    it('returns all settings ordered by key', async () => {
      const settings = [
        { key: 'a', value: 1, updatedAt: new Date() },
        { key: 'b', value: 2, updatedAt: new Date() },
      ];
      mockQueryRawUnsafe.mockResolvedValue(settings);

      const result = await getAllSettings(SCHEMA);

      expect(result).toEqual(settings);
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('usr_1_abc123.settings');
      expect(sql).toContain('ORDER BY key');
    });

    it('returns empty array when no settings exist', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);
      const result = await getAllSettings(SCHEMA);
      expect(result).toEqual([]);
    });
  });

  describe('upsertSetting', () => {
    it('upserts a setting and returns the result', async () => {
      const setting = { key: 'theme', value: '"dark"', updatedAt: new Date() };
      mockQueryRawUnsafe.mockResolvedValue([setting]);

      const result = await upsertSetting(SCHEMA, 'theme', 'dark');

      expect(result).toEqual(setting);
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO usr_1_abc123.settings');
      expect(sql).toContain('ON CONFLICT (key) DO UPDATE');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('theme');
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(JSON.stringify('dark'));
    });

    it('serializes object values to JSON', async () => {
      const obj = { color: 'blue', size: 10 };
      mockQueryRawUnsafe.mockResolvedValue([{ key: 'prefs', value: obj, updatedAt: new Date() }]);

      await upsertSetting(SCHEMA, 'prefs', obj);

      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(JSON.stringify(obj));
    });
  });

  describe('deleteSetting', () => {
    it('deletes a setting by key', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(1);

      await deleteSetting(SCHEMA, 'theme');

      const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM usr_1_abc123.settings');
      expect(sql).toContain('WHERE key = $1');
      expect(mockExecuteRawUnsafe.mock.calls[0][1]).toBe('theme');
    });
  });
});

// =============================================================================
// Taxonomies
// =============================================================================
describe('Taxonomy queries', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 1n, name: null, icon: null, color: '#333', sort_order: 3n,
    payload_encrypted: Buffer.from('sealed'), payload_iv: Buffer.from('iv'), ...over,
  });

  describe('createTaxonomy', () => {
    it('stores only the encrypted payload and colour under its reserved id, with the next sort order', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ max_order: 2 }])
        .mockResolvedValueOnce([row()]);

      const result = await createTaxonomy(SCHEMA, { id: 1, payload: Buffer.from('sealed').toString('base64'), iv: Buffer.from('iv').toString('base64'), color: '#333' });

      const [sql, id, color, order, payload] = mockQueryRawUnsafe.mock.calls[1];
      expect(sql).toContain('INSERT INTO usr_1_abc123.taxonomies (id, color, sort_order, payload_encrypted, payload_iv)');
      expect(sql).toContain('WHERE $1 <= (SELECT last_value FROM usr_1_abc123.taxonomies_id_seq)');
      expect([id, color, order]).toEqual([1, '#333', 3]);
      expect(Buffer.isBuffer(payload)).toBe(true);
      expect(result).toEqual({ id: 1, name: null, icon: null, color: '#333', sort_order: 3, payload: Buffer.from('sealed').toString('base64'), iv: Buffer.from('iv').toString('base64') });
    });

    it('starts sort_order at 0 when no taxonomies exist, and returns null for an id never reserved', async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([{ max_order: null }]).mockResolvedValueOnce([]);
      expect(await createTaxonomy(SCHEMA, { id: 5000, payload: 'cA==', iv: 'aQ==' })).toBeNull();
      expect(mockQueryRawUnsafe.mock.calls[1][3]).toBe(0);
    });
  });

  describe('reserveTaxonomyIds', () => {
    it('hands out ids from the taxonomies sequence', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ id: 8 }]);
      expect(await reserveTaxonomyIds(SCHEMA, 1)).toEqual([8]);
      expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain("nextval('usr_1_abc123.taxonomies_id_seq')");
    });
  });

  describe('getTaxonomy / getAllTaxonomies', () => {
    it('returns the payload as base64 and legacy plaintext as-is', async () => {
      mockQueryRawUnsafe.mockResolvedValue([row(), row({ id: 2n, name: 'Legacy', icon: 'book', payload_encrypted: null, payload_iv: null })]);
      const all = await getAllTaxonomies(SCHEMA);
      expect(all[0]).toMatchObject({ id: 1, name: null, payload: Buffer.from('sealed').toString('base64') });
      expect(all[1]).toMatchObject({ id: 2, name: 'Legacy', icon: 'book', payload: null, iv: null });
    });

    it('returns null when a taxonomy is not found', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);
      expect(await getTaxonomy(SCHEMA, 999)).toBeNull();
    });
  });

  describe('updateTaxonomy', () => {
    it('writing the payload clears any legacy plaintext name and icon', async () => {
      mockQueryRawUnsafe.mockResolvedValue([row()]);
      await updateTaxonomy(SCHEMA, 5, { payload: 'cA==', iv: 'aQ==' });
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('payload_encrypted = $1');
      expect(sql).toContain('payload_iv = $2');
      expect(sql).toContain('name = NULL');
      expect(sql).toContain('icon = NULL');
      expect(sql).toContain('WHERE id = $3');
    });

    it('can change just the colour', async () => {
      mockQueryRawUnsafe.mockResolvedValue([row()]);
      await updateTaxonomy(SCHEMA, 5, { color: '#abcdef' });
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('SET color = $1');
      expect(sql).not.toContain('name = NULL');
    });
  });

  it('updateTaxonomy gives null for a topic that does not exist (no crash on an empty RETURNING)', async () => {
    mockQueryRawUnsafe.mockResolvedValue([]);
    expect(await updateTaxonomy(SCHEMA, 99, { color: '#abcdef' })).toBeNull();
    expect(await updateTaxonomy(SCHEMA, 99, {})).toBeNull();
  });

  it('taxonomyCount counts the topics', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ n: 12n }]);
    expect(await taxonomyCount(SCHEMA)).toBe(12);
    expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain('count(*) AS n FROM usr_1_abc123.taxonomies');
  });

  describe('deleteTaxonomy', () => {
    it('deletes taxonomy by id', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(1);

      await deleteTaxonomy(SCHEMA, 5);

      const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM usr_1_abc123.taxonomies');
      expect(sql).toContain('WHERE id = $1');
      expect(mockExecuteRawUnsafe.mock.calls[0][1]).toBe(5);
    });
  });

  describe('storage totals', () => {
    it('sums encrypted entry bytes, leaving out the entry being replaced', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ n: BigInt(1234) }]);
      expect(await postStorageBytes(SCHEMA, 9)).toBe(1234);
      const [sql, exclude] = mockQueryRawUnsafe.mock.calls[0];
      expect(sql).toContain('octet_length(content_encrypted)');
      expect(sql).toContain('FROM usr_1_abc123.posts WHERE NOT (id = ANY($1::int[]))');
      expect(exclude).toEqual([9]);
    });

    it('sums every finance table, leaving out the row being replaced', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ n: 50 }]);
      expect(await financeStorageBytes(SCHEMA, { kind: 'bills', id: 'abc' })).toBe(50);
      const [sql, id] = mockQueryRawUnsafe.mock.calls[0];
      expect(sql.match(/UNION ALL/g)).toHaveLength(5);
      expect(sql).toContain('FROM usr_1_abc123.finance_bills WHERE id <> $1');
      expect(id).toBe('abc');
    });
  });

  describe('reorderTaxonomies', () => {
    it('sets every sort_order in one statement, from the list position', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(3);

      await reorderTaxonomies(SCHEMA, [10, 20, 30]);

      expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
      expect(mockTransaction).not.toHaveBeenCalled();
      const [sql, ids] = mockExecuteRawUnsafe.mock.calls[0];
      expect(sql).toContain('UPDATE usr_1_abc123.taxonomies t SET sort_order = o.pos - 1');
      expect(sql).toContain('unnest($1::int[]) WITH ORDINALITY');
      expect(ids).toEqual([10, 20, 30]);
    });

    it('handles an empty array without errors', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(0);
      await expect(reorderTaxonomies(SCHEMA, [])).resolves.toBeUndefined();
    });
  });
});

// =============================================================================
// Posts
// =============================================================================
describe('Post queries', () => {
  describe('reservePostIds', () => {
    it('hands out ids from the posts sequence', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ id: 41 }, { id: 42 }]);
      expect(await reservePostIds(SCHEMA, 2)).toEqual([41, 42]);
      const [sql, n] = mockQueryRawUnsafe.mock.calls[0];
      expect(sql).toContain("nextval('usr_1_abc123.posts_id_seq')");
      expect(n).toBe(2);
    });
  });

  describe('createPost', () => {
    const fields = {
      contentEncrypted: Buffer.from('encrypted-content'),
      contentIv: Buffer.from('iv-12-bytes!'),
      metadataEncrypted: Buffer.from('encrypted-meta'),
      metadataIv: Buffer.from('meta-iv-12b!'),
    };

    it('inserts an encrypted post under its reserved id, only if that id was handed out', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ id: 7, isEncrypted: true }]);
      const result = await createPost(SCHEMA, { id: 7, ...fields });
      expect(result?.id).toBe(7);
      const [sql, id, ce, ci, me, mi, created] = mockQueryRawUnsafe.mock.calls[0];
      expect(sql).toContain('INSERT INTO usr_1_abc123.posts (id, content_encrypted');
      expect(sql).toContain('WHERE $1 <= (SELECT last_value FROM usr_1_abc123.posts_id_seq)');
      expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
      expect(sql).not.toMatch(/\bcontent, metadata, is_encrypted\)/);
      expect([id, ce, ci, me, mi, created]).toEqual([7, fields.contentEncrypted, fields.contentIv, fields.metadataEncrypted, fields.metadataIv, null]);
    });

    it('returns null for an id never reserved or already taken', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);
      expect(await createPost(SCHEMA, { id: 999999, ...fields })).toBeNull();
    });
  });

  describe('ensureTopicEncryptionColumns', () => {
    it('only reads the catalog when the schema is already migrated (no exclusive locks)', async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([{ ready: true }]);
      await ensureTopicEncryptionColumns('usr_7_aaaaaa');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('usr_7_aaaaaa');
      expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
      await ensureTopicEncryptionColumns('usr_7_aaaaaa'); // remembered: no second read
      expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('runs the ALTERs when something is missing', async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([{ ready: false }]);
      mockExecuteRawUnsafe.mockResolvedValue(0);
      await ensureTopicEncryptionColumns('usr_8_bbbbbb');
      expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(5);
      expect(mockExecuteRawUnsafe.mock.calls[0][0]).toContain('ALTER TABLE usr_8_bbbbbb.taxonomies');
    });
  });

  describe('createPosts', () => {
    const fields = {
      contentEncrypted: Buffer.from('c'), contentIv: Buffer.from('i'),
      metadataEncrypted: Buffer.from('m'), metadataIv: Buffer.from('j'),
    };
    // A transaction whose tx runs the same raw-query mock
    const runTx = () => mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ $queryRawUnsafe: mockQueryRawUnsafe }));

    it('creates every entry in one transaction', async () => {
      runTx();
      mockQueryRawUnsafe.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 2 }]);
      const made = await createPosts(SCHEMA, [{ id: 1, ...fields }, { id: 2, ...fields }]);
      expect(made?.map(p => p.id)).toEqual([1, 2]);
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain('WHERE $1 <= (SELECT last_value FROM usr_1_abc123.posts_id_seq)');
    });

    it('inside a caller\'s transaction, keeps all-or-none with a savepoint', async () => {
      const tx = { $queryRawUnsafe: vi.fn(), $executeRawUnsafe: vi.fn() };
      tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);
      expect(await createPosts(SCHEMA, [{ id: 1, ...fields }, { id: 2, ...fields }], tx as never)).toBeNull();
      expect(tx.$executeRawUnsafe.mock.calls.map(c => c[0])).toEqual(['SAVEPOINT create_posts', 'ROLLBACK TO SAVEPOINT create_posts']);
      tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 1 }]);
      expect(await createPosts(SCHEMA, [{ id: 1, ...fields }], tx as never)).toHaveLength(1);
      expect(tx.$executeRawUnsafe.mock.calls.at(-1)![0]).toBe('RELEASE SAVEPOINT create_posts');
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('returns null (rolled back) when any id was not reserved or is taken', async () => {
      runTx();
      mockQueryRawUnsafe.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);
      expect(await createPosts(SCHEMA, [{ id: 1, ...fields }, { id: 2, ...fields }])).toBeNull();
    });
  });

  describe('resealPosts', () => {
    it('replaces the encrypted fields of each entry without touching updated_at', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(1);
      mockTransaction.mockImplementation(async (ops: Promise<number>[]) => Promise.all(ops));
      const p = { contentEncrypted: Buffer.from('a'), contentIv: Buffer.from('b'), metadataEncrypted: Buffer.from('c'), metadataIv: Buffer.from('d') };
      const at = new Date('2026-10-01T10:00:00.123Z');
      expect(await resealPosts(SCHEMA, [{ id: 1, updatedAt: at, ...p }, { id: 2, updatedAt: at, ...p }])).toBe(2);
      const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE usr_1_abc123.posts SET content_encrypted = $1');
      expect(sql).not.toContain('updated_at =');
      expect(sql).toContain("date_trunc('milliseconds', updated_at) = $6");
      expect(mockExecuteRawUnsafe.mock.calls[0][6]).toBe(at);
    });
  });

  describe('getPost', () => {
    it('returns post when found', async () => {
      const post = {
        id: 42, content: 'Test', metadata: {}, contentEncrypted: null, contentIv: null,
        metadataEncrypted: null, metadataIv: null, isEncrypted: false,
        createdAt: new Date(), updatedAt: new Date(),
      };
      mockQueryRawUnsafe.mockResolvedValue([post]);

      const result = await getPost(SCHEMA, 42);

      expect(result).toEqual(post);
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('usr_1_abc123.posts');
      expect(sql).toContain('WHERE id = $1');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(42);
    });

    it('returns null when post not found', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);
      const result = await getPost(SCHEMA, 999);
      expect(result).toBeNull();
    });
  });

  describe('getPostPage', () => {
    const MB = 1024 * 1024;

    it('reads sizes first, then only the entries that fit the byte cap', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ n: 6 * MB }, { n: 6 * MB }, { n: 6 * MB }])
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

      const page = await getPostPage(SCHEMA, { limit: 5000, offset: 100, maxBytes: 16 * MB });

      const sizeSql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sizeSql).toContain('octet_length(content_encrypted)');
      expect(sizeSql).not.toContain('content_iv');
      expect(sizeSql).toContain('ORDER BY created_at DESC, id DESC');
      expect(mockQueryRawUnsafe.mock.calls[0].slice(1)).toEqual([5000, 100]);
      expect(mockQueryRawUnsafe.mock.calls[1].slice(1)).toEqual([2, 100]);
      expect(page).toEqual({ posts: [{ id: 1 }, { id: 2 }], more: true });
    });

    it('always sends at least one entry, even one over the cap', async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([{ n: 20 * MB }]).mockResolvedValueOnce([{ id: 9 }]);
      const page = await getPostPage(SCHEMA, { limit: 5000, offset: 0, maxBytes: 16 * MB });
      expect(mockQueryRawUnsafe.mock.calls[1].slice(1)).toEqual([1, 0]);
      expect(page.more).toBe(false);
    });

    it('says more may follow after a full page, and nothing after the end', async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([{ n: 1 }, { n: 1 }]).mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      expect((await getPostPage(SCHEMA, { limit: 2, offset: 0, maxBytes: MB })).more).toBe(true);

      mockQueryRawUnsafe.mockReset();
      mockQueryRawUnsafe.mockResolvedValueOnce([]);
      expect(await getPostPage(SCHEMA, { limit: 2, offset: 2, maxBytes: MB })).toEqual({ posts: [], more: false });
      expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });

  describe('updatePost', () => {
    it('updates encrypted fields with correct parameter indexing', async () => {
      const contentEnc = Buffer.from('new-enc');
      const contentIv = Buffer.from('new-iv');

      mockQueryRawUnsafe.mockResolvedValue([{
        id: 1, content: null, metadata: null,
        contentEncrypted: contentEnc, contentIv,
        metadataEncrypted: null, metadataIv: null,
        isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
      }]);

      await updatePost(SCHEMA, 1, { contentEncrypted: contentEnc, contentIv });

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('content_encrypted = $1');
      expect(sql).toContain('content_iv = $2');
      expect(sql).toContain('WHERE id = $3');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(contentEnc);
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(contentIv);
      expect(mockQueryRawUnsafe.mock.calls[0][3]).toBe(1);
    });
  });

  describe('deletePost', () => {
    it('deletes a post by id', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(1);

      await deletePost(SCHEMA, 7);

      const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM usr_1_abc123.posts');
      expect(sql).toContain('WHERE id = $1');
      expect(mockExecuteRawUnsafe.mock.calls[0][1]).toBe(7);
    });
  });
});

// =============================================================================
// Post-Taxonomy Relationships
// =============================================================================
describe('Post-Taxonomy relationship queries', () => {
  describe('addTaxonomyToPost', () => {
    it('inserts a post-taxonomy relationship with ON CONFLICT DO NOTHING', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(1);

      await addTaxonomyToPost(SCHEMA, 10, 20);

      const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO usr_1_abc123.post_taxonomies');
      expect(sql).toContain('ON CONFLICT DO NOTHING');
      expect(mockExecuteRawUnsafe.mock.calls[0][1]).toBe(10);
      expect(mockExecuteRawUnsafe.mock.calls[0][2]).toBe(20);
    });
  });

  describe('removeTaxonomyFromPost', () => {
    it('deletes the post-taxonomy relationship', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(1);

      await removeTaxonomyFromPost(SCHEMA, 10, 20);

      const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM usr_1_abc123.post_taxonomies');
      expect(sql).toContain('WHERE post_id = $1 AND tax_id = $2');
      expect(mockExecuteRawUnsafe.mock.calls[0][1]).toBe(10);
      expect(mockExecuteRawUnsafe.mock.calls[0][2]).toBe(20);
    });
  });

  describe('getPostTaxonomies', () => {
    it('returns taxonomies joined to the post', async () => {
      const taxonomies = [
        { id: 1, name: 'Work', icon: 'briefcase', color: '#333' },
        { id: 2, name: 'Personal', icon: 'user', color: '#666' },
      ];
      mockQueryRawUnsafe.mockResolvedValue(taxonomies);

      const result = await getPostTaxonomies(SCHEMA, 5);

      expect(result).toEqual(taxonomies);
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('usr_1_abc123.taxonomies t');
      expect(sql).toContain('usr_1_abc123.post_taxonomies pt');
      expect(sql).toContain('JOIN');
      expect(sql).toContain('WHERE pt.post_id = $1');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(5);
    });
  });

  describe('setPostTaxonomies', () => {
    it('deletes existing and inserts new taxonomy associations in a transaction', async () => {
      const txMock = { $executeRawUnsafe: vi.fn().mockResolvedValue(1) };
      mockTransaction.mockImplementation(async (cb: (tx: typeof txMock) => Promise<void>) => {
        await cb(txMock);
      });

      await setPostTaxonomies(SCHEMA, 5, [10, 20, 30]);

      // First call: delete existing
      expect(txMock.$executeRawUnsafe.mock.calls[0][0]).toContain('DELETE FROM usr_1_abc123.post_taxonomies WHERE post_id = $1');
      expect(txMock.$executeRawUnsafe.mock.calls[0][1]).toBe(5);

      // Subsequent calls: insert each taxonomy
      expect(txMock.$executeRawUnsafe).toHaveBeenCalledTimes(4); // 1 delete + 3 inserts
      expect(txMock.$executeRawUnsafe.mock.calls[1][1]).toBe(5);
      expect(txMock.$executeRawUnsafe.mock.calls[1][2]).toBe(10);
      expect(txMock.$executeRawUnsafe.mock.calls[2][2]).toBe(20);
      expect(txMock.$executeRawUnsafe.mock.calls[3][2]).toBe(30);
    });

    it('only deletes when given empty taxonomy array', async () => {
      const txMock = { $executeRawUnsafe: vi.fn().mockResolvedValue(1) };
      mockTransaction.mockImplementation(async (cb: (tx: typeof txMock) => Promise<void>) => {
        await cb(txMock);
      });

      await setPostTaxonomies(SCHEMA, 5, []);

      expect(txMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(txMock.$executeRawUnsafe.mock.calls[0][0]).toContain('DELETE');
    });
  });
});

// =============================================================================
// Medication Dose Logs
// =============================================================================
describe('Dose record queries', () => {
  it('creates the encrypted table with only the date readable', async () => {
    mockExecuteRawUnsafe.mockResolvedValue(0);
    await ensureDoseRecordsTable('usr_9_abcdef');
    const ddl = mockExecuteRawUnsafe.mock.calls.map(c => c[0]).join('\n');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS usr_9_abcdef.medication_dose_records');
    expect(ddl).toContain('payload_encrypted BYTEA NOT NULL');
    expect(ddl).not.toContain('medication_post_id');
    expect(ddl).not.toContain('REFERENCES');
  });

  it('reads one day or everything', async () => {
    mockQueryRawUnsafe.mockResolvedValue([]);
    await getDoseRecords(SCHEMA, '2026-04-03');
    expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain('WHERE date = $1::date');
    expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('2026-04-03');
    await getDoseRecords(SCHEMA);
    expect(mockQueryRawUnsafe.mock.calls[1][0]).not.toContain('WHERE');
  });

  it('upserts by id and deletes by id', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ id: 'a' }]);
    await upsertDoseRecord(SCHEMA, 'a', '2026-04-03', Buffer.from('p'), Buffer.from('i'));
    expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain('ON CONFLICT (id) DO UPDATE');
    mockExecuteRawUnsafe.mockResolvedValue(1);
    expect(await deleteDoseRecord(SCHEMA, 'a')).toBe(true);
  });

  it('re-seals records on the same day only, leaving updated_at alone', async () => {
    mockExecuteRawUnsafe.mockResolvedValue(1);
    mockTransaction.mockImplementation(async (ops: Promise<number>[]) => Promise.all(ops));
    expect(await resealDoseRecords(SCHEMA, [{ id: 'a', date: '2026-01-02', payload: Buffer.from('p'), iv: Buffer.from('i') }])).toBe(1);
    const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE id = $3 AND date = $4::date');
    expect(sql).not.toContain('updated_at');
  });
});

describe('Schema validation in tenant queries', () => {
  it('all query functions reject invalid schema names', async () => {
    const invalidSchema = 'DROP TABLE';

    await expect(getSetting(invalidSchema, 'key')).rejects.toThrow();
    await expect(getAllSettings(invalidSchema)).rejects.toThrow();
    await expect(upsertSetting(invalidSchema, 'key', 'val')).rejects.toThrow();
    await expect(deleteSetting(invalidSchema, 'key')).rejects.toThrow();
    await expect(createTaxonomy(invalidSchema, { id: 1, payload: 'x', iv: 'y' })).rejects.toThrow();
    await expect(getTaxonomy(invalidSchema, 1)).rejects.toThrow();
    await expect(getAllTaxonomies(invalidSchema)).rejects.toThrow();
    await expect(updateTaxonomy(invalidSchema, 1, { name: 'x' })).rejects.toThrow();
    await expect(deleteTaxonomy(invalidSchema, 1)).rejects.toThrow();
    await expect(createPost(invalidSchema, {})).rejects.toThrow();
    await expect(getPost(invalidSchema, 1)).rejects.toThrow();
    await expect(getPostPage(invalidSchema, { limit: 1, offset: 0, maxBytes: 1 })).rejects.toThrow();
    await expect(updatePost(invalidSchema, 1, {})).rejects.toThrow();
    await expect(deletePost(invalidSchema, 1)).rejects.toThrow();
    await expect(getPostTaxonomies(invalidSchema, 1)).rejects.toThrow();
    await expect(setPostTaxonomies(invalidSchema, 1, [])).rejects.toThrow();
    await expect(ensureDoseRecordsTable(invalidSchema)).rejects.toThrow();
    await expect(getDoseRecords(invalidSchema, '2024-01-01')).rejects.toThrow();
    await expect(upsertDoseRecord(invalidSchema, 'a', '2024-01-01', Buffer.from('p'), Buffer.from('i'))).rejects.toThrow();

    // Prisma should never have been called with an invalid schema
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Per-account lock (storage caps) and the new cap queries
// =============================================================================
describe('withTenantLock', () => {
  it('takes the account\'s advisory lock in the transaction before running the write', async () => {
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    mockTransaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    const result = await withTenantLock(SCHEMA, async (t) => {
      expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      return t === (tx as unknown) ? 'ran on tx' : 'wrong client';
    });
    expect(result).toBe('ran on tx');
    // The schema name goes in as a parameter, never into the SQL text
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))::text', SCHEMA);
  });

  it('refuses an invalid schema name', async () => {
    await expect(withTenantLock('bad', async () => 1)).rejects.toThrow();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('doseRecordStorage / postExists', () => {
  it('sums dose rows and payload bytes, leaving out the ones being replaced', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ count: 3n, bytes: 120n }]);
    expect(await doseRecordStorage(SCHEMA, ['a'])).toEqual({ count: 3, bytes: 120 });
    expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain('usr_1_abc123.medication_dose_records WHERE NOT (id = ANY($1::text[]))');
    expect(mockQueryRawUnsafe.mock.calls[0][1]).toEqual(['a']);
  });

  it('runs on the transaction client when given one', async () => {
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ count: 0, bytes: null }]) };
    expect(await doseRecordStorage(SCHEMA, [], tx as never)).toEqual({ count: 0, bytes: 0 });
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it('postExists checks by id without loading ciphertext', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([]);
    expect(await postExists(SCHEMA, 7)).toBe(true);
    expect(await postExists(SCHEMA, 8)).toBe(false);
    expect(mockQueryRawUnsafe.mock.calls[0][0]).toBe('SELECT id FROM usr_1_abc123.posts WHERE id = $1');
  });
});

describe('ensurePostSync — deletions index', () => {
  it('new schemas get an index on deleted_posts.change_xid', () => {
    expect(postSyncStatements(SCHEMA)).toContain(
      'CREATE INDEX IF NOT EXISTS idx_usr_1_abc123_deleted_change ON usr_1_abc123.deleted_posts (change_xid)');
  });

  it('an account already tracked but missing the index gets just the index, after a catalog read', async () => {
    const schema = 'usr_2_abc123';
    mockQueryRawUnsafe.mockResolvedValue([{ ready: true, indexed: false }]);
    await ensurePostSync(schema);
    expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain('pg_indexes');
    expect(mockQueryRawUnsafe.mock.calls[0].slice(1)).toEqual([schema, 'idx_usr_2_abc123_deleted_change']);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mockExecuteRawUnsafe.mock.calls[0][0]).toBe('CREATE INDEX IF NOT EXISTS idx_usr_2_abc123_deleted_change ON usr_2_abc123.deleted_posts (change_xid)');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('touches nothing when tracking and the index are in place', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ ready: true, indexed: true }]);
    await ensurePostSync('usr_3_abc123');
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
