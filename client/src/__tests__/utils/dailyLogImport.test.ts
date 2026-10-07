import { describe, it, expect } from 'vitest';
import { planDailyLogImport } from '../../utils/dailyLogImport.js';

const sample = {
  goals: { kcal: 1200, iron: 12, vitD: 100, b12: 2.4, vitC: 75 },
  days: {
    '2026-10-01': {
      date: '2026-10-01',
      entries: {
        a: { item: 'Hot dog', type: 'Food', kcal: 100, iron: 0.6, vitD: 0, b12: 0.4, vitC: null, notes: 'estimated', created: '2026-10-01T18:00:02Z' },
        b: { item: 'Vitamin D drops', type: 'Supplement', kcal: 0, iron: 0, vitD: 100, b12: 0, vitC: 0, notes: '', created: '2026-10-01T12:00:00Z' },
        c: { item: 'Allegra', type: 'Medication', kcal: null, iron: null, vitD: null, b12: null, vitC: null, notes: '', created: '2026-10-01T14:00:00Z' },
        d: { item: 'Minor itchiness', type: 'Symptom', notes: 'after lunch', created: '2026-10-01T15:00:00Z' },
        e: { item: 'No smell in apartment', type: 'Note', notes: 'windows open', created: '2026-10-01T16:00:00Z' },
        gone: null,
      },
    },
  },
};

describe('planDailyLogImport', () => {
  const plan = planDailyLogImport(JSON.stringify(sample));
  const by = (key: string) => plan.entries.find(e => e.importKey === `dailylog:2026-10-01:${key}`)!;

  it('maps every live item and skips deleted ones', () => {
    expect(plan.entries).toHaveLength(5);
    expect(plan.days).toBe(1);
  });

  it('keeps food nutrients as typed values, blanks for missing ones', () => {
    const cf = by('a').customFields;
    expect(by('a').topic).toBe('Meals');
    expect(cf).toMatchObject({ mealDescription: 'Hot dog', mealType: '', consumedDate: '2026-10-01', calories: '100', iron: '0.6', vitaminD: '0', vitaminB12: '0.4', vitaminC: '', notes: 'estimated' });
    expect(cf.nutrientSource).toEqual({ calories: 'manual', iron: 'manual', vitaminD: 'manual', vitaminB12: 'manual' });
  });

  it('marks supplements and medications', () => {
    expect(by('b').customFields.mealType).toBe('supplement');
    expect(by('c').customFields.mealType).toBe('medication');
    expect(by('c').customFields.nutrientSource).toBeUndefined();
  });

  it('sends symptoms to Symptom and notes to Journal', () => {
    expect(by('d')).toMatchObject({ topic: 'Symptom', content: '<p>Minor itchiness</p>' });
    expect(by('d').customFields).toMatchObject({ occurredDate: '2026-10-01', notes: 'after lunch' });
    expect(by('e')).toMatchObject({ topic: 'Journal', content: '<p>No smell in apartment</p><p>windows open</p>' });
  });

  it('maps goals', () => {
    expect(plan.goals).toEqual({ calories: 1200, iron: 12, vitaminD: 100, vitaminB12: 2.4, vitaminC: 75 });
  });

  it('accepts an array of days and rejects other files', () => {
    const arr = planDailyLogImport(JSON.stringify({ days: [sample.days['2026-10-01']] }));
    expect(arr.entries).toHaveLength(5);
    expect(() => planDailyLogImport('{"foo":1}')).toThrow(/Daily log/);
    expect(() => planDailyLogImport('nope')).toThrow(/JSON/);
  });

  it('escapes HTML in item text', () => {
    const p = planDailyLogImport(JSON.stringify({ days: { '2026-10-02': { entries: { x: { item: 'M&M <3', type: 'Food' } } } } }));
    expect(p.entries[0].content).toBe('<p>M&amp;M &lt;3</p>');
  });
});
