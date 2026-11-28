/*
 * What the Chronicles AI app changed (Settings → In-App AI → Chronicles AI app).
 *
 * The server can't see inside an encrypted save, so it can't hold the AI app
 * to "add and tick". Instead it keeps the version of anything the app
 * overwrites — an entry, a dose record, a bill, the habit log — still
 * encrypted, for 14 days (server/src/db/assistantHistory.ts). It does the
 * same for an entry the app deletes: a full copy is kept (until put back or
 * removed: it never expires, being the entry's only copy), and putting it back
 * brings the entry back as it was, under the same id. Here each kept version
 * is opened so it can be named, and one that is put back is shown in this tab
 * straight away.
 *
 * A version this browser can't open is never offered to put back: writing it
 * over the record would leave something unreadable.
 */
import type { DecryptedPost, EncryptedPost } from '@shared/crypto/types';
import { assistantChanges as api, entries as entriesApi, type AssistantChangeWire } from './api.js';
import { recordCipher } from './recordCipher.js';
import { isSealed, openSetting } from './settingCipher.js';
import { reconcileAiHidden } from './aiPrivacy.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useHabitStore } from '../stores/habitStore.js';
import { clearFinanceCache } from '../stores/financeStore.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { parseHabitLog } from '../utils/habits.js';
import { AI_HIDDEN_META } from '../utils/aiHiddenFlag.js';
import { DOSES_CHANGED } from '../hooks/useTodayDoses.js';

export type DecryptPosts = (posts: EncryptedPost[]) => Promise<DecryptedPost[]>;
/** EncryptionContext's encryptPost: seals an entry's text and metadata for a save. */
export type EncryptPost = (id: number, content: string, metadata: Record<string, unknown>) =>
  Promise<{ contentEncrypted: string; contentIv: string; metadataEncrypted: string; metadataIv: string }>;

/** The version was put back, but its "Hide from AI" switch couldn't be saved on it. */
export class HideNotKept extends Error {
  constructor() { super('Put back. Its Hide from AI switch didn’t save, so open it and tick Hide again.'); }
}

export interface ShownChange {
  id: number;
  kind: AssistantChangeWire['kind'];
  /** "Task", "Dose", "Bill", "Habit check-ins" */
  what: string;
  /** The copy of an entry the AI app deleted (putting it back brings the entry back) */
  deleted: boolean;
  /** Its name as it was ("Call the dentist"), when it has one */
  name: string;
  savedAt: string;
  /** False: this browser can't open it, so it can't be put back */
  canRestore: boolean;
  wire: AssistantChangeWire;
}

const FAILED = '[Decryption failed]';
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The copy of an entry the AI app deleted, rather than an earlier version of one that is still there. */
export const isDeletedEntry = (c: AssistantChangeWire): boolean => c.kind === 'entry' && c.extra?.deleted === true;

/** A time the server kept with a deleted entry's copy, or the time the copy was made. */
const keptTime = (c: AssistantChangeWire, key: 'createdAt' | 'updatedAt') => {
  const at = isDeletedEntry(c) && typeof c.extra?.[key] === 'string' ? new Date(c.extra[key] as string) : new Date(NaN);
  return Number.isNaN(at.getTime()) ? new Date(c.savedAt) : at;
};

function asPost(c: AssistantChangeWire): EncryptedPost {
  return {
    id: Number(c.ref), contentEncrypted: c.body, contentIv: c.bodyIv, metadataEncrypted: c.meta, metadataIv: c.metaIv, isEncrypted: true,
    createdAt: keptTime(c, 'createdAt'), updatedAt: keptTime(c, 'updatedAt'),
  };
}

async function openEntry(c: AssistantChangeWire, decryptPosts: DecryptPosts): Promise<DecryptedPost | null> {
  if (!c.body || !c.bodyIv || !c.meta || !c.metaIv || !/^\d+$/.test(c.ref)) return null;
  try {
    const [post] = await decryptPosts([asPost(c)]);
    return post && post.content !== FAILED ? post : null;
  } catch { return null; }
}

