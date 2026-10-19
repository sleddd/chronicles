import { Router } from 'express';
import { createPost, getPost, getAllPosts, updatePost, deletePost, postStorageBytes } from '../db/tenantQueries.js';
import { ENTRY_STORAGE_LIMIT_BYTES } from '../utils/storageLimits.js';
import { createPostSchema, updatePostSchema } from '@chronicles/shared';
import { parseId } from '../middleware/parseId.js';
import { deleteSharesForEntry } from '../db/shareQueries.js';

const router = Router();

// Entry→topic links are no longer stored in plaintext (post_taxonomies told
// the server which entries were Medication, Symptom, etc.). The topic lives
// only in the entry's encrypted metadata; `taxonomyIds` from older clients is
// accepted and ignored.

// Helper to serialize Buffer/Uint8Array fields to base64 for JSON response
function serializePost(post: Record<string, unknown>) {
  const result = { ...post };
  for (const key of ['contentEncrypted', 'contentIv', 'metadataEncrypted', 'metadataIv']) {
    const val = result[key];
    if (val instanceof Uint8Array || val instanceof Buffer) {
      result[key] = Buffer.from(val).toString('base64');
    }
  }
  return result;
}

// GET /api/entries — Get all entries (paginated)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5000, 1), 10000);
    const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);
    const posts = await getAllPosts(req.auth!.tenantSchemaName, { limit, offset });
    res.json(posts.map(p => serializePost(p as unknown as Record<string, unknown>)));
  } catch (err) {
    console.error('Get entries error:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// POST /api/entries — Create entry
router.post('/', async (req, res) => {
  try {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    // The schema only admits encrypted posts — the server never stores plaintext
    const { taxonomyIds: _ignored, createdAt, ...postData } = parsed.data;
    const input: Record<string, unknown> = {
      isEncrypted: true,
      contentEncrypted: Buffer.from(postData.contentEncrypted, 'base64'),
      contentIv: Buffer.from(postData.contentIv, 'base64'),
      metadataEncrypted: Buffer.from(postData.metadataEncrypted, 'base64'),
      metadataIv: Buffer.from(postData.metadataIv, 'base64'),
    };

    if (createdAt) {
      input.createdAt = new Date(createdAt);
    }

    const size = (input.contentEncrypted as Buffer).length + (input.metadataEncrypted as Buffer).length;
    if (await postStorageBytes(req.auth!.tenantSchemaName) + size > ENTRY_STORAGE_LIMIT_BYTES) {
      res.status(413).json({ error: 'Your journal is full — delete some entries or drawings to make room' });
      return;
    }

    const post = await createPost(req.auth!.tenantSchemaName, input as Parameters<typeof createPost>[1]);

    res.status(201).json(serializePost(post as unknown as Record<string, unknown>));
  } catch (err) {
    console.error('Create entry error:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

// GET /api/entries/:id — Get single entry
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid entry ID' }); return; }
    const post = await getPost(req.auth!.tenantSchemaName, id);
    if (!post) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json(serializePost(post as unknown as Record<string, unknown>));
  } catch (err) {
    console.error('Get entry error:', err);
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
});

// PUT /api/entries/:id — Update entry
router.put('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid entry ID' }); return; }
    const parsed = updatePostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { taxonomyIds: _ignored, ...updates } = parsed.data;
    const input: Record<string, unknown> = {};

    if (updates.contentEncrypted !== undefined) input.contentEncrypted = Buffer.from(updates.contentEncrypted, 'base64');
    if (updates.contentIv !== undefined) input.contentIv = Buffer.from(updates.contentIv, 'base64');
    if (updates.metadataEncrypted !== undefined) input.metadataEncrypted = Buffer.from(updates.metadataEncrypted, 'base64');
    if (updates.metadataIv !== undefined) input.metadataIv = Buffer.from(updates.metadataIv, 'base64');

    if (input.contentEncrypted && input.metadataEncrypted) {
      const size = (input.contentEncrypted as Buffer).length + (input.metadataEncrypted as Buffer).length;
      if (await postStorageBytes(req.auth!.tenantSchemaName, id) + size > ENTRY_STORAGE_LIMIT_BYTES) {
        res.status(413).json({ error: 'Your journal is full — delete some entries or drawings to make room' });
        return;
      }
    }

    const post = await updatePost(req.auth!.tenantSchemaName, id, input as Parameters<typeof updatePost>[2]);
    if (!post) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json(serializePost(post as unknown as Record<string, unknown>));
  } catch (err) {
    console.error('Update entry error:', err);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// DELETE /api/entries/:id — Delete entry
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid entry ID' }); return; }
    await deletePost(req.auth!.tenantSchemaName, id);
    // Public links hold the entry as plaintext — they go with it
    await deleteSharesForEntry(req.auth!.accountId, id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete entry error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;
