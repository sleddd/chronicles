import { Router } from 'express';
import { readGate } from '../middleware/readGate.js';
import { parseId } from '../middleware/parseId.js';
import { listAssistantChanges, restoreAssistantChange, deleteAssistantChange, clearAssistantChanges, type AssistantChange } from '../db/assistantHistory.js';

/* What the Chronicles AI app changed, for the owner to look over and put back
   (db/assistantHistory.ts). For browser sessions, with one exception: the AI
   app may put back an entry its own session deleted, within the undo window
   (its own undo; checked in restoreAssistantChange). Everything else here is
   off its allowlist, and refused here as well. */

const router = Router();

const APP_UNDO = /^\/[0-9]+\/restore\/?$/;

router.use((req, res, next) => {
  if (req.auth?.assistant && !(req.method === 'POST' && APP_UNDO.test(req.path))) {
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
    // The AI app: only an entry its own session deleted, within the undo window
    const appUndo = req.auth!.assistant ? { sessionId: req.auth!.sessionId } : undefined;
    const result = await restoreAssistantChange(req.auth!.tenantSchemaName, id, appUndo);
    if (!result.ok) {
      const [status, error] = {
        gone: [410, 'That item has been deleted since, so there is nothing to put it back over'],
        taken: [409, 'That entry is already back in the journal, so nothing was changed'],
        'not-yours': [403, 'The Chronicles AI app can only put back an entry it deleted itself, in the last two minutes'],
        unknown: [404, 'Change not found'],
      }[result.reason] as [number, string];
      res.status(status).json({ error });
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
