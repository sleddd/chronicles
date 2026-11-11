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

/** The page a visitor asked for (1-based, clamped to what exists), or null when there's no such shelf */
export async function getPublicShelfPage(token: string, page: number, pageSize = PUBLIC_SHELF_PAGE_SIZE): Promise<PublicShelfPage | null> {
  const size = Math.max(1, Math.floor(pageSize));
  const wanted = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  // Clamp against the real count first, so a huge page number never asks for an empty slice
  const heads = await prisma.$queryRaw<{ title: string; total: number | bigint; updatedAt: Date }[]>`
    SELECT title, jsonb_array_length(items) AS total, updated_at AS "updatedAt"
    FROM public.public_shelves WHERE token = ${token}
  `;
  const head = heads[0];
  if (!head) return null;
  const total = Number(head.total);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(wanted, pages);
  const start = (current - 1) * size;
  const end = start + size - 1;
  // Only the slice leaves the database: jsonb_path_query_array keeps the rest of the array there
  const rows = total > 0
    ? await prisma.$queryRaw<{ items: PublicShelfItem[] }[]>`
        SELECT jsonb_path_query_array(items, ${`$[${start} to ${end}]`}::jsonpath) AS items
        FROM public.public_shelves WHERE token = ${token}
      `
    : [];
  const items = rows[0]?.items ?? [];
  return { title: head.title, items: Array.isArray(items) ? items : [], page: current, pages, total, updatedAt: head.updatedAt };
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
