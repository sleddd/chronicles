/*
 * Switches that send data off the device — Google Calendar sync, the Apple
 * Calendar feed (stored readable on the server) and its event details — are
 * sealed settings, but a sealed value can be replayed: a server could serve
 * the `true` it kept from before the user turned one off. So a switch is only
 * honoured on a browser that turned it on itself, recorded here per account.
 * A switch turned off here drops the record; a browser with no record treats
 * it as off until it's switched on there (also when the account id it's
 * given is wrong, which only ever fails towards off).
 */

export const EGRESS_STORE = 'chronicles.egress.v1';

export const EGRESS_KEYS = ['calendarSyncEnabled', 'icsFeedEnabled', 'icsIncludeDetails'] as const;
export type EgressKey = typeof EGRESS_KEYS[number];

// Records are kept under a tag derived from the account's master key
// (`encryptionService.accountTag`), set on unlock: a hash of the email could be
// checked against a guessed address by anyone at the browser, and an id from
// the server could point one account's records at another's
let account: string | null = null;
// Records made under the older email-hash key, moved over once both are known
let legacyAccount: string | null = null;

/** The unlocked account's master-key tag, for other per-account records in this browser. */
export function accountTagForRecords(): string | null {
  return account;
}

/** The unlocked account's tag (null when locked or signed out). */
export function setEgressAccount(tag: string | null | undefined): void {
  account = tag ?? null;
  migrateLegacy();
}

/** The signed-in account's older record key (a SHA-256 of its email), for a one-time move. */
export function setEgressLegacyAccount(id: string | null | undefined): void {
  legacyAccount = id ?? null;
  migrateLegacy();
}

function migrateLegacy(): void {
  if (!account || !legacyAccount) return;
  const all = records();
  let moved = false;
  for (const key of EGRESS_KEYS) {
    const old = `${legacyAccount}|${key}`;
    if (all[old]) { all[`${account}|${key}`] = true; delete all[old]; moved = true; }
  }
  if (moved) {
    try { localStorage.setItem(EGRESS_STORE, JSON.stringify(all)); } catch { /* private mode */ }
  }
}

function records(): Record<string, true> {
  try {
    const raw = localStorage.getItem(EGRESS_STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, true> : {};
  } catch {
    return {};
  }
}

const recordKey = (key: EgressKey) => `${account}|${key}`;

/** The user switched it on or off in this browser. */
export function recordEgressChoice(key: EgressKey, on: boolean): void {
  if (!account) return;
  const all = records();
  if (on) all[recordKey(key)] = true;
  else delete all[recordKey(key)];
  try { localStorage.setItem(EGRESS_STORE, JSON.stringify(all)); } catch { /* private mode */ }
}

/** The saved value as honoured here: on only if saved on and switched on in this browser. */
export function egressOn(key: EgressKey, saved: unknown): boolean {
  return saved === true && account !== null && records()[recordKey(key)] === true;
}
