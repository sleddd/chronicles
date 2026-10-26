import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

// Mock tenantQueries
vi.mock('../../db/tenantQueries.js', () => ({
  getPostPage: vi.fn(),
  getPost: vi.fn(),
  createPost: vi.fn(),
  createPosts: vi.fn(),
  ensurePostSync: vi.fn().mockResolvedValue(undefined),
  getSyncCursor: vi.fn(),
  getPostChanges: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  setPostTaxonomies: vi.fn(),
  getPostTaxonomies: vi.fn(),
  getAllTaxonomies: vi.fn(),
  postStorageBytes: vi.fn().mockResolvedValue(0),
  reservePostIds: vi.fn(),
  resealPosts: vi.fn(),
  // The lock's transaction client, handed to every query under it
  withTenantLock: vi.fn((_schema: string, fn: (tx: unknown) => unknown) => fn('TX')),
}));

vi.mock('../../db/shareQueries.js', () => ({ deleteSharesForEntry: vi.fn().mockResolvedValue(0) }));

// Mock parseId (use real implementation)
vi.mock('../../middleware/parseId.js', async () => {
  return {
    parseId: (value: string) => {
      const id = Number(value);
      if (!Number.isInteger(id) || id < 1) return NaN;
      return id;
    },
  };
});

import entriesRouter from '../../routes/entries.js';
import { getPostPage, getPost, createPost, createPosts, ensurePostSync, getSyncCursor, getPostChanges, updatePost, deletePost, setPostTaxonomies, getPostTaxonomies, getAllTaxonomies, postStorageBytes, reservePostIds, resealPosts, withTenantLock } from '../../db/tenantQueries.js';
import { ENTRY_STORAGE_LIMIT_BYTES } from '../../utils/storageLimits.js';
import { deleteSharesForEntry } from '../../db/shareQueries.js';

const app = createTestApp('/api/entries', entriesRouter);

