import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

vi.mock('../../db/tenantQueries.js', () => ({
  getAllTaxonomies: vi.fn(),
  getTaxonomy: vi.fn(),
  createTaxonomy: vi.fn(),
  updateTaxonomy: vi.fn(),
  deleteTaxonomy: vi.fn(),
  reorderTaxonomies: vi.fn(),
  ensureTopicEncryptionColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../middleware/parseId.js', async () => ({
  parseId: (value: string) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) return NaN;
    return id;
  },
}));

import topicsRouter from '../../routes/topics.js';
import { getAllTaxonomies, getTaxonomy, createTaxonomy, updateTaxonomy, deleteTaxonomy, reorderTaxonomies } from '../../db/tenantQueries.js';

const app = createTestApp('/api/topics', topicsRouter);
const sealed = { id: 1, name: null, icon: null, color: '#3B82F6', sort_order: 0, payload: 'c2VhbGVk', iv: 'aXY=' };

describe('Topic Routes (encrypted names)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists topics without seeding anything (the browser seeds defaults, encrypted)', async () => {
    (getAllTaxonomies as any).mockResolvedValue([sealed]);
    const res = await request(app).get('/api/topics');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([sealed]);
    expect(createTaxonomy).not.toHaveBeenCalled();
  });

  it('creates a topic from an encrypted payload', async () => {
    (createTaxonomy as any).mockResolvedValue(sealed);
    const res = await request(app).post('/api/topics').send({ payload: 'c2VhbGVk', iv: 'aXY=', color: '#3B82F6' });
    expect(res.status).toBe(201);
    expect(createTaxonomy).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, { payload: 'c2VhbGVk', iv: 'aXY=', color: '#3B82F6' });
  });

  it('tells an out-of-date app to update instead of saving a plaintext name or icon', async () => {
    for (const body of [{ name: 'Health' }, { payload: 'x', iv: 'y', icon: 'pills' }]) {
      const res = await request(app).post('/api/topics').send(body);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Update Chronicles/);
    }
    expect((await request(app).put('/api/topics/1').send({ name: 'Health' })).status).toBe(409);
    expect(createTaxonomy).not.toHaveBeenCalled();
    expect(updateTaxonomy).not.toHaveBeenCalled();
  });

  it('rejects a payload without its iv', async () => {
    expect((await request(app).post('/api/topics').send({ payload: 'x' })).status).toBe(400);
    expect((await request(app).put('/api/topics/1').send({ payload: 'x' })).status).toBe(400);
  });

  it('updates the payload and/or colour', async () => {
    (updateTaxonomy as any).mockResolvedValue(sealed);
    const res = await request(app).put('/api/topics/1').send({ payload: 'bmV3', iv: 'aXY=' });
    expect(res.status).toBe(200);
    expect(updateTaxonomy).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 1, { payload: 'bmV3', iv: 'aXY=' });
  });

  it('gets and deletes by id, with id validation', async () => {
    (getTaxonomy as any).mockResolvedValueOnce(sealed).mockResolvedValueOnce(null);
    expect((await request(app).get('/api/topics/1')).body).toEqual(sealed);
    expect((await request(app).get('/api/topics/2')).status).toBe(404);
    expect((await request(app).get('/api/topics/abc')).status).toBe(400);
    (deleteTaxonomy as any).mockResolvedValue(undefined);
    expect((await request(app).delete('/api/topics/1')).body).toEqual({ success: true });
  });

  describe('POST /api/topics/reorder', () => {
    it('reorders topics with valid IDs', async () => {
      (getAllTaxonomies as any).mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
      (reorderTaxonomies as any).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/topics/reorder')
        .send({ topicIds: [3, 1, 2] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(reorderTaxonomies).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, [3, 1, 2]);
    });

    it('returns 400 when topicIds is not an array', async () => {
      const res = await request(app)
        .post('/api/topics/reorder')
        .send({ topicIds: 'not-array' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('topicIds must be an array of numbers');
    });

    it('returns 400 when topicIds contains non-numbers', async () => {
      const res = await request(app)
        .post('/api/topics/reorder')
        .send({ topicIds: [1, 'abc', 3] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('topicIds must be an array of numbers');
    });

    it('returns 400 when topicIds contains invalid IDs', async () => {
      (getAllTaxonomies as any).mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const res = await request(app)
        .post('/api/topics/reorder')
        .send({ topicIds: [1, 999] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid topic IDs');
    });

    it('returns 500 on database error', async () => {
      (getAllTaxonomies as any).mockResolvedValue([{ id: 1 }]);
      (reorderTaxonomies as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/topics/reorder')
        .send({ topicIds: [1] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to reorder topics');
    });
  });
});
