import type { DecryptedPost } from '@shared/crypto/types';

/* Entries by topic, worked out once per change to the journal instead of once
   per view. Every page used to filter the whole journal for its own topic on
   each save or tick; now they share one pass.

   A topic's list keeps its identity while none of its entries changed, so a
   view that depends on its own topic's list doesn't redo its work when
   something elsewhere in the journal was saved. Lists keep the journal's own
   order (newest first, as loaded). */

type Index = Map<number, DecryptedPost[]>;

/** A topic's list is shared by every view: read it, never sort or change it in place */
export type TopicEntries = readonly DecryptedPost[];

const NONE: TopicEntries = [];
const built = new WeakMap<readonly DecryptedPost[], Index>();
let last: Index | null = null;

const topicOf = (e: DecryptedPost): unknown => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId;

const same = (a: DecryptedPost[], b: DecryptedPost[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

function indexOf(entries: readonly DecryptedPost[]): Index {
  const have = built.get(entries);
  if (have) return have;
  const index: Index = new Map();
  for (const e of entries) {
    const id = topicOf(e);
    if (typeof id !== 'number') continue;
    const list = index.get(id);
    if (list) list.push(e); else index.set(id, [e]);
  }
  // A topic nothing changed in keeps the list it had
  if (last) {
    for (const [id, list] of index) {
      const before = last.get(id);
      if (before && same(before, list)) index.set(id, before);
    }
  }
  built.set(entries, index);
  last = index;
  return index;
}

/** The entries of one topic, in the journal's order. The same array as last time while that topic is unchanged */
export function topicEntries(entries: readonly DecryptedPost[], topicId: number | null | undefined): TopicEntries {
  if (typeof topicId !== 'number') return NONE;
  return indexOf(entries).get(topicId) ?? NONE;
}
