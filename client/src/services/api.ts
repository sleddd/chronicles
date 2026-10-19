/**
 * API client — single point of contact with the Express server
 * Always sends X-Requested-With header for CSRF protection on cookie-based auth
 */

import type { CrisisRating, RiskKind } from '@shared/validation/schemas.js';
import { entryCacheAvailable, readCache, replaceCache, applyToCache, type WireEntry } from './entryCache.js';
import { recordCipher } from './recordCipher.js';
import { sealSetting } from './settingCipher.js';
import { missingDefaultTopics } from '../utils/defaultTopics.js';

const BASE_URL = '/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSec?: number,
    /** The error response's JSON body, for routes that return extra fields (e.g. requires2FA). */
    public body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Seconds to wait from a Retry-After / RateLimit-Reset header, if present. */
function retryAfterFrom(res: Response): number | undefined {
  const raw = res.headers.get('retry-after') ?? res.headers.get('ratelimit-reset');
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, Math.round((at - Date.now()) / 1000)) : undefined;
}

/*
 * Identical GETs already in flight share one request — several components
 * load settings/entries on the same page load, which used to multiply
 * traffic (and burn through the server's rate limit).
 */
const inflight = new Map<string, Promise<unknown>>();

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;
  if (method === 'GET' && body === undefined) {
    const key = `${path}?${new URLSearchParams(options.params ?? {}).toString()}`;
    const pending = inflight.get(key) as Promise<T> | undefined;
    // Followers get their own copy so no caller can mutate another's data
    if (pending) return pending.then(v => structuredClone(v));
    const p = send<T>(path, options).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  return send<T>(path, options);
}

async function send<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${BASE_URL}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest', // CSRF protection
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include', // Send cookies
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(res.status, data.error || 'Request failed', res.status === 429 ? retryAfterFrom(res) : undefined, data);
  }

  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new ApiError(res.status, 'Unexpected response content type');
  }

  return res.json();
}

// =============================================================================
// Auth
// =============================================================================

export const auth = {
  /** "Remember me": start a grant for this browser session; returns the device secret once. */
  rememberStart: () => request<{ secret: string; expiresAt: string }>('/auth/remember', { method: 'POST' }),
  /** The device secret, while this browser session still holds the grant. */
  rememberKey: () => request<{ secret: string; expiresAt: string }>('/auth/remember/key', { method: 'POST' }),
  /** Forget this browser. */
  rememberForget: () => request<{ success: boolean }>('/auth/remember', { method: 'DELETE' }),
  register: (data: {
    email: string;
    username: string;
    authSecret: string;
    encryptedMasterKey: string;
    kekSalt: string;
    kekWrapIv: string;
    recoveryWrappedMK: string;
    recoveryWrapIv: string;
    recoveryKeyHash: string;
    recoveryKeySalt: string;
  }) => request<{ user: { email: string; username: string } }>('/auth/register', { method: 'POST', body: data }),

  // authSecret comes from deriveAuthSecret — the password itself is never sent
  login: (data: { email: string; authSecret: string }) =>
    request<
      | {
          requires2FA: true;
          pendingToken: string;
        }
      | {
          requires2FA?: false;
          user: { email: string; username: string; totpEnabled: boolean };
          encryption: {
            encryptionEnabled: boolean;
            kekSalt: string | null;
            encryptedMasterKey: string | null;
            kekWrapIv: string | null;
            kekIterations: number;
            recoveryWrappedMK: string | null;
            recoveryWrapIv: string | null;
          };
        }
    >('/auth/login', { method: 'POST', body: data }),

  submit2FA: (data: { pendingToken: string; code: string }) =>
    request<{
      user: { email: string; username: string; totpEnabled: boolean };
      encryption: {
        encryptionEnabled: boolean;
        kekSalt: string | null;
        encryptedMasterKey: string | null;
        kekWrapIv: string | null;
        kekIterations: number;
        recoveryWrappedMK: string | null;
        recoveryWrapIv: string | null;
      };
    }>('/auth/login/2fa', { method: 'POST', body: data }),

  setup2FA: () =>
    request<{ secret: string; qrCodeUrl: string }>('/auth/2fa/setup', { method: 'POST' }),

  enable2FA: (data: { secret: string; code: string; currentAuthSecret: string }) =>
    request<{ backupCodes: string[] }>('/auth/2fa/enable', { method: 'POST', body: data }),

  disable2FA: (data: { authSecret: string; code: string }) =>
    request<{ success: boolean }>('/auth/2fa', { method: 'DELETE', body: data }),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  deleteAccount: (data: { authSecret: string; code?: string }) =>
    request<{ success: boolean }>('/auth/account', { method: 'DELETE', body: data }),

  changePassword: (data: {
    currentAuthSecret: string;
    newAuthSecret: string;
    newEncryptedMasterKey: string;
    newKekSalt: string;
    newKekWrapIv: string;
  }) => request<{ success: boolean }>('/auth/change-password', { method: 'POST', body: data }),

  changeEmail: (data: { newEmail: string; currentAuthSecret: string; newAuthSecret: string }) =>
    request<{ success: boolean; email: string }>('/auth/change-email', { method: 'POST', body: data }),

  getRecoveryParams: (email: string) =>
    request<{
      recoveryWrappedMK: string | null;
      recoveryWrapIv: string | null;
      recoveryKeySalt: string | null;
    }>('/auth/recovery-params', { params: { email } }),

  recover: (data: {
    email: string;
    /** deriveRecoveryProof(recoveryKey, recoveryKeySalt) — never the key itself */
    recoveryProof: string;
    newAuthSecret: string;
    newEncryptedMasterKey: string;
    newKekSalt: string;
    newKekWrapIv: string;
    newRecoveryWrappedMK: string;
    newRecoveryWrapIv: string;
    newRecoveryKeyHash: string;
    newRecoveryKeySalt: string;
    /** Authenticator or backup code — required when the account has 2FA on */
    code?: string;
  }) => request<{
    user: { email: string; username: string };
    encryption: Record<string, unknown>;
  }>('/auth/recover', { method: 'POST', body: data }),

  saveRecoveryKey: (data: {
    currentAuthSecret: string;
    recoveryWrappedMK: string;
    recoveryWrapIv: string;
    recoveryKeyHash: string;
    recoveryKeySalt: string;
  }) => request<{ success: boolean }>('/auth/recovery-key', { method: 'POST', body: data }),
};

