import type { DecryptedPost, EncryptedPostData } from '@shared/crypto/types.js';
import { entries as entriesApi, settings as settingsApi } from './api.js';
import { sealSetting, type EncryptBytes } from './settingCipher.js';

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

/** Set at startup from whether the marker exists. */
export function setOlderEntriesAllowed(on: boolean): void {
  allowOlder = on;
}

// New entries need their id before they're encrypted. Ids are reserved a few
// at a time so a bulk import doesn't cost two requests per entry.
const RESERVE_BATCH = 20;
let reserved: number[] = [];
let pending: Promise<void> | null = null;

export async function reserveEntryId(): Promise<number> {
  while (reserved.length === 0) {
    pending ??= entriesApi.reserveIds(RESERVE_BATCH)
      .then(r => { reserved.push(...r.ids); })
      .finally(() => { pending = null; });
    await pending;
  }
  return reserved.shift()!;
}

/** On lock / sign-out: the next account must never get this one's ids. */
export function clearReservedEntryIds(): void {
  reserved = [];
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
  allowOlder = false;
  return older.length;
}
