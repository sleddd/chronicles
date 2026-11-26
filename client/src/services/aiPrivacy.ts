/*
 * What AI may not see (Settings → In-App AI → "Don't share with AI").
 *
 * Three things, all chosen here:
 *  - topics on the list: none of their entries go to any AI
 *  - "Hide from AI" on a single entry (`_aiHidden` in its encrypted metadata)
 *  - features outside entries: medication doses, habit check-ins, bills, the vision
 *
 * Every AI feature in Chronicles asks `isHiddenFromAi` / `visibleToAi` /
 * `featureHiddenFromAi` before it builds a request.
 *
 * Stored twice (shared/src/validation/aiPrivacy.ts). The sealed copy is what
 * this browser believes: only the account's key can write it, and an older one
 * is refused (settingCipher's rollback guard). The readable copy is the
 * server's, so it can hold the Chronicles AI app to the same choices. The
 * server could change its own copy, so here it can only ever ADD to what is
 * hidden, never take away.
 *
 * Because an entry's topic and switch are encrypted, this browser also tells
 * the server which entries are hidden (`markHiddenBeforeCreate`,
 * `markHiddenOnSave`, `reconcileAiHidden`).
 *
 * Three rules keep a mistake on the safe side:
 *  - Until the choices have been read, everything counts as hidden.
 *  - A change that restricts (the AI app switched off, something more hidden)
 *    reaches the server's copy first, so it holds even if the rest fails. The
 *    AI app counts as on only when both copies say so.
 *  - An entry is un-hidden on the server only by an act in this browser (the
 *    switch, a topic taken off the list) or right after a fresh load. Never
 *    because a copy held in memory, which may be out of date, says so.
 */
import type { DecryptedPost } from '@shared/crypto/types';
import {
  AI_PRIVACY_KEY, AI_PRIVACY_SEALED_KEY, parseAiPrivacy, type AiPrivacy, type AiFeatureKey,
} from '@shared/validation/aiPrivacy.js';
import { aiHidden as aiHiddenApi, settings as settingsApi } from './api.js';
import { recordCipher } from './recordCipher.js';
import { isSealed, openSetting, sealSetting, seenRevision, trackGuardedSave } from './settingCipher.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { AI_HIDDEN_META } from '../utils/aiHiddenFlag.js';

export { AI_PRIVACY_KEY, AI_PRIVACY_SEALED_KEY, AI_HIDDEN_META, parseAiPrivacy };
export type { AiPrivacy, AiFeatureKey };

export const AI_FEATURES: { key: AiFeatureKey; label: string }[] = [
  { key: 'doses', label: 'Medication doses' },
  { key: 'habits', label: 'Habit check-ins' },
  { key: 'bills', label: 'Bills (names and due dates)' },
  { key: 'vision', label: 'Your vision and goal categories' },
];

export const DEFAULT_AI_PRIVACY: AiPrivacy = { appEnabled: false, hiddenTopicIds: [], hiddenFeatures: [] };

/* Choices that can't be relied on say so themselves (`unread`), rather than
   being told apart by which object they are: a copy made of one — a spread, a
   merge — still counts as hidden. Only `parseAiPrivacy`, which builds a value
   from what was read, leaves the mark off. */
type Unread = AiPrivacy & { readonly unread: 'not-loaded' | 'unreadable' };
const unreadOf = (privacy: AiPrivacy): Unread['unread'] | undefined => (privacy as Partial<Unread>).unread;

/** The choices haven't been read yet (or the session ended): everything counts as hidden. */
const NOT_LOADED: Unread = { ...DEFAULT_AI_PRIVACY, unread: 'not-loaded' };
/** They were looked for and couldn't be read. The same for every AI feature — everything hidden — but Settings offers a way out (resetAiPrivacy). */
const UNREADABLE: Unread = { ...DEFAULT_AI_PRIVACY, unread: 'unreadable' };

let current: AiPrivacy = NOT_LOADED;
const listeners = new Set<() => void>();

function setCurrent(next: AiPrivacy): void {
  current = next;
  listeners.forEach(fn => fn());
}

export function getAiPrivacy(): AiPrivacy { return current; }

/** False until the choices have been read. Until then every entry and feature counts as hidden from AI. */
export function aiPrivacyLoaded(privacy: AiPrivacy = current): boolean { return unreadOf(privacy) === undefined; }

