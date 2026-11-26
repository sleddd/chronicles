import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

// Mock tenantQueries
// Versions kept of what the AI app overwrote (its own tests: assistantRoutes.test.ts)
vi.mock('../../db/assistantHistory.js', () => ({
  // Runs the route's write on a stand-in transaction (the real one: assistantHistory.db.test.ts)
  assistantWrite: vi.fn(async (_schema: string, _kind: string, _ref: string, _mark: Buffer, write: (tx: unknown) => unknown) => write('TX')),
  assistantMark: { entry: (a: Buffer, b: Buffer) => Buffer.concat([a, b]), record: (iv: Buffer) => iv, setting: () => Buffer.from('iv') },
  AssistantHistoryFull: class AssistantHistoryFull extends Error {},
  ASSISTANT_HISTORY_FULL: { error: 'The list is full' },
  expireAssistantChanges: vi.fn().mockResolvedValue(undefined),
  forgetAssistantChangesFor: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../db/tenantQueries.js', () => ({
  getAllSettings: vi.fn(),
  // Lock, caps and write in one trip
  upsertSettingCapped: vi.fn(),
  deleteSetting: vi.fn(),
}));

import settingsRouter from '../../routes/settings.js';
import { getAllSettings, upsertSettingCapped, deleteSetting } from '../../db/tenantQueries.js';

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
      (upsertSettingCapped as any).mockResolvedValue('Too many settings');
      const res = await request(app).put('/api/settings').send({ key: 'brandNew', value: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Too many settings');
    });

    it('refuses a write that would take the settings past their total size', async () => {
      (upsertSettingCapped as any).mockResolvedValue('Settings storage is full');
      const res = await request(app).put('/api/settings').send({ key: 'headerColor', value: 'x'.repeat(100) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Settings storage is full');
    });

    it('hands the caps and the write to one locked statement', async () => {
      (upsertSettingCapped as any).mockResolvedValue({ key: 'a', value: 1, updatedAt: new Date() });
      await request(app).put('/api/settings').send({ key: 'a', value: 1 });
      expect(upsertSettingCapped).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'a', 1, { maxKeys: 500, maxBytes: 8 * 1024 * 1024 });
    });

    it('upserts a string setting', async () => {
      const result = { key: 'headerColor', value: '#FF0000', updatedAt: new Date() };
      (upsertSettingCapped as any).mockResolvedValue(result);

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'headerColor', value: '#FF0000' });

      expect(res.status).toBe(200);
      expect(res.body.key).toBe('headerColor');
      expect(upsertSettingCapped).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'headerColor', '#FF0000', expect.any(Object));
    });

    it('upserts a boolean setting', async () => {
      const result = { key: 'darkMode', value: true, updatedAt: new Date() };
      (upsertSettingCapped as any).mockResolvedValue(result);

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'darkMode', value: true });

      expect(res.status).toBe(200);
      expect(upsertSettingCapped).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'darkMode', true, expect.any(Object));
    });

    it('upserts an object setting', async () => {
      const complexValue = { nested: { data: [1, 2, 3] } };
      const result = { key: 'preferences', value: complexValue, updatedAt: new Date() };
      (upsertSettingCapped as any).mockResolvedValue(result);

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'preferences', value: complexValue });

      expect(res.status).toBe(200);
    });

    it('counts keys without loading every value', async () => {
      (upsertSettingCapped as any).mockResolvedValue({ key: 'headerColor', value: '#000', updatedAt: new Date() });
      await request(app).put('/api/settings').send({ key: 'headerColor', value: '#000' });
      expect(getAllSettings).not.toHaveBeenCalled();
    });

    it('refuses a private setting sent readable, or sealed without its key binding', async () => {
      for (const value of [true, 'Alex', { ciphertext: 'x', iv: 'y' }, { ciphertext: 'x', iv: 'y', v: 1 }]) {
        const res = await request(app).put('/api/settings').send({ key: 'icsIncludeDetails', value });
        expect(res.status).toBe(409);
      }
      for (const key of ['displayName', 'financeEnabled', 'calendarSyncEnabled', 'nutritionGoals', 'aiConfig', 'settingsSealV2']) {
        expect((await request(app).put('/api/settings').send({ key, value: false })).status).toBe(409);
      }
      expect(upsertSettingCapped).not.toHaveBeenCalled();
    });

    it('stores a private setting sealed and bound', async () => {
      const value = { ciphertext: 'abc', iv: 'def', v: 2 };
      (upsertSettingCapped as any).mockResolvedValue({ key: 'displayName', value, updatedAt: new Date() });
      const res = await request(app).put('/api/settings').send({ key: 'displayName', value });
      expect(res.status).toBe(200);
      expect(upsertSettingCapped).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'displayName', value, expect.any(Object));
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
      (upsertSettingCapped as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .put('/api/settings')
        .send({ key: 'headerColor', value: '#FF0000' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to update setting');
    });
  });

  // =========================================================================
  // DELETE /api/settings/:key
  // =========================================================================
  describe('DELETE /api/settings/:key', () => {
    it('deletes the setting — the way removed credentials are forgotten', async () => {
      (deleteSetting as any).mockResolvedValue(true);
      const res = await request(app).delete('/api/settings/aiConfig');
      expect(res.status).toBe(200);
      expect(deleteSetting).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'aiConfig');
    });

    it('succeeds when the setting was already gone', async () => {
      (deleteSetting as any).mockResolvedValue(false);
      expect((await request(app).delete('/api/settings/imageStorageConfig')).status).toBe(200);
    });

    it('refuses a key over 100 characters', async () => {
      const res = await request(app).delete(`/api/settings/${'k'.repeat(101)}`);
      expect(res.status).toBe(400);
      expect(deleteSetting).not.toHaveBeenCalled();
    });
  });
});
