import { Router } from 'express';
import { createPost, getPost, getAllPosts, updatePost, deletePost, postStorageBytes, reservePostIds, resealPosts } from '../db/tenantQueries.js';
import { ENTRY_STORAGE_LIMIT_BYTES } from '../utils/storageLimits.js';
import { createPostSchema, updatePostSchema, reservePostIdsSchema, resealPostsSchema } from '@chronicles/shared';
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

// POST /api/entries/ids — Reserve ids for new entries (each entry's ciphertext
// is bound to its id, so the client needs the id before encrypting)
router.post('/ids', async (req, res) => {
  try {
    const parsed = reservePostIdsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    res.json({ ids: await reservePostIds(req.auth!.tenantSchemaName, parsed.data.count) });
  } catch (err) {
    console.error('Reserve entry ids error:', err);
    res.status(500).json({ error: 'Failed to reserve entry ids' });
  }
});

// PUT /api/entries/reseal — Re-save older entries in the id-bound format
// (content unchanged, so updated_at stays)
router.put('/reseal', async (req, res) => {
  try {
    const parsed = resealPostsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const entries = parsed.data.entries.map(e => ({
      id: e.id,
      updatedAt: new Date(e.updatedAt),
      contentEncrypted: Buffer.from(e.contentEncrypted, 'base64'),
      contentIv: Buffer.from(e.contentIv, 'base64'),
      metadataEncrypted: Buffer.from(e.metadataEncrypted, 'base64'),
      metadataIv: Buffer.from(e.metadataIv, 'base64'),
    }));
    if (new Set(entries.map(e => e.id)).size !== entries.length) {
      res.status(400).json({ error: 'Each entry once' });
      return;
    }
    const size = entries.reduce((n, e) => n + e.contentEncrypted.length + e.metadataEncrypted.length, 0);
    if (await postStorageBytes(req.auth!.tenantSchemaName, entries.map(e => e.id)) + size > ENTRY_STORAGE_LIMIT_BYTES) {
      res.status(413).json({ error: 'Your journal is full — delete some entries or drawings to make room' });
      return;
    }
    res.json({ resealed: await resealPosts(req.auth!.tenantSchemaName, entries) });
  } catch (err) {
    console.error('Reseal entries error:', err);
    res.status(500).json({ error: 'Failed to re-save entries' });
  }
});

// POST /api/entries — Create entry (under a reserved id)
router.post('/', async (req, res) => {
  try {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    // The schema only admits encrypted posts — the server never stores plaintext
    const { taxonomyIds: _ignored, createdAt, id, format: _v3, ...postData } = parsed.data;
    const input = {
      id,
      contentEncrypted: Buffer.from(postData.contentEncrypted, 'base64'),
      contentIv: Buffer.from(postData.contentIv, 'base64'),
      metadataEncrypted: Buffer.from(postData.metadataEncrypted, 'base64'),
      metadataIv: Buffer.from(postData.metadataIv, 'base64'),
      ...(createdAt && { createdAt: new Date(createdAt) }),
    };

    const size = input.contentEncrypted.length + input.metadataEncrypted.length;
    if (await postStorageBytes(req.auth!.tenantSchemaName) + size > ENTRY_STORAGE_LIMIT_BYTES) {
      res.status(413).json({ error: 'Your journal is full — delete some entries or drawings to make room' });
      return;
    }

    const post = await createPost(req.auth!.tenantSchemaName, input);
    if (!post) {
      res.status(409).json({ error: 'That entry id was not reserved or is taken' });
      return;
    }

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

    const { taxonomyIds: _ignored, format: _v3, ...updates } = parsed.data;
    const input: Partial<Record<'contentEncrypted' | 'contentIv' | 'metadataEncrypted' | 'metadataIv', Buffer>> = {};

    if (updates.contentEncrypted !== undefined) input.contentEncrypted = Buffer.from(updates.contentEncrypted, 'base64');
    if (updates.contentIv !== undefined) input.contentIv = Buffer.from(updates.contentIv, 'base64');
    if (updates.metadataEncrypted !== undefined) input.metadataEncrypted = Buffer.from(updates.metadataEncrypted, 'base64');
    if (updates.metadataIv !== undefined) input.metadataIv = Buffer.from(updates.metadataIv, 'base64');

    if (input.contentEncrypted && input.metadataEncrypted) {
      const size = input.contentEncrypted.length + input.metadataEncrypted.length;
      if (await postStorageBytes(req.auth!.tenantSchemaName, id) + size > ENTRY_STORAGE_LIMIT_BYTES) {
        res.status(413).json({ error: 'Your journal is full — delete some entries or drawings to make room' });
        return;
      }
    }

    const post = await updatePost(req.auth!.tenantSchemaName, id, input);
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
