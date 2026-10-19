import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { entries } from '../../services/api.js';
import { clearEntryCache, readCache } from '../../services/entryCache.js';

const SCOPE_A = 'a'.repeat(32);
const SCOPE_B = 'b'.repeat(32);
const row = (id: number, day: number, tag = 'v1') => ({
  id, createdAt: new Date(Date.UTC(2026, 9, day)).toISOString(), contentEncrypted: `c-${id}-${tag}`, contentIv: 'i', metadataEncrypted: 'm', metadataIv: 'j',
});

/** A fake server: one journal per scope, with change responses queued by the test. */
function server(opts: { scope: string; cursor: string; journal: unknown[]; changes?: unknown }) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    calls.push(url.replace('/api', ''));
    let body: unknown;
    if (url.startsWith('/api/entries/cursor')) body = { cursor: opts.cursor, scope: opts.scope };
    else if (url.startsWith('/api/entries/changes')) body = opts.changes;
    else if (url.startsWith('/api/entries?')) body = opts.journal;
    else throw new Error(`unexpected ${url}`);
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchFn);
  return calls;
}

beforeEach(async () => { await clearEntryCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('entries.getAll with the browser cache', () => {
  it('downloads everything the first time and keeps the ciphertext under the account scope', async () => {
    const calls = server({ scope: SCOPE_A, cursor: '100', journal: [row(2, 5), row(1, 4)] });
    const got = await entries.getAll();
    expect(got.map(e => e.id)).toEqual([2, 1]);
    expect(calls).toEqual(['/entries/cursor', '/entries?limit=5000']);
    const cached = await readCache(SCOPE_A);
    expect(cached?.cursor).toBe('100');
    expect(cached?.rows.map(r => r.id).sort()).toEqual([1, 2]);
    expect(cached?.rows[0]).not.toHaveProperty('scope');
  });

  it('then asks only for what changed, and applies updates and deletions in order', async () => {
    server({ scope: SCOPE_A, cursor: '100', journal: [row(3, 6), row(2, 5), row(1, 4)] });
    await entries.getAll();

    const calls = server({
      scope: SCOPE_A, cursor: '150', journal: [],
      changes: { reset: false, scope: SCOPE_A, cursor: '160', entries: [row(2, 5, 'v2'), row(4, 7)], deleted: [1] },
    });
    const got = await entries.getAll();
    expect(calls).toEqual(['/entries/cursor', '/entries/changes?since=100']);
    expect(got.map(e => e.id)).toEqual([4, 3, 2]);
    expect(got.find(e => e.id === 2)?.contentEncrypted).toBe('c-2-v2');
    expect((await readCache(SCOPE_A))?.cursor).toBe('160');

    // The next visit starts from the new cursor
    const next = server({ scope: SCOPE_A, cursor: '170', journal: [], changes: { reset: false, scope: SCOPE_A, cursor: '170', entries: [], deleted: [] } });
    expect((await entries.getAll()).map(e => e.id)).toEqual([4, 3, 2]);
    expect(next).toContain('/entries/changes?since=160');
  });

  it('downloads everything again when the server says reset', async () => {
    server({ scope: SCOPE_A, cursor: '100', journal: [row(1, 4)] });
    await entries.getAll();
    const calls = server({ scope: SCOPE_A, cursor: '500', journal: [row(9, 9)], changes: { reset: true, scope: SCOPE_A } });
    expect((await entries.getAll()).map(e => e.id)).toEqual([9]);
    expect(calls).toEqual(['/entries/cursor', '/entries/changes?since=100', '/entries?limit=5000']);
    expect((await readCache(SCOPE_A))?.rows.map(r => r.id)).toEqual([9]);
  });

  it('keeps two accounts on one browser apart', async () => {
    server({ scope: SCOPE_A, cursor: '100', journal: [row(1, 4)] });
    await entries.getAll();
    const calls = server({ scope: SCOPE_B, cursor: '7', journal: [row(50, 4)] });
    expect((await entries.getAll()).map(e => e.id)).toEqual([50]);
    expect(calls).toEqual(['/entries/cursor', '/entries?limit=5000']);
    expect((await readCache(SCOPE_A))?.rows.map(r => r.id)).toEqual([1]);
  });

  it('downloads everything once the copy is a week old', async () => {
    server({ scope: SCOPE_A, cursor: '100', journal: [row(1, 4)] });
    await entries.getAll();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const calls = server({ scope: SCOPE_A, cursor: '900', journal: [row(1, 4), row(2, 5)] });
    await entries.getAll();
    expect(calls).toEqual(['/entries/cursor', '/entries?limit=5000']);
  });

  it('is erased on sign-out', async () => {
    server({ scope: SCOPE_A, cursor: '100', journal: [row(1, 4)] });
    await entries.getAll();
    await clearEntryCache();
    expect(await readCache(SCOPE_A)).toBeNull();
  });
});
