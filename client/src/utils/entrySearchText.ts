import type { DecryptedPost } from '@shared/crypto/types';

/* What the journal's search looks through for one entry — its text and every
   field, lower-cased — worked out once per entry. A save replaces the entry's
   object in the store, so its text is worked out again then and only then;
   typing a search no longer turns every entry's fields into text per keystroke. */

const texts = new WeakMap<DecryptedPost, string>();

export function entrySearchText(entry: DecryptedPost): string {
  let text = texts.get(entry);
  if (text === undefined) {
    text = `${entry.content}\n${JSON.stringify(entry.metadata ?? {})}`.toLowerCase();
    texts.set(entry, text);
  }
  return text;
}
