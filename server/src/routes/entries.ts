import { Router } from 'express';
import { readGate } from '../middleware/readGate.js';
import crypto from 'crypto';
import {
  createPost, createPostCapped, updatePostCapped, createPosts, getPost, getPostPage, updatePost, deletePost, postExists,
  postStorageBytes, reservePostIds, resealPosts, withTenantLock, type CreatePostInput, type CappedWrite,
  // Entry sync
  ensurePostSync, ensurePostReservations, getSyncCursor, getPostChanges, getPostFingerprint, getPostUpdatedAt,
  // Hidden from AI, and the Chronicles AI app
  getAiHiddenIds, setAiHidden, pruneAiHidden, getAiVisibleIds, isAiHidden, assistantMayUndo, assistantOwnsVisible,
} from '../db/tenantQueries.js';
import { ENTRY_STORAGE_LIMIT_BYTES, ROW_OVERHEAD_BYTES } from '../utils/storageLimits.js';
import { createPostSchema, createPostsBatchSchema, updatePostSchema, reservePostIdsSchema, resealPostsSchema, aiHiddenSchema } from '@chronicles/shared';
import { parseId } from '../middleware/parseId.js';
import { deleteSharesForEntry } from '../db/shareQueries.js';
import { assistantWrite, assistantCreatePost, assistantMark, forgetAssistantChangesFor, expireAssistantChanges, AssistantHistoryFull, ASSISTANT_HISTORY_FULL } from '../db/assistantHistory.js';

const router = Router();

