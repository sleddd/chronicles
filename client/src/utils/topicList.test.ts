import { describe, it, expect } from 'vitest';
import { groupTopicRows, sortTopicRows } from './topicList.js';

const row = (id: number, title: string, created: string, lines = 1, tags: string[] = []) => ({ id, title, lines, tags, created: new Date(created) });
const rows = [row(1, 'b', '2026-11-18T10:00', 42, ['PHP']), row(2, 'A', '2026-11-20T10:00', 8, ['React', 'PHP']), row(3, 'c', '2026-10-22T10:00', 6)];

describe('topicList', () => {
  it('sorts', () => {
    expect(sortTopicRows(rows, 'newest').map(r => r.id)).toEqual([2, 1, 3]);
    expect(sortTopicRows(rows, 'oldest').map(r => r.id)).toEqual([3, 1, 2]);
    expect(sortTopicRows(rows, 'title').map(r => r.id)).toEqual([2, 1, 3]);
    expect(sortTopicRows(rows, 'lines').map(r => r.id)).toEqual([1, 2, 3]);
  });

  it('groups by month, with the year only when it is not this one', () => {
    const g = groupTopicRows(sortTopicRows(rows, 'newest'), 'month', 2026);
    expect(g.map(x => [x.title, x.rows.map(r => r.id)])).toEqual([['November', [2, 1]], ['October', [3]]]);
    expect(groupTopicRows(rows, 'month', 2027)[0].title).toBe('November 2026');
  });

  it('groups by tag, an entry under each of its tags, "No tag" last', () => {
    const g = groupTopicRows(sortTopicRows(rows, 'newest'), 'tag', 2026);
    expect(g.map(x => [x.title, x.rows.map(r => r.id)])).toEqual([['PHP', [2, 1]], ['React', [2]], ['No tag', [3]]]);
  });
});
