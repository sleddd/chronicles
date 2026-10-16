import { Router } from 'express';
import { createTaxonomy, getTaxonomy, getAllTaxonomies, updateTaxonomy, deleteTaxonomy, reorderTaxonomies } from '../db/tenantQueries.js';
import { createTaxonomySchema, updateTaxonomySchema } from '@chronicles/shared';
import { prisma } from '../db/prisma.js';
import { parseId } from '../middleware/parseId.js';
import { escapeSchema } from '../db/escapeSchema.js';

/** JIT migration: add sort_order column if missing (for schemas created before this feature). */
async function ensureSortOrderColumn(schemaName: string): Promise<void> {
  const s = escapeSchema(schemaName);
  const result = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'taxonomies' AND column_name = 'sort_order'
     ) as exists`,
    s
  );
  if (!result[0]?.exists) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${s}.taxonomies ADD COLUMN sort_order INTEGER DEFAULT 0`);
  }
}

const router = Router();

const MAX_REORDER_IDS = 1000;

const DEFAULT_TOPICS = [
  { name: 'Task', icon: 'circle-check', color: '#3B82F6' },
  { name: 'Goal', icon: 'bullseye', color: '#8B5CF6' },
  { name: 'Milestone', icon: 'flag', color: '#6366F1' },
  { name: 'Idea', icon: 'lightbulb', color: '#F59E0B' },
  { name: 'Research', icon: 'magnifying-glass', color: '#10B981' },
  { name: 'Event', icon: 'calendar', color: '#F59E0B' },
  { name: 'Meeting', icon: 'users', color: '#EC4899' },
  { name: 'Meals', icon: 'utensils', color: '#F97316' },
  { name: 'Exercise', icon: 'dumbbell', color: '#EF4444' },
  { name: 'Medication', icon: 'pills', color: '#14B8A6' },
  { name: 'Symptom', icon: 'flask', color: '#EF4444' },
  { name: 'Music', icon: 'music', color: '#EC4899' },
  { name: 'Books', icon: 'book', color: '#8B5CF6' },
  { name: 'TV/Movies', icon: 'film', color: '#F59E0B' },
  { name: 'Quote', icon: 'quote-left', color: '#6366F1' },
  { name: 'Allergy', icon: 'triangle-exclamation', color: '#F97316' },
  { name: 'Shopping List', icon: 'cart-shopping', color: '#22C55E' },
  { name: 'Recipe', icon: 'bowl-food', color: '#F97316' },
  { name: 'Menu Plan', icon: 'calendar-week', color: '#8B5CF6' },
];

async function ensureDefaultTopics(schemaName: string): Promise<void> {
  const existing = await getAllTaxonomies(schemaName);
  // Singular/plural tolerant — a user-created "Recipes" topic counts as "Recipe"
  const norm = (n: string) => n.toLowerCase().replace(/s$/, '');
  const existingNames = new Set(existing.map(t => norm(t.name)));
  const missing = DEFAULT_TOPICS.filter(t => !existingNames.has(norm(t.name)));

  if (missing.length === 0) return;

  for (const topic of missing) {
    await createTaxonomy(schemaName, topic.name, { icon: topic.icon, color: topic.color });
  }
}

// GET /api/topics
router.get('/', async (req, res) => {
  try {
    await ensureSortOrderColumn(req.auth!.tenantSchemaName);
    await ensureDefaultTopics(req.auth!.tenantSchemaName);
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
    // Capped: each id is one UPDATE inside a single transaction
    if (!Array.isArray(topicIds) || topicIds.length > MAX_REORDER_IDS || !topicIds.every((id: unknown) => typeof id === 'number')) {
      res.status(400).json({ error: 'topicIds must be an array of numbers' });
      return;
    }
    // Validate all IDs belong to this tenant
    const existing = await getAllTaxonomies(req.auth!.tenantSchemaName);
    const existingIds = new Set(existing.map(t => t.id));
    if (!topicIds.every(id => existingIds.has(id))) {
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

// POST /api/topics
router.post('/', async (req, res) => {
  try {
    const parsed = createTaxonomySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { name, icon, color } = parsed.data;
    const taxonomy = await createTaxonomy(req.auth!.tenantSchemaName, name, { icon, color });
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
    const parsed = updateTaxonomySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const taxonomy = await updateTaxonomy(req.auth!.tenantSchemaName, id, parsed.data);
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
