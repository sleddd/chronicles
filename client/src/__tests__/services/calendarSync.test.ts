import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// This project's jsdom setup doesn't provide localStorage — polyfill it for the
// pending-deletes queue (the engine itself guards all localStorage access).
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, String(v)); },
    removeItem: (k: string) => { storage.delete(k); },
    clear: () => { storage.clear(); },
  },
});

// Mock the API layer — the engine talks to the Chronicles server only through this
vi.mock('../../services/api.js', () => {
  class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
  return {
    ApiError,
    entries: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    settings: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    calendar: {
      getStatus: vi.fn(),
      getAccessToken: vi.fn(),
      uploadIcs: vi.fn().mockResolvedValue({ success: true }),
    },
  };
});

import {
  runCalendarSync,
  resetCalendarSyncSession,
  enqueuePendingDelete,
  readPendingDeletes,
  getCalendarSyncUiState,
  removeImportedEntries,
  getEventEntriesOutsideYear,
  removeEntriesLocally,
} from '../../services/calendarSync.js';
import { toGooglePayload, computeSyncHash, type MappedFields } from '../../services/calendarMapping.js';
import { entries as entriesApi, calendar as calendarApi, settings as settingsApi } from '../../services/api.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useUIStore } from '../../stores/uiStore.js';
import type { DecryptedPost } from '@shared/crypto/types';

const CAL_ID = 'cal-1';

const deps = {
  encryptPost: vi.fn().mockResolvedValue({
    contentEncrypted: 'enc', contentIv: 'iv', metadataEncrypted: 'enc', metadataIv: 'iv',
  }),
};

const eventFields: MappedFields = {
  startDate: '2026-07-20', startTime: '10:00', endDate: '2026-07-20', endTime: '11:00',
  location: 'Cafe', address: '', phone: '', notes: '',
};

function makeEntry(id: number, fields: Record<string, unknown>, content = '<h2>Coffee</h2>'): DecryptedPost {
  return {
    id,
    content,
    metadata: { _taxonomyId: 1, _customFields: fields },
    isEncrypted: true,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-10T00:00:00Z'),
  };
}

function setupStores(entries: DecryptedPost[], uiOverrides: Record<string, unknown> = {}) {
  useEntriesStore.setState({
    allTopics: [
      { id: 1, name: 'Event', icon: null, color: null },
      { id: 2, name: 'Meeting', icon: null, color: null },
    ] as never,
    decryptedEntries: entries,
    isInitialized: true,
  });
  useUIStore.setState({
    calendarSyncEnabled: true,
    googleCalendarId: CAL_ID,
    googleSyncToken: '',
    calendarImportMode: 'chroniclesOnly',
    ...uiOverrides,
  });
}

interface FetchCall { url: string; method: string; body?: unknown }
let fetchCalls: FetchCall[];

/** Stub googleapis fetch: events.list returns `listItems`; insert/patch return `created`. */
function stubGoogleFetch(listItems: unknown[], created: Record<string, unknown> = { id: 'g-new' }) {
  fetchCalls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    fetchCalls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (String(url).includes('/events?')) {
      return new Response(JSON.stringify({ items: listItems, nextSyncToken: 'token-next' }), { status: 200 });
    }
    return new Response(JSON.stringify(created), { status: 200 });
  }));
}

async function syncedFieldsFor(id: number, fields: MappedFields, content = '<h2>Coffee</h2>', topicType: 'event' | 'meeting' = 'event') {
  const payload = toGooglePayload(fields, content, topicType, id)!;
  const syncedHash = await computeSyncHash(payload);
  return { payload, syncedHash };
}

// Fixtures are dated around mid-July 2026 and the sync never imports past
// events — pin "now" so the suite doesn't expire as the calendar moves on.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-13T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetCalendarSyncSession();
  (calendarApi.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
    googleConnected: true, googleEmail: 'u@g.com', icsEnabled: false, icsToken: null,
  });
  (calendarApi.getAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
    accessToken: 'tok', expiresInSeconds: 3600,
  });
  (entriesApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ updatedAt: '2026-07-13T00:00:00Z' });
  (entriesApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
});

