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
      const items = (customFields(e).items as ShoppingItem[] | undefined) ?? [];
      return items.length === 0 || items.some(i => !i.checked);
    })
    .sort((a, b) => time(b) - time(a))[0];
}
