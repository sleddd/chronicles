/**
 * Client-orchestrated Google Calendar sync engine.
 *
 * Runs in the browser because only the client can decrypt/encrypt entries —
 * the server never sees plaintext. Pull (Google → Chronicles) runs before
 * push (Chronicles → Google); a per-entry `syncedHash` stored inside the
 * encrypted metadata records the last state both sides agreed on, which both
 * suppresses echoes of our own writes and detects real changes on either side.
 */
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import {
  entries as entriesApi,
  settings as settingsApi,
  calendar as calendarApi,
  ApiError,
  type CalendarStatus,
} from './api.js';
import {
  toGooglePayload,
  buildDescription,
  fromGoogleEvent,
  computeSyncHash,
  type MappedFields,
  type SyncTopicType,
} from './calendarMapping.js';
import { generateIcs, type IcsEventInput } from './icsGenerator.js';
import type {
  EntrySyncState,
  GoogleEvent,
  GoogleEventPayload,
  PendingCalendarDelete,
} from '../types/calendarSync.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { EncryptedPostData } from '@shared/crypto/types';

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';
const PENDING_DELETES_KEY = 'chronicles.calendarSync.pendingDeletes';
const STATUS_TTL_MS = 10 * 60 * 1000;

export interface SyncRuntimeDeps {
  encryptPost: (id: number, content: string, metadata: Record<string, unknown>) => Promise<EncryptedPostData>;
  encryptNewPost: (content: string, metadata: Record<string, unknown>) => Promise<EncryptedPostData & { id: number }>;
}

interface SyncCandidate {
  entry: DecryptedPost;
  topicType: SyncTopicType;
  fields: MappedFields & { _sync?: EntrySyncState };
}

// ── Module state ─────────────────────────────────────────────────────────────

let running = false;
let googleDisconnected = false;
let tokenCache: { token: string; expiresAt: number } | null = null;
let statusCache: { status: CalendarStatus; fetchedAt: number } | null = null;
let lastUploadedIcs = '';

export interface CalendarSyncUiState {
  syncing: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
  googleDisconnected: boolean;
}

const uiState: CalendarSyncUiState = {
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  googleDisconnected: false,
};
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(cb => cb());
}

export function getCalendarSyncUiState(): CalendarSyncUiState {
  return { ...uiState };
}

export function subscribeCalendarSync(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Call after connect/disconnect/ICS changes so the next sync refetches status. */
export function invalidateCalendarStatus(): void {
  statusCache = null;
  googleDisconnected = false;
  tokenCache = null;
  uiState.googleDisconnected = false;
  notify();
}

// A run reads the entries store again and again between network calls. If the
// journal locks (or the account changes) meanwhile, the store is empty — and
// "no local entry for this event" then reads as "deleted here": the run would
// delete the user's events at Google, and the next sync, seeing them cancelled,
// would delete the journal entries too. So a run stops the moment the journal
// it started on is no longer the one loaded.
let epoch = 0;
let activeRun = -1;

/** Lock or sign-out: stop any run in flight, and drop the Google token. */
export function cancelCalendarSync(): void {
  epoch++;
  tokenCache = null;
}

/** Throws unless the run in flight still has its journal: unlocked, loaded, sync on. */
function ensureLive(): void {
  if (activeRun !== epoch
    || !useEntriesStore.getState().isInitialized
    || !useUIStore.getState().calendarSyncEnabled) {
    throw new SyncAborted('Paused. Sign in again to resume syncing');
  }
}

/** Call on logout — clears all in-memory sync session state. */
export function resetCalendarSyncSession(): void {
  cancelCalendarSync();
  keptRemote = null; // read again from storage (sign-out empties it)
  invalidateCalendarStatus();
  uiState.lastSyncAt = null;
  uiState.lastError = null;
  lastUploadedIcs = '';
}

// ── Errors ───────────────────────────────────────────────────────────────────

class SyncAborted extends Error {}
class SyncTokenGone extends Error {}

// ── Google API access ────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) return tokenCache.token;
  try {
    const { accessToken, expiresInSeconds } = await calendarApi.getAccessToken();
    tokenCache = { token: accessToken, expiresAt: Date.now() + expiresInSeconds * 1000 };
    return accessToken;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      googleDisconnected = true;
      uiState.googleDisconnected = true;
      notify();
      throw new SyncAborted('Google Calendar disconnected — reconnect in Settings');
    }
    throw err;
  }
}