// =============================================================================
// Entries
// =============================================================================

function withoutTopicLink(data: Record<string, unknown>): Record<string, unknown> {
  const { taxonomyIds: _omit, ...rest } = data;
  return rest;
}

const ENTRY_PAGE = 5000;

// Every entry, newest first, a page (ENTRY_PAGE) at a time until a short page
// comes back — one request for almost everyone. Ids seen on an earlier page
// are skipped: an entry saved meanwhile shifts the pages by one.
async function allEntryPages(): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  for (let offset = 0; ; offset += ENTRY_PAGE) {
    const page = await request<Record<string, unknown>[]>(`/entries?limit=${ENTRY_PAGE}${offset ? `&offset=${offset}` : ''}`);
    if (!Array.isArray(page)) return page;
    for (const e of page) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      all.push(e);
    }
    if (page.length < ENTRY_PAGE) return all;
  }
}

type EntryChanges =
  | { reset: true; scope: string }
  | { reset: false; scope: string; cursor: string; entries: WireEntry[]; deleted: number[] };

// A full download now and then anyway, so the browser copy can't drift
const FULL_RELOAD_MS = 7 * 24 * 60 * 60 * 1000;

// The server's order: newest first, then highest id
function newestFirst(rows: WireEntry[]): WireEntry[] {
  return rows.sort((a, b) => (Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt))) || (b.id - a.id));
}

// Batch creates: the server takes up to 100 entries and a 5 MB body
const BATCH_ENTRIES = 50;
const BATCH_BYTES = 3_500_000;

