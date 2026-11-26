/**
 * The Chronicles AI app (Smith): a Mac and iPad assistant that signs in with
 * the account's own password and runs as an **assistant session** — the
 * session row's deviceInfo is 'assistant'. Such a session is held to a short
 * allowlist here, enforced by authMiddleware on every request:
 *
 * - API only, nothing else: no account, security, session, passkey, sharing,
 *   calendar, AI-chat or analytics route.
 * - Add and tick, never remove: it can create entries, record doses, check off
 *   habits, record bill payments and change a task's status. The only delete is
 *   undoing an entry it created itself, within ASSISTANT_UNDO_MS.
 * - Limited reading: entries hidden from AI are left out (routes/entries.ts),
 *   topics on the "Don't share with AI" list are left out (routes/topics.ts),
 *   settings come back filtered (assistantMayReadSetting), finance is bills only,
 *   and the account's "Don't share with AI" features are refused outright.
 * - What it may write it may overwrite: the server can't see inside an
 *   encrypted save, so "add and tick" is the app's own rule for entries, dose
 *   records, bills and the habit log. So the version it replaces is kept first,
 *   for the owner to put back (db/assistantHistory.ts). A new write path for
 *   the AI app must make its write through assistantWrite. Anything a rule
 *   below leaves to its route ("checked in the route") is looked up inside
 *   that write, under the account's lock.
 *
 * Only while the account's "Chronicles AI app" switch is on (the readable
 * `aiPrivacy` setting) and, for now, only for emails in ASSISTANT_CLIENT_EMAILS
 * — both checked on every request. Switching it off also ends its sessions.
 */
import { AI_PRIVACY_KEY, AI_PRIVACY_SEALED_KEY, parseAiPrivacy, type AiPrivacy, type AiFeatureKey } from '@chronicles/shared';
import { getSetting } from '../db/tenantQueries.js';

export { AI_PRIVACY_KEY, parseAiPrivacy, type AiPrivacy, type AiFeatureKey };

export const ASSISTANT_DEVICE = 'assistant';

/**
 * The account's choices, read fresh for every AI-app request (one indexed
 * row). Never cached: a cache is per server instance, so a switch turned off
 * would stay on elsewhere until it ran out.
 */
export async function loadAiPrivacy(schemaName: string): Promise<AiPrivacy> {
  const row = await getSetting(schemaName, AI_PRIVACY_KEY);
  return parseAiPrivacy(row?.value);
}

/** Accounts that may use the AI app at all, while it's being tried (comma-separated emails). */
export function assistantAllowedForEmail(email: string, env = process.env.ASSISTANT_CLIENT_EMAILS): boolean {
  if (!env) return false;
  const wanted = email.trim().toLowerCase();
  return env.split(',').map(e => e.trim().toLowerCase()).filter(Boolean).includes(wanted);
}

/** The only settings an assistant session can read. `aiConfig` (sealed: only the
    account's key opens it) lets the app use the account's own AI provider key
    rather than holding one of its own. Both copies of the "Don't share with
    AI" choices: the app holds the key, so like a browser it believes the
    sealed one and lets the readable one only add to what is hidden — the
    server's own copy alone must never be able to share more with it. */
export const ASSISTANT_SETTING_KEYS = new Set(['displayName', 'timezone', 'habitLog', 'goalCategories', 'taskTypes', 'aiConfig', 'dashboardConfig', AI_PRIVACY_KEY, AI_PRIVACY_SEALED_KEY]);
/** Settings that go with a feature the account can keep from AI: left out while it is. */
const SETTING_FEATURE: Record<string, AiFeatureKey> = { habitLog: 'habits', goalCategories: 'vision' };

/** Whether an assistant session may read this setting, given the account's choices. */
export function assistantMayReadSetting(key: string, privacy: AiPrivacy): boolean {
  if (!ASSISTANT_SETTING_KEYS.has(key)) return false;
  const feature = SETTING_FEATURE[key];
  return !feature || !privacy.hiddenFeatures.includes(feature);
}
/** …and the only one it can write. */
export const ASSISTANT_WRITABLE_SETTINGS = new Set(['habitLog']);

type Rule = { method: string; path: RegExp; feature?: AiFeatureKey };

const ID = '[0-9]+';
const UUID = '[0-9a-fA-F-]{36}';

/** Everything an assistant session may call. Anything else is 403. */
export const ASSISTANT_RULES: Rule[] = [
  { method: 'GET', path: /^\/api\/auth\/me$/ },
  { method: 'POST', path: /^\/api\/auth\/logout$/ },

  { method: 'GET', path: /^\/api\/entries$/ },
  { method: 'GET', path: /^\/api\/entries\/(cursor|changes|visible-ids)$/ },
  { method: 'GET', path: new RegExp(`^/api/entries/${ID}$`) },
  { method: 'POST', path: /^\/api\/entries\/ids$/ },
  { method: 'POST', path: /^\/api\/entries$/ },
  { method: 'PUT', path: new RegExp(`^/api/entries/${ID}$`) },
  // Only its own creation, within the undo window (checked in the route)
  { method: 'DELETE', path: new RegExp(`^/api/entries/${ID}$`) },

  { method: 'GET', path: /^\/api\/topics$/ },

  { method: 'GET', path: /^\/api\/settings$/ },
  // Only habitLog (checked in the route)
  { method: 'PUT', path: /^\/api\/settings$/, feature: 'habits' },

  { method: 'GET', path: /^\/api\/doses(\/all)?$/, feature: 'doses' },
  { method: 'PUT', path: new RegExp(`^/api/doses/${UUID}$`), feature: 'doses' },

  { method: 'GET', path: /^\/api\/finance\/bills$/, feature: 'bills' },
  // Only an existing bill (checked in the route)
  { method: 'PUT', path: new RegExp(`^/api/finance/bills/${UUID}$`), feature: 'bills' },
];

/** Signing out: allowed even while the journal is moving to a new key. */
export function isAssistantSignOut(method: string, path: string): boolean {
  return method.toUpperCase() === 'POST' && /^\/api\/auth\/logout\/*$/.test(path);
}

export type AssistantVerdict = { ok: true } | { ok: false; status: 403; error: string };

/** Whether an assistant session may make this request. `path` is the URL path without the query. */
export function assistantMay(method: string, path: string, privacy: AiPrivacy): AssistantVerdict {
  if (!privacy.appEnabled) return { ok: false, status: 403, error: 'The Chronicles AI app is turned off in Settings → In-App AI' };
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const rule = ASSISTANT_RULES.find(r => r.method === method.toUpperCase() && r.path.test(clean));
  if (!rule) return { ok: false, status: 403, error: 'Not available to the Chronicles AI app' };
  if (rule.feature && privacy.hiddenFeatures.includes(rule.feature)) {
    return { ok: false, status: 403, error: 'You chose not to share this with AI' };
  }
  return { ok: true };
}