async function gcalFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(`${GCAL_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401 && !retried) {
    tokenCache = null;
    return gcalFetch(path, init, true);
  }
  if (res.status === 403 || res.status === 429) {
    throw new SyncAborted('Google Calendar rate limit — will retry later');
  }
  if (res.status === 410) {
    throw new SyncTokenGone('Sync token expired');
  }
  return res;
}

async function gcalJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await gcalFetch(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Calendar API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function gcalDeleteEvent(calendarId: string, eventId: string): Promise<void> {
  const res = await gcalFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
  // 404/410 = already gone — treat as success
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Failed to delete Google event (${res.status})`);
  }
}

// ── Status / candidates ──────────────────────────────────────────────────────

async function getCachedStatus(): Promise<CalendarStatus> {
  if (statusCache && Date.now() - statusCache.fetchedAt < STATUS_TTL_MS) return statusCache.status;
  const status = await calendarApi.getStatus();
  statusCache = { status, fetchedAt: Date.now() };
  return status;
}

/** topicId → 'event' | 'meeting' for topics whose name matches. */
export function getSyncTopicMap(): Map<number, SyncTopicType> {
  const map = new Map<number, SyncTopicType>();
  for (const topic of useEntriesStore.getState().allTopics) {
    const name = topic.name.toLowerCase();
    if (name === 'event') map.set(topic.id, 'event');
    if (name === 'meeting') map.set(topic.id, 'meeting');
  }
  return map;
}

/** All event/meeting entries with a startDate (including opted-out ones). */
export function getSyncCandidates(): SyncCandidate[] {
  const topicMap = getSyncTopicMap();
  const out: SyncCandidate[] = [];
  for (const entry of useEntriesStore.getState().decryptedEntries) {
    const taxonomyId = entry.metadata?._taxonomyId as number | undefined;
    if (!taxonomyId || !topicMap.has(taxonomyId)) continue;
    const fields = (entry.metadata?._customFields || {}) as SyncCandidate['fields'];
    if (!fields.startDate) continue;
    out.push({ entry, topicType: topicMap.get(taxonomyId)!, fields });
  }
  return out;
}

// ── Pending remote deletions (survive reloads via localStorage) ──────────────
// The calendar id is a private setting (often an email address), and
// localStorage is plain text that outlives a lock, so a queued delete keeps
// only the event id and "primary" or "the synced calendar" — resolved to the
// calendar being synced when the queue drains, at the next push.

interface StoredPendingDelete { googleEventId: string; calendar: 'primary' | 'synced' }

function readStored(): StoredPendingDelete[] {
  try {
    const raw = localStorage.getItem(PENDING_DELETES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // An older queue held the calendar id itself: kept as "the synced calendar"
    return parsed
      .filter(i => i && typeof i.googleEventId === 'string')
      .map((i): StoredPendingDelete => ({ googleEventId: i.googleEventId, calendar: i.calendar === 'primary' || i.calendarId === 'primary' ? 'primary' : 'synced' }));
  } catch {
    return [];
  }
}

export function readPendingDeletes(): StoredPendingDelete[] {
  return readStored();
}

function writePendingDeletes(items: StoredPendingDelete[]): void {
  try {
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(items.map(i => ({ googleEventId: i.googleEventId, calendar: i.calendar }))));
  } catch { /* storage full/unavailable — deletes will be reconciled on full resync */ }
}

// Events whose entries were removed from Chronicles with "they stay in Google
// Calendar": this browser never deletes them there, queues no delete for them
// and doesn't import them back. Ids only, like the queue above.
const KEEP_REMOTE_KEY = 'chronicles.calendarKeepRemote';
const KEEP_REMOTE_MAX = 5000;
let keptRemote: Set<string> | null = null;

function keptRemoteIds(): Set<string> {
  if (keptRemote) return keptRemote;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEEP_REMOTE_KEY) ?? '[]');
    keptRemote = new Set(Array.isArray(parsed) ? parsed.filter((i): i is string => typeof i === 'string') : []);
  } catch {
    keptRemote = new Set();
  }
  return keptRemote;
}