export const entries = {
  // Every entry, newest first. With a browser cache (IndexedDB), only what
  // changed since the last visit is downloaded; otherwise the whole journal is.
  // Server errors (401, 429…) reach the caller as before; a cache that can't
  // be read or written just means a full download.
  getAll: async (): Promise<Record<string, unknown>[]> => {
    if (!entryCacheAvailable()) return allEntryPages();
    const { cursor, scope } = await request<{ cursor: string; scope: string }>('/entries/cursor');
    const cached = await readCache(scope).catch(() => null);
    if (cached && Date.now() - cached.fullAt < FULL_RELOAD_MS) {
      const changes = await request<EntryChanges>(`/entries/changes?since=${cached.cursor}`);
      if (!changes.reset && changes.scope === scope) {
        const byId = new Map(cached.rows.map(r => [r.id, r]));
        for (const e of changes.entries) byId.set(e.id, e);
        for (const id of changes.deleted) byId.delete(id);
        await applyToCache(scope, changes.cursor, changes.entries, changes.deleted).catch(() => {});
        return newestFirst([...byId.values()]);
      }
    }
    // The cursor was taken before this load, so nothing written during it is missed
    const rows = await allEntryPages();
    await replaceCache(scope, cursor, rows as WireEntry[]).catch(() => {});
    return rows;
  },

  get: (id: number) => request<Record<string, unknown>>(`/entries/${id}`),

  // An entry's topic lives only in its encrypted metadata (`_taxonomyId`);
  // the plaintext topic link is never sent, so the server can't tell which
  // entries are, say, Medication or Symptom.
  // Entries are encrypted bound to their id (format 3): a new entry is created
  // under the id it was encrypted for (`encryptNewPost` reserves it).
  create: (data: Record<string, unknown> & { id: number }) =>
    request<Record<string, unknown>>('/entries', { method: 'POST', body: { ...withoutTopicLink(data), format: 3 } }),

  /**
   * Create many entries (imports) in as few requests as possible: one per 50
   * entries or ~3.5 MB, so a big import stays well under the per-account
   * request limit and the 5 MB body cap. Returns the created entries in order.
   */
  createMany: async (list: (Record<string, unknown> & { id: number })[]): Promise<Record<string, unknown>[]> => {
    const made: Record<string, unknown>[] = [];
    let chunk: Record<string, unknown>[] = [];
    let bytes = 0;
    const send = async () => {
      if (!chunk.length) return;
      made.push(...await request<Record<string, unknown>[]>('/entries/batch', { method: 'POST', body: { entries: chunk } }));
      chunk = [];
      bytes = 0;
    };
    for (const data of list) {
      const body: Record<string, unknown> = { ...withoutTopicLink(data), format: 3 };
      const size = String(body.contentEncrypted ?? '').length + String(body.metadataEncrypted ?? '').length;
      if (chunk.length && (chunk.length >= BATCH_ENTRIES || bytes + size > BATCH_BYTES)) await send();
      chunk.push(body);
      bytes += size;
    }
    await send();
    return made;
  },

  update: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/entries/${id}`, {
      method: 'PUT',
      body: { ...withoutTopicLink(data), ...(data.contentEncrypted !== undefined && { format: 3 }) },
    }),

  /** Reserve ids for new entries (each is encrypted bound to its id before it's created). */
  reserveIds: (count = 1) =>
    request<{ ids: number[] }>('/entries/ids', { method: 'POST', body: { count } }),

  /** Re-save older entries in the id-bound format (up to 100 at a time; keeps updated_at). */
  reseal: (entries: { id: number; updatedAt: string; contentEncrypted: string; contentIv: string; metadataEncrypted: string; metadataIv: string }[]) =>
    request<{ resealed: number }>('/entries/reseal', { method: 'PUT', body: { entries: entries.map(e => ({ ...e, format: 3 })) } }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/entries/${id}`, { method: 'DELETE' }),
};

// =============================================================================
// Topics
// =============================================================================

// =============================================================================
// Seal markers — sealed settings recording that an account has moved a kind of
// record to its bound format (topics, doses). Until the marker exists the
// older form still opens (and is re-saved); after, it's refused, so an old
// ciphertext the server kept can't be replayed. Checked once per unlock.
// =============================================================================

const sealMarkers = new Map<string, Promise<boolean>>();

function sealMarkerPresent(key: string): Promise<boolean> {
  let p = sealMarkers.get(key);
  if (!p) {
    p = settings.getAll().then(rows => rows.some(r => r.key === key && r.value !== null && r.value !== undefined));
    p.catch(() => sealMarkers.delete(key));
    sealMarkers.set(key, p);
  }
  return p;
}

async function writeSealMarker(key: string): Promise<void> {
  await settings.upsert(key, await sealSetting(key, true, recordCipher().encryptBytes));
  sealMarkers.set(key, Promise.resolve(true));
}

/** On lock: the next unlock (maybe another account) checks again. */
export function clearSealMarkers(): void {
  sealMarkers.clear();
}

