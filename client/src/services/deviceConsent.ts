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
/** The unlocked account's master-key tag, for other per-account records in this browser. */
export function accountTagForRecords(): string | null {
  return account;
}

/** The unlocked account's tag (null when locked or signed out). */
export function setEgressAccount(tag: string | null | undefined): void {
  account = tag ?? null;
}

// Records from before the master-key tag were kept under a hash of the email
// and used to be moved over on sign-in. The email comes from the server, so a
// server could name another person's address and hand their switches to this
// account: they are no longer moved. A browser that still has only such a
// record treats the switch as off until it's turned on there again.

function records(): Record<string, true> {
  try {
    const raw = localStorage.getItem(EGRESS_STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, true> : {};
  } catch {
    return {};
  }
}

const recordKey = (key: EgressKey | typeof PUBLIC_SHELF_RECORD) => `${account}|${key}`;

/** The user switched it on or off in this browser. */
export function recordEgressChoice(key: EgressKey, on: boolean): void {
  if (!account) return;
  const all = records();
  if (on) all[recordKey(key)] = true;
  else delete all[recordKey(key)];
  try { localStorage.setItem(EGRESS_STORE, JSON.stringify(all)); } catch { /* private mode */ }
}

/** The saved value as honoured here: on only if saved on and switched on in this browser. */
/*
 * The public shelf publishes plaintext too, and whether one exists is the
 * server's word: without a record here a server (or anyone able to write its
 * database) could say "a shelf exists" and have this browser upload every
 * bookmarked item. So a browser publishes only after its own Turn on. It has
 * no sealed setting — the record alone decides, and it can't be replayed.
 */
const PUBLIC_SHELF_RECORD = 'publicShelf';

/** The owner turned the public shelf on (Turn on) or off in this browser. */
export function recordPublicShelfChoice(on: boolean): void {
  if (!account) return;
  const all = records();
  if (on) all[recordKey(PUBLIC_SHELF_RECORD)] = true;
  else delete all[recordKey(PUBLIC_SHELF_RECORD)];
  try { localStorage.setItem(EGRESS_STORE, JSON.stringify(all)); } catch { /* private mode */ }
}

/** Whether this browser may publish the shelf: only after its own Turn on. */
export function publicShelfOnHere(): boolean {
  return account !== null && records()[recordKey(PUBLIC_SHELF_RECORD)] === true;
}

export function egressOn(key: EgressKey, saved: unknown): boolean {
  return saved === true && account !== null && records()[recordKey(key)] === true;
}
