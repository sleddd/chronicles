import { useEffect } from 'react';
import type { DecryptedPost, EncryptedPost } from '@shared/crypto/types';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entries as entriesApi } from '../services/api.js';
import { validEntryRows } from '../utils/entryRows.js';
import { keyGone } from '../utils/decryptEntries.js';

/** How often an open, visible tab asks what changed */
export const ENTRY_SYNC_MS = 60_000;
/** Coming back to the tab asks at once, but not more often than this */
const MIN_GAP_MS = 10_000;

function toEncrypted(e: Record<string, unknown>): EncryptedPost {
  return {
    id: e.id as number,
    contentEncrypted: (e.contentEncrypted as string) || null,
    contentIv: (e.contentIv as string) || null,
    metadataEncrypted: (e.metadataEncrypted as string) || null,
    metadataIv: (e.metadataIv as string) || null,
    isEncrypted: e.isEncrypted as boolean,
    content: e.content as string | undefined,
    metadata: e.metadata as Record<string, unknown> | undefined,
    createdAt: new Date(e.createdAt as string),
    updatedAt: new Date((e.updatedAt || e.createdAt) as string),
  };
}

/**
 * Entries written elsewhere — another device, the Chronicles AI app — reach an
 * open tab without signing in again: when the tab comes back into view and
 * once a minute while it's visible, only what changed since this browser's
 * copy is downloaded, opened and merged into the store. An entry this tab
 * holds a newer copy of (a save that landed after the request) is kept.
 * The editor never switches on store updates (JournalView `shownRef`), so
 * nothing being typed is overwritten.
 */
export function useEntrySync(): void {
  const { isUnlocked, decryptPosts } = useEncryption();
  const isInitialized = useEntriesStore(s => s.isInitialized);

  useEffect(() => {
    if (!isUnlocked || !isInitialized) return;
    let cancelled = false;
    let running = false;
    let lastAt = Date.now();

    const pull = async () => {
      if (running || cancelled || document.visibilityState !== 'visible') return;
      running = true;
      lastAt = Date.now();
      try {
        const changes = await entriesApi.changesSince();
        if (!changes || cancelled) return;
        const { entries, deleted } = changes;
        if (!entries.length && !deleted.length) return;
        const encrypted = validEntryRows(entries).map(toEncrypted);
        const opened: DecryptedPost[] = [];
        for (const post of encrypted) {
          try { opened.push(...await decryptPosts([post])); } catch (err) {
            if (keyGone(err)) return;
            console.warn(`Entry ${post.id} changed elsewhere but didn't open:`, err);
          }
        }
        if (cancelled) return;
        mergeChanges(encrypted, opened, deleted);
      } catch (err) {
        // A failed check (offline, rate limited) just waits for the next one
        if (!cancelled) console.warn('Checking for changes failed:', err instanceof Error ? err.message : err);
      } finally {
        running = false;
      }
    };

    const onVisible = () => { if (Date.now() - lastAt >= MIN_GAP_MS) void pull(); };
    const id = setInterval(pull, ENTRY_SYNC_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isUnlocked, isInitialized, decryptPosts]);
}

const newer = (a: { updatedAt: Date }, b: { updatedAt: Date } | undefined) =>
  !b || new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime();

/** Changed entries replace (or join) the store's, deleted ones leave; newest first as at load */
export function mergeChanges(encrypted: EncryptedPost[], opened: DecryptedPost[], deleted: number[]): void {
  useEntriesStore.setState(s => {
    const gone = new Set(deleted);
    const raw = new Map(s.rawEntries.map(e => [e.id, e]));
    const dec = new Map(s.decryptedEntries.map(e => [e.id, e]));
    for (const e of encrypted) if (newer(e, raw.get(e.id))) raw.set(e.id, e);
    for (const e of opened) if (newer(e, dec.get(e.id))) dec.set(e.id, e);
    for (const id of gone) { raw.delete(id); dec.delete(id); }
    const byNewest = <T extends { createdAt: Date }>(a: T, b: T) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return {
      rawEntries: [...raw.values()].sort(byNewest),
      decryptedEntries: [...dec.values()].sort(byNewest),
    };
  });
}
