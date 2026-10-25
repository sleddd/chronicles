import { describe, it, expect } from 'vitest';
import {
  buildSymptomHistory, searchSymptomHistory, symptomEventsFrom, symptomHistoryTotals, type SymptomEvent,
} from '@/utils/symptomHistory';

const OCT = { from: '2026-10-01', to: '2026-10-31' };

const entry = (id: number, cf: Record<string, unknown>, day = '2026-10-10') => symptomEventsFrom({ id, day, title: '', cf });

describe('symptomEventsFrom', () => {
  it('splits an entry listing several symptoms and reads its fields', () => {
    const events = entry(1, { symptomName: 'Headache, Nausea', severity: '6', occurredDate: '2026-10-04', occurredTime: '09:30', duration: '45', notes: ' after lunch ' });
    expect(events).toEqual([
      { id: 1, name: 'Headache', date: '2026-10-04', time: '09:30', severity: 6, minutes: 45, notes: 'after lunch', with: ['Nausea'] },
      { id: 1, name: 'Nausea', date: '2026-10-04', time: '09:30', severity: 6, minutes: 45, notes: 'after lunch', with: ['Headache'] },
    ]);
  });

  it('falls back to the entry text and day, and leaves out what was not given', () => {
    const [e] = symptomEventsFrom({ id: 2, day: '2026-10-12', title: 'Itchy eyes', cf: {} });
    expect(e).toMatchObject({ name: 'Itchy eyes', date: '2026-10-12', time: '', severity: null, minutes: 0 });
  });
});

describe('buildSymptomHistory', () => {
  const events: SymptomEvent[] = [
    ...entry(1, { symptomName: 'Headache, Nausea', severity: 7 }, '2026-10-03'),
    ...entry(2, { symptomName: 'headache', severity: 3 }, '2026-10-03'),
    ...entry(3, { symptomName: 'Headache', severity: 5 }, '2026-10-20'),
    ...entry(4, { symptomName: 'Cough' }, '2026-10-05'),
    ...entry(5, { symptomName: 'Headache', severity: 9 }, '2026-09-28'), // before the range
  ];

  it('groups by symptom in the range, most often first, with severity and days', () => {
    const rows = buildSymptomHistory(events, OCT);
    expect(rows.map(r => r.name)).toEqual(['Headache', 'Nausea', 'Cough']); // a tie goes to the worse one
    expect(rows[0]).toMatchObject({ times: 3, days: 2, average: 5, worst: 7, last: '2026-10-20', detail: 'Usually moderate · often with Nausea' });
    expect(rows[0].events.map(e => e.id)).toEqual([3, 1, 2]);
    expect(rows[1].detail).toBe('Usually severe · often with Headache');
    expect(rows[2]).toMatchObject({ times: 1, average: null, worst: null, detail: '' });
  });

  it('searches names and details, and totals what is shown', () => {
    const rows = buildSymptomHistory(events, OCT);
    expect(searchSymptomHistory(rows, 'nausea').map(r => r.name)).toEqual(['Headache', 'Nausea']);
    expect(symptomHistoryTotals(rows)).toEqual({ times: 5, symptoms: 3, days: 3 });
  });
});
