import { Router } from 'express';
import { getAllSettings, upsertSetting, countSettings, settingExists, settingsStorageBytes, deleteSetting, withTenantLock } from '../db/tenantQueries.js';
import { upsertSettingSchema, settingKeySchema, SEALED_SETTING_KEYS, isBoundSealedValue } from '@chronicles/shared';

const SEALED = new Set(SEALED_SETTING_KEYS);

const router = Router();

// Ceiling on distinct setting keys per account. The app uses a few dozen; this
// only stops a signed-in client from filling the database with junk keys.
const MAX_SETTING_KEYS = 500;
// …and on their total size (each value is capped at 64 KB by the schema)
const MAX_SETTINGS_BYTES = 8 * 1024 * 1024;

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
      res.status(400).json({ error: parsed.error.issues[0].message });
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
    // The caps are a read then a write: under the account's lock, so two
    // requests at once can't both see room
    const result = await withTenantLock(schema, async (tx) => {
      if (!(await settingExists(schema, key, tx)) && (await countSettings(schema, tx)) >= MAX_SETTING_KEYS) return 'Too many settings';
      if (await settingsStorageBytes(schema, key, tx) + Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_SETTINGS_BYTES) return 'Settings storage is full';
      return upsertSetting(schema, key, value, tx);
    });
    if (typeof result === 'string') {
      res.status(400).json({ error: result });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('Update setting error:', err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// DELETE /api/settings/:key — forget a setting (e.g. removed AI or R2
// credentials: sealed settings can't be overwritten with null, so they're
// deleted instead)
router.delete('/:key', async (req, res) => {
  try {
    const key = settingKeySchema.safeParse(req.params.key);
    if (!key.success) {
      res.status(400).json({ error: 'Invalid setting key' });
      return;
    }
    await deleteSetting(req.auth!.tenantSchemaName, key.data);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete setting error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

export default router;