/** Open one kept version far enough to name it. */
export async function describeChange(c: AssistantChangeWire, decryptPosts: DecryptPosts): Promise<ShownChange> {
  const shown = (what: string, name: string, canRestore: boolean): ShownChange =>
    ({ id: c.id, kind: c.kind, what, deleted: isDeletedEntry(c), name, savedAt: c.savedAt, canRestore, wire: c });
  const { decryptedEntries, allTopics } = useEntriesStore.getState();
  try {
    if (c.kind === 'entry') {
      const post = await openEntry(c, decryptPosts);
      if (!post) return shown('Entry', '', false);
      const topicId = (post.metadata as Record<string, unknown> | null)?._taxonomyId;
      const topic = allTopics.find(t => t.id === topicId)?.name ?? 'Entry';
      return shown(sentence(topic), entryTitleText(post.content), true);
    }
    if (c.kind === 'dose') {
      const date = text(c.extra?.date);
      if (!c.body || !c.bodyIv || !date) return shown('Dose', '', false);
      const p = await recordCipher().decrypt<{ medicationPostId?: number; scheduledTime?: string; status?: string }>('dose', `${c.ref}|${date}`, c.body, c.bodyIv);
      const med = decryptedEntries.find(e => e.id === p.medicationPostId);
      const name = [med ? entryTitleText(med.content) : 'A medication', date, text(p.status)].filter(Boolean).join(' · ');
      return shown('Dose', name, true);
    }
    if (c.kind === 'bill') {
      if (!c.body || !c.bodyIv) return shown('Bill', '', false);
      const bill = await recordCipher().decrypt<{ name?: string }>('bills', c.ref, c.body, c.bodyIv);
      return shown('Bill', text(bill.name), true);
    }
    // The habit log (the only setting the AI app writes)
    const value = c.extra?.value;
    if (c.ref !== 'habitLog' || !isSealed(value)) return shown('Setting', '', false);
    const cipher = recordCipher();
    await openSetting('habitLog', value, (ct, iv, aad) => cipher.decryptBytes(ct, iv, aad));
    return shown('Habit check-ins', '', true);
  } catch {
    const what = c.kind === 'entry' ? 'Entry' : c.kind === 'dose' ? 'Dose' : c.kind === 'bill' ? 'Bill' : 'Setting';
    return shown(what, '', false);
  }
}

export async function loadChanges(decryptPosts: DecryptPosts, before?: number): Promise<{ changes: ShownChange[]; more: boolean }> {
  const page = await api.list(before);
  return { changes: await Promise.all(page.changes.map(c => describeChange(c, decryptPosts))), more: page.more };
}

/**
 * Put a version back, then show it in this tab: the entry in the journal, the
 * dose lists, the bills, the habit check-ins.
 *
 * An entry that is hidden from AI now stays hidden: the version put back is
 * from before the AI app changed it, and may be from before the owner ticked
 * Hide. The switch is saved onto it again (HideNotKept if that fails — the
 * entry then still counts as hidden here and on the server's list until the
 * next load).
 */
export async function restoreChange(change: ShownChange, decryptPosts: DecryptPosts, encryptPost: EncryptPost): Promise<void> {
  if (!change.canRestore) throw new Error('That version can’t be opened in this browser');
  const store = useEntriesStore.getState();
  const wasHidden = change.kind === 'entry'
    && (store.decryptedEntries.find(e => e.id === Number(change.wire.ref))?.metadata as Record<string, unknown> | null | undefined)?.[AI_HIDDEN_META] === true;
  const restored = await api.restore(change.id);
  if (isDeletedEntry(restored)) {
    // An entry the AI app deleted, back under its own id: into the journal
    // now (the next sync brings the same entry, by id)
    const post = await openEntry(restored, decryptPosts);
    if (post) {
      const now = useEntriesStore.getState();
      if (now.decryptedEntries.some(e => e.id === post.id)) now.updateDecryptedEntry(post.id, { content: post.content, metadata: post.metadata });
      else now.addDecryptedEntry(post);
    }
    // Its topic may have been kept from AI since it was deleted: the server's list catches up
    void reconcileAiHidden().catch(() => { /* brought in line at the next load */ });
  } else if (restored.kind === 'entry') {
    const post = await openEntry(restored, decryptPosts);
    if (post) {
      const meta = (post.metadata ?? {}) as Record<string, unknown>;
      const hidden = wasHidden || meta[AI_HIDDEN_META] === true;
      // Said either way: the store keeps "Hide from AI" unless told otherwise (utils/aiHiddenFlag)
      useEntriesStore.getState().updateDecryptedEntry(post.id, { content: post.content, metadata: { ...meta, [AI_HIDDEN_META]: hidden } });
      if (hidden && meta[AI_HIDDEN_META] !== true) {
        try {
          // encryptPost marks it on the server's list before the save (services/aiPrivacy)
          const sealed = await encryptPost(post.id, post.content, { ...meta, [AI_HIDDEN_META]: true });
          await entriesApi.update(post.id, sealed);
        } catch {
          throw new HideNotKept();
        }
      } else {
        // A version that was hidden from AI is hidden again on the server's list
        void reconcileAiHidden().catch(() => { /* brought in line at the next load */ });
      }
    }
  } else if (restored.kind === 'dose') {
    window.dispatchEvent(new Event(DOSES_CHANGED));
  } else if (restored.kind === 'bill') {
    clearFinanceCache();
  } else if (restored.ref === 'habitLog' && isSealed(restored.extra?.value)) {
    const cipher = recordCipher();
    const log = await openSetting('habitLog', restored.extra.value, (ct, iv, aad) => cipher.decryptBytes(ct, iv, aad));
    useHabitStore.setState({ log: parseHabitLog(log) });
  }
}

export const dismissChange = (id: number) => api.remove(id);
export const clearChanges = () => api.clear();
