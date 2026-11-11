import crypto from 'crypto';
import { prisma } from './prisma.js';
import { PUBLIC_SHELF_PAGE_SIZE, type PublicShelfItem } from '@chronicles/shared';

/*
 * The public shelf: one row per account holding, as PLAINTEXT by the user's
 * choice (like a share link), the media items they bookmarked for a public
 * page — title, maker, year, type, rating, the Shelf status and a small JPEG
 * cover. Reached by a random token; nothing else of the journal is involved.
 * The page is read a slice at a time (`getPublicShelfPage`), never the whole
 * array. Turning the shelf off deletes the row; deleting the account cascades.
 */

export interface OwnedPublicShelf {
  token: string;
  title: string;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicShelfPage {
  title: string;
  items: PublicShelfItem[];
  page: number;
  pages: number;
  total: number;
  updatedAt: Date;
}

export async function initPublicShelvesTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.public_shelves (
      account_id  INT PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
      token       VARCHAR(64) UNIQUE NOT NULL,
      title       VARCHAR(200) NOT NULL DEFAULT 'My shelf',
      items       JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

const newToken = () => crypto.randomBytes(24).toString('base64url');

export const PUBLIC_SHELF_SORTS = ['newest', 'rating', 'title', 'type'] as const;
export type PublicShelfSort = typeof PUBLIC_SHELF_SORTS[number];

/** What a visitor may narrow a shelf page by — every value whitelisted by the route */
export interface PublicShelfQuery {
  type?: 'book' | 'movie' | 'tv' | 'music' | null;
  shelf?: 'current' | 'want' | 'done' | 'paused' | 'dnf' | null;
  minRating?: number | null;
  /** Every word must appear in the title, maker or year */
  q?: string | null;
  sort?: PublicShelfSort | null;
}

/**
 * The page a visitor asked for (1-based, clamped to what exists), narrowed
 * and ordered in SQL — the list is unnested with jsonb_array_elements, the
 * filters are WHERE clauses with bound values, the sort a CASE on the chosen
 * key, and only one page of elements comes back. Null when there's no shelf.
 */
export async function getPublicShelfPage(token: string, page: number, query: PublicShelfQuery = {}, pageSize = PUBLIC_SHELF_PAGE_SIZE): Promise<PublicShelfPage | null> {
  const size = Math.max(1, Math.floor(pageSize));
  const wanted = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const type = query.type ?? null;
  const shelf = query.shelf ?? null;
  const minRating = query.minRating && query.minRating > 0 ? query.minRating : null;
  // Each word of the search on its own, so "joni 1971" needs both somewhere in title · maker · year
  const words = (query.q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const pattern = words.length ? words.map(w => `%${w.replace(/[\\%_]/g, c => `\\${c}`)}%`) : null;
  const sort: PublicShelfSort = query.sort && (PUBLIC_SHELF_SORTS as readonly string[]).includes(query.sort) ? query.sort : 'newest';

  // Clamp against the real (filtered) count first, so a huge page number never asks for an empty slice
  const heads = await prisma.$queryRaw<{ title: string; total: number | bigint; updatedAt: Date }[]>`
    SELECT s.title, s.updated_at AS "updatedAt",
      (SELECT count(*) FROM jsonb_array_elements(s.items) AS t(elem)
        WHERE (${type}::text IS NULL OR t.elem->>'type' = ${type}::text)
          AND (${shelf}::text IS NULL OR t.elem->>'shelf' = ${shelf}::text)
          AND (${minRating}::numeric IS NULL OR (t.elem->>'rating')::numeric >= ${minRating}::numeric)
          AND (${pattern}::text[] IS NULL OR lower(concat_ws(' ', t.elem->>'title', t.elem->>'creator', t.elem->>'year')) LIKE ALL(${pattern}::text[]))
      ) AS total
    FROM public.public_shelves s WHERE s.token = ${token}
  `;
  const head = heads[0];
  if (!head) return null;
  const total = Number(head.total);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(wanted, pages);
  const offset = (current - 1) * size;
  const rows = total > 0
    ? await prisma.$queryRaw<{ elem: PublicShelfItem }[]>`
        SELECT t.elem
        FROM public.public_shelves s, jsonb_array_elements(s.items) WITH ORDINALITY AS t(elem, ord)
        WHERE s.token = ${token}
          AND (${type}::text IS NULL OR t.elem->>'type' = ${type}::text)
          AND (${shelf}::text IS NULL OR t.elem->>'shelf' = ${shelf}::text)
          AND (${minRating}::numeric IS NULL OR (t.elem->>'rating')::numeric >= ${minRating}::numeric)
          AND (${pattern}::text[] IS NULL OR lower(concat_ws(' ', t.elem->>'title', t.elem->>'creator', t.elem->>'year')) LIKE ALL(${pattern}::text[]))
        ORDER BY
          CASE WHEN ${sort}::text = 'rating' THEN (t.elem->>'rating')::numeric END DESC NULLS LAST,
          CASE WHEN ${sort}::text = 'title' THEN lower(t.elem->>'title') END ASC NULLS LAST,
          CASE WHEN ${sort}::text = 'type' THEN CASE t.elem->>'type' WHEN 'book' THEN 0 WHEN 'movie' THEN 1 WHEN 'tv' THEN 2 ELSE 3 END END ASC NULLS LAST,
          CASE WHEN ${sort}::text = 'type' THEN lower(t.elem->>'title') END ASC NULLS LAST,
          t.ord ASC
        OFFSET ${offset} LIMIT ${size}
      `
    : [];
  return { title: head.title, items: rows.map(r => r.elem), page: current, pages, total, updatedAt: head.updatedAt };
}

/** The owner's view of their shelf — never the items themselves */
export async function getPublicShelfByAccount(accountId: number): Promise<OwnedPublicShelf | null> {
  const rows = await prisma.$queryRaw<(Omit<OwnedPublicShelf, 'itemCount'> & { itemCount: number | bigint })[]>`
    SELECT token, title, jsonb_array_length(items) AS "itemCount", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM public.public_shelves WHERE account_id = ${accountId}
  `;
  const row = rows[0];
  return row ? { ...row, itemCount: Number(row.itemCount) } : null;
}

/** Create the shelf (minting its token) or replace its title and items; the token is kept on an update */
export async function upsertPublicShelf(accountId: number, data: { title: string; items: PublicShelfItem[] }): Promise<OwnedPublicShelf> {
  const rows = await prisma.$queryRaw<(Omit<OwnedPublicShelf, 'itemCount'> & { itemCount: number | bigint })[]>`
    INSERT INTO public.public_shelves (account_id, token, title, items)
    VALUES (${accountId}, ${newToken()}, ${data.title}, ${JSON.stringify(data.items)}::jsonb)
    ON CONFLICT (account_id) DO UPDATE
      SET title = EXCLUDED.title, items = EXCLUDED.items, updated_at = NOW()
    RETURNING token, title, jsonb_array_length(items) AS "itemCount", created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  const row = rows[0];
  return { ...row, itemCount: Number(row.itemCount) };
}

/** A fresh token: the old link stops working */
export async function resetPublicShelfToken(accountId: number): Promise<OwnedPublicShelf | null> {
  const rows = await prisma.$queryRaw<(Omit<OwnedPublicShelf, 'itemCount'> & { itemCount: number | bigint })[]>`
    UPDATE public.public_shelves SET token = ${newToken()}, updated_at = NOW()
    WHERE account_id = ${accountId}
    RETURNING token, title, jsonb_array_length(items) AS "itemCount", created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  const row = rows[0];
  return row ? { ...row, itemCount: Number(row.itemCount) } : null;
}

/** Turn the shelf off: a hard delete, so nothing readable stays behind */
export async function deletePublicShelf(accountId: number): Promise<boolean> {
  const n = await prisma.$executeRaw`DELETE FROM public.public_shelves WHERE account_id = ${accountId}`;
  return n > 0;
}
