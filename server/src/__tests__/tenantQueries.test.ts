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
  createPost,
  getPost,
  getAllPosts,
  updatePost,
  deletePost,
  setPostTaxonomies,
  getPostTaxonomies,
  addTaxonomyToPost,
  removeTaxonomyFromPost,
  ensureDoseRecordsTable,
  getDoseRecords,
  upsertDoseRecord,
  deleteDoseRecord,
  getLegacyDoseLogs,
  deleteLegacyDoseLogs,
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
    it('stores only the encrypted payload and colour, with the next sort order', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ max_order: 2 }])
        .mockResolvedValueOnce([row()]);

      const result = await createTaxonomy(SCHEMA, { payload: Buffer.from('sealed').toString('base64'), iv: Buffer.from('iv').toString('base64'), color: '#333' });

      const [sql, color, order, payload] = mockQueryRawUnsafe.mock.calls[1];
      expect(sql).toContain('INSERT INTO usr_1_abc123.taxonomies (color, sort_order, payload_encrypted, payload_iv)');
      expect([color, order]).toEqual(['#333', 3]);
      expect(Buffer.isBuffer(payload)).toBe(true);
      expect(result).toEqual({ id: 1, name: null, icon: null, color: '#333', sort_order: 3, payload: Buffer.from('sealed').toString('base64'), iv: Buffer.from('iv').toString('base64') });
    });

    it('starts sort_order at 0 when no taxonomies exist', async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([{ max_order: null }]).mockResolvedValueOnce([row({ sort_order: 0n })]);
      await createTaxonomy(SCHEMA, { payload: 'cA==', iv: 'aQ==' });
      expect(mockQueryRawUnsafe.mock.calls[1][2]).toBe(0);
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
  describe('createPost — encrypted', () => {
    it('creates an encrypted post with binary data', async () => {
      const contentEnc = Buffer.from('encrypted-content');
      const contentIv = Buffer.from('iv-12-bytes!');
      const metaEnc = Buffer.from('encrypted-meta');
      const metaIv = Buffer.from('meta-iv-12b!');

      mockQueryRawUnsafe.mockResolvedValue([{
        id: 1,
        content: null,
        metadata: null,
        contentEncrypted: contentEnc,
        contentIv,
        metadataEncrypted: metaEnc,
        metadataIv: metaIv,
        isEncrypted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }]);

      const result = await createPost(SCHEMA, {
        contentEncrypted: contentEnc,
        contentIv,
        metadataEncrypted: metaEnc,
        metadataIv: metaIv,
        isEncrypted: true,
      });

      expect(result.isEncrypted).toBe(true);
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO usr_1_abc123.posts');
      expect(sql).toContain('content_encrypted');
      expect(sql).toContain('TRUE');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(contentEnc);
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(contentIv);
      expect(mockQueryRawUnsafe.mock.calls[0][3]).toBe(metaEnc);
      expect(mockQueryRawUnsafe.mock.calls[0][4]).toBe(metaIv);
    });
  });

  describe('createPost — unencrypted', () => {
    it('creates a plaintext post', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{
        id: 1,
        content: 'Hello',
        metadata: {},
        contentEncrypted: null,
        contentIv: null,
        metadataEncrypted: null,
        metadataIv: null,
        isEncrypted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }]);

      const result = await createPost(SCHEMA, { content: 'Hello', metadata: { mood: 'happy' } });

      expect(result.isEncrypted).toBe(false);
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO usr_1_abc123.posts');
      expect(sql).toContain('FALSE');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('Hello');
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(JSON.stringify({ mood: 'happy' }));
    });

    it('defaults content to empty string and metadata to empty object', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{
        id: 1, content: '', metadata: {}, contentEncrypted: null, contentIv: null,
        metadataEncrypted: null, metadataIv: null, isEncrypted: false,
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      await createPost(SCHEMA, {});

      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('');
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe('{}');
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

  describe('getAllPosts', () => {
    it('uses default limit of 1000 and offset of 0', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);

      await getAllPosts(SCHEMA);

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('usr_1_abc123.posts');
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).toContain('LIMIT $1 OFFSET $2');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(1000);
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(0);
    });

    it('passes custom limit and offset', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);

      await getAllPosts(SCHEMA, { limit: 50, offset: 100 });

      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(50);
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(100);
    });
  });

  describe('updatePost', () => {
    it('updates content field', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{
        id: 1, content: 'Updated', metadata: {}, contentEncrypted: null, contentIv: null,
        metadataEncrypted: null, metadataIv: null, isEncrypted: false,
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      await updatePost(SCHEMA, 1, { content: 'Updated' });

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE usr_1_abc123.posts SET content = $1');
      expect(sql).toContain('updated_at = NOW()');
      expect(sql).toContain('WHERE id = $2');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('Updated');
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(1);
    });

    it('updates metadata with JSON serialization', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{
        id: 1, content: '', metadata: { x: 1 }, contentEncrypted: null, contentIv: null,
        metadataEncrypted: null, metadataIv: null, isEncrypted: false,
        createdAt: new Date(), updatedAt: new Date(),
      }]);

      await updatePost(SCHEMA, 1, { metadata: { x: 1 } });

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('metadata = $1::jsonb');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(JSON.stringify({ x: 1 }));
    });

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

  it('legacy reads and deletes are no-ops once the old table is gone', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ exists: false }]);
    expect(await getLegacyDoseLogs(SCHEMA)).toEqual([]);
    expect(await deleteLegacyDoseLogs(SCHEMA)).toBe(0);
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });
});

describe('Schema validation in tenant queries', () => {
  it('all query functions reject invalid schema names', async () => {
    const invalidSchema = 'DROP TABLE';

    await expect(getSetting(invalidSchema, 'key')).rejects.toThrow();
    await expect(getAllSettings(invalidSchema)).rejects.toThrow();
    await expect(upsertSetting(invalidSchema, 'key', 'val')).rejects.toThrow();
    await expect(deleteSetting(invalidSchema, 'key')).rejects.toThrow();
    await expect(createTaxonomy(invalidSchema, 'name')).rejects.toThrow();
    await expect(getTaxonomy(invalidSchema, 1)).rejects.toThrow();
    await expect(getAllTaxonomies(invalidSchema)).rejects.toThrow();
    await expect(updateTaxonomy(invalidSchema, 1, { name: 'x' })).rejects.toThrow();
    await expect(deleteTaxonomy(invalidSchema, 1)).rejects.toThrow();
    await expect(createPost(invalidSchema, {})).rejects.toThrow();
    await expect(getPost(invalidSchema, 1)).rejects.toThrow();
    await expect(getAllPosts(invalidSchema)).rejects.toThrow();
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
