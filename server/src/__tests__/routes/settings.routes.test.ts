import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

// Mock tenantQueries
vi.mock('../../db/tenantQueries.js', () => ({
  getAllSettings: vi.fn(),
  upsertSetting: vi.fn(),
}));

import settingsRouter from '../../routes/settings.js';
import { getAllSettings, upsertSetting } from '../../db/tenantQueries.js';

const app = createTestApp('/api/settings', settingsRouter);

const mockSettings = [
  { key: 'headerColor', value: '#2d2c2a', updatedAt: new Date('2025-01-01') },
  { key: 'backgroundImage', value: 'mountains', updatedAt: new Date('2025-01-01') },
];

describe('Settings Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /api/settings
  // =========================================================================
  describe('GET /api/settings', () => {
    it('returns all settings', async () => {
      (getAllSettings as any).mockResolvedValue(mockSettings);

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].key).toBe('headerColor');
      expect(getAllSettings).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName);
    });

    it('returns empty array when no settings', async () => {
      (getAllSettings as any).mockResolvedValue([]);

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      (getAllSettings as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch settings');
    });
  });

  // =========================================================================
  // PUT /api/settings
  // =========================================================================
  describe('PUT /api/settings', () => {
    beforeEach(() => {
      (getAllSettings as any).mockResolvedValue([]);
    });

    it('refuses a new key once the account has 500 settings', async () => {
      (getAllSettings as any).mockResolvedValue(Array.from({ length: 500 }, (_, i) => ({ key: `k${i}`, value: i })));

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'brandNew', value: 1 });

      expect(res.status).toBe(400);
      expect(upsertSetting).not.toHaveBeenCalled();
    });

    it('still updates an existing key at the cap', async () => {
      (getAllSettings as any).mockResolvedValue(Array.from({ length: 500 }, (_, i) => ({ key: `k${i}`, value: i })));
      (upsertSetting as any).mockResolvedValue({ key: 'k3', value: 9, updatedAt: new Date() });

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'k3', value: 9 });

      expect(res.status).toBe(200);
    });

    it('upserts a string setting', async () => {
      const result = { key: 'headerColor', value: '#FF0000', updatedAt: new Date() };
      (upsertSetting as any).mockResolvedValue(result);

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'headerColor', value: '#FF0000' });

      expect(res.status).toBe(200);
      expect(res.body.key).toBe('headerColor');
      expect(upsertSetting).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'headerColor', '#FF0000');
    });

    it('upserts a boolean setting', async () => {
      const result = { key: 'darkMode', value: true, updatedAt: new Date() };
      (upsertSetting as any).mockResolvedValue(result);

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'darkMode', value: true });

      expect(res.status).toBe(200);
      expect(upsertSetting).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'darkMode', true);
    });

    it('upserts an object setting', async () => {
      const complexValue = { nested: { data: [1, 2, 3] } };
      const result = { key: 'preferences', value: complexValue, updatedAt: new Date() };
      (upsertSetting as any).mockResolvedValue(result);

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'preferences', value: complexValue });

      expect(res.status).toBe(200);
    });

    it('returns 400 when key is missing', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({ value: 'something' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when key is empty string', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({ key: '', value: 'something' });

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      (upsertSetting as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'headerColor', value: '#FF0000' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to update setting');
    });
  });
});
