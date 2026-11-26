import { Router } from 'express';
import { readGate } from '../middleware/readGate.js';
import { createTaxonomy, getTaxonomy, getAllTaxonomies, updateTaxonomy, deleteTaxonomy, reorderTaxonomies, ensureTopicEncryptionColumns, ensureTaxonomyReservations, reserveTaxonomyIds, taxonomyCount, withTenantLock,
  ensureAiPrivacyTables, assistantTopicAllowed, recordAssistantTopic, ASSISTANT_TOPICS_PER_DAY } from '../db/tenantQueries.js';
import { createTaxonomySchema, updateTaxonomySchema, isPlaintextTopicWrite, reservePostIdsSchema } from '@chronicles/shared';
import { parseId } from '../middleware/parseId.js';
import { assistantIdLimiter } from '../middleware/rateLimiter.js';

/* Topic names and icons are encrypted in the browser, bound to the topic's id;
   the server stores the payload and never sees them. Default topics are
   seeded by the browser, encrypted. A new topic is created under an id
   reserved first (/ids), since its payload is bound to it; each reservation is
   recorded and used up by the create, so a topic id is created at most once. */

const OUTDATED = { error: 'Update Chronicles to continue — topic names are now encrypted. Reload the page.' };

/** Per-account cap: far beyond any real list of topics, but bounded */
export const TOPIC_LIMIT = (() => {
  const n = Number(process.env.TOPIC_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 1000;
})();
const TOPICS_FULL = { error: `You can have up to ${TOPIC_LIMIT} topics — delete some to make room` };
const FULL = Symbol('full');

/* The Chronicles AI app may create topics for its own data (its memories,
   letters and conversations), the same sealed way, but no more than
   ASSISTANT_TOPICS_PER_DAY in a day — it can't rename, reorder or delete one */
const ASSISTANT_TOPICS_SPENT = { error: `The Chronicles AI app can create up to ${ASSISTANT_TOPICS_PER_DAY} topics a day — try again tomorrow` };
const LIMIT = Symbol('limit');
/* …and reserves one id at a time, a handful of times an hour: the account holds
   only so many reservations, and the owner's browser needs its own */
const assistantTopicIds = assistantIdLimiter('topic-ids', 10);

const router = Router();

// GET /api/topics
router.get('/', readGate('topics', 3), async (req, res) => {
  try {
    await ensureTopicEncryptionColumns(req.auth!.tenantSchemaName);
    const taxonomies = await getAllTaxonomies(req.auth!.tenantSchemaName);
    // The Chronicles AI app holds the account's key, so a topic kept from AI
    // is left out altogether: its name is never sent
    // (authMiddleware always hands the choices over; without them nothing is listed)
    if (req.auth!.assistant && !req.auth!.aiPrivacy) {
      res.status(403).json({ error: 'Not available to the Chronicles AI app' });
      return;
    }
    const hidden = req.auth!.assistant ? new Set(req.auth!.aiPrivacy!.hiddenTopicIds) : null;
    res.json(hidden ? taxonomies.filter(t => !hidden.has(t.id)) : taxonomies);
  } catch (err) {
    console.error('Get topics error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// POST /api/topics/reorder
router.post('/reorder', async (req, res) => {
  try {
    const topicIds: unknown = req.body?.topicIds;
    if (!Array.isArray(topicIds) || !topicIds.every((id: unknown) => typeof id === 'number')) {
      res.status(400).json({ error: 'topicIds must be an array of numbers' });
      return;
    }
    // Validate all IDs belong to this tenant, each at most once — a body of
    // repeated ids would otherwise run one UPDATE per entry in one transaction
    const existing = await getAllTaxonomies(req.auth!.tenantSchemaName);
    const existingIds = new Set(existing.map(t => t.id));
    if (topicIds.length > existingIds.size || new Set(topicIds).size !== topicIds.length || !topicIds.every(id => existingIds.has(id))) {
      res.status(400).json({ error: 'Invalid topic IDs' });
      return;
    }
    await reorderTaxonomies(req.auth!.tenantSchemaName, topicIds);
    res.json({ success: true });
  } catch (err) {
    console.error('Reorder topics error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to reorder topics' });
  }
});

// POST /api/topics/ids — reserve ids for new topics
router.post('/ids', assistantTopicIds, async (req, res) => {
  try {
    const parsed = reservePostIdsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    await ensureTopicEncryptionColumns(req.auth!.tenantSchemaName);
    // Each id handed out is recorded, and used up when its topic is created
    await ensureTaxonomyReservations(req.auth!.tenantSchemaName);
    // No ids for an account that couldn't create a topic with them anyway
    if (await taxonomyCount(req.auth!.tenantSchemaName) >= TOPIC_LIMIT) {
      res.status(413).json(TOPICS_FULL);
      return;
    }
    // …nor for the AI app once its day's topics are spent (the create counts them)
    if (req.auth!.assistant && !(await assistantTopicAllowed(req.auth!.tenantSchemaName))) {
      res.status(429).json(ASSISTANT_TOPICS_SPENT);
      return;
    }
    res.json({ ids: await reserveTaxonomyIds(req.auth!.tenantSchemaName, req.auth!.assistant ? 1 : parsed.data.count) });
  } catch (err) {
    console.error('Reserve topic ids error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to reserve topic ids' });
  }
});

// POST /api/topics
router.post('/', async (req, res) => {
  try {
    if (isPlaintextTopicWrite(req.body)) { res.status(409).json(OUTDATED); return; }
    const parsed = createTaxonomySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    await ensureTopicEncryptionColumns(req.auth!.tenantSchemaName);
    await ensureTaxonomyReservations(req.auth!.tenantSchemaName);
    const { format: _v2, ...data } = parsed.data;
    const schema = req.auth!.tenantSchemaName;
    const assistant = !!req.auth!.assistant;
    if (assistant) await ensureAiPrivacyTables(schema);
    // Count and insert under the account's lock, so parallel creates can't
    // pass the cap (nor the AI app its day's budget)
    const taxonomy = await withTenantLock(schema, async (tx) => {
      if (await taxonomyCount(schema, tx) >= TOPIC_LIMIT) return FULL;
      if (assistant && !(await assistantTopicAllowed(schema, tx))) return LIMIT;
      const made = await createTaxonomy(schema, data, tx);
      if (made && assistant) await recordAssistantTopic(schema, made.id, tx);
      return made;
    });
    if (taxonomy === FULL) {
      res.status(413).json(TOPICS_FULL);
      return;
    }
    if (taxonomy === LIMIT) {
      res.status(429).json(ASSISTANT_TOPICS_SPENT);
      return;
    }
    if (!taxonomy) {
      res.status(409).json({ error: 'That topic id was not reserved or is taken' });
      return;
    }
    res.status(201).json(taxonomy);
  } catch (err) {
    console.error('Create topic error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to create topic' });
  }
});

// GET /api/topics/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid topic ID' }); return; }
    const taxonomy = await getTaxonomy(req.auth!.tenantSchemaName, id);
    if (!taxonomy) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    res.json(taxonomy);
  } catch (err) {
    console.error('Get topic error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch topic' });
  }
});

// PUT /api/topics/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid topic ID' }); return; }
    if (isPlaintextTopicWrite(req.body)) { res.status(409).json(OUTDATED); return; }
    const parsed = updateTaxonomySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    await ensureTopicEncryptionColumns(req.auth!.tenantSchemaName);
    const { format: _v2, ...updates } = parsed.data;
    const taxonomy = await updateTaxonomy(req.auth!.tenantSchemaName, id, updates);
    if (!taxonomy) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    res.json(taxonomy);
  } catch (err) {
    console.error('Update topic error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to update topic' });
  }
});

// DELETE /api/topics/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid topic ID' }); return; }
    await deleteTaxonomy(req.auth!.tenantSchemaName, id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete topic error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

export default router;
