import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

// Mock tenantQueries
vi.mock('../../db/tenantQueries.js', () => ({
  getAllTaxonomies: vi.fn(),
  getTaxonomy: vi.fn(),
  createTaxonomy: vi.fn(),
  updateTaxonomy: vi.fn(),
  deleteTaxonomy: vi.fn(),
  reorderTaxonomies: vi.fn(),
}));

// Mock prisma (for ensureSortOrderColumn)
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ exists: true }]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock escapeSchema
vi.mock('../../db/escapeSchema.js', () => ({
  escapeSchema: vi.fn((s: string) => s),
}));

// Mock parseId (real implementation)
vi.mock('../../middleware/parseId.js', async () => ({
  parseId: (value: string) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) return NaN;
    return id;
  },
}));

import topicsRouter from '../../routes/topics.js';
import { getAllTaxonomies, getTaxonomy, createTaxonomy, updateTaxonomy, deleteTaxonomy, reorderTaxonomies } from '../../db/tenantQueries.js';
import { prisma } from '../../db/prisma.js';

const app = createTestApp('/api/topics', topicsRouter);

const mockTaxonomy = {
  id: 1,
  name: 'Task',
  icon: 'circle-check',
  color: '#3B82F6',
  sort_order: 0,
};

describe('Topic Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: ensureSortOrderColumn passes (column exists)
    (prisma.$queryRawUnsafe as any).mockResolvedValue([{ exists: true }]);
  });

  // =========================================================================
  // GET /api/topics
  // =========================================================================
  describe('GET /api/topics', () => {
    it('returns list of topics', async () => {
      // getAllTaxonomies called twice: once in ensureDefaultTopics, once for the final list
      (getAllTaxonomies as any)
        .mockResolvedValueOnce([mockTaxonomy]) // ensureDefaultTopics check
        .mockResolvedValueOnce([mockTaxonomy]); // final return

      const res = await request(app).get('/api/topics');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([mockTaxonomy]);
    });

    it('creates default topics when none exist', async () => {
      (getAllTaxonomies as any)
        .mockResolvedValueOnce([]) // no existing topics
        .mockResolvedValueOnce([mockTaxonomy]); // after defaults created
      (createTaxonomy as any).mockResolvedValue(mockTaxonomy);

      const res = await request(app).get('/api/topics');

      expect(res.status).toBe(200);
      // Every default topic is created (incl. Allergy, Shopping List, Recipe, Menu Plan)
      expect(createTaxonomy).toHaveBeenCalledTimes(19);
      const names = (createTaxonomy as any).mock.calls.map((c: any[]) => c[1]);
      expect(names).toEqual(expect.arrayContaining(['Meals', 'Medication', 'Shopping List', 'Menu Plan']));
    });

    it('returns 500 on database error', async () => {
      (getAllTaxonomies as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/topics');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch topics');
    });
  });

  // =========================================================================
  // POST /api/topics
  // =========================================================================
  describe('POST /api/topics', () => {
    it('creates a topic with valid data', async () => {
      (createTaxonomy as any).mockResolvedValue({ id: 10, name: 'Custom', icon: 'star', color: '#FF0000', sort_order: 0 });

      const res = await request(app)
        .post('/api/topics')
        .send({ name: 'Custom', icon: 'star', color: '#FF0000' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Custom');
      expect(createTaxonomy).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'Custom', { icon: 'star', color: '#FF0000' });
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/topics')
        .send({ icon: 'star' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid color format', async () => {
      const res = await request(app)
        .post('/api/topics')
        .send({ name: 'Test', color: 'not-a-color' });

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      (createTaxonomy as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/topics')
        .send({ name: 'Failing' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create topic');
    });
  });

  // =========================================================================
  // GET /api/topics/:id
  // =========================================================================
  describe('GET /api/topics/:id', () => {
    it('returns a single topic', async () => {
      (getTaxonomy as any).mockResolvedValue(mockTaxonomy);

      const res = await request(app).get('/api/topics/1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
    });

    it('returns 404 when topic not found', async () => {
      (getTaxonomy as any).mockResolvedValue(null);

      const res = await request(app).get('/api/topics/999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Topic not found');
    });

    it('returns 400 for invalid ID', async () => {
      const res = await request(app).get('/api/topics/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid topic ID');
    });
  });

  // =========================================================================
  // PUT /api/topics/:id
  // =========================================================================
  describe('PUT /api/topics/:id', () => {
    it('updates a topic', async () => {
      const updated = { ...mockTaxonomy, name: 'Updated Task' };
      (updateTaxonomy as any).mockResolvedValue(updated);

      const res = await request(app)
        .put('/api/topics/1')
        .send({ name: 'Updated Task' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Task');
      expect(updateTaxonomy).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 1, { name: 'Updated Task' });
    });

    it('returns 400 for invalid ID', async () => {
      const res = await request(app)
        .put('/api/topics/abc')
        .send({ name: 'Updated' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid color', async () => {
      const res = await request(app)
        .put('/api/topics/1')
        .send({ color: 'bad' });

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      (updateTaxonomy as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .put('/api/topics/1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to update topic');
    });
  });

  // =========================================================================
  // DELETE /api/topics/:id
  // =========================================================================
  describe('DELETE /api/topics/:id', () => {
    it('deletes a topic', async () => {
      (deleteTaxonomy as any).mockResolvedValue(undefined);

      const res = await request(app).delete('/api/topics/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deleteTaxonomy).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 1);
    });

    it('returns 400 for invalid ID', async () => {
      const res = await request(app).delete('/api/topics/abc');

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      (deleteTaxonomy as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).delete('/api/topics/1');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to delete topic');
    });
  });

  // =========================================================================
  // POST /api/topics/reorder
  // =========================================================================
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