describe('calendarSync push', () => {
  it('inserts a new event into Google and stores _sync in the entry metadata', async () => {
    setupStores([makeEntry(10, { ...eventFields })]);
    stubGoogleFetch([], { id: 'g-10' });

    await runCalendarSync(deps);

    const insert = fetchCalls.find(c => c.method === 'POST');
    expect(insert).toBeDefined();
    expect(insert!.url).toContain(`/calendars/${CAL_ID}/events`);
    expect((insert!.body as Record<string, unknown>).summary).toBe('Coffee');

    expect(entriesApi.update).toHaveBeenCalledWith(10, expect.objectContaining({ isEncrypted: true }));
    const stored = useEntriesStore.getState().decryptedEntries[0];
    const sync = (stored.metadata._customFields as Record<string, unknown>)._sync as Record<string, unknown>;
    expect(sync.googleEventId).toBe('g-10');
    expect(sync.calendarId).toBe(CAL_ID);
    expect(typeof sync.syncedHash).toBe('string');
  });

  it('does nothing when the entry is unchanged since the last sync', async () => {
    const { syncedHash } = await syncedFieldsFor(10, eventFields);
    setupStores([makeEntry(10, { ...eventFields, _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash } })], { googleSyncToken: 'tok-incremental' });
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    expect(fetchCalls.filter(c => c.method === 'POST' || c.method === 'PATCH')).toHaveLength(0);
    expect(entriesApi.update).not.toHaveBeenCalled();
  });

  it('patches the Google event when local fields changed', async () => {
    const { syncedHash } = await syncedFieldsFor(10, eventFields);
    const changed = { ...eventFields, location: 'New Cafe' };
    setupStores([makeEntry(10, { ...changed, _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash } })], { googleSyncToken: 'tok-incremental' });
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    const patch = fetchCalls.find(c => c.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch!.url).toContain('/events/g-10');
    expect((patch!.body as Record<string, unknown>).location).toBe('New Cafe');
  });

  it('deletes the remote event and strips _sync when opted out', async () => {
    const { syncedHash } = await syncedFieldsFor(10, eventFields);
    setupStores([makeEntry(10, {
      ...eventFields, noCalendarSync: true,
      _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash },
    })], { googleSyncToken: 'tok-incremental' });
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    const del = fetchCalls.find(c => c.method === 'DELETE');
    expect(del?.url).toContain('/events/g-10');
    const stored = useEntriesStore.getState().decryptedEntries[0];
    expect((stored.metadata._customFields as Record<string, unknown>)._sync).toBeUndefined();
  });

  it('drains the pending-deletes queue before pushing', async () => {
    setupStores([]);
    enqueuePendingDelete({ calendarId: CAL_ID, googleEventId: 'g-gone' });
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    expect(fetchCalls.some(c => c.method === 'DELETE' && c.url.includes('/events/g-gone'))).toBe(true);
    expect(readPendingDeletes()).toHaveLength(0);
  });
});

