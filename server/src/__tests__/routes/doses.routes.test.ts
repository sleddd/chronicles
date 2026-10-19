import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

vi.mock('../../db/tenantQueries.js', () => ({
  ensureDoseRecordsTable: vi.fn().mockResolvedValue(undefined),
  getDoseRecords: vi.fn(),
  upsertDoseRecord: vi.fn(),
  deleteDoseRecord: vi.fn(),
  getLegacyDoseLogs: vi.fn(),
  deleteLegacyDoseLogs: vi.fn(),
}));

import dosesRouter from '../../routes/doses.js';
import { getDoseRecords, upsertDoseRecord, deleteDoseRecord, getLegacyDoseLogs, deleteLegacyDoseLogs } from '../../db/tenantQueries.js';

const app = createTestApp('/api/doses', dosesRouter);
const ID = '0b6c6f1e-2f4a-4c1e-9a52-3f1d2b7c8e90';
const row = { id: ID, date: '2025-06-15', payloadEncrypted: Buffer.from('sealed'), payloadIv: Buffer.from('iv'), createdAt: 'c', updatedAt: 'u' };

describe('Dose routes (encrypted records)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a day of records as base64 payloads — nothing readable but the date', async () => {
    (getDoseRecords as any).mockResolvedValue([row]);
    const res = await request(app).get('/api/doses?date=2025-06-15');
    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([{ id: ID, date: '2025-06-15', payload: Buffer.from('sealed').toString('base64'), iv: Buffer.from('iv').toString('base64'), createdAt: 'c', updatedAt: 'u' }]);
    expect(getDoseRecords).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, '2025-06-15');
  });

  it('needs a valid date', async () => {
    expect((await request(app).get('/api/doses')).status).toBe(400);
    expect((await request(app).get('/api/doses?date=June')).status).toBe(400);
  });

  it('lists every record for the export', async () => {
    (getDoseRecords as any).mockResolvedValue([row]);
    const res = await request(app).get('/api/doses/all');
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(1);
    expect(getDoseRecords).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName);
  });

  it('upserts an encrypted record by UUID', async () => {
    (upsertDoseRecord as any).mockResolvedValue(row);
    const res = await request(app).put(`/api/doses/${ID}`).send({ date: '2025-06-15', payload: 'c2VhbGVk', iv: 'aXY=' });
    expect(res.status).toBe(200);
    const [, id, date, payload] = (upsertDoseRecord as any).mock.calls[0];
    expect([id, date]).toEqual([ID, '2025-06-15']);
    expect(Buffer.isBuffer(payload)).toBe(true);
  });

  it('refuses a non-UUID id and any plaintext fields', async () => {
    expect((await request(app).put('/api/doses/1').send({ date: '2025-06-15', payload: 'x', iv: 'y' })).status).toBe(400);
    const res = await request(app).put(`/api/doses/${ID}`).send({ date: '2025-06-15', payload: 'x', iv: 'y', medicationPostId: 10, status: 'taken' });
    expect(res.status).toBe(400);
    expect(upsertDoseRecord).not.toHaveBeenCalled();
  });

  it('tells an out-of-date app to update instead of saving a plaintext dose', async () => {
    const res = await request(app).post('/api/doses').send({ medicationPostId: 10, scheduledTime: '08:00', date: '2025-06-15', status: 'taken' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Update Chronicles/);
  });

  it('deletes a record', async () => {
    (deleteDoseRecord as any).mockResolvedValue(true);
    const res = await request(app).delete(`/api/doses/${ID}`);
    expect(res.body).toEqual({ deleted: true });
  });

  it('hands out and then deletes the legacy plaintext log for migration', async () => {
    (getLegacyDoseLogs as any).mockResolvedValue([{ id: 7 }]);
    (deleteLegacyDoseLogs as any).mockResolvedValue(1);
    expect((await request(app).get('/api/doses/legacy')).body).toEqual({ logs: [{ id: 7 }] });
    expect((await request(app).delete('/api/doses/legacy')).body).toEqual({ deleted: 1 });
  });
});
