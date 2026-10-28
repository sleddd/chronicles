import { Router, type Response } from 'express';
import crypto from 'crypto';
import { createPost, createPosts, ensurePostSync, getSyncCursor, getPostChanges, type CreatePostInput, getPost, getPostPage, updatePost, deletePost, postStorageBytes, reservePostIds, resealPosts, withTenantLock } from '../db/tenantQueries.js';
import { ENTRY_STORAGE_LIMIT_BYTES, ROW_OVERHEAD_BYTES } from '../utils/storageLimits.js';
import { createPostSchema, createPostsBatchSchema, updatePostSchema, reservePostIdsSchema, resealPostsSchema } from '@chronicles/shared';
import { parseId } from '../middleware/parseId.js';
import { deleteSharesForEntry } from '../db/shareQueries.js';

const router = Router();

// Every write is change-tracked for the browser's sync (a trigger per schema,
// added on first use for older accounts) — in place before any route runs
router.use(async (req, res, next) => {
  try {
    await ensurePostSync(req.auth!.tenantSchemaName);
    next();
  } catch (err) {
    console.error('Entry sync setup error:', err);
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

const JOURNAL_FULL = { error: 'Your journal is full — delete some entries or drawings to make room' };
const FULL = Symbol('full');

// Largest xid8 (a 64-bit unsigned integer): a bigger cursor fails the cast
const MAX_XID8 = 2n ** 64n - 1n;

// Which journal a browser cache belongs to: a cache from another account (or
// one deleted and made again under the same email) never matches
const syncScope = (schemaName: string) => crypto.createHash('sha256').update(`chronicles:sync:${schemaName}`).digest('hex').slice(0, 32);

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

// One list response holds at most this much ciphertext (it's sent as base64
// in JSON, so the response is ~1.4× it); the client keeps paging. Without it
// an account at its storage cap could make each request buffer it all.
const ENTRY_PAGE_BYTES = 16 * 1024 * 1024;

// List requests (full pages and /changes) running at once per account, in
// this process: each holds up to a page in memory
const MAX_LIST_IN_FLIGHT = 3;
const listsInFlight = new Map<number, number>();

function claimListSlot(accountId: number): boolean {
  const n = listsInFlight.get(accountId) ?? 0;
  if (n >= MAX_LIST_IN_FLIGHT) return false;
  listsInFlight.set(accountId, n + 1);
  return true;
}

function releaseListSlot(accountId: number): void {
  const n = (listsInFlight.get(accountId) ?? 1) - 1;
  if (n <= 0) listsInFlight.delete(accountId);
  else listsInFlight.set(accountId, n);
}

function busy(res: Response): void {
  res.set('Retry-After', '2');
  res.status(429).json({ error: 'Still loading your entries. Try again in a moment.' });
}

// GET /api/entries — Get all entries, a page at a time (newest first), each
// page capped by count and by bytes. `?v=2` answers { entries, more } and the
// client pages while `more`; without it (older clients) the bare array, which
// those page through until a short page comes back. The offset is uncapped so
// a journal can hold more than one page.
router.get('/', async (req, res) => {
  const accountId = req.auth!.accountId;
  if (!claimListSlot(accountId)) { busy(res); return; }
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5000, 1), 10000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const page = await getPostPage(req.auth!.tenantSchemaName, { limit, offset, maxBytes: ENTRY_PAGE_BYTES });
    const entries = page.posts.map(p => serializePost(p as unknown as Record<string, unknown>));
    res.json(req.query.v === '2' ? { entries, more: page.more } : entries);
  } catch (err) {
    console.error('Get entries error:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  } finally {
    releaseListSlot(accountId);
  }
});

// GET /api/entries/cursor — Where a full load starts: take it before reading
// every page, then ask /changes from it next time
router.get('/cursor', async (req, res) => {
  try {
    res.json({ cursor: await getSyncCursor(req.auth!.tenantSchemaName), scope: syncScope(req.auth!.tenantSchemaName) });
  } catch (err) {
    console.error('Entry cursor error:', err);
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// GET /api/entries/changes?since=<cursor> — Entries written and ids deleted
// since the cursor, and the next cursor. { reset: true } means load everything
router.get('/changes', async (req, res) => {
  const accountId = req.auth!.accountId;
  if (!claimListSlot(accountId)) { busy(res); return; }
  try {
    const since = String(req.query.since ?? '');
    if (!/^\d{1,20}$/.test(since) || BigInt(since) > MAX_XID8) {
      res.status(400).json({ error: 'Invalid cursor' });
      return;
    }
    const changes = await getPostChanges(req.auth!.tenantSchemaName, since, 5000, ENTRY_PAGE_BYTES);
    const scope = syncScope(req.auth!.tenantSchemaName);
    if (changes.reset) {
      res.json({ reset: true, scope });
      return;
    }
    res.json({
      reset: false,
      scope,
      cursor: changes.cursor,
      entries: changes.entries.map(p => serializePost(p as unknown as Record<string, unknown>)),
      deleted: changes.deleted,
    });
  } catch (err) {
    console.error('Entry changes error:', err);
    res.status(500).json({ error: 'Failed to load entries' });
  } finally {
    releaseListSlot(accountId);
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
    const size = entries.reduce((n, e) => n + e.contentEncrypted.length + e.metadataEncrypted.length + ROW_OVERHEAD_BYTES, 0);
    const schema = req.auth!.tenantSchemaName;
    // Check and write under the account's lock, so parallel writes can't both fit
    const resealed = await withTenantLock(schema, async (tx) => {
      if (await postStorageBytes(schema, entries.map(e => e.id), tx) + size > ENTRY_STORAGE_LIMIT_BYTES) return FULL;
      return resealPosts(schema, entries, tx);
    });
    if (resealed === FULL) {
      res.status(413).json(JOURNAL_FULL);
      return;
    }
    res.json({ resealed });
  } catch (err) {
    console.error('Reseal entries error:', err);
    res.status(500).json({ error: 'Failed to re-save entries' });
  }
});

// The schema only admits encrypted posts — the server never stores plaintext
type CreatePostBody = NonNullable<ReturnType<typeof createPostSchema.safeParse>['data']>;

function toCreateInput(data: CreatePostBody): CreatePostInput {
  const { taxonomyIds: _ignored, createdAt, id, format: _v3, ...postData } = data;
  return {
    id,
    contentEncrypted: Buffer.from(postData.contentEncrypted, 'base64'),
    contentIv: Buffer.from(postData.contentIv, 'base64'),
    metadataEncrypted: Buffer.from(postData.metadataEncrypted, 'base64'),
    metadataIv: Buffer.from(postData.metadataIv, 'base64'),
    ...(createdAt && { createdAt: new Date(createdAt) }),
  };
}

// POST /api/entries — Create entry (under a reserved id)
router.post('/', async (req, res) => {
  try {
    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const input = toCreateInput(parsed.data);
    const size = input.contentEncrypted.length + input.metadataEncrypted.length + ROW_OVERHEAD_BYTES;
    const schema = req.auth!.tenantSchemaName;
    const post = await withTenantLock(schema, async (tx) => {
      if (await postStorageBytes(schema, [], tx) + size > ENTRY_STORAGE_LIMIT_BYTES) return FULL;
      return createPost(schema, input, tx);
    });
    if (post === FULL) {
      res.status(413).json(JOURNAL_FULL);
      return;
    }
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

// POST /api/entries/batch — Create up to 100 entries (imports), all or none
router.post('/batch', async (req, res) => {
  try {
    const parsed = createPostsBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const inputs = parsed.data.entries.map(toCreateInput);
    if (new Set(inputs.map(e => e.id)).size !== inputs.length) {
      res.status(400).json({ error: 'Each entry once' });
      return;
    }

    const size = inputs.reduce((n, e) => n + e.contentEncrypted.length + e.metadataEncrypted.length + ROW_OVERHEAD_BYTES, 0);
    const schema = req.auth!.tenantSchemaName;
    const posts = await withTenantLock(schema, async (tx) => {
      if (await postStorageBytes(schema, [], tx) + size > ENTRY_STORAGE_LIMIT_BYTES) return FULL;
      return createPosts(schema, inputs, tx);
    });
    if (posts === FULL) {
      res.status(413).json(JOURNAL_FULL);
      return;
    }
    if (!posts) {
      res.status(409).json({ error: 'An entry id was not reserved or is taken' });
      return;
    }

    res.status(201).json(posts.map(p => serializePost(p as unknown as Record<string, unknown>)));
  } catch (err) {
    console.error('Create entries error:', err);
    res.status(500).json({ error: 'Failed to create entries' });
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

    const schema = req.auth!.tenantSchemaName;
    const post = await withTenantLock(schema, async (tx) => {
      if (input.contentEncrypted && input.metadataEncrypted) {
        const size = input.contentEncrypted.length + input.metadataEncrypted.length + ROW_OVERHEAD_BYTES;
        if (await postStorageBytes(schema, id, tx) + size > ENTRY_STORAGE_LIMIT_BYTES) return FULL;
      }
      return updatePost(schema, id, input, tx);
    });
    if (post === FULL) {
      res.status(413).json(JOURNAL_FULL);
      return;
    }
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
    // Public links hold the entry as plaintext — they go first, so a failure
    // leaves the entry (and the client retries) rather than a live link to
    // an entry that's gone
    await deleteSharesForEntry(req.auth!.accountId, id);
    await deletePost(req.auth!.tenantSchemaName, id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete entry error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;
