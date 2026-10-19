import { Router } from 'express';
import { getAllSettings, upsertSetting, countSettings, settingExists } from '../db/tenantQueries.js';
import { upsertSettingSchema, SEALED_SETTING_KEYS, isBoundSealedValue } from '@chronicles/shared';

const SEALED = new Set(SEALED_SETTING_KEYS);

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
    // Private settings are only ever stored sealed and bound to their key; an
    // old client writing one readable is told to update instead
    if (SEALED.has(key) && !isBoundSealedValue(value)) {
      res.status(409).json({ error: 'Update Chronicles to save this setting' });
      return;
    }
    const schema = req.auth!.tenantSchemaName;
    if (!(await settingExists(schema, key)) && (await countSettings(schema)) >= MAX_SETTING_KEYS) {
      res.status(400).json({ error: 'Too many settings' });
      return;
    }
    const setting = await upsertSetting(schema, key, value);
    res.json(setting);
  } catch (err) {
    console.error('Update setting error:', err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

export default router;
