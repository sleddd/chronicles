import { NUTRIENTS, nutrientNumber, type NutrientKey } from '../types/nutrition.js';

/**
 * Vitamins and minerals in medications/supplements that count toward the
 * Meals log when a dose is taken. Values per dose live on the Medication
 * entry's custom fields under the same keys as food (`vitaminD`, …), so the
 * Meals totals pick them up unchanged.
 */
export const DOSE_NUTRIENT_KEYS: NutrientKey[] = ['iron', 'vitaminD', 'vitaminB12', 'vitaminC'];
export const DOSE_NUTRIENTS = NUTRIENTS.filter(n => (DOSE_NUTRIENT_KEYS as string[]).includes(n.key));

export type DoseNutrients = Partial<Record<NutrientKey, number>>;

const PATTERNS: [NutrientKey, RegExp][] = [
  ['vitaminD', /\bvit(?:amin)?\.?\s*d\s*[23]?\b|\bd3\b|\bd2\b|cholecalciferol|ergocalciferol/],
  ['vitaminB12', /\bb[-\s]?12\b|cobalamin/],
  ['vitaminC', /\bvit(?:amin)?\.?\s*c\b|ascorbic/],
  ['iron', /\biron\b|ferrous|ferric/],
];

const AMOUNT = /(\d+(?:\.\d+)?)\s*(iu|mcg|µg|ug|mg|g)\b/;

/** Convert an amount to the nutrient's unit (D, B12 in mcg; C, iron in mg). Null when it can't. */
function toUnit(key: NutrientKey, n: number, unit: string): number | null {
  const u = unit === 'µg' || unit === 'ug' ? 'mcg' : unit;
  if (key === 'vitaminD') return u === 'iu' ? n / 40 : u === 'mcg' ? n : u === 'mg' ? n * 1000 : null;
  if (key === 'vitaminB12') return u === 'mcg' ? n : u === 'mg' ? n * 1000 : null;
  if (key === 'vitaminC' || key === 'iron') return u === 'mg' ? n : u === 'g' ? n * 1000 : u === 'mcg' ? n / 1000 : null;
  return null;
}

/**
 * Read a single-nutrient supplement from its name and dosage — "Vitamin D3"
 * + "1,000 IU" → 25 mcg vitamin D. Multivitamins, B-complexes and anything
 * ambiguous return {} (left to the user or the AI).
 */
export function parseMedNutrients(name: string, dosage: string): DoseNutrients {
  const text = `${name} ${dosage}`.toLowerCase().replace(/(\d),(\d{3})\b/g, '$1$2');
  if (/multi|complex|prenatal/.test(text)) return {};
  const found = PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
  if (found.length !== 1) return {};
  const amount = (dosage.toLowerCase().replace(/(\d),(\d{3})\b/g, '$1$2').match(AMOUNT)) ?? text.match(AMOUNT);
  if (!amount) return {};
  const value = toUnit(found[0], Number(amount[1]), amount[2]);
  if (value === null || !Number.isFinite(value) || value <= 0) return {};
  return { [found[0]]: Math.round(value * 100) / 100 };
}

/** Nutrients typed on the medication entry (blank fields ignored). */
export function storedDoseNutrients(cf: Record<string, unknown>): DoseNutrients {
  const out: DoseNutrients = {};
  for (const key of DOSE_NUTRIENT_KEYS) {
    const n = nutrientNumber(cf[key]);
    if (n !== null) out[key] = n;
  }
  return out;
}

export function hasAnyNutrient(v: DoseNutrients): boolean {
  return Object.values(v).some(n => typeof n === 'number' && n > 0);
}

/** Link key tying a Meals row to one taken dose, so un-taking it removes the row. */
export function doseLinkKey(medicationPostId: number, date: string, time: string): string {
  return `${medicationPostId}|${date}|${time.slice(0, 5)}`;
}