/** The choices were looked for and couldn't be read in this browser (not merely "not read yet"). */
export function aiPrivacyUnreadable(privacy: AiPrivacy = current): boolean { return unreadOf(privacy) === 'unreadable'; }

export function subscribeAiPrivacy(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const union = <T,>(a: readonly T[], b: readonly T[]): T[] => [...new Set([...a, ...b])];
const sameSet = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every(x => b.includes(x));
const same = (a: AiPrivacy, b: AiPrivacy) =>
  a.appEnabled === b.appEnabled && sameSet(a.hiddenTopicIds, b.hiddenTopicIds) && sameSet(a.hiddenFeatures, b.hiddenFeatures);

/**
 * What this browser believes, from the two stored copies. `sealed` is the
 * sealed copy already opened (undefined: there is none, or it didn't open);
 * `stored` says a sealed copy is there at all. Null: nothing can be trusted and
 * everything stays hidden — the sealed copy is there but didn't open, or this
 * browser has seen one before and it is now missing or older.
 *
 * The server's copy can only restrict: what it hides is added to what the
 * sealed copy hides, and the Chronicles AI app is on only when both say so (a
 * switch-off that reached the server but not the sealed copy still stands).
 */
function believed(sealed: unknown, readable: unknown, stored: boolean): AiPrivacy | null {
  const mirror = parseAiPrivacy(readable);
  if (sealed === undefined) {
    // Never sealed yet (the first use): the readable copy is all there is. One
    // that is stored and won't open is not "never sealed": the server's copy
    // must not stand in for it
    return stored || seenRevision(AI_PRIVACY_SEALED_KEY) > 0 ? null : mirror;
  }
  const own = parseAiPrivacy(sealed);
  return {
    appEnabled: own.appEnabled && mirror.appEnabled,
    hiddenTopicIds: union(own.hiddenTopicIds, mirror.hiddenTopicIds),
    hiddenFeatures: union(own.hiddenFeatures, mirror.hiddenFeatures),
  };
}

/**
 * From the settings loaded at startup: the sealed copy as opened
 * (`settingsMap.aiPrivacySealed`) and the readable one (`settingsMap.aiPrivacy`).
 * `sealedStored`: the server holds a sealed copy at all (`sealedCopyStored`), so
 * one that didn't open is told apart from one that was never made.
 * A readable copy that says something else is put right for the server.
 */
export function loadAiPrivacy(sealed: unknown, readable: unknown, sealedStored: boolean): void {
  const next = believed(sealed, readable, sealedStored);
  if (!next) {
    console.warn('The "Don’t share with AI" choices could not be read. Everything stays hidden from AI.');
    setCurrent(UNREADABLE);
    return;
  }
  setCurrent(next);
  if (!same(next, parseAiPrivacy(readable))) {
    void settingsApi.upsert(AI_PRIVACY_KEY, next).catch(() => { /* put right at the next load */ });
  }
}

/** Whether the settings as downloaded hold a sealed copy of the choices (opened or not). */
export function sealedCopyStored(rows: readonly { key: string; value: unknown }[]): boolean {
  return rows.some(r => r.key === AI_PRIVACY_SEALED_KEY && r.value !== undefined && r.value !== null);
}

/** Forget it (the session ended). */
export function clearAiPrivacy(): void {
  marked.clear();
  if (pending) { clearTimeout(pending); pending = null; }
  setCurrent(NOT_LOADED);
}

/** Read both copies again from the server (another tab or device may have changed them). */
async function refreshAiPrivacy(): Promise<AiPrivacy> {
  const rows = await settingsApi.getSome([AI_PRIVACY_SEALED_KEY, AI_PRIVACY_KEY]);
  const value = (key: string) => rows.find(r => r.key === key)?.value;
  const raw = value(AI_PRIVACY_SEALED_KEY);
  let sealed: unknown;
  if (isSealed(raw)) {
    const cipher = recordCipher();
    try {
      sealed = await openSetting(AI_PRIVACY_SEALED_KEY, raw,
        (ciphertext, iv, aad) => cipher.decryptBytes(ciphertext, iv, aad));
    } catch { sealed = undefined; }
  }
  const next = believed(sealed, value(AI_PRIVACY_KEY), raw !== undefined && raw !== null);
  if (!next) throw new Error('The "Don’t share with AI" choices could not be read');
  setCurrent(next);
  return next;
}

/**
 * Change the choices. The change is made to what the server holds now, not to
 * this tab's copy, so a tab left open can't undo a choice made elsewhere.
 *
 * Ordered so a failure part way never leaves more shared than before or than
 * asked for:
 *  1. the server's copy takes whatever the change restricts (the AI app off —
 *     which ends its sessions — and anything newly hidden), keeping what was
 *     hidden before, and the entries of a newly hidden topic are marked on
 *     the server's list at once: the topic's switch alone hides only its name;
 *  2. the sealed copy takes the change;
 *  3. the server's copy takes the rest (the AI app on, anything shared again).
 *     Before the AI app is switched on, the server's list of hidden entries is
 *     brought in line, so it never signs in to a list that is behind.
 * This tab shows each step as the server takes it: what was restricted at
 * once, the rest only when the last write is in. If a later one fails, what
 * is left is the restricted state, which the next load also arrives at.
 *
 * Two devices changing the choices in the same moment each build step 1 from
 * their own read, and one could drop what the other hid. So the result is read
 * back, and a change that didn't hold is made once more on what is there.
 */
export async function updateAiPrivacy(change: (now: AiPrivacy) => AiPrivacy): Promise<void> {
  await applyChange(change);
  const after = await refreshAiPrivacy();
  if (!same(after, parseAiPrivacy(change(after)))) await applyChange(change);
}

async function applyChange(change: (now: AiPrivacy) => AiPrivacy): Promise<void> {
  const before = await refreshAiPrivacy();
  const next = parseAiPrivacy(change(before));
  const restricted: AiPrivacy = {
    appEnabled: before.appEnabled && next.appEnabled,
    hiddenTopicIds: union(before.hiddenTopicIds, next.hiddenTopicIds),
    hiddenFeatures: union(before.hiddenFeatures, next.hiddenFeatures),
  };
  const restricts = !same(restricted, before);
  const hidesTopic = next.hiddenTopicIds.some(t => !before.hiddenTopicIds.includes(t));
  const switchesAppOn = next.appEnabled && !before.appEnabled;
  // Both need every entry to hand: with the journal still loading, the entries
  // to mark can't be found, and nothing is changed rather than half of it
  if ((hidesTopic || switchesAppOn) && !useEntriesStore.getState().isInitialized) {
    throw new Error('The journal is still loading');
  }
  if (restricts) {
    await settingsApi.upsert(AI_PRIVACY_KEY, restricted);
    setCurrent(restricted);
    if (hidesTopic) await reconcileAiHidden();
  }
  const sealed = await sealSetting(AI_PRIVACY_SEALED_KEY, next, recordCipher().encryptBytes);
  await trackGuardedSave(AI_PRIVACY_SEALED_KEY, () => settingsApi.upsert(AI_PRIVACY_SEALED_KEY, sealed));
  // Judged by what this tab holds now, which hides at least as much as `next`
  if (switchesAppOn) await reconcileAiHidden();
  if (!restricts || !same(next, restricted)) await settingsApi.upsert(AI_PRIVACY_KEY, next);
  setCurrent(next);
  // Topics taken off the list: their entries are shared again — each only if
  // the server's copy is the one held here (another device may have hidden it since)
  const reopened = before.hiddenTopicIds.filter(t => !next.hiddenTopicIds.includes(t));
  if (reopened.length) {
    const entries: readonly EntryLike[] = useEntriesStore.getState().decryptedEntries;
    await shareAgainIfUnchanged(
      entries.filter(e => { const t = topicOf(e.metadata as Meta | null); return t !== null && reopened.includes(t); }), next);
  }
}

/**
 * The way out when the choices can't be read in this browser (the sealed copy
 * is missing, or older than one this browser has seen — a restored database,
 * say). Nothing else can change them in that state, and the server would go on
 * honouring its own copy, so the Chronicles AI app would keep working with no
 * switch to stop it.
 *
 * Starts again from what the server holds: every topic and feature it lists
 * stays hidden, and the Chronicles AI app is switched off (its sessions end).
 * The server's copy is written first, so the app stops even if sealing the new
 * copy then fails. Nothing is shared that wasn't before; the list is shown
 * again afterwards for the owner to check.
 */
export async function resetAiPrivacy(): Promise<void> {
  const rows = await settingsApi.getSome([AI_PRIVACY_KEY]);
  const mirror = parseAiPrivacy(rows.find(r => r.key === AI_PRIVACY_KEY)?.value);
  const next: AiPrivacy = { appEnabled: false, hiddenTopicIds: mirror.hiddenTopicIds, hiddenFeatures: mirror.hiddenFeatures };
  await settingsApi.upsert(AI_PRIVACY_KEY, next);
  const sealed = await sealSetting(AI_PRIVACY_SEALED_KEY, next, recordCipher().encryptBytes);
  await trackGuardedSave(AI_PRIVACY_SEALED_KEY, () => settingsApi.upsert(AI_PRIVACY_SEALED_KEY, sealed));
  setCurrent(next);
  await reconcileAiHidden();
}

// ---------------------------------------------------------------------------
// Which entries are hidden
// ---------------------------------------------------------------------------

type Meta = Record<string, unknown>;
type EntryLike = Pick<DecryptedPost, 'id' | 'metadata'> & { updatedAt?: Date | string };

const topicOf = (meta: Meta | null | undefined): number | null => {
  const t = meta?._taxonomyId;
  return typeof t === 'number' ? t : typeof t === 'string' && /^\d+$/.test(t) ? Number(t) : null;
};

/** Hidden by its own switch or because its topic is on the list. Everything is, until the choices have been read. */
export function isHiddenFromAi(meta: Meta | null | undefined, privacy: AiPrivacy = current): boolean {
  if (!aiPrivacyLoaded(privacy)) return true;
  if (meta?.[AI_HIDDEN_META] === true) return true;
  const topic = topicOf(meta);
  return topic !== null && privacy.hiddenTopicIds.includes(topic);
}

/** A topic on the list: not even its name goes to an AI. Every topic is, until the choices have been read. */
export function topicHiddenFromAi(topicId: number, privacy: AiPrivacy = current): boolean {
  return !aiPrivacyLoaded(privacy) || privacy.hiddenTopicIds.includes(topicId);
}

/** The entries an AI feature may send. Every AI feature goes through this. */
export function visibleToAi<T extends EntryLike>(entries: readonly T[], privacy: AiPrivacy = current): T[] {
  return entries.filter(e => !isHiddenFromAi(e.metadata as Meta | null, privacy));
}

/** A feature outside entries (doses, habits, bills, the vision) the person keeps from AI. */
export function featureHiddenFromAi(key: AiFeatureKey, privacy: AiPrivacy = current): boolean {
  return !aiPrivacyLoaded(privacy) || privacy.hiddenFeatures.includes(key);
}

// ---------------------------------------------------------------------------
// Telling the server (for the Chronicles AI app)
// ---------------------------------------------------------------------------

/* Ids this browser marked hidden on the server a moment ago, so an entry being
   typed in (a save every few seconds) is marked once, not on every save. Short
   lived: another device may share the entry again meanwhile. */
const MARKED_MS = 2 * 60 * 1000;
const marked = new Map<number, number>();
const CHUNK = 5000;

async function setOnServer(ids: number[], hidden: boolean): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    // Forgotten first: if the request fails, the next save asks again
    for (const id of part) marked.delete(id);
    await aiHiddenApi.set(part, hidden);
    if (hidden) { const now = Date.now(); for (const id of part) marked.set(id, now); }
  }
}

