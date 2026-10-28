import { describe, it, expect } from 'vitest';
import { encodePlannerFilter, decodePlannerFilter, EMPTY_PLANNER_FILTER } from '@/types/planner';

describe('planner filter in the URL', () => {
  it('round-trips an applied filter', () => {
    const f = { ...EMPTY_PLANNER_FILTER, keyword: 'garden', itemTypes: ['tasks' as const], priority: 'high', parentGoalId: 12 };
    expect(decodePlannerFilter(encodePlannerFilter(f))).toEqual(f);
  });

  it('returns null for a missing or malformed value', () => {
    expect(decodePlannerFilter(null)).toBeNull();
    expect(decodePlannerFilter('not json')).toBeNull();
  });

  it('drops unknown item types and bad ids', () => {
    const decoded = decodePlannerFilter(JSON.stringify({ itemTypes: ['tasks', 'bogus'], parentGoalId: 'x' }));
    expect(decoded?.itemTypes).toEqual(['tasks']);
    expect(decoded?.parentGoalId).toBeNull();
    expect(decoded?.goalStatus).toBe('all');
  });
});

describe('planner filter search words', () => {
  it('never puts them in the address, but brings them back in this tab', () => {
    const f = { ...EMPTY_PLANNER_FILTER, keyword: 'divorce lawyer', itemTypes: ['tasks' as const] };
    const raw = encodePlannerFilter(f);
    expect(raw).not.toContain('divorce');
    expect(decodePlannerFilter(raw)).toEqual(f);
    // An old link carrying words is read without them
    sessionStorage.clear();
    expect(decodePlannerFilter(JSON.stringify({ keyword: 'secret' }))?.keyword).toBe('');
  });
});
