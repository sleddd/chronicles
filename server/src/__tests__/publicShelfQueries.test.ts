/**
 * publicShelfQueries — mocks prisma to check the SQL and parameters: the
 * public page is read a slice at a time, the owner never gets the items back,
 * the token is minted on insert and kept on update, Turn off is a hard delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQueryRaw, mockExecuteRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockExecuteRaw: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: { $queryRaw: mockQueryRaw, $executeRaw: mockExecuteRaw },
}));

import {
  initPublicShelvesTable, getPublicShelfPage, getPublicShelfByAccount, upsertPublicShelf, resetPublicShelfToken, deletePublicShelf,
} from '../db/publicShelfQueries.js';

/** The strings and values a tagged-template call carried */
const callOf = (n: number) => {
  const [strings, ...values] = mockQueryRaw.mock.calls[n] as [TemplateStringsArray, ...unknown[]];
  return { sql: strings.join('?'), values };
};

beforeEach(() => { vi.clearAllMocks(); });

describe('initPublicShelvesTable', () => {
  it('creates the table with the account as its key and a cascade', async () => {
    mockExecuteRaw.mockResolvedValue(0);
    await initPublicShelvesTable();
    const sql = (mockExecuteRaw.mock.calls[0][0] as TemplateStringsArray).join('');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.public_shelves');
    expect(sql).toContain('account_id  INT PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE');
    expect(sql).toContain('token       VARCHAR(64) UNIQUE NOT NULL');
    expect(sql).toContain('items       JSONB NOT NULL');
  });
});

describe('getPublicShelfPage', () => {
  const head = { title: 'My shelf', total: 30, updatedAt: new Date('2026-11-10T10:00:00Z') };

  it('reads the count first, then only the slice for the page', async () => {
    mockQueryRaw.mockResolvedValueOnce([head]).mockResolvedValueOnce([{ items: [{ title: 'A' }] }]);
    const page = await getPublicShelfPage('tok', 1);
    expect(page).toEqual({ title: 'My shelf', items: [{ title: 'A' }], page: 1, pages: 2, total: 30, updatedAt: head.updatedAt });
    expect(callOf(0).sql).toContain('jsonb_array_length(items) AS total');
    expect(callOf(0).values).toEqual(['tok']);
    expect(callOf(1).sql).toContain('jsonb_path_query_array(items,');
    expect(callOf(1).values).toEqual(['$[0 to 23]', 'tok']);
  });

  it('slices the third page and clamps a page past the end to the last one', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ ...head, total: 60 }]).mockResolvedValueOnce([{ items: [] }]);
    await getPublicShelfPage('tok', 3);
    expect(callOf(1).values[0]).toBe('$[48 to 71]');

    mockQueryRaw.mockReset();
    mockQueryRaw.mockResolvedValueOnce([head]).mockResolvedValueOnce([{ items: [] }]);
    const last = await getPublicShelfPage('tok', 99);
    expect(last?.page).toBe(2);
    expect(callOf(1).values[0]).toBe('$[24 to 47]');
  });

  it('treats a bad page as the first and an empty shelf as one empty page', async () => {
    mockQueryRaw.mockResolvedValueOnce([head]).mockResolvedValueOnce([{ items: [] }]);
    const first = await getPublicShelfPage('tok', Number.NaN);
    expect(first?.page).toBe(1);

    mockQueryRaw.mockReset();
    mockQueryRaw.mockResolvedValueOnce([{ ...head, total: 0 }]);
    const empty = await getPublicShelfPage('tok', 1);
    expect(empty).toEqual({ title: 'My shelf', items: [], page: 1, pages: 1, total: 0, updatedAt: head.updatedAt });
    expect(mockQueryRaw).toHaveBeenCalledTimes(1); // no slice query for nothing
  });

  it('returns null when there is no such token', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    expect(await getPublicShelfPage('nope', 1)).toBeNull();
  });
});

describe('getPublicShelfByAccount', () => {
  it('returns the owner summary with a numeric count and never selects the items', async () => {
    mockQueryRaw.mockResolvedValue([{ token: 't', title: 'Mine', itemCount: 4n, createdAt: new Date(), updatedAt: new Date() }]);
    const shelf = await getPublicShelfByAccount(42);
    expect(shelf?.itemCount).toBe(4);
    const { sql, values } = callOf(0);
    expect(sql).toContain('jsonb_array_length(items) AS "itemCount"');
    expect(sql).toContain('SELECT token, title, jsonb_array_length(items) AS "itemCount", created_at AS "createdAt", updated_at AS "updatedAt"');
    expect(values).toEqual([42]);
  });

  it('returns null when the account has no shelf', async () => {
    mockQueryRaw.mockResolvedValue([]);
    expect(await getPublicShelfByAccount(42)).toBeNull();
  });
});

describe('upsertPublicShelf', () => {
  it('inserts with a fresh base64url token and keeps it on conflict', async () => {
    mockQueryRaw.mockResolvedValue([{ token: 'kept', title: 'Mine', itemCount: 1, createdAt: new Date(), updatedAt: new Date() }]);
    const items = [{ title: 'Dune', creator: '', year: '', type: 'book' as const, rating: 4, shelf: 'done' as const }];
    const out = await upsertPublicShelf(42, { title: 'Mine', items });
    expect(out.token).toBe('kept');
    const { sql, values } = callOf(0);
    expect(sql).toContain('INSERT INTO public.public_shelves (account_id, token, title, items)');
    expect(sql).toContain('ON CONFLICT (account_id) DO UPDATE');
    expect(sql).toContain('SET title = EXCLUDED.title, items = EXCLUDED.items, updated_at = NOW()');
    expect(sql).not.toContain('token = EXCLUDED.token');
    expect(values[0]).toBe(42);
    expect(values[1]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(values[2]).toBe('Mine');
    expect(values[3]).toBe(JSON.stringify(items));
  });
});

describe('resetPublicShelfToken', () => {
  it('writes a new token for the account and returns the summary, or null with no shelf', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ token: 'new', title: 'Mine', itemCount: 0, createdAt: new Date(), updatedAt: new Date() }]);
    const out = await resetPublicShelfToken(42);
    expect(out?.token).toBe('new');
    const { sql, values } = callOf(0);
    expect(sql).toContain('UPDATE public.public_shelves SET token =');
    expect(values[0]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(values[1]).toBe(42);

    mockQueryRaw.mockResolvedValueOnce([]);
    expect(await resetPublicShelfToken(42)).toBeNull();
  });
});

describe('deletePublicShelf', () => {
  it('hard-deletes the account’s row', async () => {
    mockExecuteRaw.mockResolvedValue(1);
    expect(await deletePublicShelf(42)).toBe(true);
    const [strings, ...values] = mockExecuteRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('?')).toContain('DELETE FROM public.public_shelves WHERE account_id = ?');
    expect(values).toEqual([42]);
    mockExecuteRaw.mockResolvedValue(0);
    expect(await deletePublicShelf(42)).toBe(false);
  });
});
