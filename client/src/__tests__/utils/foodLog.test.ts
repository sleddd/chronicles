import { describe, it, expect } from 'vitest';
import { foodRowsFrom, summarizeDay, goalMet, rowsByDay, shiftDay } from '../../utils/foodLog.js';
import { DEFAULT_NUTRIENT_GOALS, formatNutrient } from '../../types/nutrition.js';
import type { DecryptedPost } from '@shared/crypto/types';

function food(id: number, content: string, cf: Record<string, unknown>, createdAt = '2026-10-07T15:00:00Z', topic = 5): DecryptedPost {
  return { id, content, metadata: { _taxonomyId: topic, _customFields: cf }, isEncrypted: true, createdAt: new Date(createdAt), updatedAt: new Date(createdAt) } as DecryptedPost;
}

describe('foodLog', () => {
  const entries = [
    food(1, '<p>Eggs</p>', { consumedDate: '2026-10-06', calories: '150', iron: '1.2', vitaminB12: '1.1' }),
    food(2, '<p>Orange juice</p>', { consumedDate: '2026-10-06', calories: '112', vitaminC: '93' }),
    food(3, '', { mealDescription: 'Vitamin D3', mealType: 'supplement', consumedDate: '2026-10-07', vitaminD: '50' }),
    food(4, '<p>Not food</p>', { calories: '999' }, '2026-10-07T15:00:00Z', 9),
  ];

  it('flattens only the topic\'s entries, by eaten day', () => {
    const rows = foodRowsFrom(entries, 5);
    expect(rows.map(r => [r.id, r.day, r.item])).toEqual([
      [1, '2026-10-06', 'Eggs'], [2, '2026-10-06', 'Orange juice'], [3, '2026-10-07', 'Vitamin D3'],
    ]);
    expect(rows[1].values).toMatchObject({ calories: 112, iron: null, vitaminC: 93 });
  });

  it('totals a day and checks goals only where the day has values', () => {
    const day = foodRowsFrom(entries, 5).filter(r => r.day === '2026-10-06');
    const sum = summarizeDay(day);
    expect(sum.totals.calories).toBe(262);
    expect(sum.has.vitaminD).toBe(false);
    expect(goalMet(DEFAULT_NUTRIENT_GOALS, 'vitaminC', sum)).toBe(true);   // 93 ≥ 75
    expect(goalMet(DEFAULT_NUTRIENT_GOALS, 'vitaminB12', sum)).toBe(false); // 1.1 < 2.4
    expect(goalMet(DEFAULT_NUTRIENT_GOALS, 'calories', sum)).toBe(false);   // no goal set
  });

  it('groups days newest first within the window', () => {
    const groups = rowsByDay(foodRowsFrom(entries, 5), '2026-10-07');
    expect(groups.map(([d, r]) => [d, r.length])).toEqual([['2026-10-07', 1]]);
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formats amounts like the log', () => {
    expect(formatNutrient(262.4, 'calories')).toBe('262');
    expect(formatNutrient(2.4, 'vitaminB12')).toBe('2.4');
    expect(formatNutrient(0.234, 'iron')).toBe('0.23');
  });
});
