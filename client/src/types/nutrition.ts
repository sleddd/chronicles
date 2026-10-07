/**
 * Nutrients tracked on food entries (Meals log). Values live in the entry's
 * encrypted custom fields under these keys, as strings like every other
 * field. Add a nutrient here and the log, forms, totals and AI pick it up.
 */
export const NUTRIENTS = [
  { key: 'calories', label: 'Calories', short: 'Calories', unit: '', step: '1', max: 20000 },
  { key: 'iron', label: 'Iron', short: 'Iron', unit: 'mg', step: '0.1', max: 1000 },
  { key: 'vitaminD', label: 'Vitamin D', short: 'Vit D', unit: 'mcg', step: '0.1', max: 10000 },
  { key: 'vitaminB12', label: 'Vitamin B12', short: 'B12', unit: 'mcg', step: '0.1', max: 100000 },
  { key: 'vitaminC', label: 'Vitamin C', short: 'Vit C', unit: 'mg', step: '0.1', max: 100000 },
] as const;

export type NutrientKey = typeof NUTRIENTS[number]['key'];
export const NUTRIENT_KEYS: NutrientKey[] = NUTRIENTS.map(n => n.key);

export type NutrientSource = 'ai' | 'manual';

/** Daily targets; null = no goal. A day "meets" a goal when its total reaches it. */
export type NutrientGoals = Record<NutrientKey, number | null>;

export const DEFAULT_NUTRIENT_GOALS: NutrientGoals = {
  calories: null,
  iron: null,
  vitaminD: 15,
  vitaminB12: 2.4,
  vitaminC: 75,
};

/** Parse a stored nutrient value ("12", "2.4", "") — null when blank or invalid. */
export function nutrientNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Display a nutrient amount: whole calories, otherwise up to 1 decimal (2 under 1). */
export function formatNutrient(n: number | null | undefined, key: NutrientKey): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  if (key === 'calories') return String(Math.round(n));
  const digits = Math.abs(n) < 1 ? 2 : 1;
  return String(Number(n.toFixed(digits)));
}

/** Where a food entry's nutrient value came from (calories also honour the older caloriesSource). */
export function nutrientSourceOf(cf: Record<string, unknown>, key: NutrientKey): NutrientSource | undefined {
  const map = (cf.nutrientSource as Partial<Record<NutrientKey, NutrientSource>> | undefined) ?? {};
  if (map[key]) return map[key];
  if (key === 'calories') return cf.caloriesSource as NutrientSource | undefined;
  return undefined;
}

/** Record a nutrient value typed by the user, so the AI never overwrites it. */
export function withManualNutrient(cf: Record<string, unknown>, key: NutrientKey, value: string): Record<string, unknown> {
  const map = { ...((cf.nutrientSource as Record<string, NutrientSource> | undefined) ?? {}), [key]: 'manual' as const };
  return { ...cf, [key]: value, nutrientSource: map, ...(key === 'calories' ? { caloriesSource: 'manual' } : {}) };
}