describe('calendarSync pull', () => {
  it('skips the echo of our own write (remote hash equals syncedHash)', async () => {
    const { payload, syncedHash } = await syncedFieldsFor(10, eventFields);
    setupStores([makeEntry(10, { ...eventFields, _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash } })], { googleSyncToken: 'tok-incremental' });
    stubGoogleFetch([{
      id: 'g-10', status: 'confirmed', updated: '2026-07-12T00:00:00Z',
      summary: payload.summary, description: payload.description, location: payload.location,
      start: payload.start, end: payload.end,
    }]);

    await runCalendarSync(deps);

    expect(entriesApi.update).not.toHaveBeenCalled();
  });

  it('applies a remote change when the local entry is unchanged', async () => {
    const { payload, syncedHash } = await syncedFieldsFor(10, eventFields);
    setupStores([makeEntry(10, { ...eventFields, _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash } })], { googleSyncToken: 'tok-incremental' });
    stubGoogleFetch([{
      id: 'g-10', status: 'confirmed', updated: '2026-07-12T00:00:00Z',
      summary: 'Renamed remotely', description: payload.description, location: 'Moved',
      start: payload.start, end: payload.end,
    }]);

    await runCalendarSync(deps);

    const stored = useEntriesStore.getState().decryptedEntries[0];
    const fields = stored.metadata._customFields as Record<string, unknown>;
    expect(fields.location).toBe('Moved');
    expect(fields.calendarTitle).toBe('Renamed remotely');
    // syncedHash was recomputed — the following push made no PATCH
    expect(fetchCalls.filter(c => c.method === 'PATCH')).toHaveLength(0);
  });

  it('keeps the local version when both changed and local is newer, then re-pushes it', async () => {
    const { syncedHash } = await syncedFieldsFor(10, eventFields);
    const localChanged = { ...eventFields, location: 'Local wins' };
    const entry = makeEntry(10, { ...localChanged, _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash } });
    entry.updatedAt = new Date('2026-07-12T12:00:00Z'); // newer than remote
    setupStores([entry], { googleSyncToken: 'tok-incremental' });
    const { payload: remotePayload } = await syncedFieldsFor(10, { ...eventFields, location: 'Remote change' });
    stubGoogleFetch([{
      id: 'g-10', status: 'confirmed', updated: '2026-07-11T00:00:00Z',
      summary: remotePayload.summary, description: remotePayload.description, location: 'Remote change',
      start: remotePayload.start, end: remotePayload.end,
    }]);

    await runCalendarSync(deps);

    const patch = fetchCalls.find(c => c.method === 'PATCH');
    expect(patch).toBeDefined();
    expect((patch!.body as Record<string, unknown>).location).toBe('Local wins');
  });

  it('deletes the local entry when the remote event was cancelled', async () => {
    const { syncedHash } = await syncedFieldsFor(10, eventFields);
    setupStores([makeEntry(10, { ...eventFields, _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash } })], { googleSyncToken: 'tok-incremental' });
    stubGoogleFetch([{ id: 'g-10', status: 'cancelled' }]);

    await runCalendarSync(deps);

    expect(entriesApi.delete).toHaveBeenCalledWith(10);
    expect(useEntriesStore.getState().decryptedEntries).toHaveLength(0);
  });

  it('reconciles deletions on a full listing (tracked event missing remotely)', async () => {
    const { syncedHash } = await syncedFieldsFor(10, eventFields);
    // No sync token → full listing; the tracked event is absent, meaning it was deleted remotely
    setupStores([makeEntry(10, { ...eventFields, _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash } })]);
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    expect(entriesApi.delete).toHaveBeenCalledWith(10);
  });

  it('imports a foreign event when import mode is "all"', async () => {
    setupStores([], { calendarImportMode: 'all' });
    (entriesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 99, createdAt: '2026-07-13T00:00:00Z', updatedAt: '2026-07-13T00:00:00Z',
    });
    stubGoogleFetch([{
      id: 'g-foreign', status: 'confirmed', summary: 'Party',
      start: { date: '2026-08-01' }, end: { date: '2026-08-02' },
    }]);

    await runCalendarSync(deps);

    expect(entriesApi.create).toHaveBeenCalledWith(expect.objectContaining({ taxonomyIds: [1] }));
    const imported = useEntriesStore.getState().decryptedEntries.find(e => e.id === 99);
    expect(imported).toBeDefined();
    expect(imported!.content).toContain('Party');

    // Atomic import: _sync is part of the single create — no follow-up update
    // that could be interrupted and leave an unlinked (re-importable) entry
    const encryptedMetadata = deps.encryptPost.mock.calls[0][1] as Record<string, unknown>;
    const sync = (encryptedMetadata._customFields as Record<string, unknown>)._sync as Record<string, unknown>;
    expect(sync.googleEventId).toBe('g-foreign');
    expect(sync.imported).toBe(true);
    expect(entriesApi.update).not.toHaveBeenCalled();
  });

  it('pauses quietly when the journal locks mid-run', async () => {
    setupStores([makeEntry(10, { ...eventFields })]);
    stubGoogleFetch([], { id: 'g-10' });
    deps.encryptPost.mockRejectedValueOnce(new Error('Encryption not unlocked'));

    await runCalendarSync(deps);

    expect(getCalendarSyncUiState().lastError).toContain('unlock your journal');
  });

  it('never imports past events, even in "all" mode', async () => {
    setupStores([], { calendarImportMode: 'all' });
    stubGoogleFetch([{
      id: 'g-history', status: 'confirmed', summary: 'Old appointment',
      start: { date: '2020-03-15' }, end: { date: '2020-03-16' },
    }]);

    await runCalendarSync(deps);

    expect(entriesApi.create).not.toHaveBeenCalled();
  });

  it('removeImportedEntries deletes imported entries locally without queueing remote deletes', async () => {
    const { syncedHash } = await syncedFieldsFor(10, eventFields);
    setupStores([
      makeEntry(10, { ...eventFields, _sync: { googleEventId: 'g-10', calendarId: CAL_ID, syncedHash, imported: true } }),
      makeEntry(11, { ...eventFields, _sync: { googleEventId: 'g-11', calendarId: CAL_ID, syncedHash } }), // not imported
    ]);

    const removed = await removeImportedEntries();

    expect(removed).toBe(1);
    expect(entriesApi.delete).toHaveBeenCalledWith(10);
    expect(entriesApi.delete).not.toHaveBeenCalledWith(11);
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.id)).toEqual([11]);
    expect(readPendingDeletes()).toHaveLength(0);
  });

  it('year cleanup selects only event/meeting entries outside the year and deletes them without remote propagation', async () => {
    const { syncedHash } = await syncedFieldsFor(10, eventFields);
    setupStores([
      makeEntry(10, { ...eventFields, startDate: '2020-03-15', _sync: { googleEventId: 'g-old', calendarId: CAL_ID, syncedHash, imported: true } }),
      makeEntry(11, { ...eventFields, startDate: '2026-07-20' }), // current year — kept
      makeEntry(12, { ...eventFields, startDate: '' }),           // no date — kept
      { ...makeEntry(13, { someField: 'x' }), metadata: { _taxonomyId: 99, _customFields: { startDate: '2019-01-01' } } }, // not an event topic — kept
    ]);

    const outside = getEventEntriesOutsideYear('2026');
    expect(outside.map(e => e.id)).toEqual([10]);

    const removed = await removeEntriesLocally(outside);

    expect(removed).toBe(1);
    expect(entriesApi.delete).toHaveBeenCalledWith(10);
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.id).sort()).toEqual([11, 12, 13]);
    expect(readPendingDeletes()).toHaveLength(0); // linked entry deleted without queueing a Google delete
  });

  it('ignores foreign events in "chroniclesOnly" mode', async () => {
    setupStores([]);
    stubGoogleFetch([{
      id: 'g-foreign', status: 'confirmed', summary: 'Party',
      start: { date: '2026-08-01' }, end: { date: '2026-08-02' },
    }]);

    await runCalendarSync(deps);

    expect(entriesApi.create).not.toHaveBeenCalled();
  });

  it('skips recurring events', async () => {
    setupStores([], { calendarImportMode: 'all' });
    stubGoogleFetch([{
      id: 'g-rec', status: 'confirmed', summary: 'Weekly', recurringEventId: 'g-master',
      start: { date: '2026-08-01' }, end: { date: '2026-08-02' },
    }]);

    await runCalendarSync(deps);

    expect(entriesApi.create).not.toHaveBeenCalled();
  });

  it('persists the next sync token', async () => {
    setupStores([]);
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    expect(settingsApi.upsert).toHaveBeenCalledWith('googleSyncToken', 'token-next');
    expect(useUIStore.getState().googleSyncToken).toBe('token-next');
  });
});

