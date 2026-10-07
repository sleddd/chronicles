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
  ensureDoseLogsTable,
  getDoseLogsByDate,
  upsertDoseLog,
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
  describe('createTaxonomy', () => {
    it('creates a taxonomy with auto-incremented sort order', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ max_order: 2 }]) // MAX query
        .mockResolvedValueOnce([{ id: 1n, name: 'Work', icon: 'briefcase', color: '#333', sort_order: 3n }]);

      const result = await createTaxonomy(SCHEMA, 'Work', { icon: 'briefcase', color: '#333' });

      expect(result.id).toBe(1);
      expect(result.sort_order).toBe(3);
      expect(result.name).toBe('Work');

      // First call: MAX query
      const maxSql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(maxSql).toContain('MAX(sort_order)');
      expect(maxSql).toContain('usr_1_abc123.taxonomies');

      // Second call: INSERT
      const insertSql = mockQueryRawUnsafe.mock.calls[1][0] as string;
      expect(insertSql).toContain('INSERT INTO usr_1_abc123.taxonomies');
      expect(mockQueryRawUnsafe.mock.calls[1][1]).toBe('Work');
      expect(mockQueryRawUnsafe.mock.calls[1][2]).toBe('briefcase');
      expect(mockQueryRawUnsafe.mock.calls[1][3]).toBe('#333');
      expect(mockQueryRawUnsafe.mock.calls[1][4]).toBe(3); // max_order (2) + 1
    });

    it('starts sort_order at 0 when no taxonomies exist', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ max_order: null }])
        .mockResolvedValueOnce([{ id: 1n, name: 'Test', icon: null, color: null, sort_order: 0n }]);

      const result = await createTaxonomy(SCHEMA, 'Test');

      expect(mockQueryRawUnsafe.mock.calls[1][4]).toBe(0);
      expect(result.sort_order).toBe(0);
    });

    it('uses null for icon and color when not provided', async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ max_order: null }])
        .mockResolvedValueOnce([{ id: 1n, name: 'Test', icon: null, color: null, sort_order: 0n }]);

      await createTaxonomy(SCHEMA, 'Test');

      expect(mockQueryRawUnsafe.mock.calls[1][2]).toBeNull();
      expect(mockQueryRawUnsafe.mock.calls[1][3]).toBeNull();
    });
  });

  describe('getTaxonomy', () => {
    it('returns taxonomy when found', async () => {
      const tax = { id: 5, name: 'Work', icon: 'briefcase', color: '#333', sort_order: 0 };
      mockQueryRawUnsafe.mockResolvedValue([tax]);

      const result = await getTaxonomy(SCHEMA, 5);

      expect(result).toEqual(tax);
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('usr_1_abc123.taxonomies');
      expect(sql).toContain('WHERE id = $1');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(5);
    });

    it('returns null when taxonomy not found', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);
      const result = await getTaxonomy(SCHEMA, 999);
      expect(result).toBeNull();
    });
  });

  describe('getAllTaxonomies', () => {
    it('returns all taxonomies with BigInt ids converted to numbers', async () => {
      mockQueryRawUnsafe.mockResolvedValue([
        { id: 1n, name: 'A', icon: null, color: null, sort_order: 0n },
        { id: 2n, name: 'B', icon: 'star', color: '#fff', sort_order: 1n },
      ]);

      const result = await getAllTaxonomies(SCHEMA);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[0].sort_order).toBe(0);
      expect(result[1].id).toBe(2);
      expect(result[1].sort_order).toBe(1);

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY sort_order, name');
    });

    it('defaults sort_order to 0 when null', async () => {
      mockQueryRawUnsafe.mockResolvedValue([
        { id: 1n, name: 'Test', icon: null, color: null, sort_order: null },
      ]);

      const result = await getAllTaxonomies(SCHEMA);
      expect(result[0].sort_order).toBe(0);
    });
  });

  describe('updateTaxonomy', () => {
    it('updates name only', async () => {
      const updated = { id: 1, name: 'NewName', icon: null, color: null, sort_order: 0 };
      mockQueryRawUnsafe.mockResolvedValue([updated]);

      await updateTaxonomy(SCHEMA, 1, { name: 'NewName' });

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE usr_1_abc123.taxonomies SET name = $1');
      expect(sql).toContain('WHERE id = $2');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('NewName');
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe(1);
    });

    it('updates multiple fields with correct parameter indexing', async () => {
      const updated = { id: 1, name: 'New', icon: 'star', color: '#fff', sort_order: 0 };
      mockQueryRawUnsafe.mockResolvedValue([updated]);

      await updateTaxonomy(SCHEMA, 1, { name: 'New', icon: 'star', color: '#fff' });

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('name = $1');
      expect(sql).toContain('icon = $2');
      expect(sql).toContain('color = $3');
      expect(sql).toContain('WHERE id = $4');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('New');
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe('star');
      expect(mockQueryRawUnsafe.mock.calls[0][3]).toBe('#fff');
      expect(mockQueryRawUnsafe.mock.calls[0][4]).toBe(1);
    });

    it('updates icon only', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ id: 1, name: 'X', icon: 'star', color: null, sort_order: 0 }]);

      await updateTaxonomy(SCHEMA, 1, { icon: 'star' });

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('icon = $1');
      expect(sql).toContain('WHERE id = $2');
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
    it('updates sort_order for each taxonomy in order', async () => {
      const txMock = { $executeRawUnsafe: vi.fn().mockResolvedValue(1) };
      mockTransaction.mockImplementation(async (cb: (tx: typeof txMock) => Promise<void>) => {
        await cb(txMock);
      });

      await reorderTaxonomies(SCHEMA, [10, 20, 30]);

      expect(txMock.$executeRawUnsafe).toHaveBeenCalledTimes(3);

      // First taxonomy gets sort_order 0
      expect(txMock.$executeRawUnsafe.mock.calls[0][0]).toContain('UPDATE usr_1_abc123.taxonomies SET sort_order = $1 WHERE id = $2');
      expect(txMock.$executeRawUnsafe.mock.calls[0][1]).toBe(0);
      expect(txMock.$executeRawUnsafe.mock.calls[0][2]).toBe(10);

      // Second taxonomy gets sort_order 1
      expect(txMock.$executeRawUnsafe.mock.calls[1][1]).toBe(1);
      expect(txMock.$executeRawUnsafe.mock.calls[1][2]).toBe(20);

      // Third taxonomy gets sort_order 2
      expect(txMock.$executeRawUnsafe.mock.calls[2][1]).toBe(2);
      expect(txMock.$executeRawUnsafe.mock.calls[2][2]).toBe(30);
    });

    it('handles empty array without errors', async () => {
      const txMock = { $executeRawUnsafe: vi.fn() };
      mockTransaction.mockImplementation(async (cb: (tx: typeof txMock) => Promise<void>) => {
        await cb(txMock);
      });

      await reorderTaxonomies(SCHEMA, []);

      expect(txMock.$executeRawUnsafe).not.toHaveBeenCalled();
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
describe('Dose Log queries', () => {
  describe('ensureDoseLogsTable', () => {
    it('creates table and indexes when table does not exist', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ exists: false }]);
      mockExecuteRawUnsafe.mockResolvedValue(0);

      await ensureDoseLogsTable(SCHEMA);

      // First call: check existence
      expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain('information_schema.tables');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('usr_1_abc123');

      // Should create table + 3 indexes
      expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(4);
      const createSql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(createSql).toContain('CREATE TABLE usr_1_abc123.medication_dose_logs');

      const idx1 = mockExecuteRawUnsafe.mock.calls[1][0] as string;
      expect(idx1).toContain('idx_usr_1_abc123_dose_logs_date');

      const idx2 = mockExecuteRawUnsafe.mock.calls[2][0] as string;
      expect(idx2).toContain('idx_usr_1_abc123_dose_logs_med_date');

      const idx3 = mockExecuteRawUnsafe.mock.calls[3][0] as string;
      expect(idx3).toContain('idx_usr_1_abc123_dose_logs_unique');
    });

    it('skips table creation when it already exists but still ensures indexes', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ exists: true }]);

      await ensureDoseLogsTable(SCHEMA);

      const statements = mockExecuteRawUnsafe.mock.calls.map(c => c[0] as string);
      expect(statements.some(sql => sql.includes('CREATE TABLE'))).toBe(false);
      expect(statements).toHaveLength(3);
      expect(statements.every(sql => sql.includes('CREATE') && sql.includes('INDEX IF NOT EXISTS'))).toBe(true);
    });
  });

  describe('getDoseLogsByDate', () => {
    it('returns dose logs for a given date with BigInt conversion', async () => {
      mockQueryRawUnsafe.mockResolvedValue([
        { id: 1n, medicationPostId: 10n, scheduledTime: '08:00', takenAt: '08:05', date: '2024-01-15', status: 'taken', createdAt: new Date() },
      ]);

      const result = await getDoseLogsByDate(SCHEMA, '2024-01-15');

      expect(result[0].id).toBe(1);
      expect(result[0].medicationPostId).toBe(10);
      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('usr_1_abc123.medication_dose_logs');
      expect(sql).toContain('WHERE date = $1::date');
      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('2024-01-15');
    });

    it('returns empty array when no logs exist', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);
      const result = await getDoseLogsByDate(SCHEMA, '2024-01-15');
      expect(result).toEqual([]);
    });
  });

  describe('upsertDoseLog', () => {
    it('inserts or updates a dose log with correct parameters', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{
        id: 1n, medicationPostId: 10n, scheduledTime: '08:00',
        takenAt: '08:05', date: '2024-01-15', status: 'taken', createdAt: new Date(),
      }]);

      const result = await upsertDoseLog(SCHEMA, 10, '08:00', '2024-01-15', 'taken', '08:05');

      expect(result.id).toBe(1);
      expect(result.medicationPostId).toBe(10);

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO usr_1_abc123.medication_dose_logs');
      expect(sql).toContain('ON CONFLICT (medication_post_id, scheduled_time, date)');
      expect(sql).toContain('DO UPDATE SET status = EXCLUDED.status');

      expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(10);
      expect(mockQueryRawUnsafe.mock.calls[0][2]).toBe('08:00');
      expect(mockQueryRawUnsafe.mock.calls[0][3]).toBe('2024-01-15');
      expect(mockQueryRawUnsafe.mock.calls[0][4]).toBe('taken');
      expect(mockQueryRawUnsafe.mock.calls[0][5]).toBe('08:05');
    });

    it('passes null takenAt for pending status', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{
        id: 2n, medicationPostId: 10n, scheduledTime: '12:00',
        takenAt: null, date: '2024-01-15', status: 'pending', createdAt: new Date(),
      }]);

      const result = await upsertDoseLog(SCHEMA, 10, '12:00', '2024-01-15', 'pending', null);

      expect(result.id).toBe(2);
      expect(mockQueryRawUnsafe.mock.calls[0][5]).toBeNull();
    });
  });
});

// =============================================================================
// Schema validation propagation
// =============================================================================
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
    await expect(ensureDoseLogsTable(invalidSchema)).rejects.toThrow();
    await expect(getDoseLogsByDate(invalidSchema, '2024-01-01')).rejects.toThrow();
    await expect(upsertDoseLog(invalidSchema, 1, '08:00', '2024-01-01', 'pending', null)).rejects.toThrow();

    // Prisma should never have been called with an invalid schema
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });
});
