/*
 * Switches that send data off the device — Google Calendar sync, the Apple
 * Calendar feed (stored readable on the server) and its event details — are
 * sealed settings, but a sealed value can be replayed: a server could serve
 * the `true` it kept from before the user turned one off. So a switch is only
 * honoured on a browser that turned it on itself, recorded here per account.
 * A switch turned off here drops the record; a browser with no record treats
 * it as off until it's switched on there (also when the account id it's
 * given is wrong, which only ever fails towards off).
 *
 * A switch turned off in ANOTHER browser must end this one's record too, or
 * the server could later replay the old `true` here, where the record still
 * stood. So whenever the settings are read and a switch isn't on (off, missing
 * or unopenable), this browser's record for it is dropped (`reconcileEgress`),
 * and the same when the server says there is no public shelf
 * (`reconcilePublicShelf`). Both only ever fail towards off: at worst the
 * switch has to be turned on here again.
 */

import { AI_SHARING_CONSENT_VERSION } from '../utils/chatDisclosure.js';

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

type RecordName = EgressKey | typeof PUBLIC_SHELF_RECORD | typeof PUBLIC_SHELF_OFF_RECORD | typeof AI_RECORD | typeof AI_GRANDFATHER_RECORD | AiFeatureRecord;
const recordKey = (key: RecordName) => `${account}|${key}`;

// A switch turned on a moment ago: its save may not have reached the server
// yet, so a settings read answered just before it must not drop the record
const JUST_ON_MS = 60_000;
const turnedOnAt = new Map<string, number>();

function setRecord(key: RecordName, on: boolean): void {
  if (!account) return;
  const all = records();
  const k = recordKey(key);
  if (on) { all[k] = true; turnedOnAt.set(k, Date.now()); }
  else { delete all[k]; turnedOnAt.delete(k); }
  try { localStorage.setItem(EGRESS_STORE, JSON.stringify(all)); } catch { /* private mode */ }
}

function dropIfStale(key: RecordName): void {
  if (!account) return;
  const k = recordKey(key);
  if (records()[k] !== true) return;
  if (Date.now() - (turnedOnAt.get(k) ?? 0) < JUST_ON_MS) return;
  setRecord(key, false);
}

/** The settings were read: a switch that isn't on there ends this browser's record of it. */
export function reconcileEgress(key: EgressKey, saved: unknown): void {
  if (saved !== true) dropIfStale(key);
}

/** The server was asked about the public shelf: none there ends this browser's record. */
export function reconcilePublicShelf(exists: boolean): void {
  if (!exists) dropIfStale(PUBLIC_SHELF_RECORD);
}

/** The user switched it on or off in this browser. */
export function recordEgressChoice(key: EgressKey, on: boolean): void {
  setRecord(key, on);
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
// The owner pressed Turn off in this browser: nothing short of pressing Turn on
// again publishes from here (see `publicShelfTurnedOffHere`)
const PUBLIC_SHELF_OFF_RECORD = 'publicShelfOff';

/*
 * In-App AI sends what is logged (meals, exercise, symptoms, chat messages)
 * to the provider named in the sealed `aiConfig`. A sealed value can be
 * replayed: on a browser that has never seen a revision of it, the rollback
 * guard (settingCipher.ts) has nothing to compare with, so a server could
 * serve an aiConfig the user removed, or one with AI switched on. So AI is
 * used only on a browser that turned it on itself (Settings → In-App AI),
 * like the off-device switches; whenever the settings are read and AI is
 * off, missing or unopenable, this browser's record goes (`reconcileAi`).
 *
 * Browsers that already used AI before this record existed are let through
 * once (`grandfatherAi`): one whose rollback guard had already seen a
 * revision of aiConfig for this account had opened a config the user saved.
 */
const AI_RECORD = 'aiConfig';
const AI_GRANDFATHER_RECORD = 'aiConfig:checked';

/*
 * AI task planning, AI insights and AI kitchen send decrypted entries (tasks,
 * goals, visions / journal text / recipes, and allergies when ticked) to the provider. Each has its own switch in the
 * sealed aiConfig and, like AI itself, is used only on a browser where the
 * owner read the notice and agreed. The record names the version of the
 * wording agreed to (`AI_SHARING_CONSENT_VERSION`), so new wording asks again.
 */
export type AiFeature = 'aiPlan' | 'aiInsights' | 'aiKitchen';
type AiFeatureRecord = `${AiFeature}:v${number}`;
const featureRecord = (feature: AiFeature): AiFeatureRecord => `${feature}:v${AI_SHARING_CONSENT_VERSION}`;

/** The owner agreed to the sharing notice for this feature in this browser (or turned it off). */
export function recordAiFeatureChoice(feature: AiFeature, on: boolean): void {
  setRecord(featureRecord(feature), on);
}

/** Whether this feature may send anything from this browser: only after its own consent, to the current wording. */
export function aiFeatureChosenHere(feature: AiFeature): boolean {
  return account !== null && records()[recordKey(featureRecord(feature))] === true;
}

/** The settings were read: the feature off there (or AI off, missing, unopenable) ends this browser's record. */
export function reconcileAiFeature(feature: AiFeature, onThere: boolean): void {
  if (!onThere) dropIfStale(featureRecord(feature));
}

/** The user turned AI on (or off) in this browser. */
export function recordAiChoice(on: boolean): void {
  setRecord(AI_RECORD, on);
}

/** Whether AI may be used from this browser: only after its own choice. */
export function aiChosenHere(): boolean {
  return account !== null && records()[recordKey(AI_RECORD)] === true;
}

/** The settings were read: AI off, missing or unopenable there ends this browser's record. */
export function reconcileAi(onThere: boolean): void {
  if (!onThere) dropIfStale(AI_RECORD);
}

/**
 * Once per account in this browser, before the first aiConfig is opened
 * under this rule: a browser that had already seen a revision of it counts
 * as having chosen AI. Never again after that (a revision seen later proves
 * nothing — the guard notes whatever it opens).
 */
export function grandfatherAi(hadSeenRevision: boolean): void {
  if (!account || records()[recordKey(AI_GRANDFATHER_RECORD)] === true) return;
  if (hadSeenRevision) {
    setRecord(AI_RECORD, true);
    // Not "just turned on": a read that finds AI off may drop it at once
    turnedOnAt.delete(recordKey(AI_RECORD));
  }
  setRecord(AI_GRANDFATHER_RECORD, true);
}

/** The owner turned the public shelf on (Turn on) or off (Turn off) in this browser. */
export function recordPublicShelfChoice(on: boolean): void {
  setRecord(PUBLIC_SHELF_RECORD, on);
  setRecord(PUBLIC_SHELF_OFF_RECORD, !on);
}

/**
 * Turn off was pressed in this browser and Turn on hasn't been since. A shelf
 * the server then says exists must not start publishing again from an edit or
 * a bookmark tap (the bookmarks stay on the entries after Turn off) — only
 * from the owner pressing Turn on, which asks first.
 */
export function publicShelfTurnedOffHere(): boolean {
  return account !== null && records()[recordKey(PUBLIC_SHELF_OFF_RECORD)] === true;
}

/** Whether this browser may publish the shelf: only after its own Turn on. */
export function publicShelfOnHere(): boolean {
  return account !== null && records()[recordKey(PUBLIC_SHELF_RECORD)] === true;
}

export function egressOn(key: EgressKey, saved: unknown): boolean {
  return saved === true && account !== null && records()[recordKey(key)] === true;
}
