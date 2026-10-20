import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

vi.mock('../../db/tenantQueries.js', () => ({
  ensureDoseRecordsTable: vi.fn().mockResolvedValue(undefined),
  getDoseRecords: vi.fn(),
  upsertDoseRecord: vi.fn(),
  deleteDoseRecord: vi.fn(),
  resealDoseRecords: vi.fn(),
  doseRecordStorage: vi.fn().mockResolvedValue({ count: 0, bytes: 0 }),
  withTenantLock: vi.fn((_schema: string, fn: (tx: unknown) => unknown) => fn('TX')),
}));

import dosesRouter from '../../routes/doses.js';
import { getDoseRecords, upsertDoseRecord, deleteDoseRecord, resealDoseRecords, doseRecordStorage, withTenantLock } from '../../db/tenantQueries.js';
import { DOSE_RECORD_LIMIT, DOSE_STORAGE_LIMIT_BYTES } from '../../routes/doses.js';

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
    const res = await request(app).put(`/api/doses/${ID}`).send({ format: 2, date: '2025-06-15', payload: 'c2VhbGVk', iv: 'aXY=' });
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

  it('refuses a dose from an older client (not sealed to its day)', async () => {
    const res = await request(app).put(`/api/doses/${ID}`).send({ date: '2025-06-15', payload: 'c2VhbGVk', iv: 'aXY=' });
    expect(res.status).toBe(400);
    expect(upsertDoseRecord).not.toHaveBeenCalled();
  });

  it('re-seals older records in batches, each once', async () => {
    (resealDoseRecords as any).mockResolvedValue(2);
    const rec = (id: string) => ({ id, date: '2025-06-15', payload: 'cA==', iv: 'aQ==' });
    const A = '11111111-1111-4111-8111-111111111111';
    const B = '22222222-2222-4222-8222-222222222222';
    const ok = await request(app).put('/api/doses/reseal').send({ records: [rec(A), rec(B)] });
    expect(ok.body).toEqual({ resealed: 2 });
    expect((await request(app).put('/api/doses/reseal').send({ records: [rec(A), rec(A)] })).status).toBe(400);
  });

  it('refuses dates that look right but are not real days (400, not a failed ::date cast)', async () => {
    for (const d of ['2026-13-45', '2026-02-30', '2025-02-29', '0000-01-01']) {
      expect((await request(app).get(`/api/doses?date=${d}`)).status).toBe(400);
      expect((await request(app).put(`/api/doses/${ID}`).send({ format: 2, date: d, payload: 'c2VhbGVk', iv: 'aXY=' })).status).toBe(400);
    }
    const rec = { id: '11111111-1111-4111-8111-111111111111', date: '2026-13-45', payload: 'cA==', iv: 'aQ==' };
    expect((await request(app).put('/api/doses/reseal').send({ records: [rec] })).status).toBe(400);
    expect(getDoseRecords).not.toHaveBeenCalled();
    expect(upsertDoseRecord).not.toHaveBeenCalled();
    (getDoseRecords as any).mockResolvedValue([]);
    expect((await request(app).get('/api/doses?date=2024-02-29')).status).toBe(200);
  });

  it('caps an account\'s dose records by count and bytes, checked under the account lock', async () => {
    const put = () => request(app).put(`/api/doses/${ID}`).send({ format: 2, date: '2025-06-15', payload: 'c2VhbGVk', iv: 'aXY=' });
    (doseRecordStorage as any).mockResolvedValueOnce({ count: DOSE_RECORD_LIMIT, bytes: 0 });
    expect((await put()).status).toBe(413);
    (doseRecordStorage as any).mockResolvedValueOnce({ count: 0, bytes: DOSE_STORAGE_LIMIT_BYTES - 2 });
    expect((await put()).status).toBe(413);
    expect(upsertDoseRecord).not.toHaveBeenCalled();
    // The record being replaced isn't counted against itself
    (upsertDoseRecord as any).mockResolvedValue(row);
    expect((await put()).status).toBe(200);
    expect(withTenantLock).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.any(Function));
    expect(doseRecordStorage).toHaveBeenLastCalledWith(TEST_AUTH.tenantSchemaName, [ID], 'TX');
    expect((upsertDoseRecord as any).mock.calls[0][5]).toBe('TX');
  });

  it('refuses a re-seal that would overfill dose storage', async () => {
    (doseRecordStorage as any).mockResolvedValueOnce({ count: 1, bytes: DOSE_STORAGE_LIMIT_BYTES });
    const rec = { id: '11111111-1111-4111-8111-111111111111', date: '2025-06-15', payload: 'cA==', iv: 'aQ==' };
    expect((await request(app).put('/api/doses/reseal').send({ records: [rec] })).status).toBe(413);
    expect(resealDoseRecords).not.toHaveBeenCalled();
  });

  it('no longer serves the old plaintext log', async () => {
    expect((await request(app).get('/api/doses/legacy')).status).toBe(404);
  });
});
