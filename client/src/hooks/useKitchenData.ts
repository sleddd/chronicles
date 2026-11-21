import { useMemo } from 'react';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { topicEntries } from '../utils/topicIndex.js';
import type { KitchenAllergy, KitchenRecipeIn } from '../utils/aiKitchen.js';
import type { RecipeIngredient } from '../types/fields.js';

/*
 * What AI kitchen can offer to send, read from the journal in this browser:
 * the person's allergies (Allergy entries), their recipes (name and
 * ingredient names) and the meal names of their saved Menu weeks. Nothing
 * here is sent: the dialogs decide what goes, and allergies go only when
 * ticked for that run.
 */

const fieldsOf = (meta: unknown): Record<string, unknown> =>
  ((meta as Record<string, unknown> | null)?._customFields as Record<string, unknown> | undefined) ?? {};
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** A saved week of the Menu: its Monday and the meal names planned in it */
export interface MenuWeek { weekStart: string; meals: string[] }

export function useKitchenData(): { allergies: KitchenAllergy[]; recipes: KitchenRecipeIn[]; menuWeeks: MenuWeek[] } {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const topics = useEntriesStore(s => s.allTopics);
  return useMemo(() => {
    /** Every entry in the topics with one of these names, from the journal's one pass by topic */
    const entriesIn = (...names: string[]) => topics
      .filter(t => names.includes(t.name.trim().toLowerCase()))
      .flatMap(t => topicEntries(entries, t.id));

    const allergies: KitchenAllergy[] = [];
    const seen = new Set<string>();
    for (const e of entriesIn('allergy', 'allergies')) {
      const cf = fieldsOf(e.metadata);
      const allergen = text(cf.allergen) || entryTitleText(e.content);
      if (!allergen || seen.has(allergen.toLowerCase())) continue;
      seen.add(allergen.toLowerCase());
      const severity = typeof cf.severity === 'number' && cf.severity >= 1 && cf.severity <= 10 ? cf.severity : null;
      allergies.push({ allergen, reaction: text(cf.reaction), severity });
    }

    const menuWeeks: MenuWeek[] = [];
    for (const e of entriesIn('menu plan', 'menu plans', 'menu')) {
      const cf = fieldsOf(e.metadata);
      const weekStart = text(cf.weekStart);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) continue;
      const days = cf.days && typeof cf.days === 'object' ? Object.values(cf.days as Record<string, unknown>) : [];
      const meals = days.flatMap(day => (day && typeof day === 'object'
        ? Object.values(day as Record<string, unknown>).map(slot => text((slot as { mealName?: unknown } | null)?.mealName))
        : [])).filter(Boolean);
      menuWeeks.push({ weekStart, meals });
    }

    const recipes: KitchenRecipeIn[] = [];
    for (const e of entriesIn('recipe', 'recipes')) {
      const cf = fieldsOf(e.metadata);
      const title = text(cf.recipeName) || entryTitleText(e.content);
      if (!title) continue;
      const ingredients = Array.isArray(cf.ingredients)
        ? (cf.ingredients as RecipeIngredient[]).map(i => text(i?.name)).filter(Boolean)
        : [];
      recipes.push({ id: e.id, title, ingredients });
    }
    return { allergies, recipes, menuWeeks };
  }, [entries, topics]);
}