// Topic names and icons are encrypted here (one { name, icon } payload, kind
// 'topic', AAD bound to the topic's id); the server stores only the payload
// and the colour. A new topic reserves its id first. Topics sealed before the
// id binding (AAD 'v1') open once and are re-sealed; then the marker
// TOPICS_SEAL_MARKER is written and that form is refused.
// Missing default topics are seeded here too, encrypted.

export interface TopicRecord { id: number; name: string; icon: string | null; color: string | null; sort_order?: number }
interface TopicWire {
  id: number; name: string | null; icon: string | null; color: string | null;
  sort_order?: number; payload: string | null; iv: string | null;
}

const TOPIC_KIND = 'topic';
const TOPIC_OLDER_AAD_ID = 'v1';
const TOPICS_SEAL_MARKER = 'topicsSealV2';

async function sealTopic(id: number, name: string, icon: string | null | undefined) {
  return { ...(await recordCipher().encrypt(TOPIC_KIND, String(id), { name, icon: icon ?? null })), format: 2 as const };
}

async function openTopic(w: TopicWire, allowOlder: boolean): Promise<{ topic: TopicRecord; older: boolean }> {
  const base = { id: w.id, color: w.color, sort_order: w.sort_order };
  if (w.payload && w.iv) {
    const open = (aadId: string) => recordCipher().decrypt<{ name: string; icon: string | null }>(TOPIC_KIND, aadId, w.payload!, w.iv!);
    try {
      const p = await open(String(w.id));
      return { topic: { ...base, name: p.name, icon: p.icon ?? null }, older: false };
    } catch {
      if (allowOlder) {
        try {
          const p = await open(TOPIC_OLDER_AAD_ID);
          return { topic: { ...base, name: p.name, icon: p.icon ?? null }, older: true };
        } catch { /* unreadable */ }
      }
    }
    return { topic: { ...base, name: 'Unreadable topic', icon: null }, older: false };
  }
  // A plaintext name is never trusted: every topic is sealed in the browser
  return { topic: { ...base, name: 'Untitled topic', icon: null }, older: false };
}

let seedingDefaults: Promise<void> | null = null;
/** A fresh id for a new topic (its payload is bound to it). */
async function reserveTopicId(): Promise<number> {
  const { ids } = await request<{ ids: number[] }>('/topics/ids', { method: 'POST', body: { count: 1 } });
  return ids[0];
}

async function loadTopics(seed: boolean): Promise<TopicRecord[]> {
  const [wires, migrated] = await Promise.all([request<TopicWire[]>('/topics'), sealMarkerPresent(TOPICS_SEAL_MARKER)]);
  const opened = await Promise.all(wires.map(w => openTopic(w, !migrated)));
  if (!migrated) {
    // Re-seal topics still in the older form, then mark the account done
    const results = await Promise.all(opened.filter(o => o.older).map(async o => {
      try { await request(`/topics/${o.topic.id}`, { method: 'PUT', body: await sealTopic(o.topic.id, o.topic.name, o.topic.icon) }); return true; }
      catch { return false; }
    }));
    if (results.every(Boolean)) await writeSealMarker(TOPICS_SEAL_MARKER).catch(() => { /* next load */ });
  }
  const list = opened.map(o => o.topic);
  const missing = seed ? missingDefaultTopics(list) : [];
  if (!missing.length) return list;
  // One seeding at a time in this tab, so two loads can't add a default twice
  seedingDefaults ??= (async () => {
    for (const t of missing) await topics.create(t).catch(() => { /* next load */ });
  })().finally(() => { seedingDefaults = null; });
  await seedingDefaults;
  return loadTopics(false);
}

