import { useEntriesStore } from '../stores/entriesStore.js';
import { bestEffortDeleteImages, collectImageKeys, type EntryImage } from './imageStorage.js';
import { storedImageKeys } from '../utils/storedImage.js';

/**
 * A photo a setting no longer uses (a background replaced or removed): its objects
 * are deleted from the person's bucket unless an entry still has the photo. Call it
 * after the owner's new pins are set (pinImageKeys) — photos another setting still
 * uses are pinned and stay. Skipped until the journal is loaded, since "no entry has
 * it" can't be known before then.
 */
export function dropUnusedImage(image: EntryImage | null | undefined): void {
  if (!image) return;
  const { decryptedEntries, isInitialized } = useEntriesStore.getState();
  if (!isInitialized) return;
  const inEntries = new Set(collectImageKeys(decryptedEntries));
  const keys = storedImageKeys(image).filter(k => !inEntries.has(k));
  if (keys.length) void bestEffortDeleteImages(keys);
}

/**
 * Save a setting whose photo changed from `old` to `next`, and only then let the old
 * photo go: a save that failed leaves the server naming the old photo, so it must
 * still be there. The caller pins the new photo's keys before calling. When the save
 * fails, `repin` puts the old pins back and a photo uploaded just for this is removed
 * (one taken from the library stays — its entry has it). True once saved.
 */
export async function replaceStoredImage({ old, next, save, repin }: {
  old: EntryImage | null | undefined;
  next: EntryImage | null | undefined;
  save: () => Promise<unknown>;
  repin: () => void;
}): Promise<boolean> {
  const changed = old?.key !== next?.key;
  try {
    await save();
  } catch (err) {
    console.error('Saving a background photo failed:', err instanceof Error ? err.message : err);
    repin();
    if (changed) dropUnusedImage(next);
    return false;
  }
  if (changed) dropUnusedImage(old);
  return true;
}
