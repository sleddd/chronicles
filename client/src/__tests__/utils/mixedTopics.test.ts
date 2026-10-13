import { describe, it, expect } from 'vitest';
import { entryTopicIds, hasMixedTopics } from '../../utils/mixedTopics.js';

describe('hasMixedTopics', () => {
  it('is false for an empty or single-topic list', () => {
    expect(hasMixedTopics([])).toBe(false);
    expect(hasMixedTopics([3, 3, 3])).toBe(false);
  });

  it('is true when two topics appear', () => {
    expect(hasMixedTopics([3, 3, 4])).toBe(true);
  });

  it('reads topic ids from entry metadata', () => {
    const ids = entryTopicIds([{ metadata: { _taxonomyId: 1 } }, { metadata: { _taxonomyId: 2 } }, { metadata: {} }]);
    expect(ids).toEqual([1, 2, undefined]);
    expect(hasMixedTopics(ids)).toBe(true);
  });
});