export const topics = {
  getAll: () => loadTopics(true),

  create: async (data: { name: string; icon?: string | null; color?: string }): Promise<TopicRecord> => {
    const id = await reserveTopicId();
    const sealed = await sealTopic(id, data.name, data.icon);
    const w = await request<TopicWire>('/topics', { method: 'POST', body: { id, ...sealed, ...(data.color ? { color: data.color } : {}) } });
    return { id: w.id, name: data.name, icon: data.icon ?? null, color: w.color, sort_order: w.sort_order };
  },

  update: async (id: number, data: { name?: string; icon?: string | null; color?: string }): Promise<TopicRecord> => {
    let body: Record<string, unknown> = data.color !== undefined ? { color: data.color } : {};
    let name = data.name;
    let icon = data.icon;
    if (name !== undefined || icon !== undefined) {
      // The payload holds both, so fill in whichever wasn't given
      if (name === undefined || icon === undefined) {
        const migrated = await sealMarkerPresent(TOPICS_SEAL_MARKER);
        const current = (await openTopic(await request<TopicWire>(`/topics/${id}`), !migrated)).topic;
        name ??= current.name;
        if (icon === undefined) icon = current.icon;
      }
      body = { ...body, ...(await sealTopic(id, name, icon)) };
    }
    const w = await request<TopicWire>(`/topics/${id}`, { method: 'PUT', body });
    return (await openTopic(w, !(await sealMarkerPresent(TOPICS_SEAL_MARKER)))).topic;
  },

  delete: (id: number) =>
    request<{ success: boolean }>(`/topics/${id}`, { method: 'DELETE' }),

  reorder: (topicIds: number[]) =>
    request<{ success: boolean }>('/topics/reorder', { method: 'POST', body: { topicIds } }),
};

// =============================================================================
// Settings
// =============================================================================

export const settings = {
  getAll: () => request<{ key: string; value: unknown; updatedAt: string }[]>('/settings'),

  upsert: (key: string, value: unknown) =>
    request<{ key: string; value: unknown; updatedAt: string }>('/settings', { method: 'PUT', body: { key, value } }),
};

// =============================================================================
// AI chat consent + app analytics (the analytics rows carry no account)
// =============================================================================

export interface AiChatStatus { consentAt: string | null; consentVersion: number | null; blocked: boolean }

export const aiChat = {
  status: () => request<AiChatStatus>('/ai-chat'),
  consent: (version: number) =>
    request<AiChatStatus>('/ai-chat/consent', { method: 'POST', body: { version, ageConfirmed: true } }),
  withdraw: () => request<AiChatStatus>('/ai-chat/consent', { method: 'DELETE' }),
};

export interface ConsentRecord {
  agreedAt: string;
  ageConfirmed: boolean;
  termsVersion: string;
  healthVersion: string;
  healthConsentWithdrawnAt: string | null;
  breachNotice: 'email' | 'mail';
  postalAddress: string | null;
}
export interface ConsentStatus { consent: ConsentRecord | null; current: { terms: string; health: string } }
export interface ConsentInput {
  termsVersion: string;
  healthVersion: string;
  breachNotice: 'email' | 'mail';
  postalAddress?: string;
}

export const consent = {
  status: () => request<ConsentStatus>('/consent'),
  agree: (c: ConsentInput) =>
    request<ConsentStatus>('/consent', { method: 'POST', body: { ageConfirmed: true, termsAccepted: true, healthConsent: true, ...c } }),
  setBreachNotice: (breachNotice: 'email' | 'mail', postalAddress?: string) =>
    request<ConsentStatus>('/consent/breach-notice', { method: 'PUT', body: { breachNotice, ...(postalAddress ? { postalAddress } : {}) } }),
};

export interface AppNotice { message: string; linkUrl: string | null; updatedAt: string }
export const notice = {
  get: () => request<{ notice: AppNotice | null }>('/notice'),
};

// Public landing page — no account needed
export interface BetaApplication {
  name: string; email: string; trackFirst: string; device: string; website?: string;
}
export const beta = {
  apply: (a: BetaApplication) =>
    request<{ ok: true }>('/beta/apply', { method: 'POST', body: { ...a, ageConfirmed: true, riskAccepted: true } }),
};

export const analytics = {
  crisisCard: (rating: CrisisRating, kind: RiskKind | null) =>
    request<{ ok: true }>('/analytics/crisis-card', { method: 'POST', body: { rating, kind } }),
  minorDetected: () => request<{ ok: true }>('/analytics/minor-detected', { method: 'POST' }),
};

// =============================================================================
// Sessions
// =============================================================================

export const sessions = {
  getAll: () => request<{
    id: number;
    deviceInfo: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    lastActiveAt: string;
    createdAt: string;
    isCurrent: boolean;
  }[]>('/sessions'),

  revoke: (id: number) =>
    request<{ success: boolean }>(`/sessions/${id}/revoke`, { method: 'POST' }),

  revokeAll: () =>
    request<{ success: boolean }>('/sessions/revoke-all', { method: 'POST' }),
};

// =============================================================================
// Doses
// =============================================================================

