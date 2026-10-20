import { entries as entriesApi, ApiError } from '../services/api.js';
import { showFlash } from '../services/flashNotice.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { collectImageKeys, bestEffortDeleteImages } from '../services/imageStorage.js';

/**
 * Images can be attached to more than one entry (added from the library), so
 * R2 objects may only be deleted when no OTHER entry still references them.
 * Returns the subset of keys not referenced by any entry outside excludeIds.
 */
export function filterDeletableImageKeys(keys: string[], excludeEntryIds: number[] = []): string[] {
  if (keys.length === 0) return keys;
  const exclude = new Set(excludeEntryIds);
  const others = useEntriesStore.getState().decryptedEntries.filter(e => !exclude.has(e.id));
  const referenced = new Set(collectImageKeys(others));
  return keys.filter(k => !referenced.has(k));
}

/**
 * Delete an entry everywhere: server row, store, and best-effort cleanup of
 * its encrypted image objects in the user's R2 bucket. The entry leaves the
 * store straight away (so a slow server never leaves it sitting in a list).
 * If the server delete fails it comes back, a short notice says so, and this
 * throws. A 404 means it was already gone, which counts as done. Image
 * cleanup never blocks, and objects still referenced by other entries are
 * left in the bucket.
 */
export async function deleteEntryWithImages(entryId: number): Promise<void> {
  const state = useEntriesStore.getState();
  const entry = state.decryptedEntries.find(e => e.id === entryId);
  const raw = state.rawEntries.find(e => e.id === entryId);
  const imageKeys = entry ? filterDeletableImageKeys(collectImageKeys([entry]), [entryId]) : [];
  state.removeEntry(entryId);
  try {
    await entriesApi.delete(entryId);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) {
      const now = useEntriesStore.getState();
      if (entry && !now.decryptedEntries.some(e => e.id === entryId)) {
        useEntriesStore.setState({
          decryptedEntries: [entry, ...now.decryptedEntries],
          rawEntries: raw ? [raw, ...now.rawEntries] : now.rawEntries,
        });
      }
      showFlash('Couldn’t delete that entry, so it’s back in the list. Try again.');
      throw err;
    }
  }
  if (imageKeys.length > 0) void bestEffortDeleteImages(imageKeys);
}
