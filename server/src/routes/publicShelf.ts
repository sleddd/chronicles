import { Router, json as jsonBody } from 'express';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter, publicShelfLimiter, writeGate } from '../middleware/rateLimiter.js';
import {
  getPublicShelfPage, getPublicShelfByAccount, upsertPublicShelf, resetPublicShelfToken, deletePublicShelf,
  PUBLIC_SHELF_SORTS, type OwnedPublicShelf, type PublicShelfQuery,
} from '../db/publicShelfQueries.js';
import { PUBLIC_SHELF_STORAGE_LIMIT_BYTES } from '../utils/storageLimits.js';
import { putPublicShelfSchema } from '@chronicles/shared';

/*
 * The public shelf (see db/publicShelfQueries.ts): the public GET serves one
 * page of items per request, cached for a minute, and the owner routes
 * create, replace, re-key and delete the one shelf an account has. The PUT's
 * body parser is its own (8 MB — up to 1,000 items with small covers) and
 * runs only after the session check, so no one signed out can make the
 * server buffer it.
 */

const router = Router();

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;
const PUT_BODY_LIMIT = '8mb';
const TYPES = ['book', 'movie', 'tv', 'music'] as const;
const SHELVES = ['current', 'want', 'done', 'paused', 'dnf'] as const;
const Q_MAX = 100;

/** The visitor's filters, each value whitelisted; anything else is ignored */
function readQuery(q: Record<string, unknown>): PublicShelfQuery {
  const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '');
  const type = str(q.type); const shelf = str(q.shelf); const sort = str(q.sort);
  const rating = Number.parseFloat(str(q.rating));
  return {
    type: (TYPES as readonly string[]).includes(type) ? type as PublicShelfQuery['type'] : null,
    shelf: (SHELVES as readonly string[]).includes(shelf) ? shelf as PublicShelfQuery['shelf'] : null,
    minRating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? Math.round(rating * 2) / 2 : null,
    q: str(q.q).trim().slice(0, Q_MAX) || null,
    sort: (PUBLIC_SHELF_SORTS as readonly string[]).includes(sort) ? sort as PublicShelfQuery['sort'] : null,
  };
}

// Owner payload — never the items (the owner has them), never the account
function owned(shelf: OwnedPublicShelf) {
  return { token: shelf.token, title: shelf.title, itemCount: shelf.itemCount, createdAt: shelf.createdAt, updatedAt: shelf.updatedAt };
}

// GET /api/public-shelf/:token?page=N — public, one page at a time
router.get('/:token', publicShelfLimiter, async (req, res) => {
  try {
    const token = String(req.params.token);
    if (!TOKEN_SHAPE.test(token)) {
      res.status(404).json({ error: 'Public shelf not found' });
      return;
    }
    const page = Number.parseInt(String(req.query.page ?? '1'), 10);
    const query = readQuery(req.query as Record<string, unknown>);
    const result = await getPublicShelfPage(token, Number.isFinite(page) ? page : 1, query);
    if (!result) {
      res.status(404).json({ error: 'Public shelf not found' });
      return;
    }
    // A link opened by many people: a minute of shared cache and a 304 for a
    // page the browser already holds. Nothing private is in this response.
    const etag = `"${crypto.createHash('sha256').update(`${result.updatedAt.toISOString()}|${result.page}|${result.total}|${JSON.stringify(query)}`).digest('base64url').slice(0, 24)}"`;
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.json({ title: result.title, items: result.items, page: result.page, pages: result.pages, total: result.total, updatedAt: result.updatedAt });
  } catch (err) {
    console.error('Get public shelf error:', err);
    res.status(500).json({ error: 'Failed to fetch the public shelf' });
  }
});

// GET /api/public-shelf — the owner's shelf, if any
router.get('/', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const shelf = await getPublicShelfByAccount(req.auth!.accountId);
    res.json({ publicShelf: shelf ? owned(shelf) : null });
  } catch (err) {
    console.error('Get own public shelf error:', err);
    res.status(500).json({ error: 'Failed to fetch your public shelf' });
  }
});

// PUT /api/public-shelf — create or replace the whole shelf
router.put('/', authMiddleware, apiLimiter, writeGate, jsonBody({ limit: PUT_BODY_LIMIT }), async (req, res) => {
  try {
    const parsed = putPublicShelfSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { title, items } = parsed.data;
    if (JSON.stringify(items).length > PUBLIC_SHELF_STORAGE_LIMIT_BYTES) {
      res.status(413).json({ error: 'Your public shelf is too big — take a few items off it' });
      return;
    }
    const shelf = await upsertPublicShelf(req.auth!.accountId, { title, items });
    res.json(owned(shelf));
  } catch (err) {
    console.error('Put public shelf error:', err);
    res.status(500).json({ error: 'Failed to save your public shelf' });
  }
});

// POST /api/public-shelf/reset — a new link; the old one stops working
router.post('/reset', authMiddleware, apiLimiter, writeGate, async (req, res) => {
  try {
    const shelf = await resetPublicShelfToken(req.auth!.accountId);
    if (!shelf) {
      res.status(404).json({ error: 'You have no public shelf' });
      return;
    }
    res.json(owned(shelf));
  } catch (err) {
    console.error('Reset public shelf error:', err);
    res.status(500).json({ error: 'Failed to reset the link' });
  }
});

// DELETE /api/public-shelf — turn it off (idempotent)
router.delete('/', authMiddleware, apiLimiter, writeGate, async (req, res) => {
  try {
    await deletePublicShelf(req.auth!.accountId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete public shelf error:', err);
    res.status(500).json({ error: 'Failed to turn off your public shelf' });
  }
});

export default router;
