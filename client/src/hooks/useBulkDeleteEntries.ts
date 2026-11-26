import { useCallback, useState } from 'react';
import type { DecryptedPost } from '@shared/crypto/types.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { removeEntriesLocally } from '../services/calendarSync.js';
import { collectImageKeys, bestEffortDeleteImages } from '../services/imageStorage.js';
import { filterDeletableImageKeys, deleteEntriesWithImages } from '../utils/entryActions.js';

/** Deletes several entries (the journal's select mode). With `alsoRemote`, linked
 *  events go from Google Calendar too, otherwise their sync links are stripped first. */
export function useBulkDeleteEntries() {
  const [deleting, setDeleting] = useState(false);

  const deleteEntries = useCallback(async (selected: DecryptedPost[], alsoRemote: boolean) => {
    if (selected.length === 0) return;
    setDeleting(true);
    try {
      if (alsoRemote) {
        // Plain deletes, 100 a request. The sync hook's deletion tracker
        // propagates linked entries to Google Calendar. Photos, tracked time
        // and habit check-ins go with them (deleteEntriesWithImages)
        await deleteEntriesWithImages(selected.map(e => e.id));
      } else {
        // Strip sync links first so nothing is deleted from Google Calendar
        await removeEntriesLocally(selected);
        // Failures are swallowed there. Clean up only entries gone from the store,
        // and skip objects still referenced by surviving entries (library reuse)
        const remaining = new Set(useEntriesStore.getState().decryptedEntries.map(e => e.id));
        const deletable = filterDeletableImageKeys(collectImageKeys(selected.filter(e => !remaining.has(e.id))));
        if (deletable.length > 0) void bestEffortDeleteImages(deletable);
      }
    } finally {
      setDeleting(false);
    }
  }, []);

  return { deleteEntries, deleting };
}