// Medication dose records are encrypted here (kind 'dose', AAD bound to the
// record's UUID and its day, so the server can't move a dose to another day);
// only the day is readable on the server. Records sealed before the day was
// bound (AAD = the UUID alone) open once and are re-saved (doses.resealOlder);
// then the marker DOSES_SEAL_MARKER is written and that form is refused.

export interface DoseLogRecord {
  id: string;
  medicationPostId: number;
  scheduledTime: string;
  takenAt: string | null;
  date: string;
  status: string;
  createdAt: string;
}
interface DoseWire { id: string; date: string; payload: string; iv: string; createdAt: string; updatedAt: string }
interface DosePayload { medicationPostId: number; scheduledTime: string; status: string; takenAt: string | null }

const DOSE_KIND = 'dose';
const DOSES_SEAL_MARKER = 'dosesSealV2';
const doseAadId = (id: string, date: string) => `${id}|${date}`;

/** Open one record: bound to its day, or (before the marker) the older UUID-only form. */
async function openDose(w: DoseWire, allowOlder: boolean): Promise<{ payload: DosePayload; older: boolean } | null> {
  try {
    return { payload: await recordCipher().decrypt<DosePayload>(DOSE_KIND, doseAadId(w.id, w.date), w.payload, w.iv), older: false };
  } catch {
    if (!allowOlder) return null;
    try { return { payload: await recordCipher().decrypt<DosePayload>(DOSE_KIND, w.id, w.payload, w.iv), older: true }; }
    catch { return null; }
  }
}

