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
const KITCHEN_MEASURE = /\b(tsps?|teaspoons?|tbsps?|tbs|tablespoons?|cups?|c\.|pinch(es)?|dash(es)?|splash(es)?|drizzles?|handfuls?|sprigs?|cloves?|ml|millilit(er|re)s?|fl\.? ?oz|pints?|quarts?|knobs?|to taste|as needed|optional)\b/i;
/** Pantry things bought as one jar, bottle or bag whatever a recipe uses: listed by name alone */
const PANTRY = /\b(salt|black pepper|peppercorns?|spices?|seasonings?|powder|flakes|extract|cumin|paprika|oregano|thyme|rosemary|cinnamon|nutmeg|turmeric|curry|cayenne|bay leaf|bay leaves|baking soda|yeast|vanilla|oil|vinegar|soy sauce|fish sauce|hot sauce|honey|syrup|mustard|ketchup|mayonnaise|sugar|flour|cornstarch|stock cubes?|bouillon)\b/i;

/**
 * The amount to show on a shopping list for one ingredient: a count or a
 * package size you'd buy ("5", "2 lb", "1 can") stays; a cooking measure
 * ("1.5 tbsp", "1 cup", "2 cloves") or anything for a pantry item goes, so
 * the item is just named.
 */
export function buyingAmount(amount: string, name: string): string {
  const a = amount.trim();
  if (!a || KITCHEN_MEASURE.test(a) || KITCHEN_MEASURE.test(name) || PANTRY.test(name)) return '';
  return a;
}

/** "2 cloves garlic, minced" → "garlic": a recipe's ingredient name as you'd shop for it */
export function shoppingName(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(',')[0]
    .replace(KITCHEN_MEASURE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PLAIN_COUNT = /^\d+$/;

/**
 * Recipe ingredients as shopping list lines: named as you'd buy them, with
 * only counts and package sizes kept, and the same item from several recipes
 * listed once (plain counts added up — 2 + 3 chicken breasts is 5).
 */
export function shoppingLines(ingredients: { amount: string; name: string }[]): { amount: string; name: string }[] {
  const lines = new Map<string, { amount: string; name: string }>();
  for (const ing of ingredients) {
    const name = shoppingName(ing.name);
    if (!name) continue;
    const amount = buyingAmount(ing.amount, name);
    const key = name.toLowerCase();
    const had = lines.get(key);
    if (!had) { lines.set(key, { amount, name }); continue; }
    had.amount = PLAIN_COUNT.test(had.amount) && PLAIN_COUNT.test(amount)
      ? String(Number(had.amount) + Number(amount))
      : had.amount === amount ? amount : '';
  }
  return [...lines.values()];
}

/** One shopping list line as its item name: "5 chicken breasts", or just "cumin" */
export const shoppingLineText = (line: { amount: string; name: string }) => [line.amount, line.name].filter(Boolean).join(' ');
