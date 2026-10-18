import { Router } from 'express';
import { ensureDoseLogsTable, getAllDoseLogs, getDoseLogsByDate, upsertDoseLog, getPost } from '../db/tenantQueries.js';
import { z } from 'zod';

const router = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;

const logDoseSchema = z.object({
  medicationPostId: z.number(),
  scheduledTime: z.string().regex(timeRegex, 'Must be HH:MM format'),
  date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD format'),
  status: z.enum(['taken', 'skipped', 'pending']),
  takenAt: z.string().nullable().optional(),
});

// GET /api/doses/all — every dose log (for the full data export)
router.get('/all', async (req, res) => {
  try {
    await ensureDoseLogsTable(req.auth!.tenantSchemaName);
    res.json({ logs: await getAllDoseLogs(req.auth!.tenantSchemaName) });
  } catch (err) {
    console.error('Get all dose logs error:', err);
    res.status(500).json({ error: 'Failed to fetch dose logs' });
  }
});

// GET /api/doses?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const date = req.query.date as string;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date query parameter is required in YYYY-MM-DD format' });
      return;
    }

    await ensureDoseLogsTable(req.auth!.tenantSchemaName);
    const logs = await getDoseLogsByDate(req.auth!.tenantSchemaName, date);
    res.json({ logs });
  } catch (err) {
    console.error('Get dose logs error:', err);
    res.status(500).json({ error: 'Failed to fetch dose logs' });
  }
});

// POST /api/doses
router.post('/', async (req, res) => {
  try {
    const parsed = logDoseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { medicationPostId, scheduledTime, date, status, takenAt } = parsed.data;

    // Validate that the medication post exists in this tenant's schema
    await ensureDoseLogsTable(req.auth!.tenantSchemaName);
    const post = await getPost(req.auth!.tenantSchemaName, medicationPostId);
    if (!post) {
      res.status(404).json({ error: 'Medication post not found' });
      return;
    }

    const resolvedTakenAt = status === 'taken'
      ? (takenAt || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }))
      : null;
    const log = await upsertDoseLog(
      req.auth!.tenantSchemaName,
      medicationPostId,
      scheduledTime,
      date,
      status,
      resolvedTakenAt
    );

    res.json({ log });
  } catch (err) {
    console.error('Log dose error:', err);
    res.status(500).json({ error: 'Failed to log dose' });
  }
});

export default router;