const markedLately = (id: number) => Date.now() - (marked.get(id) ?? 0) < MARKED_MS;

/**
 * Marks waiting to be sent together: an import encrypts its entries one by
 * one and creates them a batch at a time, and one request per entry would run
 * a large import into the request limit. `flushAiMarks` sends them, and MUST
 * be awaited before the batch is created.
 */
export interface AiMarkBatch { ids: number[] }
export const newAiMarkBatch = (): AiMarkBatch => ({ ids: [] });

export async function flushAiMarks(batch: AiMarkBatch): Promise<void> {
  const ids = batch.ids.splice(0);
  if (ids.length) await setOnServer(ids, true);
}

/**
 * A new entry that will be hidden is marked before it exists, so there is no
 * moment the AI app could read it. Called with the reserved id, before create.
 * With a `batch` the mark waits there for `flushAiMarks`.
 */
export async function markHiddenBeforeCreate(id: number, meta: Meta, batch?: AiMarkBatch): Promise<void> {
  if (!isHiddenFromAi(meta)) return;
  if (batch) batch.ids.push(id);
  else await setOnServer([id], true);
}

/**
 * Before an existing entry is saved. One that is hidden is marked first (the
 * save waits for it: if the server can't be told, the save fails rather than
 * leaving the entry readable). One that was hidden and no longer is — the
 * switch turned off here, or moved out of a hidden topic — is shared again,
 * once the choices have been read afresh.
 */
