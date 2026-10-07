import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

// Mock tenantQueries
vi.mock('../../db/tenantQueries.js', () => ({
  getAllPosts: vi.fn(),
  getPost: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  setPostTaxonomies: vi.fn(),
  getPostTaxonomies: vi.fn(),
  getAllTaxonomies: vi.fn(),
}));

// Mock parseId (use real implementation)
vi.mock('../../middleware/parseId.js', async () => {
  return {
    parseId: (value: string) => {
      const id = Number(value);
      if (!Number.isInteger(id) || id < 1) return NaN;
      return id;
    },
  };
});

import entriesRouter from '../../routes/entries.js';
import { getAllPosts, getPost, createPost, updatePost, deletePost, setPostTaxonomies, getPostTaxonomies, getAllTaxonomies } from '../../db/tenantQueries.js';

const app = createTestApp('/api/entries', entriesRouter);

const mockPost = {
  id: 1,
  content: null,
  metadata: null,
  contentEncrypted: Buffer.from('encrypted'),
  contentIv: Buffer.from('iv12345678ab'),
  metadataEncrypted: Buffer.from('metaenc'),
  metadataIv: Buffer.from('metaiv123456'),
  isEncrypted: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('Entry Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /api/entries
  // =========================================================================
  describe('GET /api/entries', () => {
    it('returns a list of entries with serialized buffers', async () => {
      (getAllPosts as any).mockResolvedValue([mockPost]);

      const res = await request(app).get('/api/entries');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].contentEncrypted).toBe(Buffer.from('encrypted').toString('base64'));
      expect(res.body[0].contentIv).toBe(Buffer.from('iv12345678ab').toString('base64'));
      // Default is large on purpose — the client keeps every entry in its store
      expect(getAllPosts).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, { limit: 5000, offset: 0 });
    });

    it('respects limit and offset query params', async () => {
      (getAllPosts as any).mockResolvedValue([]);

      await request(app).get('/api/entries?limit=50&offset=10');

      expect(getAllPosts).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, { limit: 50, offset: 10 });
    });

    it('clamps limit to max 10000', async () => {
      (getAllPosts as any).mockResolvedValue([]);

      await request(app).get('/api/entries?limit=999999');

      expect(getAllPosts).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, { limit: 10000, offset: 0 });
    });

    it('returns 500 on database error', async () => {
      (getAllPosts as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/entries');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch entries');
    });
  });

  // =========================================================================
  // POST /api/entries
  // =========================================================================
  describe('POST /api/entries', () => {
    it('creates an encrypted entry', async () => {
      const newPost = { ...mockPost, id: 2 };
      (createPost as any).mockResolvedValue(newPost);
      (getAllTaxonomies as any).mockResolvedValue([]);

      const res = await request(app)
        .post('/api/entries')
        .send({
          isEncrypted: true,
          contentEncrypted: Buffer.from('encrypted').toString('base64'),
          contentIv: Buffer.from('iv12345678ab').toString('base64'),
          metadataEncrypted: Buffer.from('metaenc').toString('base64'),
          metadataIv: Buffer.from('metaiv123456').toString('base64'),
        });

      expect(res.status).toBe(201);
      expect(createPost).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.objectContaining({
        isEncrypted: true,
      }));
    });

    it('creates a plaintext entry', async () => {
      const plainPost = { ...mockPost, id: 3, isEncrypted: false, content: 'Hello', contentEncrypted: null, contentIv: null, metadataEncrypted: null, metadataIv: null };
      (createPost as any).mockResolvedValue(plainPost);

      const res = await request(app)
        .post('/api/entries')
        .send({ content: 'Hello', metadata: { title: 'Test' } });

      expect(res.status).toBe(201);
    });

    it('sets taxonomy IDs when provided', async () => {
      (createPost as any).mockResolvedValue({ ...mockPost, id: 4 });
      (getAllTaxonomies as any).mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
      (setPostTaxonomies as any).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/entries')
        .send({
          content: 'Hello',
          taxonomyIds: [1, 2],
        });

      expect(res.status).toBe(201);
      expect(setPostTaxonomies).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 4, [1, 2]);
    });

    it('filters out invalid taxonomy IDs', async () => {
      (createPost as any).mockResolvedValue({ ...mockPost, id: 5 });
      (getAllTaxonomies as any).mockResolvedValue([{ id: 1 }]);
      (setPostTaxonomies as any).mockResolvedValue(undefined);

      await request(app)
        .post('/api/entries')
        .send({ content: 'Hello', taxonomyIds: [1, 999] });

      expect(setPostTaxonomies).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 5, [1]);
    });

    it('returns 400 when encrypted post is missing required fields', async () => {
      const res = await request(app)
        .post('/api/entries')
        .send({
          isEncrypted: true,
          contentEncrypted: Buffer.from('x').toString('base64'),
          // missing contentIv, metadataEncrypted, metadataIv
        });

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      (createPost as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/entries')
        .send({ content: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create entry');
    });
  });

  // =========================================================================
  // GET /api/entries/:id
  // =========================================================================
  describe('GET /api/entries/:id', () => {
    it('returns a single entry with taxonomies', async () => {
      (getPost as any).mockResolvedValue(mockPost);
      (getPostTaxonomies as any).mockResolvedValue([{ id: 1, name: 'Task' }]);

      const res = await request(app).get('/api/entries/1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
      expect(res.body.taxonomies).toEqual([{ id: 1, name: 'Task' }]);
    });

    it('returns 404 when entry not found', async () => {
      (getPost as any).mockResolvedValue(null);

      const res = await request(app).get('/api/entries/999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entry not found');
    });

    it('returns 400 for non-numeric ID', async () => {
      const res = await request(app).get('/api/entries/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid entry ID');
    });

    it('returns 400 for negative ID', async () => {
      const res = await request(app).get('/api/entries/-1');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid entry ID');
    });
  });

  // =========================================================================
  // PUT /api/entries/:id
  // =========================================================================
  describe('PUT /api/entries/:id', () => {
    it('updates an entry', async () => {
      const updatedPost = { ...mockPost, content: 'Updated' };
      (updatePost as any).mockResolvedValue(updatedPost);

      const res = await request(app)
        .put('/api/entries/1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(200);
      expect(updatePost).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 1, expect.any(Object));
    });

    it('updates taxonomy IDs when provided', async () => {
      (updatePost as any).mockResolvedValue(mockPost);
      (getAllTaxonomies as any).mockResolvedValue([{ id: 1 }, { id: 2 }]);
      (setPostTaxonomies as any).mockResolvedValue(undefined);

      await request(app)
        .put('/api/entries/1')
        .send({ content: 'Updated', taxonomyIds: [1] });

      expect(setPostTaxonomies).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 1, [1]);
    });

    it('returns 400 for invalid ID', async () => {
      const res = await request(app)
        .put('/api/entries/abc')
        .send({ content: 'Updated' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid entry ID');
    });

    it('returns 500 on database error', async () => {
      (updatePost as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .put('/api/entries/1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to update entry');
    });
  });

  // =========================================================================
  // DELETE /api/entries/:id
  // =========================================================================
  describe('DELETE /api/entries/:id', () => {
    it('deletes an entry', async () => {
      (deletePost as any).mockResolvedValue(undefined);

      const res = await request(app).delete('/api/entries/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deletePost).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 1);
    });

    it('returns 400 for invalid ID', async () => {
      const res = await request(app).delete('/api/entries/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid entry ID');
    });

    it('returns 500 on database error', async () => {
      (deletePost as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).delete('/api/entries/1');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to delete entry');
    });
  });
});
