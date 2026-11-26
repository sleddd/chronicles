import { entries as entriesApi, ApiError } from '../services/api.js';
import { useTimeStore } from '../stores/timeStore.js';
import { useHabitStore } from '../stores/habitStore.js';
import { withoutHabit } from './habits.js';
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
  // Its tracked time goes with it
  useTimeStore.getState().apply(list => (list.some(x => x.entryId === entryId) ? list.filter(x => x.entryId !== entryId) : list));
  // A habit's check-ins go with it too
  useHabitStore.getState().apply(log => withoutHabit(log, entryId));
}

/**
 * Delete several entries the same way, 100 a request (the journal's Select
 * entries, Clear completed). They leave the store straight away. Any whose
 * request failed come back, with one short notice for the lot. Returns the ids
 * that were deleted. Never throws.
 */
export async function deleteEntriesWithImages(entryIds: number[]): Promise<number[]> {
  const ids = [...new Set(entryIds)];
  if (ids.length === 0) return [];
  const state = useEntriesStore.getState();
  const wanted = new Set(ids);
  const entries = state.decryptedEntries.filter(e => wanted.has(e.id));
  const raws = state.rawEntries.filter(e => wanted.has(e.id));
  for (const id of ids) state.removeEntry(id);

  const { deleted, error } = await entriesApi.deleteMany(ids);
  const gone = new Set(deleted);
  if (error !== undefined) {
    // What wasn't deleted goes back in the list
    const now = useEntriesStore.getState();
    const there = new Set(now.decryptedEntries.map(e => e.id));
    const back = entries.filter(e => !gone.has(e.id) && !there.has(e.id));
    const backIds = new Set(back.map(e => e.id));
    if (back.length > 0) {
      useEntriesStore.setState({
        decryptedEntries: [...back, ...now.decryptedEntries],
        rawEntries: [...raws.filter(r => backIds.has(r.id)), ...now.rawEntries],
      });
    }
    console.error('Failed to delete entries:', error instanceof Error ? error.message : 'Unknown error');
    showFlash(back.length === 1
      ? 'Couldn’t delete that entry, so it’s back in the list. Try again.'
      : `Couldn’t delete ${back.length} entries, so they’re back in the list. Try again.`);
  }
  if (deleted.length === 0) return [];

  // Photos no entry still uses (the deleted ones are already out of the store)
  const imageKeys = filterDeletableImageKeys(collectImageKeys(entries.filter(e => gone.has(e.id))));
  if (imageKeys.length > 0) void bestEffortDeleteImages(imageKeys);
  // Their tracked time and habit check-ins go with them
  useTimeStore.getState().apply(list => (list.some(x => gone.has(x.entryId)) ? list.filter(x => !gone.has(x.entryId)) : list));
  useHabitStore.getState().apply(log => deleted.reduce((next, id) => withoutHabit(next, id), log));
  return deleted;
}