export function isKeptRemote(googleEventId: string): boolean {
  return keptRemoteIds().has(googleEventId);
}

function keepRemote(googleEventId: string): void {
  const ids = keptRemoteIds();
  ids.add(googleEventId);
  // The oldest go first once it's long (a Set keeps the order they were added)
  while (ids.size > KEEP_REMOTE_MAX) ids.delete(ids.values().next().value as string);
  try { localStorage.setItem(KEEP_REMOTE_KEY, JSON.stringify([...ids])); } catch { /* kept in memory for this tab */ }
}

export function enqueuePendingDelete(item: PendingCalendarDelete): void {
  // Its entry went with "keep it in Google": no delete is ever queued
  if (isKeptRemote(item.googleEventId)) return;
  const items = readStored();
  if (!items.some(i => i.googleEventId === item.googleEventId)) {
    items.push({ googleEventId: item.googleEventId, calendar: item.calendarId === 'primary' ? 'primary' : 'synced' });
    writePendingDeletes(items);
  }
}

async function drainPendingDeletes(calendarId: string): Promise<void> {
  const items = readStored();
  if (!items.length) return;
  const remaining: StoredPendingDelete[] = [];
  for (const item of items) {
    ensureLive();
    // Queued before it was marked "keep in Google" (or by an older build)
    if (isKeptRemote(item.googleEventId)) continue;
    try {
      await gcalDeleteEvent(item.calendar === 'primary' ? 'primary' : calendarId, item.googleEventId);
    } catch (err) {
      if (err instanceof SyncAborted) throw err;
      remaining.push(item);
    }
  }
  writePendingDeletes(remaining);
}

// ── Entry persistence (always through the normal encrypt path) ───────────────

async function persistEntryMetadata(
  deps: SyncRuntimeDeps,
  entry: DecryptedPost,
  newFields: Record<string, unknown>,
): Promise<void> {
  const newMetadata = { ...entry.metadata, _customFields: newFields };
  const encrypted = await deps.encryptPost(entry.id, entry.content, newMetadata);
  const resp = await entriesApi.update(entry.id, { ...encrypted, isEncrypted: true });
  useEntriesStore.getState().updateDecryptedEntry(entry.id, {
    metadata: newMetadata,
    updatedAt: resp.updatedAt ? new Date(resp.updatedAt as string) : new Date(),
  });
}

// ── Pull: Google → Chronicles ────────────────────────────────────────────────

/** 250 events a page: 20,000 events in one listing */
const MAX_LIST_PAGES = 80;
/** New entries made from Google events in one run. The rest follow in later runs */
const IMPORTS_PER_RUN = 100;

interface EventListPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

async function listEvents(calendarId: string, syncToken: string | null): Promise<{ events: GoogleEvent[]; nextSyncToken: string; full: boolean }> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken = '';
  let pages = 0;
  do {
    // A calendar (or someone filling it with invitations) can't make a run
    // hold an unbounded list in memory
    if (++pages > MAX_LIST_PAGES) throw new SyncAborted('This calendar has too many events to sync');
    const params = new URLSearchParams({ maxResults: '250' });
    if (syncToken) params.set('syncToken', syncToken);
    if (pageToken) params.set('pageToken', pageToken);
    const page = await gcalJson<EventListPage>(
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    );
    events.push(...(page.items || []));
    pageToken = page.nextPageToken;
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
  } while (pageToken);
  return { events, nextSyncToken, full: !syncToken };
}

