import { describe, it, expect } from 'vitest';
import type { DecryptedPost } from '@shared/crypto/types';
import { topicEntries } from './topicIndex.js';

const entry = (id: number, topic?: number): DecryptedPost => ({
  id, content: `e${id}`, metadata: topic ? { _taxonomyId: topic } : {}, isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
} as DecryptedPost);

describe('topicEntries', () => {
  it('gives a topic’s entries in the journal’s order', () => {
    const all = [entry(1, 7), entry(2, 8), entry(3, 7), entry(4)];
    expect(topicEntries(all, 7).map(e => e.id)).toEqual([1, 3]);
    expect(topicEntries(all, 8).map(e => e.id)).toEqual([2]);
    expect(topicEntries(all, 9)).toEqual([]);
    expect(topicEntries(all, undefined)).toEqual([]);
  });

  it('keeps a topic’s list while only other topics change', () => {
    const a = entry(1, 7), b = entry(2, 8), c = entry(3, 7);
    const first = [a, b, c];
    const sevens = topicEntries(first, 7);
    // Topic 8's entry was saved: a new journal array, a new object for that entry
    const second = [a, { ...b, content: 'edited' }, c];
    expect(topicEntries(second, 7)).toBe(sevens);
    expect(topicEntries(second, 8)[0].content).toBe('edited');
    // An entry added to topic 7 does change its list
    const third = [entry(5, 7), ...second];
    expect(topicEntries(third, 7)).not.toBe(sevens);
    expect(topicEntries(third, 7).map(e => e.id)).toEqual([5, 1, 3]);
  });

  it('answers the same array for the same journal', () => {
    const all = [entry(1, 7)];
    expect(topicEntries(all, 7)).toBe(topicEntries(all, 7));
  });
});
