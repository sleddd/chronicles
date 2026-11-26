import { assistantWrite, assistantMark, assistantNewRecordAllowed, forgetAssistantChangesFor, AssistantHistoryFull, ASSISTANT_HISTORY_FULL, ASSISTANT_NEW_DOSES_PER_DAY } from '../db/assistantHistory.js';
import { Router } from 'express';
import { readGate } from '../middleware/readGate.js';
import { doseRecordIdSchema, putDoseRecordSchema, resealDoseRecordsSchema } from '@chronicles/shared';
import {
  ensureDoseRecordsTable, getDoseRecords, upsertDoseRecordCapped, upsertDoseRecord, deleteDoseRecord, resealDoseRecords, doseRecordStorage, withTenantLock,
  type DoseRecordRow,
} from '../db/tenantQueries.js';

/* Medication dose records are opaque to the server: each row is one AES-GCM
   payload (medication, scheduled time, status, taken at) the browser encrypted
   with AAD bound to the row id and its day. Only the day is readable, for the
   day query. Records sealed before the day was bound are re-saved once
   (/reseal). The old plaintext log is no longer read. */

const router = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day (2026-13-45 matches the pattern but fails Postgres's ::date). */
export function isCalendarDate(value: string): boolean {
  if (!dateRegex.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  return y >= 1 && day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d;
}

const envLimit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Per-account cap — years of several doses a day fit easily; one account mustn't fill the database */
export const DOSE_RECORD_LIMIT = envLimit('DOSE_RECORD_LIMIT', 50_000);
export const DOSE_STORAGE_LIMIT_BYTES = envLimit('DOSE_STORAGE_LIMIT_MB', 20) * 1024 * 1024;
const DOSES_FULL = { error: 'Dose history is full — delete some old doses to make room' };
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

// GET /api/doses?date=YYYY-MM-DD — that day's records. Gated like the other
// lists: the caps are per account, not per day, so one day can hold all 20 MB
router.get('/', readGate('doses-day', 4), async (req, res) => {
  const date = req.query.date as string;
  if (!date || !isCalendarDate(date)) {
    res.status(400).json({ error: 'date query parameter is required in YYYY-MM-DD format' });
    return;
  }
  try {
    await ensureDoseRecordsTable(req.auth!.tenantSchemaName);
    res.json({ records: (await getDoseRecords(req.auth!.tenantSchemaName, date)).map(serialize) });
  } catch (err) {
    console.error('Get dose records error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch doses' });
  }
});

// GET /api/doses/all — every record (for the full data export)
router.get('/all', readGate('doses', 2), async (req, res) => {
  try {
    await ensureDoseRecordsTable(req.auth!.tenantSchemaName);
    res.json({ records: (await getDoseRecords(req.auth!.tenantSchemaName)).map(serialize) });
  } catch (err) {
    console.error('Get all dose records error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch doses' });
  }
});

// PUT /api/doses/reseal — re-save older records bound to their day (keeps updated_at)
router.put('/reseal', async (req, res) => {
  const body = resealDoseRecordsSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0].message });
    return;
  }
  if (new Set(body.data.records.map(r => r.id)).size !== body.data.records.length) {
    res.status(400).json({ error: 'Each record once' });
    return;
  }
  if (!body.data.records.every(r => isCalendarDate(r.date))) {
    res.status(400).json({ error: 'Must be a real date' });
    return;
  }
  try {
    const schema = req.auth!.tenantSchemaName;
    await ensureDoseRecordsTable(schema);
    const records = body.data.records.map(r => ({
      id: r.id, date: r.date, payload: Buffer.from(r.payload, 'base64'), iv: Buffer.from(r.iv, 'base64'),
    }));
    const size = records.reduce((n, r) => n + r.payload.length, 0);
    const resealed = await withTenantLock(schema, async (tx) => {
      if ((await doseRecordStorage(schema, records.map(r => r.id), tx)).bytes + size > DOSE_STORAGE_LIMIT_BYTES) return null;
      return resealDoseRecords(schema, records, tx);
    });
    if (resealed === null) {
      res.status(413).json(DOSES_FULL);
      return;
    }
    res.json({ resealed });
  } catch (err) {
    console.error('Reseal dose records error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to re-save doses' });
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
    res.status(400).json({ error: id.error.issues[0].message });
    return;
  }
  const body = putDoseRecordSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0].message });
    return;
  }
  if (!isCalendarDate(body.data.date)) {
    res.status(400).json({ error: 'Must be a real date' });
    return;
  }
  try {
    const schema = req.auth!.tenantSchemaName;
    await ensureDoseRecordsTable(schema);
    const payload = Buffer.from(body.data.payload, 'base64');
    const iv = Buffer.from(body.data.iv, 'base64');
    const row = req.auth!.assistant
      // The Chronicles AI app: the record it replaces is kept and the save made
      // under one lock, for the owner to put back (a full list refuses the save)
      // A dose record it makes new comes out of its day's budget: it can't
      // delete one later, and a new record has no earlier version to put back
      ? await assistantWrite(schema, 'dose', id.data, assistantMark.record(iv, payload), async (tx) => {
        if (!(await assistantNewRecordAllowed(tx, schema, 'dose', id.data, ASSISTANT_NEW_DOSES_PER_DAY))) return 'limit' as const;
        const used = await doseRecordStorage(schema, [id.data], tx);
        if (used.count + 1 > DOSE_RECORD_LIMIT || used.bytes + payload.length > DOSE_STORAGE_LIMIT_BYTES) return null;
        return upsertDoseRecord(schema, id.data, body.data.date, payload, iv, tx);
      }, saved => saved !== null && saved !== 'limit')
      // Lock, caps and write in one trip, so parallel saves can't both fit
      : await upsertDoseRecordCapped(schema, id.data, body.data.date, payload, iv,
        { maxRows: DOSE_RECORD_LIMIT, maxBytes: DOSE_STORAGE_LIMIT_BYTES });
    if (row === 'limit') {
      res.status(429).json({ error: 'The Chronicles AI app has recorded as many new doses as it may in a day' });
      return;
    }
    if (!row) {
      res.status(413).json(DOSES_FULL);
      return;
    }
    res.json({ record: serialize(row) });
  } catch (err) {
    if (err instanceof AssistantHistoryFull) { res.status(429).json(ASSISTANT_HISTORY_FULL); return; }
    console.error('Save dose record error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to save dose' });
  }
});

// DELETE /api/doses/:id
router.delete('/:id', async (req, res) => {
  const id = doseRecordIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: id.error.issues[0].message });
    return;
  }
  try {
    await ensureDoseRecordsTable(req.auth!.tenantSchemaName);
    // Earlier versions kept from the AI app's changes go with it
    await forgetAssistantChangesFor(req.auth!.tenantSchemaName, 'dose', id.data);
    const deleted = await deleteDoseRecord(req.auth!.tenantSchemaName, id.data);
    // Again: a write by the AI app that landed between the two would leave a version of a record that is gone
    await forgetAssistantChangesFor(req.auth!.tenantSchemaName, 'dose', id.data);
    res.json({ deleted });
  } catch (err) {
    console.error('Delete dose record error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to delete dose' });
  }
});

export default router;
