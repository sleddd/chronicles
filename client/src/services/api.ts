/**
 * API client — single point of contact with the Express server
 * Always sends X-Requested-With header for CSRF protection on cookie-based auth
 */

const BASE_URL = '/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfterSec?: number) {
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
    throw new ApiError(res.status, data.error || 'Request failed', res.status === 429 ? retryAfterFrom(res) : undefined);
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
    password: string;
    encryptedMasterKey: string;
    kekSalt: string;
    kekWrapIv: string;
    recoveryWrappedMK: string;
    recoveryWrapIv: string;
    recoveryKeyHash: string;
    recoveryKeySalt: string;
  }) => request<{ user: { email: string; username: string } }>('/auth/register', { method: 'POST', body: data }),

  login: (data: { email: string; password: string }) =>
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

  enable2FA: (data: { secret: string; code: string }) =>
    request<{ backupCodes: string[] }>('/auth/2fa/enable', { method: 'POST', body: data }),

  disable2FA: (data: { password: string }) =>
    request<{ success: boolean }>('/auth/2fa', { method: 'DELETE', body: data }),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  getSalt: (email: string) =>
    request<{
      encryptionEnabled: boolean;
      kekSalt: string | null;
      encryptedMasterKey: string | null;
      kekWrapIv: string | null;
      kekIterations: number;
    }>('/auth/salt', { params: { email } }),

  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
    newEncryptedMasterKey: string;
    newKekSalt: string;
    newKekWrapIv: string;
  }) => request<{ success: boolean }>('/auth/change-password', { method: 'POST', body: data }),

  changeEmail: (data: { newEmail: string }) =>
    request<{ success: boolean; email: string }>('/auth/change-email', { method: 'POST', body: data }),

  getRecoveryParams: (email: string) =>
    request<{
      recoveryWrappedMK: string | null;
      recoveryWrapIv: string | null;
    }>('/auth/recovery-params', { params: { email } }),

  recover: (data: {
    email: string;
    recoveryKey: string;
    newPassword: string;
    newEncryptedMasterKey: string;
    newKekSalt: string;
    newKekWrapIv: string;
    newRecoveryWrappedMK: string;
    newRecoveryWrapIv: string;
    newRecoveryKeyHash: string;
    newRecoveryKeySalt: string;
  }) => request<{
    user: { email: string; username: string };
    encryption: Record<string, unknown>;
  }>('/auth/recover', { method: 'POST', body: data }),

  saveRecoveryKey: (data: {
    recoveryWrappedMK: string;
    recoveryWrapIv: string;
    recoveryKeyHash: string;
    recoveryKeySalt: string;
  }) => request<{ success: boolean }>('/auth/recovery-key', { method: 'POST', body: data }),
};

// =============================================================================
// Entries
// =============================================================================

export const entries = {
  getAll: () => request<Record<string, unknown>[]>('/entries?limit=5000'),

  get: (id: number) => request<Record<string, unknown>>(`/entries/${id}`),

  create: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/entries', { method: 'POST', body: data }),

  update: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/entries/${id}`, { method: 'PUT', body: data }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/entries/${id}`, { method: 'DELETE' }),
};

// =============================================================================
// Topics
// =============================================================================

export const topics = {
  getAll: () => request<{ id: number; name: string; icon: string | null; color: string | null }[]>('/topics'),

  create: (data: { name: string; icon?: string; color?: string }) =>
    request<{ id: number; name: string; icon: string | null; color: string | null }>('/topics', { method: 'POST', body: data }),

  update: (id: number, data: { name?: string; icon?: string; color?: string }) =>
    request<{ id: number; name: string; icon: string | null; color: string | null }>(`/topics/${id}`, { method: 'PUT', body: data }),

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

export interface DoseLogRecord {
  id: number;
  medicationPostId: number;
  scheduledTime: string;
  takenAt: string | null;
  date: string;
  status: string;
  createdAt: string;
}

export const doses = {
  getByDate: (date: string) =>
    request<{ logs: DoseLogRecord[] }>('/doses', { params: { date } }),

  log: (data: {
    medicationPostId: number;
    scheduledTime: string;
    date: string;
    status: 'taken' | 'skipped' | 'pending';
    takenAt?: string | null;
  }) => request<{ log: DoseLogRecord }>('/doses', { method: 'POST', body: data }),
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
export default { auth, entries, topics, settings, sessions, doses, shares, calendar };

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
