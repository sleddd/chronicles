import type { EncryptedPost, DecryptedPost } from '@shared/crypto/types';

/* Opening the journal at sign-in. Entries are decrypted a batch at a time,
   newest first, with a pause between batches so the page stays responsive
   (the spinner keeps turning, a tap still lands) however long the journal is.
   The journal is still handed over whole: views, sync and the "find it or
   start a new one" lists all read "every entry is here" from the store. */

/** How many entries are decrypted before the page gets a turn */
export const DECRYPT_BATCH = 400;

/** What the encryption context throws once the key has left the tab (EncryptionContext `getKey`) */
const KEY_GONE = 'Encryption not unlocked';
export const keyGone = (err: unknown): boolean => err instanceof Error && err.message === KEY_GONE;

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** An entry that wouldn't open: kept in the list as such, never dropped */
const failed = (entry: EncryptedPost): DecryptedPost => ({
  id: entry.id,
  content: '[Decryption failed]',
  metadata: {},
  isEncrypted: entry.isEncrypted,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

/**
 * Every entry decrypted, in the order given. `null` when `cancelled` turned
 * true on the way (the session ended): nothing of that load may be shown.
 * Throws when the key has left the tab — no key is not a bad entry.
 */
export async function decryptEntriesInBatches(
  encrypted: EncryptedPost[],
  decryptPosts: (posts: EncryptedPost[]) => Promise<DecryptedPost[]>,
  cancelled: () => boolean = () => false,
  batch = DECRYPT_BATCH,
): Promise<DecryptedPost[] | null> {
  // Newest first, whatever order the rows came in
  const order = encrypted.map((_, i) => i)
    .sort((a, b) => new Date(encrypted[b].createdAt).getTime() - new Date(encrypted[a].createdAt).getTime());
  const out: DecryptedPost[][] = new Array(encrypted.length);
  for (let at = 0; at < order.length; at += batch) {
    if (cancelled()) return null;
    await Promise.all(order.slice(at, at + batch).map(async i => {
      try {
        out[i] = await decryptPosts([encrypted[i]]);
      } catch (err) {
        if (keyGone(err)) throw err;
        console.warn(`Skipping entry ${encrypted[i].id} — decryption failed:`, err);
        out[i] = [failed(encrypted[i])];
      }
    }));
    if (at + batch < order.length) await pause();
  }
  return cancelled() ? null : out.flat();
}