// Every write is change-tracked for the browser's sync (a trigger per schema,
// added on first use for older accounts) — in place before any route runs
router.use(async (req, res, next) => {
  try {
    await ensurePostSync(req.auth!.tenantSchemaName);
    // Ids handed out for new entries are recorded and used up on create
    await ensurePostReservations(req.auth!.tenantSchemaName);
    next();
  } catch (err) {
    console.error('Entry sync setup error:', err instanceof Error ? err.message : 'Unknown error');
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
// this process: each holds up to a page in memory until it has been sent
const listGate = readGate('entries', 3);

// GET /api/entries — Get all entries, a page at a time (newest first), each
// page capped by count and by bytes. `?v=2` answers { entries, more } and the
// client pages while `more`; without it (older clients) the bare array, which
// those page through until a short page comes back. The offset is uncapped so
// a journal can hold more than one page.
router.get('/', listGate, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5000, 1), 10000);
    // Bounded: a number past int4 fails the query's cast
    const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 2_000_000_000);
    // The Chronicles AI app never receives entries hidden from AI
    const page = await getPostPage(req.auth!.tenantSchemaName, { limit, offset, maxBytes: ENTRY_PAGE_BYTES, excludeAiHidden: !!req.auth!.assistant });
    const entries = page.posts.map(p => serializePost(p as unknown as Record<string, unknown>));
    res.json(req.query.v === '2' ? { entries, more: page.more } : entries);
  } catch (err) {
    console.error('Get entries error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// GET /api/entries/cursor — Where a full load starts: take it before reading
// every page, then ask /changes from it next time
router.get('/cursor', async (req, res) => {
  try {
    res.json({ cursor: await getSyncCursor(req.auth!.tenantSchemaName), scope: syncScope(req.auth!.tenantSchemaName) });
  } catch (err) {
    console.error('Entry cursor error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// GET /api/entries/fingerprint — How many entries there are and the sum of
// their ids. A browser whose copy is a week old compares its own with this and,
// when they agree, keeps the copy instead of downloading the journal again
router.get('/fingerprint', async (req, res) => {
  try {
    res.json(await getPostFingerprint(req.auth!.tenantSchemaName));
  } catch (err) {
    console.error('Entry fingerprint error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// GET /api/entries/changes?since=<cursor> — Entries written and ids deleted
// since the cursor, and the next cursor. { reset: true } means load everything
router.get('/changes', listGate, async (req, res) => {
  try {
    const since = String(req.query.since ?? '');
    if (!/^\d{1,20}$/.test(since) || BigInt(since) > MAX_XID8) {
      res.status(400).json({ error: 'Invalid cursor' });
      return;
    }
    const changes = await getPostChanges(req.auth!.tenantSchemaName, since, 5000, ENTRY_PAGE_BYTES, { excludeAiHidden: !!req.auth!.assistant });
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
    console.error('Entry changes error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// GET /api/entries/visible-ids — Every entry id the AI app may see, so it can
// drop entries that were hidden from AI (or deleted) since it last looked.
// Ids only, nothing else.
router.get('/visible-ids', listGate, async (req, res) => {
  try {
    res.json({ ids: await getAiVisibleIds(req.auth!.tenantSchemaName) });
  } catch (err) {
    console.error('Visible ids error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// GET /api/entries/updated-at?ids=1,2,3 — When each of these entries was last
// saved (up to 100), so a browser can check a few against its own copy without
// downloading them. Not for the AI app.
router.get('/updated-at', async (req, res) => {
  try {
    const raw = typeof req.query.ids === 'string' && req.query.ids.length <= 1200 ? req.query.ids.split(',') : [];
    const ids = raw.map(v => parseId(v));
    if (ids.length === 0 || ids.length > 100 || ids.some(Number.isNaN)) {
      res.status(400).json({ error: 'Invalid ids' });
      return;
    }
    res.json({ entries: await getPostUpdatedAt(req.auth!.tenantSchemaName, ids) });
  } catch (err) {
    console.error('Entry times error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// GET /api/entries/ai-hidden — The entries hidden from AI (the browser keeps
// this list in step with each entry's switch and the hidden topics: both are
// encrypted, so the server can only enforce what it is told). Not for the AI app.
router.get('/ai-hidden', listGate, async (req, res) => {
  try {
    // Rows for entries that are gone are dropped here (once a load), not on every save
    await pruneAiHidden(req.auth!.tenantSchemaName);
    // So are versions kept of the AI app's changes whose days have run out
    await expireAssistantChanges(req.auth!.tenantSchemaName);
    res.json({ ids: await getAiHiddenIds(req.auth!.tenantSchemaName) });
  } catch (err) {
    console.error('AI hidden list error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

// PUT /api/entries/ai-hidden — Hide entries from AI, or share them again
router.put('/ai-hidden', async (req, res) => {
  try {
    const parsed = aiHiddenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    await setAiHidden(req.auth!.tenantSchemaName, parsed.data.ids, parsed.data.hidden);
    res.json({ success: true });
  } catch (err) {
    console.error('AI hidden update error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to update entries' });
  }
});

// POST /api/entries/ids — Reserve ids for new entries (each entry's ciphertext
// is bound to its id, so the client needs the id before encrypting)
router.post('/ids', async (req, res) => {
  try {
    const parsed = reservePostIdsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    res.json({ ids: await reservePostIds(req.auth!.tenantSchemaName, parsed.data.count) });
  } catch (err) {
    console.error('Reserve entry ids error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to reserve entry ids' });
  }
});

// PUT /api/entries/reseal — Re-save older entries in the id-bound format
// (content unchanged, so updated_at stays)
router.put('/reseal', async (req, res) => {
  try {
    const parsed = resealPostsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
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
    console.error('Reseal entries error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to re-save entries' });
  }
});

const NOT_FOR_BROWSER = { error: 'assistantOwned is only for the Chronicles AI app' };

// The schema only admits encrypted posts — the server never stores plaintext
type CreatePostBody = NonNullable<ReturnType<typeof createPostSchema.safeParse>['data']>;

function toCreateInput(data: CreatePostBody): CreatePostInput {
  const { taxonomyIds: _ignored, createdAt, id, format: _v3, assistantOwned: _owned, ...postData } = data;
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
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    // Only the AI app's own data is owned by it: a browser sending the flag is refused, not ignored
    if (parsed.data.assistantOwned !== undefined && !req.auth!.assistant) {
      res.status(400).json(NOT_FOR_BROWSER);
      return;
    }

    const input = toCreateInput(parsed.data);
    const size = input.contentEncrypted.length + input.metadataEncrypted.length + ROW_OVERHEAD_BYTES;
    const schema = req.auth!.tenantSchemaName;
    const post = req.auth!.assistant
      // The AI app: its day's budget (it can't delete entries later), the cap,
      // the create, what lets it undo this entry and, for its own data
      // (assistantOwned), what lets it edit and delete it later, all under one lock
      ? await assistantCreatePost(schema, input, size, ENTRY_STORAGE_LIMIT_BYTES, { owned: parsed.data.assistantOwned === true })
      // Lock, cap check and insert in one trip to the database
      : await createPostCapped(schema, input, size, ENTRY_STORAGE_LIMIT_BYTES);
    if (post === 'limit') {
      res.status(429).json({ error: 'The Chronicles AI app has added as many entries as it may in a day' });
      return;
    }
    if (post === 'full') {
      res.status(413).json(JOURNAL_FULL);
      return;
    }
    if (!post) {
      res.status(409).json({ error: 'That entry id was not reserved or is taken' });
      return;
    }

    res.status(201).json(serializePost(post as unknown as Record<string, unknown>));
  } catch (err) {
    console.error('Create entry error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

// POST /api/entries/batch — Create up to 100 entries (imports), all or none
router.post('/batch', async (req, res) => {
  try {
    const parsed = createPostsBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    // Imports are the browser's: nothing in them is the AI app's own
    if (parsed.data.entries.some(e => e.assistantOwned !== undefined)) {
      res.status(400).json(NOT_FOR_BROWSER);
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
    console.error('Create entries error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to create entries' });
  }
});

// GET /api/entries/:id — Get single entry (one can be over 2 MB as JSON, so
// only a few at once per account)
router.get('/:id', readGate('entry', 6), async (req, res) => {
  try {
    const id = parseId(String(req.params.id));
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid entry ID' }); return; }
    const post = await getPost(req.auth!.tenantSchemaName, id, { excludeAiHidden: !!req.auth!.assistant });
    if (!post) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json(serializePost(post as unknown as Record<string, unknown>));
  } catch (err) {
    console.error('Get entry error:', err instanceof Error ? err.message : 'Unknown error');
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
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { taxonomyIds: _ignored, format: _v3, ...updates } = parsed.data;
    const input: Partial<Record<'contentEncrypted' | 'contentIv' | 'metadataEncrypted' | 'metadataIv', Buffer>> = {};

    if (updates.contentEncrypted !== undefined) input.contentEncrypted = Buffer.from(updates.contentEncrypted, 'base64');
    if (updates.contentIv !== undefined) input.contentIv = Buffer.from(updates.contentIv, 'base64');
    if (updates.metadataEncrypted !== undefined) input.metadataEncrypted = Buffer.from(updates.metadataEncrypted, 'base64');
    if (updates.metadataIv !== undefined) input.metadataIv = Buffer.from(updates.metadataIv, 'base64');

    const schema = req.auth!.tenantSchemaName;
    // A save of the entry itself carries all four encrypted fields
    const fields = input.contentEncrypted && input.contentIv && input.metadataEncrypted && input.metadataIv
      ? { contentEncrypted: input.contentEncrypted, contentIv: input.contentIv, metadataEncrypted: input.metadataEncrypted, metadataIv: input.metadataIv }
      : null;
    const size = fields ? fields.contentEncrypted.length + fields.metadataEncrypted.length + ROW_OVERHEAD_BYTES : 0;
    let post: CappedWrite | undefined;
    if (req.auth!.assistant) {
      // Any entry it can see (its own data, assistantOwned, included, at any
      // age). The AI app makes only full saves — never a bare updated_at touch
      if (!fields) {
        res.status(400).json({ error: 'A full save is required' });
        return;
      }
      // The version it replaces is kept and the save made under one lock, so
      // what is kept is exactly what was overwritten. A save that is refused
      // keeps nothing, and a full list refuses the save (the catch below)
      post = await assistantWrite<CappedWrite>(schema, 'entry', String(id),
        assistantMark.entry(fields.contentIv, fields.contentEncrypted, fields.metadataIv, fields.metadataEncrypted),
        async (tx) => {
          // Only an entry it can see: a hidden one is "not found" to it. Looked
          // up inside the write, as late as can be (marking an entry hidden
          // doesn't take the account's lock, so the two can still cross: the
          // version written over is kept either way)
          if (await isAiHidden(schema, id, tx)) return null;
          if (await postStorageBytes(schema, id, tx) + size > ENTRY_STORAGE_LIMIT_BYTES) return 'full';
          return (await updatePost(schema, id, fields, tx)) ?? null;
        },
        saved => saved !== null && saved !== 'full');
      // No room, or no such entry (the rare path pays for the second look)
      if (post === 'full' && !(await postExists(schema, id))) post = null;
    } else {
      // A save of the entry itself (the usual case): lock, cap check and write
      // in one trip. A body with no encrypted fields only touches updated_at
      post = fields
        ? await updatePostCapped(schema, id, fields, size, ENTRY_STORAGE_LIMIT_BYTES)
        : await withTenantLock(schema, tx => updatePost(schema, id, input, tx));
    }
    if (post === 'full') {
      res.status(413).json(JOURNAL_FULL);
      return;
    }
    if (!post) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json(serializePost(post as unknown as Record<string, unknown>));
  } catch (err) {
    if (err instanceof AssistantHistoryFull) { res.status(429).json(ASSISTANT_HISTORY_FULL); return; }
    console.error('Update entry error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// DELETE /api/entries/:id — Delete entry
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: 'Invalid entry ID' }); return; }
    // The AI app never removes anything — except undoing an entry it created
    // itself, within the undo window, and its own data (assistantOwned) at any
    // age while it can see it
    if (req.auth!.assistant && !(await assistantMayUndo(req.auth!.tenantSchemaName, id))
        && !(await assistantOwnsVisible(req.auth!.tenantSchemaName, id))) {
      res.status(403).json({ error: 'The Chronicles AI app can only undo what it just created, or remove its own data' });
      return;
    }
    // Public links hold the entry as plaintext — they go first, so a failure
    // leaves the entry (and the client retries) rather than a live link to
    // an entry that's gone
    await deleteSharesForEntry(req.auth!.accountId, id);
    // So do earlier versions kept from the AI app's changes: nothing of a deleted entry stays
    await forgetAssistantChangesFor(req.auth!.tenantSchemaName, 'entry', String(id));
    await deletePost(req.auth!.tenantSchemaName, id);
    // Again: a link made between the two steps above would outlive the entry
    await deleteSharesForEntry(req.auth!.accountId, id);
    // And a version kept by a write of the AI app that landed between them
    await forgetAssistantChangesFor(req.auth!.tenantSchemaName, 'entry', String(id));
    res.json({ success: true });
  } catch (err) {
    console.error('Delete entry error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;
