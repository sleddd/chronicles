import type { DecryptedPost } from '@shared/crypto/types';
import type { MealSlotType, MenuPlanDay, ShoppingItem } from '../types/fields.js';
import { shiftDay } from './foodLog.js';

/** Helpers for the From the Kitchen dashboard (pure — easy to test). */

export const MENU_SLOTS: { key: MealSlotType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

export interface PlannedMeal {
  slot: MealSlotType;
  label: string;
  name: string;
  recipeId: number | null;
}

function customFields(e: DecryptedPost): Record<string, unknown> {
  return ((e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
}

function topicOf(e: DecryptedPost): unknown {
  return (e.metadata as Record<string, unknown> | undefined)?._taxonomyId;
}

/** Every planned day across all saved weekly menus, keyed YYYY-MM-DD. */
export function menuDays(entries: DecryptedPost[], menuTopicId: number | undefined): Map<string, MenuPlanDay> {
  const out = new Map<string, MenuPlanDay>();
  if (menuTopicId === undefined) return out;
  for (const e of entries) {
    if (topicOf(e) !== menuTopicId) continue;
    const days = customFields(e).days as Record<string, MenuPlanDay> | undefined;
    if (days && typeof days === 'object') for (const [d, plan] of Object.entries(days)) out.set(d, plan);
  }
  return out;
}

export function mealsOn(plan: MenuPlanDay | undefined): PlannedMeal[] {
  if (!plan) return [];
  return MENU_SLOTS.flatMap(({ key, label }) => {
    const slot = plan[key];
    const name = (slot?.mealName || slot?.recipeName || '').trim();
    return name ? [{ slot: key, label, name, recipeId: slot?.recipeId ?? null }] : [];
  });
}

/** Today's planned meals, else the next day (within `lookahead` days) that has any. */
export function upcomingMeals(
  days: Map<string, MenuPlanDay>, today: string, lookahead = 14,
): { day: string; meals: PlannedMeal[] } | null {
  for (let i = 0; i <= lookahead; i++) {
    const day = shiftDay(today, i);
    const meals = mealsOn(days.get(day));
    if (meals.length) return { day, meals };
  }
  return null;
}

/** The newest shopping list that still has unchecked items (or no items yet). */
export function latestOpenList(entries: DecryptedPost[], listTopicId: number | undefined): DecryptedPost | undefined {
  if (listTopicId === undefined) return undefined;
  const time = (e: DecryptedPost) => new Date(e.createdAt).getTime();
  return entries
    .filter(e => topicOf(e) === listTopicId)
    .filter(e => {
      const raw = customFields(e).items;
      const items = Array.isArray(raw) ? raw as ShoppingItem[] : [];
      return items.length === 0 || items.some(i => !i?.checked);
    })
    .sort((a, b) => time(b) - time(a))[0];
}

/** Name for a shopping list saved without a title: "Shopping list created on Oct 7, 2026". */
export function defaultShoppingListTitle(date = new Date()): string {
  return `Shopping list created on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/* ── Shopping list amounts: what you buy, not what a recipe measures ── */

/** Cooking measures nobody buys by: "1 cup flour" is bought as a bag of flour */
const MEASURE_WORDS = 'tsps?|teaspoons?|tbsps?|tbs|tablespoons?|cups?|c\\.|pinch(?:es)?|dash(?:es)?|splash(?:es)?|drizzles?|handfuls?|sprigs?|cloves?|ml|millilit(?:er|re)s?|fl\\.? ?oz|knobs?';
const KITCHEN_MEASURE = new RegExp(`\\b(?:${MEASURE_WORDS}|to taste|as needed|optional)\\b`, 'i');
/** A measure in front of the food it measures: "2 cloves garlic", "pinch of salt" */
const LEADING_MEASURE = new RegExp(`^[\\d\\s./-]*(?:${MEASURE_WORDS})(?![a-z])\\s*(?:of\\s+)?(?=\\S)`, 'i');
/** A measure after its food, where it can only be a measure: "garlic cloves", "thyme sprigs" (not "ground cloves") */
const TRAILING_MEASURE = /(?<=\bgarlic)\s+cloves?$|(?<=\S)\s+sprigs?$/i;
const COOKING_NOTE = /\b(?:to taste|as needed|optional)\b/gi;
/**
 * Pantry things bought as one jar, bottle or bag whatever a recipe uses:
 * listed by name alone. Matched as what the item is (the end of its name), so
 * "olive oil" is pantry and "flour tortillas" or "oil-packed tuna" are not.
 */
const PANTRY = /\b(salt|black pepper|peppercorns?|spices?|seasonings?|powder|flakes|extract|cumin|paprika|oregano|thyme|rosemary|cinnamon|nutmeg|cloves|turmeric|curry|cayenne|bay leaf|bay leaves|baking soda|yeast|vanilla|oil|vinegar|soy sauce|fish sauce|hot sauce|honey|syrup|mustard|ketchup|mayonnaise|sugar|flour|cornstarch|stock cubes?|bouillon)$/i;

/**
 * The amount to show on a shopping list for one ingredient: a count or a
 * package size you'd buy ("5", "2 lb", "1 can") stays; a cooking measure
 * ("1.5 tbsp", "1 cup", "2 cloves") or anything for a pantry item goes, so
 * the item is just named.
 */
export function buyingAmount(amount: string, name: string): string {
  const a = amount.trim();
  if (!a || KITCHEN_MEASURE.test(a) || PANTRY.test(name.trim())) return '';
  return a;
}

/** "2 cloves garlic, minced" → "garlic": a recipe's ingredient name as you'd shop for it */
export function shoppingName(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(',')[0]
    .replace(COOKING_NOTE, '')
    .trim()
    .replace(LEADING_MEASURE, '')
    .replace(TRAILING_MEASURE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2", "1.5 lb", "1/2 can", "1 1/2 lb" → the number and what it counts */
const AMOUNT = /^(\d+ \d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/;

/** What follows the number in a range ("2-3", "2 – 3 lb", "1 to 2"): not a unit */
const RANGE_REST = /^(?:[-–—]|to\b)|\d/i;

function readAmount(amount: string): { n: number; unit: string } | null {
  const m = AMOUNT.exec(amount.trim());
  if (!m || RANGE_REST.test(m[2])) return null;
  const n = m[1].split(' ').reduce((sum, piece) => {
    const [top, bottom] = piece.split('/').map(Number);
    return sum + (bottom === undefined ? top : top / bottom);
  }, 0);
  return Number.isFinite(n) ? { n, unit: m[2].trim() } : null;
}

/**
 * Two amounts of the same item as one: added up when they count the same thing
 * (2 + 3 → "5", "1 lb" + "1 lb" → "2 lb"), else blank, so the list never
 * shows less than is needed.
 */
export function addAmounts(a: string, b: string): string {
  const x = readAmount(a);
  const y = readAmount(b);
  if (!x || !y || x.unit.toLowerCase() !== y.unit.toLowerCase()) return '';
  const total = Math.round((x.n + y.n) * 100) / 100;
  return [String(total), x.unit].filter(Boolean).join(' ');
}

/** One shopping list line as text: "2 lb ground beef", or just "salt" */
export function shoppingLineText(line: { amount: string; name: string }): string {
  return [line.amount, line.name].filter(Boolean).join(' ');
}

/**
 * Recipe ingredients as shopping list lines: named as you'd buy them, with
 * only counts and package sizes kept, and the same item from several recipes
 * listed once with its amounts added up.
 */
export function shoppingLines(ingredients: { amount: string; name: string }[]): { amount: string; name: string }[] {
  const lines = new Map<string, { amount: string; name: string }>();
  for (const ing of ingredients) {
    const name = shoppingName(ing.name);
    if (!name) continue;
    const amount = buyingAmount(ing.amount, name);
    const key = name.toLowerCase();
    const had = lines.get(key);
    if (had) had.amount = addAmounts(had.amount, amount);
    else lines.set(key, { amount, name });
  }
  return [...lines.values()];
}