export async function markHiddenOnSave(id: number, meta: Meta): Promise<void> {
  if (isHiddenFromAi(meta)) {
    if (!markedLately(id)) await setOnServer([id], true);
    return;
  }
  const before = useEntriesStore.getState().decryptedEntries.find(e => e.id === id);
  const wasHidden = markedLately(id) || (!!before && isHiddenFromAi(before.metadata as Meta | null));
  if (!wasHidden) return;
  try {
    const fresh = await refreshAiPrivacy();
    if (!isHiddenFromAi(meta, fresh)) await setOnServer([id], false);
    else await setOnServer([id], true);
  } catch (err) {
    // Not shared again yet: it stays hidden (the safe side) until the next load
    console.warn('Hidden-from-AI list not updated yet:', err instanceof Error ? err.message : err);
  }
}

/**
 * Bring the server's list in line with the entries held here. It always adds
 * what is missing. It takes entries OFF the list only with `prune`, which is
 * for the moment right after a fresh load: a copy that has sat in memory may
 * be older than a choice made in another tab or on another device.
 */
export async function reconcileAiHidden(
  { prune = false, entries = useEntriesStore.getState().decryptedEntries }: { prune?: boolean; entries?: readonly EntryLike[] } = {},
): Promise<void> {
  if (!aiPrivacyLoaded()) return;
  const want = new Set(entries.filter(e => isHiddenFromAi(e.metadata as Meta | null)).map(e => e.id));
  const { ids } = await aiHiddenApi.list();
  const have = new Set(ids);
  await setOnServer([...want].filter(id => !have.has(id)), true);
  if (!prune) return;
  // Only entries this browser knows: an id marked before its create stays
  const known = new Map(entries.map(e => [e.id, e]));
  const candidates = ids.filter(id => known.has(id) && !want.has(id));
  if (!candidates.length) return;
  // The entries and choices held here were read a moment ago, and another
  // device may have hidden something since. So before anything is shared
  // again the choices are read afresh (a topic hidden meanwhile keeps its
  // entries hidden), and each entry is checked against the server's copy
  const fresh = await refreshAiPrivacy();
  await shareAgainIfUnchanged(candidates.slice(0, PRUNE_PER_RUN).map(id => known.get(id)!), fresh);
}

