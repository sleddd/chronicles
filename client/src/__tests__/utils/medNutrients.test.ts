import { describe, it, expect } from 'vitest';
import { parseMedNutrients, storedDoseNutrients, hasAnyNutrient, doseLinkKey } from '../../utils/medNutrients.js';

describe('parseMedNutrients', () => {
  it('reads single-vitamin supplements', () => {
    expect(parseMedNutrients('Vitamin D3', '1,000 IU')).toEqual({ vitaminD: 25 });
    expect(parseMedNutrients('Vitamin D drops', '100 mcg')).toEqual({ vitaminD: 100 });
    expect(parseMedNutrients('Methylcobalamin B12', '1000 mcg')).toEqual({ vitaminB12: 1000 });
    expect(parseMedNutrients('Vitamin C', '500mg')).toEqual({ vitaminC: 500 });
    expect(parseMedNutrients('Vitamin C', '1 g')).toEqual({ vitaminC: 1000 });
    expect(parseMedNutrients('Ferrous sulfate', '65 mg')).toEqual({ iron: 65 });
    expect(parseMedNutrients('Vitamin D 2000 IU', '')).toEqual({ vitaminD: 50 });
  });

  it('leaves multivitamins, complexes, ordinary meds and missing amounts alone', () => {
    expect(parseMedNutrients('Multivitamin', '1 tablet')).toEqual({});
    expect(parseMedNutrients('Active B-Complex', '1 capsule')).toEqual({});
    expect(parseMedNutrients('Allegra', '180 mg')).toEqual({});
    expect(parseMedNutrients('Vitamin D', '1 drop')).toEqual({});
    expect(parseMedNutrients('Iron + Vitamin C', '65 mg')).toEqual({});
  });
});

describe('dose nutrient helpers', () => {
  it('reads typed values and ignores blanks', () => {
    expect(storedDoseNutrients({ vitaminD: '25', iron: '', vitaminC: 'x' })).toEqual({ vitaminD: 25 });
  });
  it('detects any positive nutrient', () => {
    expect(hasAnyNutrient({})).toBe(false);
    expect(hasAnyNutrient({ iron: 0 })).toBe(false);
    expect(hasAnyNutrient({ vitaminC: 75 })).toBe(true);
  });
  it('builds a stable link key', () => {
    expect(doseLinkKey(7, '2026-10-07', '08:00:00')).toBe('7|2026-10-07|08:00');
  });
});