describe('calendarSync guards', () => {
  it('does nothing when sync is disabled', async () => {
    setupStores([makeEntry(10, { ...eventFields })], { calendarSyncEnabled: false });
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    expect(fetchCalls).toHaveLength(0);
    expect(calendarApi.getStatus).not.toHaveBeenCalled();
  });

  it('marks the session disconnected when the token endpoint returns 401', async () => {
    const { ApiError } = await import('../../services/api.js');
    (calendarApi.getAccessToken as ReturnType<typeof vi.fn>).mockRejectedValue(new ApiError(401, 'google_disconnected'));
    setupStores([makeEntry(10, { ...eventFields })]);
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    expect(getCalendarSyncUiState().googleDisconnected).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });

  it('uploads the ICS feed when enabled, even without Google', async () => {
    (calendarApi.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      googleConnected: false, googleEmail: null, icsEnabled: true, icsToken: 'a'.repeat(64),
    });
    setupStores([makeEntry(10, { ...eventFields })]);
    stubGoogleFetch([]);

    await runCalendarSync(deps);

    expect(calendarApi.uploadIcs).toHaveBeenCalledTimes(1);
    const ics = (calendarApi.uploadIcs as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:chronicles-10@chronicles');

    // Second run with identical content skips the upload
    await runCalendarSync(deps);
    expect(calendarApi.uploadIcs).toHaveBeenCalledTimes(1);
  });
});
