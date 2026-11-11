import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

vi.mock('../../db/publicShelfQueries.js', () => ({
  PUBLIC_SHELF_SORTS: ['newest', 'rating', 'title', 'type'],
  getPublicShelfPage: vi.fn(),
  getPublicShelfByAccount: vi.fn(),
  upsertPublicShelf: vi.fn(),
  resetPublicShelfToken: vi.fn(),
  deletePublicShelf: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((req: any, _res: any, next: any) => {
    req.auth = { accountId: 1, tenantSchemaName: 'usr_1_a1b2c3', sessionId: 42, selector: 'aabbccddee11' };
    next();
  }),
}));

vi.mock('../../middleware/rateLimiter.js', () => ({
  publicShelfLimiter: (_req: any, _res: any, next: any) => next(),
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  writeGate: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../utils/storageLimits.js', () => ({ PUBLIC_SHELF_STORAGE_LIMIT_BYTES: 2_000 }));

import publicShelfRouter from '../../routes/publicShelf.js';
import {
  getPublicShelfPage, getPublicShelfByAccount, upsertPublicShelf, resetPublicShelfToken, deletePublicShelf,
} from '../../db/publicShelfQueries.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  // Like index.ts: the router is mounted before the global JSON parser; the PUT brings its own
  app.use('/api/public-shelf', publicShelfRouter);
  app.use(express.json({ limit: '1mb' }));
  return app;
}

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const AUTH = { 'X-Requested-With': 'XMLHttpRequest', Cookie: 'chronicle_session=aabbccddee11verifier1234567890123456789012' };
const owned = { token: TOKEN, title: 'My shelf', itemCount: 2, createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-10') };
const item = { title: 'Dune', creator: 'Frank Herbert', year: '1965', type: 'book', rating: 4.5, shelf: 'done' };

describe('Public shelf routes', () => {
  let app: express.Express;
  beforeEach(() => { vi.clearAllMocks(); app = buildApp(); });

  describe('GET /api/public-shelf/:token (public)', () => {
    it('answers one page with only what the page shows, cacheable, with an ETag', async () => {
      vi.mocked(getPublicShelfPage).mockResolvedValue({ title: 'My shelf', items: [item as any], page: 2, pages: 3, total: 60, updatedAt: new Date('2026-11-10T10:00:00Z') });
      const res = await request(app).get(`/api/public-shelf/${TOKEN}?page=2`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['items', 'page', 'pages', 'title', 'total', 'updatedAt']);
      expect(res.body.items).toHaveLength(1);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      expect(res.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/);
      expect(getPublicShelfPage).toHaveBeenCalledWith(TOKEN, 2, { type: null, shelf: null, minRating: null, q: null, sort: null });
    });

    it('passes whitelisted filters, a rounded rating and a trimmed search; junk is dropped', async () => {
      vi.mocked(getPublicShelfPage).mockResolvedValue({ title: 'x', items: [], page: 1, pages: 1, total: 0, updatedAt: new Date() });
      await request(app).get(`/api/public-shelf/${TOKEN}?type=book&shelf=done&rating=4.3&q=%20joni%20&sort=rating`);
      expect(getPublicShelfPage).toHaveBeenLastCalledWith(TOKEN, 1, { type: 'book', shelf: 'done', minRating: 4.5, q: 'joni', sort: 'rating' });
      await request(app).get(`/api/public-shelf/${TOKEN}?type=game&shelf=maybe&rating=9&sort=random&q=${'x'.repeat(300)}`);
      const [, , q] = vi.mocked(getPublicShelfPage).mock.calls.at(-1)!;
      expect(q).toMatchObject({ type: null, shelf: null, minRating: null, sort: null });
      expect(q.q).toHaveLength(100);
    });

    it('keys the ETag on the filters too', async () => {
      vi.mocked(getPublicShelfPage).mockResolvedValue({ title: 'x', items: [], page: 1, pages: 1, total: 0, updatedAt: new Date('2026-11-10T10:00:00Z') });
      const a = await request(app).get(`/api/public-shelf/${TOKEN}`);
      const b = await request(app).get(`/api/public-shelf/${TOKEN}?type=book`);
      expect(a.headers['etag']).not.toBe(b.headers['etag']);
    });

    it('turns a non-numeric page into page 1', async () => {
      vi.mocked(getPublicShelfPage).mockResolvedValue({ title: 'x', items: [], page: 1, pages: 1, total: 0, updatedAt: new Date() });
      await request(app).get(`/api/public-shelf/${TOKEN}?page=abc`);
      expect(vi.mocked(getPublicShelfPage).mock.calls[0].slice(0, 2)).toEqual([TOKEN, 1]);
    });

    it('answers 304 when the browser already holds that page', async () => {
      vi.mocked(getPublicShelfPage).mockResolvedValue({ title: 'x', items: [], page: 1, pages: 1, total: 0, updatedAt: new Date('2026-11-10T10:00:00Z') });
      const first = await request(app).get(`/api/public-shelf/${TOKEN}`);
      const again = await request(app).get(`/api/public-shelf/${TOKEN}`).set('If-None-Match', first.headers['etag']);
      expect(again.status).toBe(304);
    });

    it('404s for an unknown or malformed token without touching the database for a bad one', async () => {
      vi.mocked(getPublicShelfPage).mockResolvedValue(null);
      expect((await request(app).get(`/api/public-shelf/${TOKEN}`)).status).toBe(404);
      const bad = await request(app).get('/api/public-shelf/..%2Fx');
      expect(bad.status).toBe(404);
      expect(getPublicShelfPage).toHaveBeenCalledTimes(1);
    });

    it('500s when the database fails', async () => {
      vi.mocked(getPublicShelfPage).mockRejectedValue(new Error('db'));
      expect((await request(app).get(`/api/public-shelf/${TOKEN}`)).status).toBe(500);
    });
  });

  describe('GET /api/public-shelf (owner)', () => {
    it('returns the owner summary, or null', async () => {
      vi.mocked(getPublicShelfByAccount).mockResolvedValue(owned);
      const res = await request(app).get('/api/public-shelf').set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.publicShelf.token).toBe(TOKEN);
      expect(res.body.publicShelf.items).toBeUndefined();
      expect(res.headers['cache-control']).not.toBe('public, max-age=60');
      vi.mocked(getPublicShelfByAccount).mockResolvedValue(null);
      expect((await request(app).get('/api/public-shelf').set(AUTH)).body).toEqual({ publicShelf: null });
    });
  });

  describe('PUT /api/public-shelf', () => {
    it('saves the title and the stripped items', async () => {
      vi.mocked(upsertPublicShelf).mockResolvedValue(owned);
      const res = await request(app).put('/api/public-shelf').set(AUTH)
        .send({ title: 'Mine', items: [{ ...item, notes: 'secret', progress: 40, id: 9 }] });
      expect(res.status).toBe(200);
      expect(res.body.token).toBe(TOKEN);
      const [accountId, data] = vi.mocked(upsertPublicShelf).mock.calls[0];
      expect(accountId).toBe(1);
      expect(data.title).toBe('Mine');
      expect(Object.keys(data.items[0]).sort()).toEqual(['creator', 'rating', 'shelf', 'title', 'type', 'year']);
    });

    it('400s on a bad body', async () => {
      expect((await request(app).put('/api/public-shelf').set(AUTH).send({ title: 'x', items: [{ ...item, cover: 'data:image/svg+xml;base64,PHN2Zz4=' }] })).status).toBe(400);
      expect((await request(app).put('/api/public-shelf').set(AUTH).send({ title: '', items: [] })).status).toBe(400);
      expect(upsertPublicShelf).not.toHaveBeenCalled();
    });

    it('413s over the storage cap', async () => {
      const big = Array.from({ length: 20 }, (_, i) => ({ ...item, title: `Title number ${i} `.repeat(8) }));
      const res = await request(app).put('/api/public-shelf').set(AUTH).send({ title: 'x', items: big });
      expect(res.status).toBe(413);
      expect(res.body.error).toMatch(/too big/);
      expect(upsertPublicShelf).not.toHaveBeenCalled();
    });
  });

  it('POST /reset returns the new token, 404 with no shelf', async () => {
    vi.mocked(resetPublicShelfToken).mockResolvedValue({ ...owned, token: 'n'.repeat(32) });
    const res = await request(app).post('/api/public-shelf/reset').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('n'.repeat(32));
    vi.mocked(resetPublicShelfToken).mockResolvedValue(null);
    expect((await request(app).post('/api/public-shelf/reset').set(AUTH)).status).toBe(404);
  });

  it('DELETE turns the shelf off and is idempotent', async () => {
    vi.mocked(deletePublicShelf).mockResolvedValue(true);
    expect((await request(app).delete('/api/public-shelf').set(AUTH)).body).toEqual({ success: true });
    vi.mocked(deletePublicShelf).mockResolvedValue(false);
    expect((await request(app).delete('/api/public-shelf').set(AUTH)).status).toBe(200);
    expect(deletePublicShelf).toHaveBeenCalledWith(1);
  });
});
