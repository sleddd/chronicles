import { Router } from 'express';
import {
  ensureFinanceTables,
  getFinanceRecords,
  upsertFinanceRecord,
  financeStorageBytes,
  deleteFinanceRecord,
  withTenantLock,
  FINANCE_TABLES,
  type FinanceTableKind,
  type FinanceRecordRow,
} from '../db/tenantQueries.js';
import { financeRecordIdSchema, putFinanceRecordSchema } from '@chronicles/shared';
import { FINANCE_STORAGE_LIMIT_BYTES, ROW_OVERHEAD_BYTES } from '../utils/storageLimits.js';

// Finance records are opaque to the server: each row is one AES-GCM payload
// the client encrypted (AAD bound to kind + id). The server only stores it.
const router = Router();

function parseKind(raw: string): FinanceTableKind | null {
  return Object.prototype.hasOwnProperty.call(FINANCE_TABLES, raw) ? (raw as FinanceTableKind) : null;
}

function serialize(row: FinanceRecordRow) {
  return {
    id: row.id,
    payload: Buffer.from(row.payloadEncrypted).toString('base64'),
    iv: Buffer.from(row.payloadIv).toString('base64'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /api/finance/:kind — every record of one kind
router.get('/:kind', async (req, res) => {
  const kind = parseKind(req.params.kind);
  if (!kind) {
    res.status(404).json({ error: 'Unknown finance kind' });
    return;
  }
  try {
    await ensureFinanceTables(req.auth!.tenantSchemaName);
    const rows = await getFinanceRecords(req.auth!.tenantSchemaName, kind);
    res.json({ records: rows.map(serialize) });
  } catch (err) {
    console.error('Get finance records error:', err);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// PUT /api/finance/:kind/:id — create or replace one record
router.put('/:kind/:id', async (req, res) => {
  const kind = parseKind(req.params.kind);
  if (!kind) {
    res.status(404).json({ error: 'Unknown finance kind' });
    return;
  }
  const id = financeRecordIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: id.error.errors[0].message });
    return;
  }
  const body = putFinanceRecordSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.errors[0].message });
    return;
  }
  try {
    await ensureFinanceTables(req.auth!.tenantSchemaName);
    const payload = Buffer.from(body.data.payload, 'base64');
    const schema = req.auth!.tenantSchemaName;
    // Check and write under the account's lock, so parallel saves can't both fit
    const row = await withTenantLock(schema, async (tx) => {
      if (await financeStorageBytes(schema, { kind, id: id.data }, tx) + payload.length + ROW_OVERHEAD_BYTES > FINANCE_STORAGE_LIMIT_BYTES) return null;
      return upsertFinanceRecord(schema, kind, id.data, payload, Buffer.from(body.data.iv, 'base64'), tx);
    });
    if (!row) {
      res.status(413).json({ error: 'Finance storage is full — delete some old records to make room' });
      return;
    }
    res.json({ record: serialize(row) });
  } catch (err) {
    console.error('Save finance record error:', err);
    res.status(500).json({ error: 'Failed to save record' });
  }
});

// DELETE /api/finance/:kind/:id
router.delete('/:kind/:id', async (req, res) => {
  const kind = parseKind(req.params.kind);
  if (!kind) {
    res.status(404).json({ error: 'Unknown finance kind' });
    return;
  }
  const id = financeRecordIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: id.error.errors[0].message });
    return;
  }
  try {
    await ensureFinanceTables(req.auth!.tenantSchemaName);
    const deleted = await deleteFinanceRecord(req.auth!.tenantSchemaName, kind, id.data);
    if (!deleted) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete finance record error:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

export default router;