async function openDoses(wire: DoseWire[]): Promise<DoseLogRecord[]> {
  const allowOlder = !(await sealMarkerPresent(DOSES_SEAL_MARKER));
  const opened = await Promise.all(wire.map(async w => {
    const o = await openDose(w, allowOlder);
    return o ? { log: { id: w.id, date: w.date, createdAt: w.createdAt, ...o.payload }, updatedAt: w.updatedAt } : null;
  }));
  // Two devices can each save the same dose: keep the newest per medication + time + day
  const newest = new Map<string, { log: DoseLogRecord; updatedAt: string }>();
  for (const o of opened) {
    if (!o) continue;
    const k = `${o.log.medicationPostId}|${o.log.scheduledTime}|${o.log.date}`;
    const prev = newest.get(k);
    if (!prev || o.updatedAt > prev.updatedAt) newest.set(k, o);
  }
  return [...newest.values()].map(o => o.log).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

/** "1:35 PM" — how a taken time has always been shown. */
function nowTakenAt(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

async function sealDose(id: string, date: string, p: DosePayload) {
  return recordCipher().encrypt(DOSE_KIND, doseAadId(id, date), p);
}

async function putDose(id: string, date: string, p: DosePayload) {
  return request<{ record: DoseWire }>(`/doses/${id}`, { method: 'PUT', body: { format: 2, date, ...(await sealDose(id, date, p)) } });
}

let resealingDoses: Promise<number> | null = null;

export const doses = {
  getByDate: async (date: string) =>
    ({ logs: await openDoses((await request<{ records: DoseWire[] }>('/doses', { params: { date } })).records) }),

  /** Every dose record (reports, Settings → Data → Export All) */
  getAll: async () =>
    ({ logs: await openDoses((await request<{ records: DoseWire[] }>('/doses/all')).records) }),

  log: async (data: {
    medicationPostId: number;
    scheduledTime: string;
    date: string;
    status: 'taken' | 'skipped' | 'pending';
    takenAt?: string | null;
  }) => {
    const { logs } = await doses.getByDate(data.date);
    const existing = logs.find(l => l.medicationPostId === data.medicationPostId && l.scheduledTime === data.scheduledTime);
    const id = existing?.id ?? crypto.randomUUID();
    const payload: DosePayload = {
      medicationPostId: data.medicationPostId,
      scheduledTime: data.scheduledTime,
      status: data.status,
      takenAt: data.status === 'taken' ? (data.takenAt || nowTakenAt()) : null,
    };
    const { record } = await putDose(id, data.date, payload);
    return { log: { id, date: data.date, createdAt: record.createdAt, ...payload } as DoseLogRecord };
  },

  /**
   * Once per account: re-save records sealed before the day was bound (200 at
   * a time), then write the marker. Any failure leaves the marker unwritten,
   * so the next session tries again. Returns how many moved.
   */
  resealOlder: (): Promise<number> => {
    resealingDoses ??= (async () => {
      if (await sealMarkerPresent(DOSES_SEAL_MARKER)) return 0;
      const { records } = await request<{ records: DoseWire[] }>('/doses/all');
      const older: { id: string; date: string; payload: string; iv: string }[] = [];
      for (const w of records) {
        const o = await openDose(w, true);
        if (o?.older) older.push({ id: w.id, date: w.date, ...(await sealDose(w.id, w.date, o.payload)) });
      }
      let moved = 0;
      for (let i = 0; i < older.length; i += 200) {
        moved += (await request<{ resealed: number }>('/doses/reseal', { method: 'PUT', body: { records: older.slice(i, i + 200) } })).resealed;
      }
      if (moved === older.length) await writeSealMarker(DOSES_SEAL_MARKER);
      return moved;
    })().finally(() => { resealingDoses = null; });
    return resealingDoses;
  },
};

// =============================================================================
// Finance (opaque encrypted records — see stores/financeStore.ts)
// =============================================================================

export type FinanceKind = 'paydays' | 'bills' | 'budget' | 'expenses' | 'goals' | 'savings';

export interface FinanceRecordWire {
  id: string;
  payload: string;
  iv: string;
  createdAt: string;
  updatedAt: string;
}

export const finance = {
  list: (kind: FinanceKind) =>
    request<{ records: FinanceRecordWire[] }>(`/finance/${kind}`),

  put: (kind: FinanceKind, id: string, payload: string, iv: string) =>
    request<{ record: FinanceRecordWire }>(`/finance/${kind}/${id}`, { method: 'PUT', body: { payload, iv } }),

  remove: (kind: FinanceKind, id: string) =>
    request<{ success: boolean }>(`/finance/${kind}/${id}`, { method: 'DELETE' }),
};

// =============================================================================
// Shares
// =============================================================================

export interface ShareRecord {
  token: string;
  /** Entry the share was created from — present on owner list/create responses */
  entryId?: number | null;
  /** Plaintext shared content — present on public GET-by-token responses */
  content?: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export const shares = {
  /** Create a share (protected) — content is stored as plaintext by design */
  create: (data: { content: string; entryId: number; expiresAt?: string | null }) =>
    request<ShareRecord>('/shares', { method: 'POST', body: data }),

  /** Fetch a share by token — public, no auth */
  get: (token: string) =>
    request<ShareRecord>(`/shares/${token}`),

  /** List all my shares (protected) */
  list: () =>
    request<ShareRecord[]>('/shares'),

  /** Revoke a share (protected) */
  revoke: (token: string) =>
    request<{ success: boolean }>(`/shares/${token}`, { method: 'DELETE' }),
};

// =============================================================================
// Calendar sync
// =============================================================================

export interface CalendarStatus {
  googleConnected: boolean;
  googleEmail: string | null;
  icsEnabled: boolean;
  icsToken: string | null;
}

export const calendar = {
  getAuthUrl: () => request<{ url: string }>('/calendar/google/auth-url'),

  getStatus: () => request<CalendarStatus>('/calendar/status'),

  getAccessToken: () =>
    request<{ accessToken: string; expiresInSeconds: number }>('/calendar/google/token', { method: 'POST' }),

  disconnectGoogle: () =>
    request<{ success: boolean }>('/calendar/google', { method: 'DELETE' }),

  enableIcs: () => request<{ icsToken: string }>('/calendar/ics/enable', { method: 'POST' }),

  regenerateIcs: () => request<{ icsToken: string }>('/calendar/ics/regenerate', { method: 'POST' }),

  disableIcs: () => request<{ success: boolean }>('/calendar/ics', { method: 'DELETE' }),

  uploadIcs: (ics: string) => request<{ success: boolean }>('/calendar/ics', { method: 'PUT', body: { ics } }),
};

export { ApiError };
export default { auth, entries, topics, settings, sessions, doses, finance, shares, calendar, aiChat, analytics };

/**
 * How long to wait before retrying a failed initial load: the server's
 * Retry-After on a 429 (capped at 15 min), otherwise exponential backoff
 * from 10s up to a minute.
 */
export function retryDelayMs(err: unknown, attempt: number): number {
  if (err instanceof ApiError && err.status === 429) {
    const secs = err.retryAfterSec ?? 60;
    return Math.min(Math.max(secs, 5), 15 * 60) * 1000;
  }
  return Math.min(10_000 * 2 ** attempt, 60_000);
}
