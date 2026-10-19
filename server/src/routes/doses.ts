import { Router } from 'express';
import { doseRecordIdSchema, putDoseRecordSchema } from '@chronicles/shared';
import {
  ensureDoseRecordsTable, getDoseRecords, upsertDoseRecord, deleteDoseRecord,
  getLegacyDoseLogs, deleteLegacyDoseLogs, type DoseRecordRow,
} from '../db/tenantQueries.js';

/* Medication dose records are opaque to the server: each row is one AES-GCM
   payload (medication, scheduled time, status, taken at) the browser encrypted
   with AAD bound to the row id. Only the day is readable, for the day query.
   The old plaintext log (medication_dose_logs) is read once by the browser,
   re-saved encrypted, and deleted (/legacy). */

const router = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const OUTDATED = { error: 'Update Chronicles to continue — doses are now encrypted. Reload the page.' };

function serialize(row: DoseRecordRow) {
  return {
    id: row.id,
    date: row.date,
    payload: Buffer.from(row.payloadEncrypted).toString('base64'),
    iv: Buffer.from(row.payloadIv).toString('base64'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /api/doses?date=YYYY-MM-DD — that day's records
router.get('/', async (req, res) => {
  const date = req.query.date as string;
  if (!date || !dateRegex.test(date)) {
    res.status(400).json({ error: 'date query parameter is required in YYYY-MM-DD format' });
    return;
  }
  try {
    await ensureDoseRecordsTable(req.auth!.tenantSchemaName);
    res.json({ records: (await getDoseRecords(req.auth!.tenantSchemaName, date)).map(serialize) });
  } catch (err) {
    console.error('Get dose records error:', err);
    res.status(500).json({ error: 'Failed to fetch doses' });
  }
});

// GET /api/doses/all — every record (for the full data export)
router.get('/all', async (req, res) => {
  try {
    await ensureDoseRecordsTable(req.auth!.tenantSchemaName);
    res.json({ records: (await getDoseRecords(req.auth!.tenantSchemaName)).map(serialize) });
  } catch (err) {
    console.error('Get all dose records error:', err);
    res.status(500).json({ error: 'Failed to fetch doses' });
  }
});

// GET /api/doses/legacy — old plaintext logs still to migrate ([] once done)
router.get('/legacy', async (req, res) => {
  try {
    res.json({ logs: await getLegacyDoseLogs(req.auth!.tenantSchemaName) });
  } catch (err) {
    console.error('Get legacy dose logs error:', err);
    res.status(500).json({ error: 'Failed to fetch legacy doses' });
  }
});

// DELETE /api/doses/legacy — the browser has re-saved them encrypted
router.delete('/legacy', async (req, res) => {
  try {
    res.json({ deleted: await deleteLegacyDoseLogs(req.auth!.tenantSchemaName) });
  } catch (err) {
    console.error('Delete legacy dose logs error:', err);
    res.status(500).json({ error: 'Failed to delete legacy doses' });
  }
});

// POST /api/doses — the old plaintext write; an out-of-date app is told to update
router.post('/', (_req, res) => {
  res.status(409).json(OUTDATED);
});

// PUT /api/doses/:id — create or replace one encrypted record
router.put('/:id', async (req, res) => {
  const id = doseRecordIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: id.error.errors[0].message });
    return;
  }
  const body = putDoseRecordSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.errors[0].message });
    return;
  }
  try {
    await ensureDoseRecordsTable(req.auth!.tenantSchemaName);
    const row = await upsertDoseRecord(
      req.auth!.tenantSchemaName, id.data, body.data.date,
      Buffer.from(body.data.payload, 'base64'), Buffer.from(body.data.iv, 'base64'),
    );
    res.json({ record: serialize(row) });
  } catch (err) {
    console.error('Save dose record error:', err);
    res.status(500).json({ error: 'Failed to save dose' });
  }
});

// DELETE /api/doses/:id
router.delete('/:id', async (req, res) => {
  const id = doseRecordIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: id.error.errors[0].message });
    return;
  }
  try {
    await ensureDoseRecordsTable(req.auth!.tenantSchemaName);
    res.json({ deleted: await deleteDoseRecord(req.auth!.tenantSchemaName, id.data) });
  } catch (err) {
    console.error('Delete dose record error:', err);
    res.status(500).json({ error: 'Failed to delete dose' });
  }
});

export default router;
