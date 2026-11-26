import { Router } from 'express';
import { readGate } from '../middleware/readGate.js';
import { parseId } from '../middleware/parseId.js';
import { listAssistantChanges, restoreAssistantChange, deleteAssistantChange, clearAssistantChanges, type AssistantChange } from '../db/assistantHistory.js';

/* What the Chronicles AI app changed, for the owner to look over and put back
   (db/assistantHistory.ts). For browser sessions only: these paths are not on
   the AI app's allowlist, and it is refused here as well. */

const router = Router();

router.use((req, res, next) => {
  if (req.auth?.assistant) {
    res.status(403).json({ error: 'Not available to the Chronicles AI app' });
    return;
  }
  next();
});

const b64 = (b: Buffer | null) => (b ? Buffer.from(b).toString('base64') : null);

function serialize(c: AssistantChange) {
  return {
    id: c.id, kind: c.kind, ref: c.ref, savedAt: c.savedAt,
    body: b64(c.body), bodyIv: b64(c.bodyIv), meta: b64(c.meta), metaIv: b64(c.metaIv), extra: c.extra,
  };
}

// GET /api/assistant-changes?before=<id> — newest first, a page at a time
router.get('/', readGate('assistant-changes', 2), async (req, res) => {
  try {
    const before = req.query.before === undefined ? undefined : parseId(String(req.query.before));
    if (before !== undefined && Number.isNaN(before)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const page = await listAssistantChanges(req.auth!.tenantSchemaName, before);
    res.json({ changes: page.changes.map(serialize), more: page.more });
  } catch (err) {
    console.error('Assistant changes list error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to load changes' });
  }
});

// POST /api/assistant-changes/:id/restore — put that version back (what is there now takes its place in the list)
router.post('/:id/restore', async (req, res) => {
  try {
    const id = parseId(String(req.params.id));
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const result = await restoreAssistantChange(req.auth!.tenantSchemaName, id);
    if (!result.ok) {
      res.status(result.reason === 'gone' ? 410 : 404).json({
        error: result.reason === 'gone' ? 'That item has been deleted since, so there is nothing to put it back over' : 'Change not found',
      });
      return;
    }
    res.json({ restored: serialize(result.change) });
  } catch (err) {
    console.error('Assistant change restore error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to restore' });
  }
});

// DELETE /api/assistant-changes/:id — throw one kept version away
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(String(req.params.id));
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    await deleteAssistantChange(req.auth!.tenantSchemaName, id);
    res.json({ success: true });
  } catch (err) {
    console.error('Assistant change delete error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// DELETE /api/assistant-changes — throw them all away
router.delete('/', async (req, res) => {
  try {
    await clearAssistantChanges(req.auth!.tenantSchemaName);
    res.json({ success: true });
  } catch (err) {
    console.error('Assistant changes clear error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
