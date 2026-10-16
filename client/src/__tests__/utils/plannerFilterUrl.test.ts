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
