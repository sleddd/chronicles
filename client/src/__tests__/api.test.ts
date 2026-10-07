import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auth, entries, topics, settings, sessions, doses, shares, ApiError } from '../services/api.js';

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
      password: 'StrongPass123!',
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

    const result = await auth.login({ email: 'a@b.com', password: 'pw' });

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

  it('changeEmail sends the current password along', async () => {
    fetchSpy = mockFetchResponse({ success: true, email: 'n@b.com' });
    vi.stubGlobal('fetch', fetchSpy);

    await auth.changeEmail({ newEmail: 'n@b.com', currentPassword: 'pw' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/change-email');
    expect(JSON.parse(init.body)).toEqual({ newEmail: 'n@b.com', currentPassword: 'pw' });
  });

  it('changePassword sends POST with body', async () => {
    fetchSpy = mockFetchResponse({ success: true });
    vi.stubGlobal('fetch', fetchSpy);

    const data = { currentPassword: 'old', newPassword: 'new', newEncryptedMasterKey: 'emk', newKekSalt: 's', newKekWrapIv: 'iv' };
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
      email: 'a@b.com', recoveryKey: 'rk', newPassword: 'np',
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

  it('create sends POST with encrypted data', async () => {
    const data = { contentEncrypted: 'abc', contentIv: 'iv' };
    fetchSpy = mockFetchResponse(data);
    vi.stubGlobal('fetch', fetchSpy);

    await entries.create(data);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/entries');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(data);
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

  it('create sends POST', async () => {
    fetchSpy = mockFetchResponse({ id: 1, name: 'Work', icon: null, color: null });
    vi.stubGlobal('fetch', fetchSpy);

    await topics.create({ name: 'Work' });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).name).toBe('Work');
  });

  it('update sends PUT to /topics/:id', async () => {
    fetchSpy = mockFetchResponse({ id: 2, name: 'Updated', icon: null, color: null });
    vi.stubGlobal('fetch', fetchSpy);

    await topics.update(2, { name: 'Updated' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/topics/2');
    expect(init.method).toBe('PUT');
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
  it('getByDate passes date as query param', async () => {
    fetchSpy = mockFetchResponse({ logs: [] });
    vi.stubGlobal('fetch', fetchSpy);

    await doses.getByDate('2026-04-03');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/api/doses');
    expect(url).toContain('date=2026-04-03');
  });

  it('log sends POST with dose data', async () => {
    const doseData = {
      medicationPostId: 1,
      scheduledTime: '08:00',
      date: '2026-04-03',
      status: 'taken' as const,
      takenAt: '2026-04-03T08:05:00Z',
    };
    fetchSpy = mockFetchResponse({ log: { id: 1, ...doseData, createdAt: '' } });
    vi.stubGlobal('fetch', fetchSpy);

    await doses.log(doseData);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/doses');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(doseData);
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
