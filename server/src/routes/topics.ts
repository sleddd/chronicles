import { Router } from 'express';
import { createTaxonomy, getTaxonomy, getAllTaxonomies, updateTaxonomy, deleteTaxonomy, reorderTaxonomies, ensureTopicEncryptionColumns, reserveTaxonomyIds, taxonomyCount, withTenantLock } from '../db/tenantQueries.js';
import { createTaxonomySchema, updateTaxonomySchema, isPlaintextTopicWrite, reservePostIdsSchema } from '@chronicles/shared';
import { parseId } from '../middleware/parseId.js';

/* Topic names and icons are encrypted in the browser, bound to the topic's id;
   the server stores the payload and never sees them. Default topics are
   seeded by the browser, encrypted. A new topic is created under an id
   reserved first (/ids), since its payload is bound to it. */

const OUTDATED = { error: 'Update Chronicles to continue — topic names are now encrypted. Reload the page.' };

/** Per-account cap: far beyond any real list of topics, but bounded */
export const TOPIC_LIMIT = (() => {
  const n = Number(process.env.TOPIC_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 1000;
})();
const TOPICS_FULL = { error: `You can have up to ${TOPIC_LIMIT} topics — delete some to make room` };
const FULL = Symbol('full');

const router = Router();

// GET /api/topics
router.get('/', async (req, res) => {
  try {
    await ensureTopicEncryptionColumns(req.auth!.tenantSchemaName);
    const taxonomies = await getAllTaxonomies(req.auth!.tenantSchemaName);
    res.json(taxonomies);
  } catch (err) {
    console.error('Get topics error:', err);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// POST /api/topics/reorder
router.post('/reorder', async (req, res) => {
  try {
    const { topicIds } = req.body;
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
    console.error('Reorder topics error:', err);
    res.status(500).json({ error: 'Failed to reorder topics' });
  }
});

// POST /api/topics/ids — reserve ids for new topics
router.post('/ids', async (req, res) => {
  try {
    const parsed = reservePostIdsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    await ensureTopicEncryptionColumns(req.auth!.tenantSchemaName);
    // No ids for an account that couldn't create a topic with them anyway
    if (await taxonomyCount(req.auth!.tenantSchemaName) >= TOPIC_LIMIT) {
      res.status(413).json(TOPICS_FULL);
      return;
    }
    res.json({ ids: await reserveTaxonomyIds(req.auth!.tenantSchemaName, parsed.data.count) });
  } catch (err) {
    console.error('Reserve topic ids error:', err);
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
    const { format: _v2, ...data } = parsed.data;
    const schema = req.auth!.tenantSchemaName;
    // Count and insert under the account's lock, so parallel creates can't pass the cap
    const taxonomy = await withTenantLock(schema, async (tx) => {
      if (await taxonomyCount(schema, tx) >= TOPIC_LIMIT) return FULL;
      return createTaxonomy(schema, data, tx);
    });
    if (taxonomy === FULL) {
      res.status(413).json(TOPICS_FULL);
      return;
    }
    if (!taxonomy) {
      res.status(409).json({ error: 'That topic id was not reserved or is taken' });
      return;
    }
    res.status(201).json(taxonomy);
  } catch (err) {
    console.error('Create topic error:', err);
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
    console.error('Get topic error:', err);
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
    console.error('Update topic error:', err);
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
    console.error('Delete topic error:', err);
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

export default router;
