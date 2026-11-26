import { assistantWrite, assistantMark, forgetAssistantChangesFor, AssistantHistoryFull, ASSISTANT_HISTORY_FULL } from '../db/assistantHistory.js';
import { Router } from 'express';
import { readGate } from '../middleware/readGate.js';
import {
  ensureFinanceTables,
  getFinancePage,
  upsertFinanceRecord,
  resealFinanceRecords,
  financeRecordBytes,
  financeStorageBytes,
  deleteFinanceRecord,
  withTenantLock,
  FINANCE_TABLES,
  type FinanceTableKind,
  type FinanceRecordRow,
  type TenantClient,
} from '../db/tenantQueries.js';
import { financeRecordIdSchema, putFinanceRecordSchema, resealFinanceRecordsSchema } from '@chronicles/shared';
import { FINANCE_STORAGE_LIMIT_BYTES, ROW_OVERHEAD_BYTES } from '../utils/storageLimits.js';
import { addUsage, fitsWithoutCounting, setUsage } from '../db/storageUsage.js';

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

// One list answer holds at most this much ciphertext (sent as base64 in JSON,
// so ~1.4× it), and a few run at once per account: a kind at the storage cap
// is read a page at a time instead of all 50 MB in one answer
const FINANCE_PAGE_BYTES = 8 * 1024 * 1024;
const FINANCE_PAGE_ROWS = 5000;
const listGate = readGate('finance', 6);

// GET /api/finance/:kind?v=2&offset=N — one kind's records, a page at a time
// (oldest first): { records, more }, and the client pages while `more`.
// Without v=2 (older clients, which read one answer as everything) a kind that
// doesn't fit one page is refused rather than shown with records missing.
router.get('/:kind', listGate, async (req, res) => {
  const kind = parseKind(String(req.params.kind));
  if (!kind) {
    res.status(404).json({ error: 'Unknown finance kind' });
    return;
  }
  try {
    await ensureFinanceTables(req.auth!.tenantSchemaName);
    const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 2_000_000_000);
    const page = await getFinancePage(req.auth!.tenantSchemaName, kind, { offset, limit: FINANCE_PAGE_ROWS, maxBytes: FINANCE_PAGE_BYTES });
    if (req.query.v !== '2' && page.more) {
      res.status(409).json({ error: 'Update Chronicles to continue. Reload the page.' });
      return;
    }
    res.json({ records: page.records.map(serialize), more: page.more });
  } catch (err) {
    console.error('Get finance records error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// PUT /api/finance/:kind — re-encrypted records (a new master key), up to 200
// at once, each replacing the one stored under its id (none is created)
router.put('/:kind', async (req, res) => {
  const kind = parseKind(String(req.params.kind));
  if (!kind) {
    res.status(404).json({ error: 'Unknown finance kind' });
    return;
  }
  const body = resealFinanceRecordsSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0].message });
    return;
  }
  const ids = body.data.records.map(r => r.id);
  if (new Set(ids).size !== ids.length) {
    res.status(400).json({ error: 'Each record once' });
    return;
  }
  try {
    const schema = req.auth!.tenantSchemaName;
    await ensureFinanceTables(schema);
    const records = body.data.records.map(r => ({ id: r.id, payload: Buffer.from(r.payload, 'base64'), iv: Buffer.from(r.iv, 'base64') }));
    const size = records.reduce((n, r) => n + r.payload.length + ROW_OVERHEAD_BYTES, 0);
    const resealed = await withTenantLock(schema, async (tx) => {
      const others = await financeStorageBytes(schema, undefined, tx) - await financeRecordBytes(schema, kind, ids, tx);
      if (others + size > FINANCE_STORAGE_LIMIT_BYTES) return null;
      return resealFinanceRecords(schema, kind, records, tx);
    });
    if (resealed === null) {
      res.status(413).json({ error: 'Finance storage is full — delete some old records to make room' });
      return;
    }
    res.json({ resealed });
  } catch (err) {
    console.error('Reseal finance records error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to re-save records' });
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
    res.status(400).json({ error: id.error.issues[0].message });
    return;
  }
  const body = putFinanceRecordSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0].message });
    return;
  }
  try {
    await ensureFinanceTables(req.auth!.tenantSchemaName);
    const payload = Buffer.from(body.data.payload, 'base64');
    const schema = req.auth!.tenantSchemaName;
    const iv = Buffer.from(body.data.iv, 'base64');
    // Check and write under the account's lock, so parallel saves can't both fit
    const write = async (tx: TenantClient) => {
      // The Chronicles AI app records a payment on an existing bill; it never
      // creates one (the route is bills-only for it: services/assistant.ts).
      // Looked up under the lock, so a bill deleted a moment ago isn't made again
      if (req.auth!.assistant && (await financeRecordBytes(schema, kind, [id.data], tx)) === 0) return 'missing' as const;
      // Far below the cap by the last count (db/storageUsage.ts): the five
      // finance tables aren't added up again for every bill ticked paid
      const size = payload.length + ROW_OVERHEAD_BYTES;
      if (fitsWithoutCounting(schema, 'finance', { bytes: size }, { maxBytes: FINANCE_STORAGE_LIMIT_BYTES })) {
        addUsage(schema, 'finance', { bytes: size });
      } else {
        const others = await financeStorageBytes(schema, { kind, id: id.data }, tx);
        if (others + size > FINANCE_STORAGE_LIMIT_BYTES) return null;
        setUsage(schema, 'finance', { bytes: others + size, rows: 0 });
      }
      return upsertFinanceRecord(schema, kind, id.data, payload, iv, tx);
    };
    const row = req.auth!.assistant
      // …and the bill as it was is kept under the same lock, for the owner to
      // put back (a full list refuses the save)
      ? await assistantWrite(schema, 'bill', id.data, assistantMark.record(iv, payload), write, saved => saved !== null && saved !== 'missing')
      // (this save keeps the account's usage figure up to date itself)
      : await withTenantLock(schema, write, { keepUsage: true });
    if (row === 'missing') {
      res.status(404).json({ error: 'Bill not found' });
      return;
    }
    if (!row) {
      res.status(413).json({ error: 'Finance storage is full — delete some old records to make room' });
      return;
    }
    res.json({ record: serialize(row) });
  } catch (err) {
    if (err instanceof AssistantHistoryFull) { res.status(429).json(ASSISTANT_HISTORY_FULL); return; }
    console.error('Save finance record error:', err instanceof Error ? err.message : 'Unknown error');
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
    res.status(400).json({ error: id.error.issues[0].message });
    return;
  }
  try {
    await ensureFinanceTables(req.auth!.tenantSchemaName);
    // Earlier versions kept from the AI app's changes go with it (it only ever changes bills)
    if (kind === 'bills') await forgetAssistantChangesFor(req.auth!.tenantSchemaName, 'bill', id.data);
    const deleted = await deleteFinanceRecord(req.auth!.tenantSchemaName, kind, id.data);
    // Again: a write by the AI app that landed between the two would leave a version of a bill that is gone
    if (kind === 'bills') await forgetAssistantChangesFor(req.auth!.tenantSchemaName, 'bill', id.data);
    if (!deleted) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete finance record error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

export default router;
