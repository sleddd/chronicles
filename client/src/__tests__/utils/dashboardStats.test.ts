import { describe, it, expect } from 'vitest';
import { dashboardStats, periodStart } from '../../utils/dashboardStats';

const topics = [
  { id: 1, name: 'Journal' }, { id: 2, name: 'Meals' }, { id: 3, name: 'Exercise' }, { id: 4, name: 'Symptom' }, { id: 5, name: 'Ideas' },
];
const today = new Date(2026, 10, 5, 12); // Thu Nov 5, 2026
const at = (day: string) => new Date(`${day}T12:00:00`);
const e = (day: string, meta: Record<string, unknown> = {}) => ({ createdAt: at(day), metadata: meta });

describe('periodStart', () => {
  it('counts the last 7 days, this month, or everything', () => {
    expect(periodStart('week', today)).toBe('2026-10-30');
    expect(periodStart('month', today)).toBe('2026-11-01');
    expect(periodStart('all', today)).toBeNull();
  });
});

describe('dashboardStats', () => {
  const entries = [
    e('2026-11-05', { _taxonomyId: 1 }),
    e('2026-11-04'), // no topic = Journal
    e('2026-11-03', { _taxonomyId: 5 }),
    e('2026-11-02', { _taxonomyId: 2, _customFields: { consumedDate: '2026-11-02', mealType: 'lunch' } }),
    e('2026-11-02', { _taxonomyId: 2, _customFields: { mealType: 'medication' } }),
    e('2026-11-02', { _taxonomyId: 2, _doseLink: '9|2026-11-02|08:00' }),
    e('2026-11-05', { _taxonomyId: 3, _customFields: { performedDate: '2026-10-20' } }), // logged late for October
    e('2026-11-01', { _taxonomyId: 4 }),
    e('2026-11-05', { _widgetType: 'wellness-checkin', _customFields: { date: '2026-11-05' } }),
    e('2026-09-10', { _taxonomyId: 1 }),
  ];
  const doses = [
    { date: '2026-11-05', status: 'taken' }, { date: '2026-11-04', status: 'skipped' }, { date: '2026-10-01', status: 'taken' },
  ];

  it('counts this month', () => {
    expect(dashboardStats(entries, topics, doses, 'month', today)).toEqual({
      entries: 9, journal: 2, meals: 1, doses: 1, exercise: 0, symptoms: 1, checkIns: 1,
    });
  });

  it('counts everything, by the day each thing happened', () => {
    const s = dashboardStats(entries, topics, doses, 'all', today);
    expect(s).toMatchObject({ entries: 10, journal: 3, meals: 1, doses: 2, exercise: 1, symptoms: 1, checkIns: 1 });
  });

  it('leaves out days after today', () => {
    expect(dashboardStats([e('2026-11-09', { _taxonomyId: 1 })], topics, [], 'all', today).entries).toBe(0);
  });
});
