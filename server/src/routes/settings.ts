import { Router } from 'express';
import { readGate } from '../middleware/readGate.js';
import { getAllSettings, upsertSettingCapped, upsertSetting, settingExists, countSettings, settingsStorageBytes, deleteSetting } from '../db/tenantQueries.js';
import { upsertSettingSchema, settingKeySchema, SEALED_SETTING_KEYS, isBoundSealedValue } from '@chronicles/shared';
import { ASSISTANT_WRITABLE_SETTINGS, AI_PRIVACY_KEY, assistantMayReadSetting, parseAiPrivacy } from '../services/assistant.js';
import { revokeAssistantSessions } from '../middleware/auth.js';
import { assistantWrite, assistantMark, forgetAssistantChangesFor, AssistantHistoryFull, ASSISTANT_HISTORY_FULL } from '../db/assistantHistory.js';

const SEALED = new Set(SEALED_SETTING_KEYS);

const router = Router();

// Ceiling on distinct setting keys per account. The app uses a few dozen; this
// only stops a signed-in client from filling the database with junk keys.
const MAX_SETTING_KEYS = 500;
// …and on their total size (each value is capped at 64 KB by the schema)
const MAX_SETTINGS_BYTES = 8 * 1024 * 1024;

// GET /api/settings
router.get('/', readGate('settings', 3), async (req, res) => {
  try {
    const all = await getAllSettings(req.auth!.tenantSchemaName);
    // ?keys=a,b: just those (a browser reading a couple of settings again needn't download them all)
    const wanted = typeof req.query.keys === 'string' && req.query.keys.length <= 2000 ? new Set(req.query.keys.split(',')) : null;
    const settings = wanted ? all.filter(s => wanted.has(s.key)) : all;
    // The Chronicles AI app reads only the few settings it needs, and none that
    // belong to a feature the account keeps from AI (habit check-ins, the vision)
    const privacy = req.auth!.aiPrivacy;
    res.json(req.auth!.assistant ? settings.filter(s => !!privacy && assistantMayReadSetting(s.key, privacy)) : settings);
  } catch (err) {
    console.error('Get settings error:', err instanceof Error ? err.message : 'Unknown error');
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
    // The Chronicles AI app writes habit check-ins and nothing else
    if (req.auth!.assistant && !ASSISTANT_WRITABLE_SETTINGS.has(key)) {
      res.status(403).json({ error: 'Not available to the Chronicles AI app' });
      return;
    }
    // Private settings are only ever stored sealed and bound to their key; an
    // old client writing one readable is told to update instead
    if (SEALED.has(key) && !isBoundSealedValue(value)) {
      res.status(409).json({ error: 'Update Chronicles to save this setting' });
      return;
    }
    const schema = req.auth!.tenantSchemaName;
    const result = req.auth!.assistant
      // The Chronicles AI app replaces the whole habit log: the one it replaces
      // is kept and the save made under one lock, for the owner to put back
      // (a full list refuses the save)
      ? await assistantWrite(schema, 'setting', key, assistantMark.setting(value), async (tx) => {
        if (!(await settingExists(schema, key, tx)) && (await countSettings(schema, tx)) >= MAX_SETTING_KEYS) return 'Too many settings' as const;
        if (await settingsStorageBytes(schema, key, tx) + Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_SETTINGS_BYTES) return 'Settings storage is full' as const;
        return upsertSetting(schema, key, value, tx);
      }, saved => typeof saved !== 'string')
      // Lock, both caps and the write in one trip, so two requests at once
      // can't both see room
      : await upsertSettingCapped(schema, key, value, { maxKeys: MAX_SETTING_KEYS, maxBytes: MAX_SETTINGS_BYTES });
    if (typeof result === 'string') {
      res.status(400).json({ error: result });
      return;
    }
    // The Chronicles AI app switched off: its sessions end now
    if (key === AI_PRIVACY_KEY && !parseAiPrivacy(value).appEnabled) await revokeAssistantSessions(req.auth!.accountId);
    res.json(result);
  } catch (err) {
    if (err instanceof AssistantHistoryFull) { res.status(429).json(ASSISTANT_HISTORY_FULL); return; }
    console.error('Update setting error:', err instanceof Error ? err.message : 'Unknown error');
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
    // Earlier versions kept from the AI app's changes go with it
    await forgetAssistantChangesFor(req.auth!.tenantSchemaName, 'setting', key.data);
    await deleteSetting(req.auth!.tenantSchemaName, key.data);
    // Again: a write by the AI app that landed between the two would leave a version of a setting that is gone
    await forgetAssistantChangesFor(req.auth!.tenantSchemaName, 'setting', key.data);
    if (key.data === AI_PRIVACY_KEY) await revokeAssistantSessions(req.auth!.accountId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete setting error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

export default router;
