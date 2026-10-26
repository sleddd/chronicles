import { describe, it, expect } from 'vitest';
import {
  addDays, dayList, symptomDays, loggedDays, rankedSymptoms, questionRows, metricTiles, dayTriggers, exerciseReport,
  medicationReport, symptomGlance, type ReportScope, type ReportSymptom,
} from '@/utils/healthReport';
import { inventoryDays, type InventoryWellness } from '@/utils/dailyInventory';
import type { TriggerEvent } from '@/utils/foodSymptoms';

const TODAY = '2026-10-25';
const FROM = addDays(TODAY, -19); // 20 days
const DAYS = dayList(FROM, TODAY);

/* A 20-day diary: mood 4 and 8 h sleep on even days, mood 2 and 5 h sleep on odd
   days. Headache on every odd day (severity 6), and bloating on the days after
   a latte (days 0, 4, 8, 12, 16). Exercise on even days. */
function diary(extra: Partial<{ wellness: InventoryWellness[]; symptoms: ReportSymptom[] }> = {}): ReportScope {
  const wellness: InventoryWellness[] = extra.wellness ?? DAYS.map((date, i) => ({
    date, moodScore: i % 2 ? 2 : 4, sleepHours: i % 2 ? 5 : 8, waterGlasses: i % 2 ? 4 : 8, social: i % 2 ? 2 : 4,
  }));
  const symptoms: ReportSymptom[] = extra.symptoms ?? [
    ...DAYS.filter((_, i) => i % 2 === 1).map(d => ({ name: 'Headache', severity: 6, occurredAt: `${d}T09:00:00` })),
    ...DAYS.filter((_, i) => i % 4 === 0).map(d => ({ name: 'Bloating', severity: 3, occurredAt: `${d}T20:00:00` })),
  ];
  const workouts = DAYS.filter((_, i) => i % 2 === 0).map(day => ({ day, minutes: 30 }));
  return {
    today: TODAY,
    range: { from: FROM, to: TODAY },
    inventory: inventoryDays(wellness, [], workouts, { from: FROM, to: TODAY }),
    symptoms: symptomDays(symptoms),
  };
}

