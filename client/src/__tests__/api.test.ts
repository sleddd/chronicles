import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auth, entries, topics, settings, sessions, doses, shares, ApiError, legacyDoseId } from '../services/api.js';
import { setRecordCipherForTests } from '../services/recordCipher.js';
import { DEFAULT_TOPICS } from '../utils/defaultTopics.js';

/* A stand-in cipher: "encrypts" to base64 JSON bound to kind + id, so a
   payload opened with the wrong kind or id fails like real AES-GCM would. */
const fakeCipher = {
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
  it('getAll fetches every entry in one request', async () => {
    fetchSpy = mockFetchResponse([]);
    vi.stubGlobal('fetch', fetchSpy);

    await entries.getAll();

    // Topic filtering relies on the whole journal being in the store
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/entries?limit=5000');
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
    fetchSpy = mockFetchResponse([]);
    vi.stubGlobal('fetch', fetchSpy);
    await topics.getAll();
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/topics');
  });

  it('create sends only an encrypted payload — never the name', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({ 'POST /api/topics': () => ({ id: 1, name: null, icon: null, color: '#112233', payload: 'x', iv: 'iv' }) });
    vi.stubGlobal('fetch', fetchSpy);

    const t = await topics.create({ name: 'Work', icon: 'briefcase', color: '#112233' });

    const sent = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(sent).not.toHaveProperty('name');
    expect(sent).not.toHaveProperty('icon');
    expect(sent.color).toBe('#112233');
    expect(await fakeCipher.decrypt('topic', 'v1', sent.payload)).toEqual({ name: 'Work', icon: 'briefcase' });
    expect(t).toMatchObject({ id: 1, name: 'Work', icon: 'briefcase' });
  });

  it('update re-seals name and icon together, filling in the one not given', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      'GET /api/topics/2': () => ({ id: 2, name: null, icon: null, color: null, payload: seal('topic', 'v1', { name: 'Old', icon: 'star' }), iv: 'iv' }),
      'PUT /api/topics/2': body => ({ id: 2, name: null, icon: null, color: null, payload: body.payload, iv: 'iv' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const t = await topics.update(2, { name: 'Updated' });

    const put = fetchSpy.mock.calls.find(c => c[1]?.method === 'PUT')!;
    expect(put[0]).toBe('/api/topics/2');
    expect(await fakeCipher.decrypt('topic', 'v1', JSON.parse(put[1].body).payload)).toEqual({ name: 'Updated', icon: 'star' });
    expect(t).toMatchObject({ name: 'Updated', icon: 'star' });
  });

  it('getAll decrypts topics, seals legacy plaintext rows, and seeds missing defaults once', async () => {
    setRecordCipherForTests(fakeCipher);
    const rows: any[] = [
      { id: 1, name: 'Journal', icon: 'book', color: null, payload: null, iv: null },
      ...DEFAULT_TOPICS.slice(1).map((t, i) => ({ id: 10 + i, name: null, icon: null, color: t.color, payload: seal('topic', 'v1', { name: t.name, icon: t.icon }), iv: 'iv' })),
    ];
    let created = 0;
    fetchSpy = routeFetch({
      'GET /api/topics': () => rows,
      'PUT /api/topics/1': body => { rows[0] = { ...rows[0], name: null, icon: null, payload: body.payload, iv: 'iv' }; return rows[0]; },
      'POST /api/topics': body => { created++; const r = { id: 99, name: null, icon: null, color: body.color, payload: body.payload, iv: 'iv' }; rows.push(r); return r; },
    });
    vi.stubGlobal('fetch', fetchSpy);

    const [a, b] = await Promise.all([topics.getAll(), topics.getAll()]);

    // The legacy "Journal" row was sealed (its plaintext cleared)
    expect(rows[0].name).toBeNull();
    // Only the one missing default ("Task") was created — once, despite two loads
    expect(created).toBe(1);
    expect(a.map(t => t.name)).toContain('Task');
    expect(b.map(t => t.name)).toContain('Journal');
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
  const dose = { medicationPostId: 1, scheduledTime: '08:00', status: 'taken', takenAt: '8:05 AM' };

  it('getByDate asks for the day and decrypts each record', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      'GET /api/doses': () => ({ records: [{ id: 'a', date: '2026-04-03', payload: seal('dose', 'a', dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { logs } = await doses.getByDate('2026-04-03');

    expect(fetchSpy.mock.calls[0][0]).toContain('date=2026-04-03');
    expect(logs).toEqual([{ id: 'a', date: '2026-04-03', createdAt: 'c', ...dose }]);
  });

  it('keeps the newest when two devices saved the same dose, and skips unreadable ones', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      'GET /api/doses/all': () => ({ records: [
        { id: 'old', date: '2026-04-03', payload: seal('dose', 'old', { ...dose, status: 'pending', takenAt: null }), iv: 'iv', createdAt: 'c', updatedAt: '2026-04-03T08:00:00Z' },
        { id: 'new', date: '2026-04-03', payload: seal('dose', 'new', dose), iv: 'iv', createdAt: 'c', updatedAt: '2026-04-03T09:00:00Z' },
        { id: 'swapped', date: '2026-04-03', payload: seal('dose', 'someone-else', dose), iv: 'iv', createdAt: 'c', updatedAt: 'u' },
      ] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { logs } = await doses.getAll();
    expect(logs.map(l => l.id)).toEqual(['new']);
  });

  it('log updates the existing record for that dose, encrypted, with only the date readable', async () => {
    setRecordCipherForTests(fakeCipher);
    fetchSpy = routeFetch({
      'GET /api/doses': () => ({ records: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-04-03', payload: seal('dose', '11111111-1111-4111-8111-111111111111', { ...dose, status: 'pending', takenAt: null }), iv: 'iv', createdAt: 'c', updatedAt: 'u' }] }),
      'PUT /api/doses/11111111-1111-4111-8111-111111111111': () => ({ record: { createdAt: 'c' } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { log } = await doses.log({ medicationPostId: 1, scheduledTime: '08:00', date: '2026-04-03', status: 'taken', takenAt: '8:05 AM' });

    const put = fetchSpy.mock.calls.find(c => c[1]?.method === 'PUT')!;
    const body = JSON.parse(put[1].body);
    expect(Object.keys(body).sort()).toEqual(['date', 'iv', 'payload']);
    expect(await fakeCipher.decrypt('dose', '11111111-1111-4111-8111-111111111111', body.payload)).toEqual(dose);
    expect(log.status).toBe('taken');
  });

  it('migrates the legacy plaintext log with stable ids, then deletes it', async () => {
    setRecordCipherForTests(fakeCipher);
    const puts: string[] = [];
    fetchSpy = routeFetch({
      'GET /api/doses/legacy': () => ({ logs: [{ id: 7, medicationPostId: 3, scheduledTime: '21:00', takenAt: null, date: '2026-01-02', status: 'skipped' }] }),
      [`PUT /api/doses/${await legacyDoseId(7)}`]: (_b, url) => { puts.push(url); return { record: { createdAt: 'c' } }; },
      'DELETE /api/doses/legacy': () => ({ deleted: 1 }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    expect(await doses.migrateLegacy()).toBe(1);
    expect(puts).toHaveLength(1);
    expect(await legacyDoseId(7)).toBe(await legacyDoseId(7));
    expect(await legacyDoseId(7)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(fetchSpy.mock.calls.at(-1)![1].method).toBe('DELETE');
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
