import { useEffect, useRef } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import {
  runCalendarSync,
  enqueuePendingDelete,
  getSyncTopicMap,
  type SyncRuntimeDeps,
} from '../services/calendarSync.js';
import type { EntrySyncState } from '../types/calendarSync.js';
import type { DecryptedPost } from '@shared/crypto/types';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const EDIT_DEBOUNCE_MS = 3000;

interface TrackedEntry {
  googleEventId: string;
  calendarId: string;
}

/** Map of entryId → remote ids for all currently-synced entries. */
function buildTrackedMap(entries: DecryptedPost[]): Map<number, TrackedEntry> {
  const map = new Map<number, TrackedEntry>();
  for (const entry of entries) {
    const sync = (entry.metadata?._customFields as Record<string, unknown> | undefined)?._sync as EntrySyncState | undefined;
    if (sync?.googleEventId) {
      map.set(entry.id, { googleEventId: sync.googleEventId, calendarId: sync.calendarId });
    }
  }
  return map;
}

/** Cheap fingerprint of the syncable fields of all event/meeting entries (excludes _sync). */
function buildFingerprint(entries: DecryptedPost[]): string {
  const topicMap = getSyncTopicMap();
  const parts: string[] = [];
  for (const entry of entries) {
    const taxonomyId = entry.metadata?._taxonomyId as number | undefined;
    if (!taxonomyId || !topicMap.has(taxonomyId)) continue;
    const { _sync, ...fields } = (entry.metadata?._customFields || {}) as Record<string, unknown>;
    parts.push(`${entry.id}:${JSON.stringify(fields)}:${entry.content.length}`);
  }
  return parts.sort().join('|');
}

/**
 * Mounts the calendar sync engine. Triggers a sync on unlock, on an interval
 * while visible, on tab focus, and (debounced) after local entry edits; tracks
 * local deletions of synced entries so their Google events get removed.
 */
export function useCalendarSync(): void {
  const { encryptPost, encryptNewPost, isUnlocked } = useEncryption();
  const calendarSyncEnabled = useUIStore(s => s.calendarSyncEnabled);
  const googleCalendarId = useUIStore(s => s.googleCalendarId);
  const isInitialized = useEntriesStore(s => s.isInitialized);

  const depsRef = useRef<SyncRuntimeDeps>({ encryptPost, encryptNewPost });
  depsRef.current = { encryptPost, encryptNewPost };

  useEffect(() => {
    if (!calendarSyncEnabled || !isUnlocked || !isInitialized) return;

    const kick = () => { void runCalendarSync(depsRef.current); };
    kick();

    const interval = setInterval(() => {
      if (!document.hidden) kick();
    }, SYNC_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let prevTracked = buildTrackedMap(useEntriesStore.getState().decryptedEntries);
    let prevFingerprint = buildFingerprint(useEntriesStore.getState().decryptedEntries);

    const unsubscribe = useEntriesStore.subscribe((state) => {
      if (!state.isInitialized) {
        // Store was cleared (logout) — reset without treating it as mass deletion
        prevTracked = new Map();
        prevFingerprint = '';
        return;
      }

      const tracked = buildTrackedMap(state.decryptedEntries);
      for (const [id, remote] of prevTracked) {
        if (!tracked.has(id)) enqueuePendingDelete(remote);
      }
      prevTracked = tracked;

      const fingerprint = buildFingerprint(state.decryptedEntries);
      if (fingerprint !== prevFingerprint) {
        prevFingerprint = fingerprint;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(kick, EDIT_DEBOUNCE_MS);
      }
    });

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [calendarSyncEnabled, isUnlocked, isInitialized, googleCalendarId]);
}
