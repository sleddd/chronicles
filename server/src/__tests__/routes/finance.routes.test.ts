import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

vi.mock('../../db/tenantQueries.js', () => ({
  FINANCE_TABLES: {
    paydays: 'finance_paydays',
    bills: 'finance_bills',
    budget: 'finance_budget_categories',
    expenses: 'finance_expenses',
    goals: 'finance_goals',
    savings: 'finance_savings',
  },
  ensureFinanceTables: vi.fn().mockResolvedValue(undefined),
  getFinanceRecords: vi.fn(),
  upsertFinanceRecord: vi.fn(),
  deleteFinanceRecord: vi.fn(),
  financeStorageBytes: vi.fn().mockResolvedValue(0),
}));

import financeRouter from '../../routes/finance.js';
import { ensureFinanceTables, getFinanceRecords, upsertFinanceRecord, deleteFinanceRecord, financeStorageBytes } from '../../db/tenantQueries.js';
import { FINANCE_STORAGE_LIMIT_BYTES } from '../../utils/storageLimits.js';

const app = createTestApp('/api/finance', financeRouter);

const ID = '3f1c2a64-8d1e-4f5a-9b2c-0d1e2f3a4b5c';
const row = {
  id: ID,
  payloadEncrypted: Buffer.from('cipher'),
  payloadIv: Buffer.from('iv-bytes'),
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

describe('Finance Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/finance/:kind', () => {
    it('returns records as base64', async () => {
      (getFinanceRecords as any).mockResolvedValue([row]);
      const res = await request(app).get('/api/finance/bills');
      expect(res.status).toBe(200);
      expect(res.body.records).toHaveLength(1);
      expect(res.body.records[0].payload).toBe(Buffer.from('cipher').toString('base64'));
      expect(res.body.records[0].iv).toBe(Buffer.from('iv-bytes').toString('base64'));
      expect(ensureFinanceTables).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName);
      expect(getFinanceRecords).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 'bills');
    });

    it('serves every finance kind', async () => {
      (getFinanceRecords as any).mockResolvedValue([]);
      for (const kind of ['paydays', 'bills', 'budget', 'expenses', 'goals', 'savings']) {
        const res = await request(app).get(`/api/finance/${kind}`);
        expect(res.status).toBe(200);
      }
    });

    it('rejects unknown kinds without touching the DB', async () => {
      for (const kind of ['posts', 'finance_bills', '__proto__', 'toString']) {
        const res = await request(app).get(`/api/finance/${kind}`);
        expect(res.status).toBe(404);
      }
      expect(getFinanceRecords).not.toHaveBeenCalled();
    });

    it('returns 500 when the query fails', async () => {
      (getFinanceRecords as any).mockRejectedValue(new Error('db'));
      const res = await request(app).get('/api/finance/paydays');
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/finance/:kind/:id', () => {
    it('upserts an encrypted record', async () => {
      (upsertFinanceRecord as any).mockResolvedValue(row);
      const payload = Buffer.from('cipher').toString('base64');
      const iv = Buffer.from('iv-bytes').toString('base64');
      const res = await request(app).put(`/api/finance/goals/${ID}`).send({ payload, iv });
      expect(res.status).toBe(200);
      expect(res.body.record.id).toBe(ID);
      const args = (upsertFinanceRecord as any).mock.calls[0];
      expect(args[0]).toBe(TEST_AUTH.tenantSchemaName);
      expect(args[1]).toBe('goals');
      expect(args[2]).toBe(ID);
      expect(Buffer.isBuffer(args[3])).toBe(true);
      expect(args[3].toString()).toBe('cipher');
    });

    it('refuses a record once finance storage is full (the row being replaced not counted)', async () => {
      (financeStorageBytes as any).mockResolvedValueOnce(FINANCE_STORAGE_LIMIT_BYTES);
      const res = await request(app).put(`/api/finance/goals/${ID}`)
        .send({ payload: Buffer.from('cipher').toString('base64'), iv: Buffer.from('iv-bytes').toString('base64') });
      expect(res.status).toBe(413);
      expect(financeStorageBytes).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, { kind: 'goals', id: ID });
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
});
