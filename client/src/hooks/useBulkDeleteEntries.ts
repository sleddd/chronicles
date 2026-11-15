import { useCallback, useState } from 'react';
import type { DecryptedPost } from '@shared/crypto/types.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entries as entriesApi } from '../services/api.js';
import { removeEntriesLocally } from '../services/calendarSync.js';
import { collectImageKeys, bestEffortDeleteImages } from '../services/imageStorage.js';
import { filterDeletableImageKeys } from '../utils/entryActions.js';

/** Deletes several entries (the journal's select mode). With `alsoRemote`, linked
 *  events go from Google Calendar too, otherwise their sync links are stripped first. */
export function useBulkDeleteEntries() {
  const removeEntry = useEntriesStore(s => s.removeEntry);
  const [deleting, setDeleting] = useState(false);

  const deleteEntries = useCallback(async (selected: DecryptedPost[], alsoRemote: boolean) => {
    if (selected.length === 0) return;
    setDeleting(true);
    // R2 keys for entries whose delete succeeds — only those objects are removed,
    // so a failed entry delete never strips images from a surviving entry
    const cleanupKeys: string[] = [];
    try {
      if (alsoRemote) {
        // Plain deletes — the sync hook's deletion tracker propagates linked
        // entries to Google Calendar
        for (const entry of selected) {
          try {
            const imageKeys = collectImageKeys([entry]);
            await entriesApi.delete(entry.id);
            removeEntry(entry.id);
            cleanupKeys.push(...imageKeys);
          } catch (err) {
            console.error('Failed to delete entry:', err);
          }
        }
      } else {
        // Strip sync links first so nothing is deleted from Google Calendar
        await removeEntriesLocally(selected);
        // Per-entry failures are swallowed above — clean up only entries gone from the store
        const remaining = new Set(useEntriesStore.getState().decryptedEntries.map(e => e.id));
        cleanupKeys.push(...collectImageKeys(selected.filter(e => !remaining.has(e.id))));
      }
    } finally {
      // Skip objects still referenced by surviving entries (library reuse)
      const deletable = filterDeletableImageKeys(cleanupKeys);
      if (deletable.length > 0) void bestEffortDeleteImages(deletable);
      setDeleting(false);
    }
  }, [removeEntry]);

  return { deleteEntries, deleting };
}
