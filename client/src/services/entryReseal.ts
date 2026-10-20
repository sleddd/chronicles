import type { DecryptedPost, EncryptedPostData } from '@shared/crypto/types.js';
import { entries as entriesApi, settings as settingsApi } from './api.js';
import { sealSetting, type EncryptBytes } from './settingCipher.js';
import { sealMarkerHeld, noteSealMarker } from './sealedFormats.js';
import { useEntriesStore } from '../stores/entriesStore.js';

/*
 * Entries are encrypted bound to their id (v3 AAD,
 * shared/src/crypto/encryptionService.ts). Entries from before — v2, bound
 * only to the other half's IV, and the no-AAD pair before that — still open
 * while an account is moving over: they're re-saved in the v3 format once
 * (`resealOlderEntries`), and then the sealed marker `entriesSealV3` is
 * written. Once the marker exists older formats are refused, so an old
 * ciphertext the server kept can't be served as another entry.
 */

export const ENTRIES_SEAL_MARKER = 'entriesSealV3';

let allowOlder = false;

/** Whether entries in a format from before id binding may still be opened (only before the marker). */
export function olderEntriesAllowed(): boolean {
  return allowOlder;
}

/** Set at startup from whether the server has the marker (backed by sealedFormats.ts). */
export function setOlderEntriesFromMarker(markerOnServer: boolean): void {
  allowOlder = !sealMarkerHeld(ENTRIES_SEAL_MARKER, markerOnServer);
}

// New entries need their id before they're encrypted. Ids are reserved a few
// at a time so a bulk import doesn't cost two requests per entry. The server
// hands them out, so an id it gave before, or one an entry already has, is
// refused: a new entry sealed under an existing id would be valid for it.
const RESERVE_BATCH = 20;
let reserved: number[] = [];
let issued = new Set<number>();
let pending: Promise<void> | null = null;

function usable(id: unknown): id is number {
  if (!Number.isSafeInteger(id) || (id as number) <= 0 || issued.has(id as number)) return false;
  const { rawEntries, decryptedEntries } = useEntriesStore.getState();
  return !rawEntries.some(e => e.id === id) && !decryptedEntries.some(e => e.id === id);
}

export async function reserveEntryId(): Promise<number> {
  while (reserved.length === 0) {
    pending ??= entriesApi.reserveIds(RESERVE_BATCH)
      .then(r => {
        const fresh = r.ids.filter(usable);
        if (fresh.length !== r.ids.length || new Set(fresh).size !== fresh.length) throw new Error('The server reserved an entry id already in use');
        for (const id of fresh) issued.add(id);
        reserved.push(...fresh);
      })
      .finally(() => { pending = null; });
    await pending;
  }
  return reserved.shift()!;
}

/** On lock / sign-out: the next account must never get this one's ids. */
export function clearReservedEntryIds(): void {
  reserved = [];
  issued = new Set();
}

// A re-seal request: at most 100 entries (server limit) and well under the
// 5 MB body limit
const MAX_PER_REQUEST = 100;
const MAX_BYTES_PER_REQUEST = 3_500_000;

type EncryptPost = (id: number, content: string, metadata: Record<string, unknown>) => Promise<EncryptedPostData>;

/**
 * The one-time move to v3: re-save every entry that opened in an older
 * format, then write the marker. A failure, or any entry skipped, leaves the
 * marker unwritten, so the next load tries again (entries already moved
 * simply open as v3). Returns how many entries were re-saved.
 */
export async function resealOlderEntries(
  decrypted: DecryptedPost[],
  encryptPost: EncryptPost,
  encryptBytes: EncryptBytes,
): Promise<number> {
  const older = decrypted.filter(e => e.needsReseal);
  let batch: Parameters<typeof entriesApi.reseal>[0] = [];
  let bytes = 0;
  let skipped = 0;
  const flush = async () => {
    if (batch.length) skipped += batch.length - (await entriesApi.reseal(batch)).resealed;
    batch = [];
    bytes = 0;
  };
  for (const entry of older) {
    const enc = await encryptPost(entry.id, entry.content, entry.metadata);
    const size = enc.contentEncrypted.length + enc.metadataEncrypted.length;
    if (batch.length >= MAX_PER_REQUEST || (batch.length && bytes + size > MAX_BYTES_PER_REQUEST)) await flush();
    batch.push({ id: entry.id, updatedAt: new Date(entry.updatedAt).toISOString(), ...enc });
    bytes += size;
  }
  await flush();
  // An entry edited meanwhile was skipped (its edit is already id-bound); the
  // marker waits for a load where every older entry was moved, so nothing
  // still in an older format is ever locked out
  if (skipped > 0) return older.length - skipped;
  await settingsApi.upsert(ENTRIES_SEAL_MARKER, await sealSetting(ENTRIES_SEAL_MARKER, true, encryptBytes));
  noteSealMarker(ENTRIES_SEAL_MARKER);
  allowOlder = false;
  return older.length;
}
