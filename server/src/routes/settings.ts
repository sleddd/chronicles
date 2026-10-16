import { Router } from 'express';
import { getAllSettings, upsertSetting } from '../db/tenantQueries.js';
import { upsertSettingSchema } from '@chronicles/shared';

const router = Router();

// Ceiling on distinct setting keys per account. The app uses a few dozen; this
// only stops a signed-in client from filling the database with junk keys.
const MAX_SETTING_KEYS = 500;

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const settings = await getAllSettings(req.auth!.tenantSchemaName);
    res.json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const parsed = upsertSettingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { key, value } = parsed.data;
    const existing = await getAllSettings(req.auth!.tenantSchemaName);
    if (existing.length >= MAX_SETTING_KEYS && !existing.some(st => st.key === key)) {
      res.status(400).json({ error: 'Too many settings' });
      return;
    }
    const setting = await upsertSetting(req.auth!.tenantSchemaName, key, value);
    res.json(setting);
  } catch (err) {
    console.error('Update setting error:', err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

export default router;
