import { describe, it, expect } from 'vitest';
import { triggerEvents, symptomTriggers, standsOut, beforeLabel, setTriggerReview, applyTriggerReviews, triggerKey } from '@/utils/foodSymptoms';
import type { DecryptedFood, DecryptedSymptom, DecryptedMedicationLog, DecryptedExercise } from '@/utils/correlationAnalysis';

let id = 0;
const meal = (at: string, name: string, ingredients: string[] = [], mealType?: string): DecryptedFood => ({ id: ++id, name, consumedAt: at, ingredients, mealType });
const sym = (at: string, name: string): DecryptedSymptom => ({ id: ++id, name, occurredAt: at, severity: 5 });
const dose = (at: string, name: string): DecryptedMedicationLog => ({ id: String(++id), medicationPostId: 1, medicationName: name, takenAt: at });

/* Ten days: a pill every morning; pizza on days 1, 3, 5, 7, each followed by bloating 3h later */
function diary() {
  const foods: DecryptedFood[] = [];
  const meds: DecryptedMedicationLog[] = [];
  const symptoms: DecryptedSymptom[] = [];
  for (let d = 1; d <= 10; d++) {
    const day = `2026-10-${String(d).padStart(2, '0')}`;
    meds.push(dose(`${day}T11:00:00`, 'Metformin'));
    if (d % 2 === 1 && d <= 7) {
      foods.push(meal(`${day}T12:00:00`, 'Pizza', ['cheese']));
      symptoms.push(sym(`${day}T15:00:00`, 'Bloating'));
    } else {
      foods.push(meal(`${day}T12:00:00`, 'Salad'));
    }
  }
  return { foods, meds, symptoms };
}

describe('triggerEvents', () => {
  it('turns meals, medication rows, doses and exercise into events', () => {
    const ex: DecryptedExercise = { id: 1, name: '', exerciseType: 'running', duration: 30, intensity: 'medium', performedAt: '2026-10-01T07:00:00' };
    const events = triggerEvents(
      [meal('2026-10-01T12:00:00', 'Pizza', ['Cheese', 'cheese ', 'pizza']), meal('2026-10-01T20:00:00', 'Ibuprofen', [], 'medication')],
      [dose('2026-10-01T08:00:00', 'Vitamin D')], [ex],
    );
    expect(events.map(e => [e.name, e.kind])).toEqual([
      ['Pizza', 'food'], ['Cheese', 'food'], ['Ibuprofen', 'medication'], ['Vitamin D', 'medication'], ['Running', 'exercise'],
    ]);
  });
});

describe('symptomTriggers', () => {
  it('counts what came before each time — food and an everyday pill both show', () => {
    const { foods, meds, symptoms } = diary();
    const rows = symptomTriggers(symptoms, triggerEvents(foods, meds, []), 4);
    const pizza = rows.find(r => r.trigger === 'Pizza')!;
    const pill = rows.find(r => r.trigger === 'Metformin')!;
    expect(pizza).toMatchObject({ kind: 'food', symptom: 'Bloating', before: 4, of: 4, share: 1 });
    expect(pizza.usual).toBeCloseTo(0.4);
    expect(pizza.avgHours).toBeCloseTo(3);
    expect(pill).toMatchObject({ kind: 'medication', before: 4, of: 4, usual: 1 });
    expect(standsOut(pizza)).toBe(true);
    expect(standsOut(pill)).toBe(false);
    expect(rows[0].trigger).not.toBe('Metformin'); // the unusual one ranks first
  });

  it('respects the window and the minimums, and can look at one symptom', () => {
    const { foods, meds, symptoms } = diary();
    expect(symptomTriggers(symptoms, triggerEvents(foods, meds, []), 2).map(r => r.trigger)).toEqual([]); // all 3h+ before
    expect(symptomTriggers([sym('2026-10-01T13:00:00', 'Hives')], triggerEvents([meal('2026-10-01T12:00:00', 'Shrimp')], [], []), 4)).toEqual([]);
    const one = symptomTriggers([...symptoms, sym('2026-10-02T13:00:00', 'Headache')], triggerEvents(foods, meds, []), 4, { symptom: 'headache', minTimes: 1, minShare: 0 });
    expect(one.map(r => r.trigger).sort()).toEqual(['Metformin', 'Salad']);
  });
});

describe('beforeLabel', () => {
  it('reads naturally', () => {
    expect(beforeLabel(0.6)).toBe('~35 min before');
    expect(beforeLabel(3.2)).toBe('~3 h before');
    expect(beforeLabel(40)).toBe('~2 days before');
  });
});

describe('trigger reviews', () => {
  const { foods, meds, symptoms } = diary();
  const rows = symptomTriggers(symptoms, triggerEvents(foods, meds, []), 4);
  const pizza = rows.find(r => r.trigger === 'Pizza')!;
  const pill = rows.find(r => r.trigger === 'Metformin')!;

  it('confirms, dismisses and clears', () => {
    let reviews = setTriggerReview({}, pizza, 'confirmed', '2026-10-19');
    expect(reviews[triggerKey(pizza)]).toMatchObject({ verdict: 'confirmed', at: '2026-10-19', trigger: 'Pizza', symptom: 'Bloating' });
    reviews = setTriggerReview(reviews, pill, 'dismissed', '2026-10-19');
    const split = applyTriggerReviews(rows, reviews);
    expect(split.confirmed.map(c => c.row?.trigger)).toEqual(['Pizza']);
    expect(split.dismissed.map(d => d.row?.trigger)).toEqual(['Metformin']);
    expect(split.open.some(r => r.trigger === 'Pizza' || r.trigger === 'Metformin')).toBe(false);
    expect(Object.keys(setTriggerReview(reviews, pizza, null, '2026-10-19'))).toEqual([triggerKey(pill)]);
  });

  it('keeps a confirmed trigger listed in a period it was not seen', () => {
    const reviews = setTriggerReview({}, { kind: 'food', trigger: 'Shellfish', symptom: 'Hives' }, 'confirmed', '2026-09-01');
    const split = applyTriggerReviews(rows, reviews);
    expect(split.confirmed).toEqual([{ review: expect.objectContaining({ trigger: 'Shellfish' }), row: null }]);
    expect(split.open).toHaveLength(rows.length);
  });

  it('matches names whatever their case', () => {
    const reviews = setTriggerReview({}, { kind: 'food', trigger: 'pizza ', symptom: 'BLOATING' }, 'dismissed', '2026-10-19');
    expect(applyTriggerReviews(rows, reviews).dismissed[0].row?.trigger).toBe('Pizza');
  });
});