/** How many entries one "when were these last saved?" request may name (the server's limit). */
const UPDATED_AT_CHUNK = 100;

/**
 * Share entries with AI again on the server's list — each only when it isn't
 * hidden under `privacy` and the server's copy is the very one held here. One
 * saved since this browser read it (another device may have ticked Hide) is
 * left alone until the next load. One small request for when they were last
 * saved, not a download of each; if it fails nothing is checked, so nothing is
 * shared again.
 */
async function shareAgainIfUnchanged(entries: readonly EntryLike[], privacy: AiPrivacy): Promise<void> {
  const held = entries.filter(e => !!e.updatedAt && !isHiddenFromAi(e.metadata as Meta | null, privacy));
  for (let i = 0; i < held.length; i += UPDATED_AT_CHUNK) {
    const part = held.slice(i, i + UPDATED_AT_CHUNK);
    let saved: { id: number; updatedAt: string }[];
    try { ({ entries: saved } = await aiHiddenApi.updatedAt(part.map(e => e.id))); } catch { return; }
    const savedAt = new Map(saved.map(e => [e.id, new Date(e.updatedAt).getTime()]));
    await setOnServer(part.filter(e => savedAt.get(e.id) === new Date(e.updatedAt!).getTime()).map(e => e.id), false);
  }
}

/** Entries shared again in one run (each is checked against the server first); the rest wait for the next load. */
const PRUNE_PER_RUN = 50;

let pending: ReturnType<typeof setTimeout> | null = null;

/** Reconcile a moment after things settle. `prune` only right after a fresh load. */
export function scheduleReconcile(delayMs = 1500, options: { prune?: boolean } = {}): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    void reconcileAiHidden(options).catch(err => console.warn('Hidden-from-AI list not updated yet:', err instanceof Error ? err.message : err));
  }, delayMs);
}

/** After a fresh load of the journal: keep the server's list in step (only for accounts that use any of this). */
export function reconcileAfterLoad(entries: readonly EntryLike[]): void {
  if (!aiPrivacyLoaded()) return;
  if (current.appEnabled || current.hiddenTopicIds.length > 0 || entries.some(e => (e.metadata as Meta | null)?.[AI_HIDDEN_META] === true)) {
    scheduleReconcile(3000, { prune: true });
  }
}