const mockPost = {
  id: 1,
  content: null,
  metadata: null,
  contentEncrypted: Buffer.from('encrypted'),
  contentIv: Buffer.from('iv12345678ab'),
  metadataEncrypted: Buffer.from('metaenc'),
  metadataIv: Buffer.from('metaiv123456'),
  isEncrypted: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('Entry Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /api/entries
  // =========================================================================
  describe('GET /api/entries', () => {
    it('returns a list of entries with serialized buffers', async () => {
      (getPostPage as any).mockResolvedValue({ posts: [mockPost], more: false });

      const res = await request(app).get('/api/entries');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].contentEncrypted).toBe(Buffer.from('encrypted').toString('base64'));
      expect(res.body[0].contentIv).toBe(Buffer.from('iv12345678ab').toString('base64'));
      // Default is large on purpose — the client keeps every entry in its store;
      // each page is also capped by bytes
      expect(getPostPage).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, { limit: 5000, offset: 0, maxBytes: 16 * 1024 * 1024 });
    });

    it('answers { entries, more } to ?v=2', async () => {
      (getPostPage as any).mockResolvedValue({ posts: [mockPost], more: true });

      const res = await request(app).get('/api/entries?v=2');

      expect(res.body.more).toBe(true);
      expect(res.body.entries).toHaveLength(1);
    });

    it('respects limit and offset query params', async () => {
      (getPostPage as any).mockResolvedValue({ posts: [], more: false });

      await request(app).get('/api/entries?limit=50&offset=10');

      expect(getPostPage).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.objectContaining({ limit: 50, offset: 10 }));
    });

    it('clamps limit to max 10000', async () => {
      (getPostPage as any).mockResolvedValue({ posts: [], more: false });

      await request(app).get('/api/entries?limit=999999');

      expect(getPostPage).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.objectContaining({ limit: 10000, offset: 0 }));
    });

    it('allows offsets past 10000 so large journals can page to the end', async () => {
      (getPostPage as any).mockResolvedValue({ posts: [], more: false });

      await request(app).get('/api/entries?limit=5000&offset=15000');

      expect(getPostPage).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.objectContaining({ limit: 5000, offset: 15000 }));
    });

    it('lets one account run only a few list requests at once', async () => {
      let release!: () => void;
      const gate = new Promise<void>(r => { release = r; });
      (getPostPage as any).mockImplementation(async () => { await gate; return { posts: [], more: false }; });

      const running = [1, 2, 3].map(() => request(app).get('/api/entries').then(r => r));
      await new Promise(r => setTimeout(r, 50));
      const extra = await request(app).get('/api/entries');
      expect(extra.status).toBe(429);
      expect(extra.headers['retry-after']).toBe('2');

      release();
      expect((await Promise.all(running)).map(r => r.status)).toEqual([200, 200, 200]);
      expect((await request(app).get('/api/entries')).status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      (getPostPage as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/entries');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch entries');
    });
  });

  // =========================================================================
  // POST /api/entries
  // =========================================================================
  describe('POST /api/entries', () => {
    const ENCRYPTED_BODY = {
      id: 2,
      format: 3,
      isEncrypted: true,
      contentEncrypted: Buffer.from('encrypted').toString('base64'),
      contentIv: Buffer.from('iv12345678ab').toString('base64'),
      metadataEncrypted: Buffer.from('metaenc').toString('base64'),
      metadataIv: Buffer.from('metaiv123456').toString('base64'),
    };

    it('refuses an entry once the account is at its storage cap', async () => {
      (postStorageBytes as any).mockResolvedValueOnce(ENTRY_STORAGE_LIMIT_BYTES - 4);
      const res = await request(app).post('/api/entries').send(ENCRYPTED_BODY);
      expect(res.status).toBe(413);
      expect(createPost).not.toHaveBeenCalled();
    });

    it('checks the cap and writes in one transaction under the account lock', async () => {
      (createPost as any).mockResolvedValue(mockPost);
      await request(app).post('/api/entries').send(ENCRYPTED_BODY);
      expect(withTenantLock).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.any(Function));
      expect(postStorageBytes).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, [], 'TX');
    });

    it('counts an update without the old copy of the same entry, and 404s a missing one', async () => {
      (updatePost as any).mockResolvedValueOnce(undefined);
      const res = await request(app).put('/api/entries/7').send({
        format: 3,
        contentEncrypted: Buffer.from('encrypted').toString('base64'),
        contentIv: Buffer.from('iv12345678ab').toString('base64'),
        metadataEncrypted: Buffer.from('metaenc').toString('base64'),
        metadataIv: Buffer.from('metaiv123456').toString('base64'),
      });
      expect(postStorageBytes).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 7, 'TX');
      expect(res.status).toBe(404);
    });

    it('creates a batch of entries in one request, all or none', async () => {
      (createPosts as any).mockResolvedValueOnce([{ id: 2 }, { id: 3 }]);
      const ok = await request(app).post('/api/entries/batch').send({ entries: [ENCRYPTED_BODY, { ...ENCRYPTED_BODY, id: 3 }] });
      expect(ok.status).toBe(201);
      expect(ok.body).toEqual([{ id: 2 }, { id: 3 }]);
      const inputs = (createPosts as any).mock.calls[0][1];
      expect(inputs.map((e: { id: number }) => e.id)).toEqual([2, 3]);
      expect(Buffer.isBuffer(inputs[0].contentEncrypted)).toBe(true);

      (createPosts as any).mockResolvedValueOnce(null);
      const taken = await request(app).post('/api/entries/batch').send({ entries: [ENCRYPTED_BODY] });
      expect(taken.status).toBe(409);
    });

    it('refuses a batch that repeats an id, is too big, is plaintext or overfills storage', async () => {
      const send = (entries: unknown[]) => request(app).post('/api/entries/batch').send({ entries });
      expect((await send([ENCRYPTED_BODY, ENCRYPTED_BODY])).status).toBe(400);
      expect((await send(Array.from({ length: 101 }, (_, k) => ({ ...ENCRYPTED_BODY, id: k + 1 })))).status).toBe(400);
      expect((await send([{ ...ENCRYPTED_BODY, isEncrypted: false }])).status).toBe(400);
      expect((await send([])).status).toBe(400);
      (postStorageBytes as any).mockResolvedValueOnce(ENTRY_STORAGE_LIMIT_BYTES - 4);
      expect((await send([ENCRYPTED_BODY])).status).toBe(413);
      expect(createPosts).not.toHaveBeenCalled();
    });

    it('reserves ids for new entries', async () => {
      (reservePostIds as any).mockResolvedValue([10, 11]);
      const res = await request(app).post('/api/entries/ids').send({ count: 2 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ids: [10, 11] });
      expect((await request(app).post('/api/entries/ids').send({ count: 500 })).status).toBe(400);
    });

    it('re-seals older entries in batches, each once, within the storage cap', async () => {
      (resealPosts as any).mockResolvedValue(2);
      const row = (id: number) => ({ id, format: 3, updatedAt: '2026-10-01T10:00:00.123Z', contentEncrypted: 'YQ==', contentIv: 'Yg==', metadataEncrypted: 'Yw==', metadataIv: 'ZA==' });
      const ok = await request(app).put('/api/entries/reseal').send({ entries: [row(1), row(2)] });
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ resealed: 2 });
      expect(postStorageBytes).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, [1, 2], 'TX');
      expect((await request(app).put('/api/entries/reseal').send({ entries: [row(1), row(1)] })).status).toBe(400);
      expect((await request(app).put('/api/entries/reseal').send({ entries: Array.from({ length: 101 }, (_, i) => row(i + 1)) })).status).toBe(400);
      (postStorageBytes as any).mockResolvedValueOnce(ENTRY_STORAGE_LIMIT_BYTES);
      expect((await request(app).put('/api/entries/reseal').send({ entries: [row(3)] })).status).toBe(413);
    });

    it('creates an encrypted entry', async () => {
      const newPost = { ...mockPost, id: 2 };
      (createPost as any).mockResolvedValue(newPost);
      (getAllTaxonomies as any).mockResolvedValue([]);

      const res = await request(app)
        .post('/api/entries')
        .send(ENCRYPTED_BODY);

      expect(res.status).toBe(201);
      expect(createPost).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.objectContaining({ id: 2 }), 'TX');
    });

    it('needs the reserved id the entry was encrypted for', async () => {
      const { id: _id, ...noId } = ENCRYPTED_BODY;
      expect((await request(app).post('/api/entries').send(noId)).status).toBe(400);
      expect(createPost).not.toHaveBeenCalled();
    });

    it('refuses an older client (no format 3) instead of saving an entry that would stop opening', async () => {
      const { format: _f, ...old } = ENCRYPTED_BODY;
      const res = await request(app).post('/api/entries').send(old);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Update Chronicles to save entries');
      const upd = await request(app).put('/api/entries/2').send({ contentEncrypted: 'YQ==', contentIv: 'Yg==', metadataEncrypted: 'Yw==', metadataIv: 'ZA==' });
      expect(upd.status).toBe(400);
    });

    it('answers 409 for an id that was never reserved or is taken', async () => {
      (createPost as any).mockResolvedValue(null);
      const res = await request(app).post('/api/entries').send(ENCRYPTED_BODY);
      expect(res.status).toBe(409);
    });

    it('rejects a createdAt that is not a date', async () => {
      const res = await request(app).post('/api/entries').send({ ...ENCRYPTED_BODY, createdAt: 'yesterday' });
      expect(res.status).toBe(400);
    });

    it('rejects a plaintext entry', async () => {
      const res = await request(app)
        .post('/api/entries')
        .send({ content: 'Hello', metadata: { title: 'Test' } });

      expect(res.status).toBe(400);
      expect(createPost).not.toHaveBeenCalled();
    });

    it('rejects isEncrypted: false even with ciphertext fields', async () => {
      const res = await request(app)
        .post('/api/entries')
        .send({ ...ENCRYPTED_BODY, isEncrypted: false });

      expect(res.status).toBe(400);
      expect(createPost).not.toHaveBeenCalled();
    });

    it('accepts but never stores a plaintext topic link', async () => {
      (createPost as any).mockResolvedValue({ ...mockPost, id: 4 });

      const res = await request(app)
        .post('/api/entries')
        .send({ ...ENCRYPTED_BODY, taxonomyIds: [1, 2] });

      expect(res.status).toBe(201);
      expect(setPostTaxonomies).not.toHaveBeenCalled();
      expect(createPost).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, expect.not.objectContaining({ taxonomyIds: expect.anything() }), 'TX');
    });

    it('returns 400 when encrypted post is missing required fields', async () => {
      const res = await request(app)
        .post('/api/entries')
        .send({
          isEncrypted: true,
          contentEncrypted: Buffer.from('x').toString('base64'),
          // missing contentIv, metadataEncrypted, metadataIv
        });

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      (createPost as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/entries')
        .send(ENCRYPTED_BODY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create entry');
    });
  });

  // =========================================================================
  describe('entry sync', () => {
    it('makes sure change tracking is in place before any entries route', async () => {
      (getPostPage as any).mockResolvedValue({ posts: [], more: false });
      await request(app).get('/api/entries');
      expect(ensurePostSync).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName);
    });

    it('gives a cursor and a scope for this account', async () => {
      (getSyncCursor as any).mockResolvedValue('1234');
      const res = await request(app).get('/api/entries/cursor');
      expect(res.status).toBe(200);
      expect(res.body.cursor).toBe('1234');
      expect(res.body.scope).toMatch(/^[a-f0-9]{32}$/);
    });

    it('sends changes since a cursor, entries in wire form', async () => {
      (getPostChanges as any).mockResolvedValue({
        reset: false, cursor: '1300',
        entries: [{ id: 4, contentEncrypted: Buffer.from('c'), contentIv: Buffer.from('i'), metadataEncrypted: Buffer.from('m'), metadataIv: Buffer.from('j') }],
        deleted: [2, 3],
      });
      const res = await request(app).get('/api/entries/changes?since=1234');
      expect(getPostChanges).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, '1234', 5000, 16 * 1024 * 1024);
      expect(res.body).toMatchObject({ reset: false, cursor: '1300', deleted: [2, 3] });
      expect(res.body.entries[0].contentEncrypted).toBe(Buffer.from('c').toString('base64'));
    });

    it('tells the client to reload everything when asked, and refuses a bad cursor', async () => {
      (getPostChanges as any).mockResolvedValue({ reset: true });
      const res = await request(app).get('/api/entries/changes?since=5');
      expect(res.body).toMatchObject({ reset: true });
      expect((await request(app).get('/api/entries/changes?since=abc')).status).toBe(400);
      // Digits, but past xid8's range (2^64 - 1): 400, not a failed cast
      expect((await request(app).get('/api/entries/changes?since=18446744073709551616')).status).toBe(400);
      expect((await request(app).get('/api/entries/changes?since=99999999999999999999')).status).toBe(400);
      (getPostChanges as any).mockResolvedValue({ reset: true });
      expect((await request(app).get('/api/entries/changes?since=18446744073709551615')).status).toBe(200);
      expect((await request(app).get('/api/entries/changes')).status).toBe(400);
    });
  });

  // GET /api/entries/:id
  // =========================================================================
  describe('GET /api/entries/:id', () => {
    it('returns a single entry without any plaintext topic link', async () => {
      (getPost as any).mockResolvedValue(mockPost);

      const res = await request(app).get('/api/entries/1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
      expect(res.body.taxonomies).toBeUndefined();
      expect(getPostTaxonomies).not.toHaveBeenCalled();
    });

    it('returns 404 when entry not found', async () => {
      (getPost as any).mockResolvedValue(null);

      const res = await request(app).get('/api/entries/999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entry not found');
    });

    it('returns 400 for non-numeric ID', async () => {
      const res = await request(app).get('/api/entries/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid entry ID');
    });

    it('returns 400 for negative ID', async () => {
      const res = await request(app).get('/api/entries/-1');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid entry ID');
    });
  });

  // =========================================================================
  // PUT /api/entries/:id
  // =========================================================================
  describe('PUT /api/entries/:id', () => {
    it('updates an entry', async () => {
      const updatedPost = { ...mockPost, content: 'Updated' };
      (updatePost as any).mockResolvedValue(updatedPost);

      const res = await request(app)
        .put('/api/entries/1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(200);
      expect(updatePost).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 1, expect.any(Object), 'TX');
    });

    it('ignores a plaintext topic link on update', async () => {
      (updatePost as any).mockResolvedValue(mockPost);

      await request(app)
        .put('/api/entries/1')
        .send({ content: 'Updated', taxonomyIds: [1] });

      expect(setPostTaxonomies).not.toHaveBeenCalled();
      expect(getAllTaxonomies).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid ID', async () => {
      const res = await request(app)
        .put('/api/entries/abc')
        .send({ content: 'Updated' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid entry ID');
    });

    it('returns 500 on database error', async () => {
      (updatePost as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .put('/api/entries/1')
        .send({ content: 'Updated' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to update entry');
    });
  });

  // =========================================================================
  // DELETE /api/entries/:id
  // =========================================================================
  describe('DELETE /api/entries/:id', () => {
    it('deletes an entry', async () => {
      (deletePost as any).mockResolvedValue(undefined);

      const res = await request(app).delete('/api/entries/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deletePost).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName, 1);
    });

    it("deletes the entry's public share links with it", async () => {
      (deletePost as any).mockResolvedValue(undefined);

      await request(app).delete('/api/entries/7');

      expect(deleteSharesForEntry).toHaveBeenCalledWith(TEST_AUTH.accountId, 7);
    });

    it('returns 400 for invalid ID', async () => {
      const res = await request(app).delete('/api/entries/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid entry ID');
    });

    it('returns 500 on database error', async () => {
      (deletePost as any).mockRejectedValue(new Error('DB error'));

      const res = await request(app).delete('/api/entries/1');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to delete entry');
    });
  });
});
