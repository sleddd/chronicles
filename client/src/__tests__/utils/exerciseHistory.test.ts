import { describe, it, expect } from 'vitest';
import { buildExerciseHistory, exerciseHistoryTotals, searchExerciseHistory } from '@/utils/exerciseHistory';
import type { Session } from '@/utils/training';

const s = (id: number, date: string, name: string, extra: Partial<Session> = {}): Session =>
  ({ id, date, time: '07:00', minutes: 30, distance: 0, unit: 'mi', exerciseType: 'walking', category: '', title: '', name, ...extra });

describe('exercise history', () => {
  const sessions = [
    s(1, '2026-10-01', 'Walk', { distance: 2, category: 'Aerobic' }),
    s(2, '2026-10-01', 'Walk', { time: '19:00', distance: 3.2, unit: 'km', category: 'Aerobic' }),
    s(3, '2026-10-05', 'walk', { category: 'Aerobic' }),
    s(4, '2026-10-03', 'Strength Training', { exerciseType: 'strength', minutes: 25 }),
    s(5, '2026-09-30', 'Walk'),
  ];
  const rows = buildExerciseHistory(sessions, { from: '2026-10-01', to: '2026-10-31' });

  it('groups the period by exercise, most sessions first', () => {
    expect(rows.map(r => [r.name, r.sessions, r.days, r.minutes, r.last])).toEqual([
      ['Walk', 3, 2, 90, '2026-10-05'],
      ['Strength Training', 1, 1, 25, '2026-10-03'],
    ]);
    expect(rows[0].miles).toBeCloseTo(4, 1);
    expect(rows[0].detail).toBe('Walking · Aerobic');
    expect(rows[0].events.map(e => e.id)).toEqual([3, 2, 1]);
  });

  it('searches and totals', () => {
    expect(searchExerciseHistory(rows, 'aerob').map(r => r.key)).toEqual(['walk']);
    expect(exerciseHistoryTotals(rows)).toEqual({ sessions: 4, exercises: 2, minutes: 115 });
  });
});
