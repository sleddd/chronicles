import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

vi.mock('../../db/tenantQueries.js', () => ({
  FINANCE_TABLES: {
    bills: 'finance_bills',
    budget: 'finance_budget_categories',
    expenses: 'finance_expenses',
    goals: 'finance_goals',
    savings: 'finance_savings',
  },
  ensureFinanceTables: vi.fn().mockResolvedValue(undefined),
  getFinancePage: vi.fn(),
  upsertFinanceRecord: vi.fn(),
  deleteFinanceRecord: vi.fn(),
  financeStorageBytes: vi.fn().mockResolvedValue(0),
  resealFinanceRecords: vi.fn(),
  financeRecordBytes: vi.fn().mockResolvedValue(0),
  withTenantLock: vi.fn((_schema: string, fn: (tx: unknown) => unknown) => fn('TX')),
}));

import financeRouter from '../../routes/finance.js';
import { ensureFinanceTables, getFinancePage, upsertFinanceRecord, deleteFinanceRecord, financeStorageBytes, withTenantLock, resealFinanceRecords, financeRecordBytes } from '../../db/tenantQueries.js';
import { FINANCE_STORAGE_LIMIT_BYTES } from '../../utils/storageLimits.js';

const app = createTestApp('/api/finance', financeRouter);

const ID = '3f1c2a64-8d1e-4f5a-9b2c-0d1e2f3a4b5c';
const row = {
  id: ID,
  payloadEncrypted: Buffer.from('finance-cipher-with-tag!'),
  payloadIv: Buffer.from('iv-bytes-12b'),
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

describe('Finance Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/finance/:kind', () => {
    it('returns records as base64', async () => {
      (getFinancePage as any).mockResolvedValue({ records: [row], more: false });
      const res = await request(app).get('/api/finance/bills');
      expect(res.status).toBe(200);
      expect(res.body.records).toHaveLength(1);
      expect(res.body.records[0].payload).toBe(Buffer.from('finance-cipher-with-tag!').toString('base64'));
      expect(res.body.records[0].iv).toBe(Buffer.from('iv-bytes-12b').toString('base64'));
      expect(ensureFinanceTables).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName);
      expect(getFinancePage).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'bills', { offset: 0, limit: 5000, maxBytes: 8 * 1024 * 1024 });
    });

    it('pages: v=2 answers a page and whether there is more, from the offset asked for', async () => {
      (getFinancePage as any).mockResolvedValue({ records: [row], more: true });
      const res = await request(app).get('/api/finance/bills?v=2&offset=40');
      expect(res.status).toBe(200);
      expect(res.body.more).toBe(true);
      expect((getFinancePage as any).mock.calls[0][2].offset).toBe(40);
    });

    it('an older client (no v=2) is told to update rather than shown part of a kind', async () => {
      (getFinancePage as any).mockResolvedValue({ records: [row], more: true });
      const res = await request(app).get('/api/finance/bills');
      expect(res.status).toBe(409);
      expect(res.body.records).toBeUndefined();
    });

    it('serves every finance kind', async () => {
      (getFinancePage as any).mockResolvedValue({ records: [], more: false });
      for (const kind of ['bills', 'budget', 'expenses', 'goals', 'savings']) {
        const res = await request(app).get(`/api/finance/${kind}`);
        expect(res.status).toBe(200);
      }
    });

    it('rejects unknown kinds without touching the DB', async () => {
      for (const kind of ['posts', 'finance_bills', 'paydays', '__proto__', 'toString']) {
        const res = await request(app).get(`/api/finance/${kind}`);
        expect(res.status).toBe(404);
      }
      expect(getFinancePage).not.toHaveBeenCalled();
    });

    it('returns 500 when the query fails', async () => {
      (getFinancePage as any).mockRejectedValue(new Error('db'));
      const res = await request(app).get('/api/finance/goals');
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/finance/:kind/:id', () => {
    it('upserts an encrypted record', async () => {
      (upsertFinanceRecord as any).mockResolvedValue(row);
      const payload = Buffer.from('finance-cipher-with-tag!').toString('base64');
      const iv = Buffer.from('iv-bytes-12b').toString('base64');
      const res = await request(app).put(`/api/finance/goals/${ID}`).send({ payload, iv });
      expect(res.status).toBe(200);
      expect(res.body.record.id).toBe(ID);
      const args = (upsertFinanceRecord as any).mock.calls[0];
      expect(args[0]).toBe(TEST_AUTH.tenantSchemaName);
      expect(args[1]).toBe('goals');
      expect(args[2]).toBe(ID);
      expect(Buffer.isBuffer(args[3])).toBe(true);
      expect(args[3].toString()).toBe('finance-cipher-with-tag!');
    });

    it('refuses a record once finance storage is full (the row being replaced not counted)', async () => {
      (financeStorageBytes as any).mockResolvedValueOnce(FINANCE_STORAGE_LIMIT_BYTES);
      const res = await request(app).put(`/api/finance/goals/${ID}`)
        .send({ payload: Buffer.from('finance-cipher-with-tag!').toString('base64'), iv: Buffer.from('iv-bytes-12b').toString('base64') });
      expect(res.status).toBe(413);
      expect(financeStorageBytes).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, { kind: 'goals', id: ID }, 'TX');
      expect(withTenantLock).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.any(Function));
      expect(upsertFinanceRecord).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID id', async () => {
      const res = await request(app).put('/api/finance/goals/123').send({ payload: 'a', iv: 'b' });
      expect(res.status).toBe(400);
      expect(upsertFinanceRecord).not.toHaveBeenCalled();
    });

    it('rejects a missing payload or iv', async () => {
      const res1 = await request(app).put(`/api/finance/goals/${ID}`).send({ iv: 'b' });
      const res2 = await request(app).put(`/api/finance/goals/${ID}`).send({ payload: 'a' });
      expect(res1.status).toBe(400);
      expect(res2.status).toBe(400);
    });

    it('rejects an oversized payload', async () => {
      // (the test app's 100kb body limit may reject it first; either way it's never saved)
      const res = await request(app).put(`/api/finance/goals/${ID}`).send({ payload: 'a'.repeat(350_001), iv: 'b' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(upsertFinanceRecord).not.toHaveBeenCalled();
    });

    it('rejects unknown kinds', async () => {
      const res = await request(app).put(`/api/finance/accounts/${ID}`).send({ payload: 'a', iv: 'b' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/finance/:kind/:id', () => {
    it('deletes a record', async () => {
      (deleteFinanceRecord as any).mockResolvedValue(true);
      const res = await request(app).delete(`/api/finance/savings/${ID}`);
      expect(res.status).toBe(200);
      expect(deleteFinanceRecord).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'savings', ID);
    });

    it('returns 404 when nothing was deleted', async () => {
      (deleteFinanceRecord as any).mockResolvedValue(false);
      const res = await request(app).delete(`/api/finance/savings/${ID}`);
      expect(res.status).toBe(404);
    });

    it('rejects a non-UUID id', async () => {
      const res = await request(app).delete('/api/finance/savings/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/finance/:kind (re-encrypted records)', () => {
    const rec = (id: string) => ({ id, payload: Buffer.from('new-cipher-with-a-tag!!').toString('base64'), iv: Buffer.from('iv-bytes-12b').toString('base64') });
    const ID2 = '4f1c2a64-8d1e-4f5a-9b2c-0d1e2f3a4b5c';

    it('replaces the records named, under the account lock', async () => {
      (resealFinanceRecords as any).mockResolvedValue(2);
      const res = await request(app).put('/api/finance/expenses').send({ records: [rec(ID), rec(ID2)] });
      expect(res.status).toBe(200);
      expect(res.body.resealed).toBe(2);
      expect(withTenantLock).toHaveBeenCalled();
      const [, kind, records] = (resealFinanceRecords as any).mock.calls[0];
      expect(kind).toBe('expenses');
      expect(records.map((r: { id: string }) => r.id)).toEqual([ID, ID2]);
    });

    it('leaves the records being replaced out of the size check, and refuses past the cap', async () => {
      (financeStorageBytes as any).mockResolvedValue(FINANCE_STORAGE_LIMIT_BYTES);
      (financeRecordBytes as any).mockResolvedValue(10_000);
      (resealFinanceRecords as any).mockResolvedValue(1);
      expect((await request(app).put('/api/finance/bills').send({ records: [rec(ID)] })).status).toBe(200);
      (financeRecordBytes as any).mockResolvedValue(0);
      expect((await request(app).put('/api/finance/bills').send({ records: [rec(ID)] })).status).toBe(413);
      (financeStorageBytes as any).mockResolvedValue(0);
    });

    it('refuses a record twice, a bad id, extra fields and unknown kinds', async () => {
      expect((await request(app).put('/api/finance/bills').send({ records: [rec(ID), rec(ID)] })).status).toBe(400);
      expect((await request(app).put('/api/finance/bills').send({ records: [rec('nope')] })).status).toBe(400);
      expect((await request(app).put('/api/finance/bills').send({ records: [rec(ID)], extra: 1 })).status).toBe(400);
      expect((await request(app).put('/api/finance/bills').send({ records: [] })).status).toBe(400);
      expect((await request(app).put('/api/finance/paydays').send({ records: [rec(ID)] })).status).toBe(404);
      expect(resealFinanceRecords).not.toHaveBeenCalled();
    });
  });
});

