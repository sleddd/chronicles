import { describe, it, expect } from 'vitest';
import { searchAndSort, type PlanRow } from '@/utils/planningView';

type Item = PlanRow & { id: number };
const items: Item[] = [
  { id: 1, title: 'Paint kitchen', text: 'Paint kitchen Home', due: '2026-11-02', priority: 'low', created: 3 },
  { id: 2, title: 'Book flights', text: 'Book flights Trip', due: '', priority: 'urgent', created: 2 },
  { id: 3, title: 'apply for visa', text: 'apply for visa Trip', due: '2026-10-20', priority: 'high', created: 1 },
];
const ids = (list: Item[]) => list.map(i => i.id);
const run = (q: string, s: Parameters<typeof searchAndSort>[3]) => ids(searchAndSort(items, i => i, q, s));

describe('searchAndSort', () => {
  it('keeps the incoming order for newest', () => expect(run('', 'newest')).toEqual([1, 2, 3]));
  it('sorts oldest first', () => expect(run('', 'oldest')).toEqual([3, 2, 1]));
  it('sorts by title ignoring case', () => expect(run('', 'title')).toEqual([3, 2, 1]));
  it('sorts by due date with undated last', () => expect(run('', 'due')).toEqual([3, 1, 2]));
  it('sorts by priority', () => expect(run('', 'priority')).toEqual([2, 3, 1]));
  it('matches every word of the query in the searchable text', () => {
    expect(run('trip', 'newest')).toEqual([2, 3]);
    expect(run('TRIP visa', 'newest')).toEqual([3]);
    expect(run('nothing', 'newest')).toEqual([]);
  });
});
