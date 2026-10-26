import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auth, entries, topics, settings, sessions, doses, shares, ApiError, clearSealMarkers } from '../services/api.js';
import { setRecordCipherForTests } from '../services/recordCipher.js';
import { DEFAULT_TOPICS } from '../utils/defaultTopics.js';

/* A stand-in cipher: "encrypts" to base64 JSON bound to kind + id, so a
   payload opened with the wrong kind or id fails like real AES-GCM would. */
const fakeCipher = {
  encryptBytes: async (data: ArrayBuffer) => ({ ciphertext: data, iv: 'aXY=' }),
  encrypt: async (kind: string, id: string, record: unknown) =>
    ({ payload: btoa(JSON.stringify({ kind, id, record })), iv: 'iv' }),
  decrypt: async <T,>(kind: string, id: string, payload: string): Promise<T> => {
    const o = JSON.parse(atob(payload));
    if (o.kind !== kind || o.id !== id) throw new Error('bad AAD');
    return o.record as T;
  },
};
const seal = (kind: string, id: string, record: unknown) => btoa(JSON.stringify({ kind, id, record }));

/** fetch that answers by "METHOD path" (query ignored) and records every call. */
function routeFetch(routes: Record<string, (body: any, url: string) => unknown>) {
  return vi.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
    const key = `${init.method ?? 'GET'} ${url.split('?')[0]}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    const body = handler(init.body ? JSON.parse(init.body) : undefined, url);
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(body: unknown, options: { status?: number; contentType?: string } = {}) {
  const { status = 200, contentType = 'application/json' } = options;
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null),
    },
    json: () => Promise.resolve(body),
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = mockFetchResponse({});
  vi.stubGlobal('fetch', fetchSpy);
  clearSealMarkers();
  localStorage.clear();
});

/** GET /api/settings answering with the given seal markers present */
const markers = (...keys: string[]) => ({
  'GET /api/settings': () => keys.map(key => ({ key, value: { ciphertext: 'x', iv: 'y', v: 2 }, updatedAt: '' })),
  'PUT /api/settings': (b: { key: string; value: unknown }) => ({ key: b.key, value: b.value, updatedAt: '' }),
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ApiError class
// ---------------------------------------------------------------------------

describe('ApiError', () => {
  it('has correct name, status, and message', () => {
    const err = new ApiError(404, 'Not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// Shared header / error behaviour
// ---------------------------------------------------------------------------

describe('request – shared behaviour', () => {
  it('includes X-Requested-With header in every request', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await entries.getAll();

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('sends credentials: include', async () => {
    fetchSpy = mockFetchResponse([]);
    vi.stubGlobal('fetch', fetchSpy);

    await entries.getAll();

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.credentials).toBe('include');
  });

  it('throws ApiError on non-OK response', async () => {
    fetchSpy = mockFetchResponse({ error: 'Forbidden' }, { status: 403 });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(entries.getAll()).rejects.toThrow(ApiError);
    await expect(entries.getAll()).rejects.toThrow('Forbidden');
  });

  it('throws ApiError when content-type is not application/json', async () => {
    fetchSpy = mockFetchResponse('OK', { contentType: 'text/html' });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(entries.getAll()).rejects.toThrow('Unexpected response content type');
  });

  it('sets Content-Type header when body is provided', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await settings.upsert('headerColor', '#000');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('does not set Content-Type header when there is no body', async () => {
    fetchSpy = mockFetchResponse([]);
    vi.stubGlobal('fetch', fetchSpy);

    await entries.getAll();

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['Content-Type']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('auth', () => {
  it('register sends POST with correct body', async () => {
    const regData = {
      email: 'a@b.com',
      username: 'alice',
      authSecret: 'a'.repeat(64),
      encryptedMasterKey: 'emk',
      kekSalt: 'salt',
      kekWrapIv: 'iv',
      recoveryWrappedMK: 'rwmk',
      recoveryWrapIv: 'riv',
      recoveryKeyHash: 'rkh',
      recoveryKeySalt: 'rks',
    };
    fetchSpy = mockFetchResponse({ user: { email: 'a@b.com', username: 'alice' } });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await auth.register(regData);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/register');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(regData);
    expect(result.user.email).toBe('a@b.com');
  });

  it('login sends POST and returns user + encryption', async () => {
    const loginResp = {
      user: { email: 'a@b.com', username: 'alice' },
      encryption: {
        encryptionEnabled: true,
        kekSalt: 's',
        encryptedMasterKey: 'emk',
        kekWrapIv: 'iv',
        kekIterations: 600000,
        recoveryWrappedMK: null,
        recoveryWrapIv: null,
      },
    };
    fetchSpy = mockFetchResponse(loginResp);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await auth.login({ email: 'a@b.com', authSecret: 'a'.repeat(64) });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect((result as { encryption: { encryptionEnabled: boolean } }).encryption.encryptionEnabled).toBe(true);
  });

  it('logout sends POST to /auth/logout', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await auth.logout();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
  });

  it('changeEmail sends the current and new sign-in secrets', async () => {
    fetchSpy = mockFetchResponse({ success: true, email: 'n@b.com' });
    vi.stubGlobal('fetch', fetchSpy);

    await auth.changeEmail({ newEmail: 'n@b.com', currentAuthSecret: 'cur', newAuthSecret: 'new' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/change-email');
    expect(JSON.parse(init.body)).toEqual({ newEmail: 'n@b.com', currentAuthSecret: 'cur', newAuthSecret: 'new' });
  });

  it('changePassword sends POST with body', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    const data = { currentAuthSecret: 'old', newAuthSecret: 'new', newEncryptedMasterKey: 'emk', newKekSalt: 's', newKekWrapIv: 'iv' };
    await auth.changePassword(data);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/change-password');
    expect(init.method).toBe('POST');
  });

  it('getRecoveryParams sends email as query param', async () => {
    fetchSpy = mockFetchResponse({ recoveryWrappedMK: null, recoveryWrapIv: null });
    vi.stubGlobal('fetch', fetchSpy);

    await auth.getRecoveryParams('a@b.com');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/api/auth/recovery-params');
    expect(url).toContain('email=a%40b.com');
  });

  it('recover sends POST', async () => {
    fetchSpy = mockFetchResponse({ user: { email: 'a@b.com', username: 'alice' }, encryption: {} });
    vi.stubGlobal('fetch', fetchSpy);

    await auth.recover({
      email: 'a@b.com', recoveryProof: 'rp', newAuthSecret: 'np',
      newEncryptedMasterKey: 'emk', newKekSalt: 's', newKekWrapIv: 'iv',
      newRecoveryWrappedMK: 'rwmk', newRecoveryWrapIv: 'rwiv',
      newRecoveryKeyHash: 'rkh', newRecoveryKeySalt: 'rks',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/recover');
    expect(init.method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

describe('entries', () => {
  it('getAll fetches a journal under 5000 entries in one request', async () => {
    fetchSpy = mockFetchResponse({ entries: [], more: false });
    vi.stubGlobal('fetch', fetchSpy);

    await entries.getAll();

    // Topic filtering relies on the whole journal being in the store
    expect(fetchSpy.mock.calls).toHaveLength(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/entries?v=2&limit=5000');
  });

  it('getAll pages while the server says there is more, from where the last page ended, skipping repeated ids', async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, k) => ({ id: from - k }));
    const pages: Record<string, { entries: unknown[]; more: boolean }> = {
      '/api/entries?v=2&limit=5000': { entries: page(12000, 5000), more: true },
      // an entry saved while paging shifts the next page by one: 7001 repeats
      '/api/entries?v=2&limit=5000&offset=5000': { entries: page(7001, 3000), more: true }, // cut short by the byte cap
      '/api/entries?v=2&limit=5000&offset=8000': { entries: page(4001, 4001), more: false },
    };
    fetchSpy = vi.fn(async (url: string) => ({
      ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => pages[url],
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const all = await entries.getAll();

    expect(fetchSpy.mock.calls.map(c => c[0])).toEqual(Object.keys(pages));
    expect(all).toHaveLength(12000);
    expect(new Set(all.map(e => e.id)).size).toBe(12000);
  });

  it('createMany sends entries 50 to a request (and splits big ones by size), returning them in order', async () => {
    const sent: { id: number; format: number; taxonomyIds?: unknown }[][] = [];
    fetchSpy = vi.fn(async (_url: string, init: { body: string }) => {
      const { entries: batch } = JSON.parse(init.body);
      sent.push(batch);
      return { ok: true, status: 201, headers: { get: () => 'application/json' }, json: async () => batch.map((e: { id: number }) => ({ id: e.id })) };
    });
    vi.stubGlobal('fetch', fetchSpy);
    const entry = (id: number, size = 10) => ({ id, contentEncrypted: 'x'.repeat(size), contentIv: 'i', metadataEncrypted: 'm', metadataIv: 'j', isEncrypted: true, taxonomyIds: [3] });

    const made = await entries.createMany(Array.from({ length: 120 }, (_, k) => entry(k + 1)));
    expect(fetchSpy.mock.calls.every(c => c[0] === '/api/entries/batch')).toBe(true);
    expect(sent.map(b => b.length)).toEqual([50, 50, 20]);
    expect(made.map(e => e.id)).toEqual(Array.from({ length: 120 }, (_, k) => k + 1));
    expect(sent[0][0].format).toBe(3);
    expect(sent[0][0].taxonomyIds).toBeUndefined(); // no plaintext topic link

    sent.length = 0;
    await entries.createMany([entry(1, 2_000_000), entry(2, 2_000_000), entry(3)]);
    expect(sent.map(b => b.length)).toEqual([1, 2]);

    sent.length = 0;
    expect(await entries.createMany([])).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('get fetches /entries/:id', async () => {
    fetchSpy = mockFetchResponse({ id: 5 });
    vi.stubGlobal('fetch', fetchSpy);

    await entries.get(5);

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/entries/5');
  });

  it('create sends POST with the reserved id and format 3', async () => {
    const data = { id: 12, contentEncrypted: 'abc', contentIv: 'iv' };
    fetchSpy = mockFetchResponse(data);
    vi.stubGlobal('fetch', fetchSpy);

    await entries.create(data);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/entries');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ...data, format: 3 });
  });

  it('update sends PUT to /entries/:id', async () => {
    fetchSpy = mockFetchResponse({ id: 3 });
    vi.stubGlobal('fetch', fetchSpy);

    await entries.update(3, { contentEncrypted: 'new' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/entries/3');
    expect(init.method).toBe('PUT');
  });

  it('delete sends DELETE to /entries/:id', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await entries.delete(7);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/entries/7');
    expect(init.method).toBe('DELETE');
  });
});

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

describe('topics', () => {
  it('getAll fetches /topics', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({ ...markers('topicsSealV2'), 'GET /api/topics': () => DEFAULT_TOPICS.map((t, i) => ({ id: i + 1, name: null, icon: null, color: null, payload: seal('topic', String(i + 1), t), iv: 'iv' })) });
    vi.stubGlobal('fetch', fetchSpy);
    await topics.getAll();
    expect(fetchSpy.mock.calls.map(c => c[0])).toContain('/api/topics');
  });

  it('create reserves an id and sends only a payload bound to it — never the name', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      'POST /api/topics/ids': () => ({ ids: [41] }),
      'POST /api/topics': () => ({ id: 41, name: null, icon: null, color: '#112233', payload: 'x', iv: 'iv' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const t = await topics.create({ name: 'Work', icon: 'briefcase', color: '#112233' });

    const sent = JSON.parse(fetchSpy.mock.calls.find(c => c[0] === '/api/topics')![1].body);
    expect(sent).not.toHaveProperty('name');
    expect(sent).not.toHaveProperty('icon');
    expect(sent).toMatchObject({ id: 41, format: 2, color: '#112233' });
    expect(await fakeCipher.decrypt('topic', '41', sent.payload)).toEqual({ name: 'Work', icon: 'briefcase' });
    expect(t).toMatchObject({ id: 41, name: 'Work', icon: 'briefcase' });
  });

  it('update re-seals name and icon together, bound to the topic, filling in the one not given', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      ...markers('topicsSealV2'),
      'GET /api/topics/2': () => ({ id: 2, name: null, icon: null, color: null, payload: seal('topic', '2', { name: 'Old', icon: 'star' }), iv: 'iv' }),
      'PUT /api/topics/2': body => ({ id: 2, name: null, icon: null, color: null, payload: body.payload, iv: 'iv' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const t = await topics.update(2, { name: 'Updated' });

    const put = fetchSpy.mock.calls.find(c => c[1]?.method === 'PUT')!;
    expect(put[0]).toBe('/api/topics/2');
    expect(JSON.parse(put[1].body).format).toBe(2);
    expect(await fakeCipher.decrypt('topic', '2', JSON.parse(put[1].body).payload)).toEqual({ name: 'Updated', icon: 'star' });
    expect(t).toMatchObject({ name: 'Updated', icon: 'star' });
  });

  it('getAll re-seals older (unbound) topics bound to their id, writes the marker, and seeds missing defaults once', async () => {
    setRecordCipherForTests(fakeCipher);
    const rows: any[] = DEFAULT_TOPICS.slice(1).map((t, i) => ({ id: 10 + i, name: null, icon: null, color: t.color, payload: seal('topic', 'v1', { name: t.name, icon: t.icon }), iv: 'iv' }));
    let created = 0;
    let markerWritten = false;
    fetchSpy = routeFetch({
      'GET /api/settings': () => (markerWritten ? [{ key: 'topicsSealV2', value: { ciphertext: 'x', iv: 'y', v: 2 } }] : []),
      'PUT /api/settings': b => { if (b.key === 'topicsSealV2') markerWritten = true; return b; },
      'GET /api/topics': () => rows,
      ...Object.fromEntries(rows.map(r => [`PUT /api/topics/${r.id}`, (body: any) => { Object.assign(r, { payload: body.payload }); return r; }])),
      'POST /api/topics/ids': () => ({ ids: [99] }),
      'POST /api/topics': body => { created++; const r = { id: 99, name: null, icon: null, color: body.color, payload: body.payload, iv: 'iv' }; rows.push(r); return r; },
    });
    vi.stubGlobal('fetch', fetchSpy);

    const [a, b] = await Promise.all([topics.getAll(), topics.getAll()]);

    for (const r of rows.slice(0, -1)) expect(JSON.parse(atob(r.payload)).id).toBe(String(r.id));
    expect(markerWritten).toBe(true);
    // Only the one missing default was created — once, despite two loads
    expect(created).toBe(1);
    expect(a.map(t => t.name)).toContain(DEFAULT_TOPICS[0].name);
    expect(b.map(t => t.name)).toContain(DEFAULT_TOPICS[1].name);
  });

  it('after the marker, an older (unbound) payload or a plaintext name is never shown', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      ...markers('topicsSealV2'),
      'GET /api/topics': () => [
        { id: 3, name: null, icon: null, color: null, payload: seal('topic', 'v1', { name: 'Replayed', icon: null }), iv: 'iv' },
        { id: 4, name: 'Planted', icon: null, color: null, payload: null, iv: null },
        { id: 5, name: null, icon: null, color: null, payload: seal('topic', '6', { name: 'Moved', icon: null }), iv: 'iv' },
        ...DEFAULT_TOPICS.map((t, i) => ({ id: 20 + i, name: null, icon: null, color: null, payload: seal('topic', String(20 + i), t), iv: 'iv' })),
      ],
    });
    vi.stubGlobal('fetch', fetchSpy);

    const list = await topics.getAll();
    const names = list.map(t => t.name);
    expect(names).not.toContain('Replayed');
    expect(names).not.toContain('Planted');
    expect(names).not.toContain('Moved');
  });

  it('delete sends DELETE to /topics/:id', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await topics.delete(4);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/topics/4');
    expect(init.method).toBe('DELETE');
  });

  it('reorder sends POST with topicIds', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await topics.reorder([3, 1, 2]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/topics/reorder');
    expect(JSON.parse(init.body)).toEqual({ topicIds: [3, 1, 2] });
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe('settings', () => {
  it('getAll fetches /settings', async () => {
    fetchSpy = mockFetchResponse([]);
    vi.stubGlobal('fetch', fetchSpy);
    await settings.getAll();
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/settings');
  });

  it('upsert sends PUT with key/value', async () => {
    fetchSpy = mockFetchResponse({ key: 'headerColor', value: '#fff', updatedAt: '' });
    vi.stubGlobal('fetch', fetchSpy);

    await settings.upsert('headerColor', '#fff');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/settings');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ key: 'headerColor', value: '#fff' });
  });
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe('sessions', () => {
  it('getAll fetches /sessions', async () => {
    fetchSpy = mockFetchResponse([]);
    vi.stubGlobal('fetch', fetchSpy);
    await sessions.getAll();
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/sessions');
  });

  it('revoke sends POST to /sessions/:id/revoke', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await sessions.revoke(10);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/sessions/10/revoke');
    expect(init.method).toBe('POST');
  });

  it('revokeAll sends POST to /sessions/revoke-all', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await sessions.revokeAll();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/sessions/revoke-all');
    expect(init.method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// Doses
// ---------------------------------------------------------------------------

describe('doses', () => {
  // Dose ids are UUIDs (anything else is refused before opening)
  const A = '00000001-0000-4000-8000-000000000000';
  const OLD = '00000002-0000-4000-8000-000000000000';
  const NEW = '00000003-0000-4000-8000-000000000000';
  const MOVED = '00000004-0000-4000-8000-000000000000';
  const SWAPPED = '00000005-0000-4000-8000-000000000000';
  const UNBOUND = '00000006-0000-4000-8000-000000000000';
  const O1 = '00000007-0000-4000-8000-000000000000';
  const B1 = '00000008-0000-4000-8000-000000000000';
  const SOMEONE_ELSE = '00000009-0000-4000-8000-000000000000';
  const dose = { medicationPostId: 1, scheduledTime: '08:00', status: 'taken', takenAt: '8:05 AM' };
  const bound = (id: string, date: string, p: unknown) => seal('dose', `${id}|${date}`, p);

  it('getByDate asks for the day and decrypts each record bound to its day', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      ...markers('dosesSealV2'),
      'GET /api/doses': () => ({ records: [{ id: A, date: '2026-04-03', payload: bound(A, '2026-04-03', dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { logs } = await doses.getByDate('2026-04-03');

    expect(fetchSpy.mock.calls.find(c => String(c[0]).startsWith('/api/doses'))![0]).toContain('date=2026-04-03');
    expect(logs).toEqual([{ id: A, date: '2026-04-03', createdAt: 'c', ...dose }]);
  });

  it('keeps the newest when two devices saved the same dose, and drops one moved to another day or record', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      ...markers('dosesSealV2'),
      'GET /api/doses/all': () => ({ records: [
        { id: OLD, date: '2026-04-03', payload: bound(OLD, '2026-04-03', { ...dose, status: 'pending', takenAt: null }), iv: 'iv', createdAt: 'c', updatedAt: '2026-04-03T08:00:00Z' },
        { id: NEW, date: '2026-04-03', payload: bound(NEW, '2026-04-03', dose), iv: 'iv', createdAt: 'c', updatedAt: '2026-04-03T09:00:00Z' },
        { id: MOVED, date: '2026-04-04', payload: bound(MOVED, '2026-04-03', dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' },
        { id: SWAPPED, date: '2026-04-03', payload: bound(SOMEONE_ELSE, '2026-04-03', dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' },
        { id: UNBOUND, date: '2026-04-05', payload: seal('dose', UNBOUND, dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' },
      ] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { logs } = await doses.getAll();
    expect(logs.map(l => l.id)).toEqual([NEW]);
  });

  it('refuses a record whose id is not a UUID or whose day is malformed', async () => {
    setRecordCipherForTests(fakeCipher);
    // A '|' in the id would otherwise let an older record's AAD pass as `<id>|<day>`
    fetchSpy = routeFetch({
      ...markers('dosesSealV2'),
      'GET /api/doses/all': () => ({ records: [
        { id: `${A}|2026-04-03`, date: '2026-04-09', payload: seal('dose', `${A}|2026-04-03`, dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' },
        { id: B1, date: '2026-4-3', payload: bound(B1, '2026-4-3', dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' },
      ] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    expect((await doses.getAll()).logs).toEqual([]);
  });

  it('log updates the existing record for that dose, sealed to its day, with only the date readable', async () => {
    setRecordCipherForTests(fakeCipher);
    const id = '11111111-1111-4111-8111-111111111111';
    fetchSpy = routeFetch({
      ...markers('dosesSealV2'),
      'GET /api/doses': () => ({ records: [{ id, date: '2026-04-03', payload: bound(id, '2026-04-03', { ...dose, status: 'pending', takenAt: null }), iv: 'iv', createdAt: 'c', updatedAt: 'u' }] }),
      [`PUT /api/doses/${id}`]: () => ({ record: { createdAt: 'c' } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { log } = await doses.log({ medicationPostId: 1, scheduledTime: '08:00', date: '2026-04-03', status: 'taken', takenAt: '8:05 AM' });

    const put = fetchSpy.mock.calls.find(c => c[1]?.method === 'PUT')!;
    const body = JSON.parse(put[1].body);
    expect(Object.keys(body).sort()).toEqual(['date', 'format', 'iv', 'payload']);
    expect(body.format).toBe(2);
    expect(await fakeCipher.decrypt('dose', `${id}|2026-04-03`, body.payload)).toEqual(dose);
    expect(log.status).toBe('taken');
  });

  it('resealOlder moves records sealed before the day was bound, then writes the marker', async () => {
    setRecordCipherForTests(fakeCipher);
    const resealed: any[] = [];
    let markerWritten = false;
    fetchSpy = routeFetch({
      'GET /api/settings': () => [],
      'PUT /api/settings': b => { if (b.key === 'dosesSealV2') markerWritten = true; return b; },
      'GET /api/doses/all': () => ({ records: [
        { id: O1, date: '2026-01-02', payload: seal('dose', O1, dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' },
        { id: B1, date: '2026-01-03', payload: bound(B1, '2026-01-03', dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' },
      ] }),
      'PUT /api/doses/reseal': b => { resealed.push(...b.records); return { resealed: b.records.length }; },
    });
    vi.stubGlobal('fetch', fetchSpy);

    expect(await doses.resealOlder()).toBe(1);
    expect(resealed.map(r => r.id)).toEqual([O1]);
    expect(await fakeCipher.decrypt('dose', `${O1}|2026-01-02`, resealed[0].payload)).toEqual(dose);
    expect(markerWritten).toBe(true);
  });

  it('resealOlder does nothing once the marker exists', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({ ...markers('dosesSealV2') });
    vi.stubGlobal('fetch', fetchSpy);
    expect(await doses.resealOlder()).toBe(0);
    expect(fetchSpy.mock.calls.map(c => c[0])).toEqual(['/api/settings']);
  });
});

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

describe('shares', () => {
  it('create sends POST', async () => {
    fetchSpy = mockFetchResponse({ id: 1, token: 'abc' });
    vi.stubGlobal('fetch', fetchSpy);

    await shares.create({ content: '<p>Hi</p>', entryId: 7 });

    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ content: '<p>Hi</p>', entryId: 7 });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/shares');
    expect(init.method).toBe('POST');
  });

  it('get fetches share by token', async () => {
    fetchSpy = mockFetchResponse({ id: 1, token: 'tok123' });
    vi.stubGlobal('fetch', fetchSpy);

    await shares.get('tok123');

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/shares/tok123');
  });

  it('list fetches /shares', async () => {
    fetchSpy = mockFetchResponse([]);
    vi.stubGlobal('fetch', fetchSpy);

    await shares.list();

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/shares');
  });

  it('revoke sends DELETE to /shares/:token', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    await shares.revoke('tok123');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/shares/tok123');
    expect(init.method).toBe('DELETE');
  });
});