describe('days', () => {
  it('lists every day inclusive and steps across month ends', () => {
    expect(dayList('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts a day as logged when it has an answer or a symptom', () => {
    const scope: ReportScope = {
      today: TODAY, range: { from: FROM, to: TODAY },
      inventory: inventoryDays([{ date: TODAY, moodScore: 3 }], [], [], { from: FROM, to: TODAY }),
      symptoms: symptomDays([{ name: 'Cough', severity: 4, occurredAt: `${FROM}T08:00:00` }]),
    };
    expect(loggedDays(scope, FROM, TODAY)).toEqual([FROM, TODAY]);
  });

  it('keeps the worst severity per symptom per day and ranks symptoms by days', () => {
    const scope = diary({ symptoms: [
      { name: 'Cough', severity: 2, occurredAt: `${TODAY}T08:00:00` },
      { name: 'cough ', severity: 7, occurredAt: `${TODAY}T18:00:00` },
      { name: 'Fever', severity: 5, occurredAt: `${FROM}T08:00:00` },
      { name: 'Fever', severity: 5, occurredAt: `${addDays(FROM, 1)}T08:00:00` },
    ] });
    expect(scope.symptoms.get(TODAY)?.get('cough')?.severity).toBe(7);
    expect(rankedSymptoms(scope).map(s => [s.name, s.days])).toEqual([['Fever', 2], ['Cough', 1]]);
  });
});

describe('questionRows', () => {
  it('shows today, the last 7 days and the range for each answered question', () => {
    const rows = questionRows(diary(), null);
    const sleep = rows.find(r => r.key === 'sleep')!;
    expect(sleep.label).toBe('Sleep');
    expect(sleep.today).toBe('5 h'); // TODAY is index 19, odd
    expect(sleep.period).toBe('6.5 h');
    expect(sleep.compare).toBeNull();
    expect(rows.find(r => r.key === 'breakfast')).toBeUndefined(); // never answered
    expect(rows[0].key).toBe('sleep');
  });

  it('compares mood on days above and below the average', () => {
    const sleep = questionRows(diary(), { kind: 'mood' }).find(r => r.key === 'sleep')!;
    expect(sleep.compare).toEqual({ ready: true, sentence: 'You feel better on days with over 6.5 h of sleep.' });
    // Mood isn't compared with itself
    expect(questionRows(diary(), { kind: 'mood' }).find(r => r.key === 'day')!.compare).toBeNull();
  });

  it('says which side you get a symptom less often on', () => {
    const ex = questionRows(diary(), { kind: 'symptom', key: 'headache', name: 'Headache' }).find(r => r.key === 'exerciseMinutes')!;
    expect(ex.compare).toEqual({ ready: true, sentence: 'You get headache less often on days you exercised.' });
  });

  it('says how many more days it needs on the short side', () => {
    const wellness = DAYS.map((date, i) => ({ date, moodScore: 3, sleepHours: i < 2 ? 9 : 6 }));
    const sleep = questionRows(diary({ wellness }), { kind: 'mood' }).find(r => r.key === 'sleep')!;
    expect(sleep.compare).toEqual({ ready: false, need: 'Needs 1 more day with over 6.5 h of sleep' });
  });
});

describe('metricTiles', () => {
  it('builds mood, sleep, social time, exercise and water, with the compared symptom first', () => {
    const tiles = metricTiles(diary(), { key: 'headache', name: 'Headache' });
    expect(tiles.map(t => t.key)).toEqual(['symptom', 'mood', 'sleep', 'social', 'exercise', 'stress']);
    expect(tiles[0]).toMatchObject({ value: '10', unit: 'days', caption: 'of 20 logged', today: 'Moderate', week: '4 of 7' });
    expect(tiles[1]).toMatchObject({ value: 'Okay', today: 'Low' });
    expect(tiles[2]).toMatchObject({ value: '6.5', unit: 'h', today: '5 h' });
  });
});

describe('dayTriggers', () => {
  const latte = (day: string): TriggerEvent => ({ key: 'f:latte', name: 'Latte', kind: 'food', at: Date.parse(`${day}T08:00:00`), day });
  const toast = (day: string): TriggerEvent => ({ key: 'f:toast', name: 'Toast', kind: 'food', at: Date.parse(`${day}T08:00:00`), day });

  it('finds a food the symptom follows far more often than other days', () => {
    const events = [...DAYS.filter((_, i) => i % 4 === 0).map(latte), toast(DAYS[3]), toast(DAYS[5])];
    const { triggers, tooFew } = dayTriggers(events, diary(), 0);
    expect(triggers).toEqual([{ kind: 'food', trigger: 'Latte', symptom: 'Bloating', hits: 5, times: 5, otherRate: 0 }]);
    expect(tooFew).toBe(1); // toast on 2 days
  });

  it('skips something taken nearly every day', () => {
    const daily = DAYS.map(day => ({ key: 'f:pill', name: 'Pill', kind: 'medication' as const, at: Date.parse(`${day}T08:00:00`), day }));
    expect(dayTriggers(daily, diary(), 1).triggers).toEqual([]);
  });
});

describe('exerciseReport', () => {
  it('compares mood, next-night sleep and symptoms on days with and without exercise', () => {
    const sessions = DAYS.filter((_, i) => i % 2 === 0).map(day => ({ day, minutes: 30 }));
    const r = exerciseReport(diary(), sessions);
    expect(r).toMatchObject({ sessions: 10, minutes: 300, perWeek: 3.5, enough: true });
    expect(r.rows).toEqual([
      { name: 'Mood', on: 'Good', off: 'Low', tone: 'better' },
      { name: 'Sleep that night', on: '5 h', off: '8 h', tone: 'worse' },
      { name: 'Symptoms', on: '0.5 symptoms', off: '1 symptom', tone: 'better' },
    ]);
    expect(r.findings).toEqual([
      'You feel better on days you exercise.',
      'You sleep about 3 hours less the night after you exercise.',
      'You have fewer symptoms on days you exercise.',
    ]);
    expect(r.lessOften).toEqual(['Headache']);
    expect(r.moreOften).toEqual(['Bloating']);
  });

  it('needs 3 days on each side', () => {
    expect(exerciseReport(diary(), [{ day: TODAY, minutes: 20 }]).enough).toBe(false);
  });
});

describe('medicationReport', () => {
  it('finds symptoms clearly more common on days it was taken, ignoring weaker differences', () => {
    const doses = DAYS.filter((_, i) => i % 2 === 1).map(day => ({ name: 'Iron', day }));
    // Bloating is 0 of 10 on Iron days vs 5 of 10 off them — p ≈ 0.016, not clear enough
    expect(medicationReport(diary(), doses)).toEqual([
      { name: 'Iron', taken: 10, of: 20, lessOften: [], moreOften: ['Headache'], note: null },
    ]);
  });

  it('never compares a medication taken as needed with the symptoms it is taken for', () => {
    const doses = DAYS.filter((_, i) => i % 2 === 1).map(day => ({ name: 'Ibuprofen', day, asNeeded: true }));
    expect(medicationReport(diary(), doses)).toEqual([
      { name: 'Ibuprofen', taken: 10, of: 20, lessOften: [], moreOften: [], note: 'Taken as needed for symptoms, so it isn’t compared with them' },
    ]);
  });

  it('explains why there is nothing to compare', () => {
    const daily = DAYS.map(day => ({ name: 'Magnesium', day }));
    const few = DAYS.slice(0, 2).map(day => ({ name: 'Zinc', day }));
    const rows = medicationReport(diary(), [...daily, ...few]);
    expect(rows.map(r => [r.name, r.note])).toEqual([
      ['Magnesium', 'Taken almost every day, so there is nothing to compare against'],
      ['Zinc', 'Too few days to tell yet'],
    ]);
  });
});

describe('symptomGlance', () => {
  it('draws a square per day by severity and says what each usually comes with', () => {
    const cold = DAYS.filter((_, i) => i % 5 === 0).flatMap(d => [
      { name: 'Cough', severity: 8, occurredAt: `${d}T08:00:00` },
      { name: 'Fever', severity: 5, occurredAt: `${d}T09:00:00` },
    ]);
    const g = symptomGlance(diary({ symptoms: [...cold, { name: 'Itch', severity: 2, occurredAt: `${DAYS[1]}T08:00:00` }] }));
    expect(g.unit).toBe('day');
    const cough = g.rows.find(r => r.name === 'Cough')!;
    expect(cough).toMatchObject({ days: 4, usual: 'Severe', often: 'Fever' });
    expect(cough.cells.slice(0, 2)).toEqual(['severe', 'none']);
    expect(g.clusters).toEqual([{ names: 'Cough and fever', days: '4 of 4 cough days' }]);
  });

  it('switches to a square per week over long ranges', () => {
    const scope = { ...diary(), range: { from: addDays(TODAY, -364), to: TODAY } };
    const g = symptomGlance(scope);
    expect(g.unit).toBe('week');
    expect(g.rows[0].cells).toHaveLength(53);
    expect(g.rows[0].cells[0]).toBe('unlogged');
  });
});

describe('Did you dream?', () => {
  it('shows as a yes/no question and compares like one', () => {
    const wellness = DAYS.map((date, i) => ({ date, moodScore: i % 2 ? 2 : 4, dreamed: i % 2 === 0 }));
    const row = questionRows(diary({ wellness }), { kind: 'mood' }).find(r => r.key === 'dreamed')!;
    expect(row).toMatchObject({ label: 'Dreamed', today: 'No', week: '3 of 7 days' });
    expect(row.compare).toEqual({ ready: true, sentence: 'You feel better on days you dreamed.' });
  });
});

describe('Stress level', () => {
  it('scores less stress as better, and shows a Stress tile and question', () => {
    const wellness = DAYS.map((date, i) => ({ date, moodScore: 3, stress: i % 2 ? 4 : 2 }));
    const scope = diary({ wellness });
    expect(scope.inventory.find(d => d.date === TODAY)?.scores.stress).toBe(40); // TODAY is odd → 4, High
    const tile = metricTiles(scope).find(t => t.key === 'stress')!;
    expect(tile).toMatchObject({ name: 'Stress', value: 'Moderate', today: 'High' });
    expect(questionRows(scope, null).find(r => r.key === 'stress')).toMatchObject({ label: 'Stress', today: 'High' });
  });
});

describe('exercise by activity', () => {
  // Strength on 6 days with muscle soreness each time; yoga on 6 days with headache; rest days have neither
  const days = dayList(addDays(TODAY, -29), TODAY);
  const strength = days.filter((_, i) => i % 5 === 0);
  const yoga = days.filter((_, i) => i % 5 === 2);
  const scope = (): ReportScope => ({
    today: TODAY, range: { from: days[0], to: TODAY },
    inventory: inventoryDays(days.map(date => ({ date, moodScore: 3 })), [], [], { from: days[0], to: TODAY }),
    symptoms: symptomDays([
      ...strength.map(d => ({ name: 'Muscle soreness', severity: 5, occurredAt: `${d}T18:00:00` })),
      ...yoga.map(d => ({ name: 'Headache', severity: 5, occurredAt: `${d}T18:00:00` })),
    ]),
  });
  const sessions = [
    ...strength.map(day => ({ day, minutes: 40, type: 'strength' })),
    ...yoga.map(day => ({ day, minutes: 30, type: 'yoga' })),
  ];

  it('names a symptom clearly more common on one activity’s days, never “more often” for a gentle one', () => {
    const r = exerciseReport(scope(), sessions);
    expect(r.byActivity).toContain('You get muscle soreness more often on strength training days.');
    expect(r.byActivity.some(f => f.includes('yoga days') && f.includes('more often'))).toBe(false);
  });

  it('says nothing about an activity with too few days', () => {
    const r = exerciseReport(scope(), sessions.filter(x => x.type === 'yoga').concat(strength.slice(0, 2).map(day => ({ day, minutes: 40, type: 'strength' }))));
    expect(r.byActivity.some(f => f.includes('strength'))).toBe(false);
  });
});