function remotePayloadOf(event: GoogleEvent): GoogleEventPayload {
  return {
    summary: event.summary || '',
    location: event.location || '',
    start: event.start || {},
    end: event.end || {},
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function applyRemoteToEntry(
  deps: SyncRuntimeDeps,
  candidate: SyncCandidate,
  event: GoogleEvent,
  calendarId: string,
): Promise<void> {
  const { entry, topicType, fields } = candidate;
  const remoteFields = fromGoogleEvent(event, topicType);
  const newFields = { ...fields, ...remoteFields };

  const postApplyPayload = toGooglePayload(newFields, entry.content, topicType, entry.id);
  const syncedHash = await computeSyncHash(postApplyPayload || remotePayloadOf(event));
  const newSync: EntrySyncState = {
    ...(fields._sync as EntrySyncState),
    googleEventId: event.id,
    calendarId,
    syncedHash,
  };

  // Skip the write when nothing actually changed (idempotent re-application)
  const before = JSON.stringify({ ...fields, _sync: undefined });
  const after = JSON.stringify({ ...newFields, _sync: undefined });
  if (before === after && (fields._sync as EntrySyncState | undefined)?.syncedHash === syncedHash) return;

  await persistEntryMetadata(deps, entry, { ...newFields, _sync: newSync });
}

/** Local YYYY-MM-DD for "today" — import cutoff comparisons are string-safe. */
function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns whether an entry was made. */
async function importForeignEvent(
  deps: SyncRuntimeDeps,
  event: GoogleEvent,
  calendarId: string,
): Promise<boolean> {
  const topicMap = getSyncTopicMap();
  const eventTopicId = [...topicMap.entries()].find(([, type]) => type === 'event')?.[0];
  if (!eventTopicId) return false; // no Event topic to attach imports to

  const remoteFields = fromGoogleEvent(event, 'event', { withDetails: true });
  if (!remoteFields.startDate) return false;
  // Only import events from today onward — never a calendar's history. Already
  // synced past events keep updating via their _sync link; this only gates
  // the creation of NEW entries from foreign events.
  if (remoteFields.startDate < todayLocalDate()) return false;

  const summary = event.summary || 'Event';
  const descriptionHtml = (event.description || '')
    .split('\n')
    .filter(l => l.trim())
    .map(l => `<p>${escapeHtml(l)}</p>`)
    .join('');
  const content = `<h2>${escapeHtml(summary)}</h2>${descriptionHtml}`;

  // Compute _sync up front so the entry is created fully linked in one write —
  // a second write could be interrupted (e.g. auto-lock) and leave an unlinked
  // entry that the next sync would import again as a duplicate. The hash never
  // includes the entry id, so it can be computed before the entry exists.
  const payload = toGooglePayload(remoteFields as MappedFields, content, 'event', 0);
  const syncedHash = await computeSyncHash(payload || remotePayloadOf(event));
  const sync: EntrySyncState = { googleEventId: event.id, calendarId, syncedHash, imported: true };

  // eventName too: the text's first line is the event's name, and field-first readers see the same
  const fields: Record<string, unknown> = { ...remoteFields, calendarTitle: summary, eventName: summary, _sync: sync };
  const metadata: Record<string, unknown> = { _taxonomyId: eventTopicId, _customFields: fields };

  const encrypted = await deps.encryptNewPost(content, metadata);
  const resp = await entriesApi.create({ ...encrypted, isEncrypted: true, taxonomyIds: [eventTopicId] });

  useEntriesStore.getState().addDecryptedEntry({
    id: resp.id as number,
    content,
    metadata,
    isEncrypted: true,
    createdAt: resp.createdAt ? new Date(resp.createdAt as string) : new Date(),
    updatedAt: resp.updatedAt ? new Date(resp.updatedAt as string) : new Date(),
  });
  return true;
}

/**
 * The event is gone at Google (cancelled, or missing from a full listing).
 * The entry is NOT deleted: whoever organises an event the user was invited to
 * can cancel it, and the entry may hold writing that never went to Google.
 * It loses its link and is taken out of calendar sync (so it isn't pushed
 * back as a new event) — "Sync to calendar" on the entry turns that back on.
 */
async function unlinkEntry(deps: SyncRuntimeDeps, candidate: SyncCandidate): Promise<void> {
  const current = useEntriesStore.getState().decryptedEntries.find(e => e.id === candidate.entry.id);
  if (!current) return;
  const { _sync, ...rest } = (current.metadata?._customFields || {}) as Record<string, unknown>;
  const sync = _sync as EntrySyncState | undefined;
  // Nothing to remove there, and the tracker must not queue a delete for it
  if (sync?.googleEventId) keepRemote(sync.googleEventId);
  await persistEntryMetadata(deps, current, { ...rest, noCalendarSync: true });
}

async function pullPhase(deps: SyncRuntimeDeps, calendarId: string): Promise<void> {
  const ui = useUIStore.getState();
  let result: { events: GoogleEvent[]; nextSyncToken: string; full: boolean };
  try {
    result = await listEvents(calendarId, ui.googleSyncToken || null);
  } catch (err) {
    if (err instanceof SyncTokenGone) {
      // Expired incremental token — full resync
      result = await listEvents(calendarId, null);
    } else {
      throw err;
    }
  }

  // The listing took a while: the journal must still be the one it began with
  ensureLive();
  const candidates = getSyncCandidates();
  const byGoogleId = new Map<string, SyncCandidate>();
  for (const c of candidates) {
    const sync = c.fields._sync;
    if (sync?.googleEventId) byGoogleId.set(sync.googleEventId, c);
  }
  const importMode = ui.calendarImportMode;
  let imported = 0;
  let moreToImport = false;

  for (const event of result.events) {
    // Recurring events are out of scope for v1
    if (event.recurringEventId || event.recurrence?.length) continue;

    ensureLive();
    const match = byGoogleId.get(event.id);
    // Removed from Chronicles on purpose with "keep it in Google": left alone
    // there, and not brought back in as an import
    if (!match && isKeptRemote(event.id)) continue;

    if (event.status === 'cancelled') {
      if (match) {
        await unlinkEntry(deps, match);
        byGoogleId.delete(event.id);
      }
      continue;
    }

    if (match) {
      const sync = match.fields._sync as EntrySyncState;
      const remoteHash = await computeSyncHash(remotePayloadOf(event));
      if (remoteHash === sync.syncedHash) continue; // echo of our own write

      const localPayload = toGooglePayload(match.fields, match.entry.content, match.topicType, match.entry.id);
      const localHash = localPayload ? await computeSyncHash(localPayload) : '';
      const localChanged = localHash !== sync.syncedHash;

      if (localChanged) {
        // Both sides changed — last write wins
        const remoteNewer = Date.parse(event.updated || '') > match.entry.updatedAt.getTime();
        if (!remoteNewer) continue; // local wins; push phase re-pushes
      }
      await applyRemoteToEntry(deps, match, event, calendarId);
    } else if (event.extendedProperties?.private?.chroniclesId) {
      // Created by Chronicles but the local entry no longer exists — remove remotely
      await gcalDeleteEvent(calendarId, event.id);
    } else if (importMode === 'all') {
      // So many at once (a calendar filled with invitations) come in over
      // several runs: the listing is asked for again from the same point
      if (imported >= IMPORTS_PER_RUN) { moreToImport = true; continue; }
      if (await importForeignEvent(deps, event, calendarId)) imported++;
    }
  }

  // Full listing doubles as deletion reconciliation: anything we track that
  // Google didn't return was deleted remotely
  if (result.full) {
    const returnedIds = new Set(result.events.map(e => e.id));
    for (const c of candidates) {
      const sync = c.fields._sync;
      if (sync?.googleEventId && sync.calendarId === calendarId && !returnedIds.has(sync.googleEventId)) {
        ensureLive();
        await unlinkEntry(deps, c);
      }
    }
  }

  ensureLive();
  // Events still waiting to be imported: keep the old token, so the next run
  // is handed the same changes again and carries on
  if (moreToImport) return;
  if (result.nextSyncToken && result.nextSyncToken !== ui.googleSyncToken) {
    useUIStore.getState().setGoogleSyncToken(result.nextSyncToken);
    await settingsApi.upsert('googleSyncToken', result.nextSyncToken);
  }
}

// ── Push: Chronicles → Google ────────────────────────────────────────────────

async function pushPhase(deps: SyncRuntimeDeps, calendarId: string): Promise<void> {
  await drainPendingDeletes(calendarId);

  for (const candidate of getSyncCandidates()) {
    ensureLive();
    const { entry, topicType } = candidate;
    // Re-read fields from the store — the pull phase may have updated them
    const current = useEntriesStore.getState().decryptedEntries.find(e => e.id === entry.id);
    if (!current) continue;
    const fields = (current.metadata?._customFields || {}) as SyncCandidate['fields'];
    const sync = fields._sync as EntrySyncState | undefined;

    if (fields.noCalendarSync) {
      if (sync?.googleEventId) {
        await gcalDeleteEvent(sync.calendarId || calendarId, sync.googleEventId);
        const { _sync, ...rest } = fields;
        await persistEntryMetadata(deps, current, rest);
      }
      continue;
    }

    const payload = toGooglePayload(fields, current.content, topicType, current.id);
    if (!payload) continue;
    const hash = await computeSyncHash(payload);

    if (!sync?.googleEventId) {
      const created = await gcalJson<GoogleEvent>(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: 'POST', body: JSON.stringify(payload) },
      );
      const newSync: EntrySyncState = { googleEventId: created.id, calendarId, syncedHash: hash, detailsCleared: true };
      await persistEntryMetadata(deps, current, { ...fields, _sync: newSync });
    } else if (sync.calendarId !== calendarId) {
      // Target calendar changed — move the event
      await gcalDeleteEvent(sync.calendarId, sync.googleEventId);
      const created = await gcalJson<GoogleEvent>(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: 'POST', body: JSON.stringify(payload) },
      );
      const newSync: EntrySyncState = { ...sync, googleEventId: created.id, calendarId, syncedHash: hash, detailsCleared: !sync.imported || sync.detailsCleared };
      await persistEntryMetadata(deps, current, { ...fields, _sync: newSync });
    } else {
      // Events Chronicles created may still carry notes / attendees / phone
      // from older versions: clear the description once. An imported event's
      // description is the owner's own Google text, so it's left alone.
      const clearOld = !sync.imported && !sync.detailsCleared;
      if (hash !== sync.syncedHash || clearOld) {
        await gcalJson<GoogleEvent>(
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(sync.googleEventId)}`,
          { method: 'PATCH', body: JSON.stringify(clearOld ? { ...payload, description: '' } : payload) },
        );
        await persistEntryMetadata(deps, current, {
          ...fields, _sync: { ...sync, syncedHash: hash, ...(clearOld ? { detailsCleared: true } : {}) },
        });
      }
    }
  }
}

// ── ICS feed upload ──────────────────────────────────────────────────────────

async function icsPhase(): Promise<void> {
  const events: IcsEventInput[] = [];
  // The feed is stored readable on the server: descriptions (notes, attendees)
  // only when the user turned them on — title, time and place otherwise
  const includeDetails = useUIStore.getState().icsIncludeDetails;
  for (const { entry, topicType, fields } of getSyncCandidates()) {
    if (fields.noCalendarSync) continue;
    const payload = toGooglePayload(fields, entry.content, topicType, entry.id);
    if (!payload) continue;
    events.push({
      uid: `chronicles-${entry.id}@chronicles`,
      summary: payload.summary,
      description: includeDetails ? buildDescription(fields) : undefined,
      location: payload.location,
      startDate: fields.startDate,
      startTime: fields.startTime || '',
      endDate: fields.endDate || '',
      endTime: fields.endTime || '',
    });
  }
  // Deterministic timestamp input so unchanged content produces identical ICS
  const ics = generateIcs(events, new Date(0));
  if (ics === lastUploadedIcs) return;
  // Never upload a feed built from a store that was emptied by a lock
  ensureLive();
  await calendarApi.uploadIcs(ics);
  lastUploadedIcs = ics;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function runCalendarSync(deps: SyncRuntimeDeps): Promise<void> {
  if (running) return;
  const entriesState = useEntriesStore.getState();
  const ui = useUIStore.getState();
  if (!ui.calendarSyncEnabled || !entriesState.isInitialized) return;

  running = true;
  activeRun = epoch;
  uiState.syncing = true;
  uiState.lastError = null;
  notify();

  try {
    const status = await getCachedStatus();
    ensureLive();

    if (status.googleConnected && !googleDisconnected && ui.googleCalendarId) {
      await pullPhase(deps, ui.googleCalendarId);
      await pushPhase(deps, ui.googleCalendarId);
    }

    // Both: the feed as this account switched it on (sealed) and as the server has it
    if (status.icsEnabled && ui.icsFeedEnabled) {
      ensureLive();
      await icsPhase();
    }

    uiState.lastSyncAt = new Date();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Calendar sync failed';
    if (message === 'Encryption not unlocked') {
      // The journal auto-locked mid-run (tab hidden / inactivity) — not an
      // error; the next unlock triggers a fresh sync that resumes cleanly
      uiState.lastError = 'Paused. Sign in again to resume syncing';
    } else {
      uiState.lastError = message;
      if (!(err instanceof SyncAborted)) {
        console.error('Calendar sync error:', err);
      }
    }
  } finally {
    running = false;
    uiState.syncing = false;
    notify();
  }
}

/** All entries that were created by importing a foreign Google event. */
export function getImportedEntries(): DecryptedPost[] {
  return useEntriesStore.getState().decryptedEntries.filter(entry => {
    const sync = (entry.metadata?._customFields as Record<string, unknown> | undefined)?._sync as EntrySyncState | undefined;
    return sync?.imported === true;
  });
}

/**
 * Delete entries from Chronicles WITHOUT deleting any linked Google events.
 *
 * The deletion tracker (useCalendarSync) queues a Google delete for every
 * entry that stops carrying a sync link — which is what stripping the link
 * here used to trigger, so "they stay in Google Calendar" deleted them there.
 * Each event is therefore marked kept first (`keepRemote`: no delete queued,
 * none sent, not imported back), and an event Chronicles made also has its
 * `chroniclesId` mark taken off at Google, so no browser's later listing
 * mistakes it for one whose entry was deleted and removes it.
 */
export async function removeEntriesLocally(entries: DecryptedPost[]): Promise<number> {
  for (const entry of entries) {
    const { _sync, ...rest } = (entry.metadata._customFields || {}) as Record<string, unknown>;
    const sync = _sync as EntrySyncState | undefined;
    if (sync?.googleEventId) {
      keepRemote(sync.googleEventId);
      if (!sync.imported && sync.calendarId) {
        // Best effort: without it the event still stays as far as this browser goes
        await gcalFetch(
          `/calendars/${encodeURIComponent(sync.calendarId)}/events/${encodeURIComponent(sync.googleEventId)}`,
          { method: 'PATCH', body: JSON.stringify({ extendedProperties: { private: { chroniclesId: null } } }) },
        ).catch(() => undefined);
      }
    }
    useEntriesStore.getState().updateDecryptedEntry(entry.id, {
      metadata: { ...entry.metadata, _customFields: rest },
    });
  }
  // Every event is marked kept by now. The entries go 100 a request (one
  // request an entry stopped a year's clean-up at the request limit)
  const { deleted } = await entriesApi.deleteMany(entries.map(e => e.id));
  // Keep going past a failure: the remaining entries reappear linked on reload
  for (const id of deleted) useEntriesStore.getState().removeEntry(id);
  return deleted.length;
}

/** Delete all imported entries from Chronicles (Google events are kept). */
export async function removeImportedEntries(): Promise<number> {
  return removeEntriesLocally(getImportedEntries());
}

/** Event/Meeting entries whose startDate falls outside the given year. */
export function getEventEntriesOutsideYear(year: string): DecryptedPost[] {
  const topicMap = getSyncTopicMap();
  return useEntriesStore.getState().decryptedEntries.filter(entry => {
    const taxonomyId = entry.metadata?._taxonomyId as number | undefined;
    if (!taxonomyId || !topicMap.has(taxonomyId)) return false;
    const startDate = ((entry.metadata?._customFields || {}) as Record<string, unknown>).startDate;
    return typeof startDate === 'string' && startDate.length >= 4 && !startDate.startsWith(year);
  });
}

/** List the user's writable Google calendars (for the Settings picker). */
export async function listWritableCalendars(): Promise<{ id: string; summary: string; primary: boolean }[]> {
  const page = await gcalJson<{ items?: { id: string; summary: string; primary?: boolean; accessRole: string }[] }>(
    '/users/me/calendarList?minAccessRole=writer&maxResults=250',
  );
  return (page.items || []).map(c => ({ id: c.id, summary: c.summary, primary: !!c.primary }));
}
