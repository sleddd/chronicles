import { useMemo } from 'react';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entryTitleText } from '../utils/entryTitle.js';
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
    const idsNamed = (...names: string[]) =>
      new Set(topics.filter(t => names.includes(t.name.trim().toLowerCase())).map(t => t.id));
    const allergyTopics = idsNamed('allergy', 'allergies');
    const recipeTopics = idsNamed('recipe', 'recipes');
    const menuTopics = idsNamed('menu plan', 'menu plans', 'menu');
    const menuWeeks: MenuWeek[] = [];
    const allergies: KitchenAllergy[] = [];
    const seen = new Set<string>();
    const recipes: KitchenRecipeIn[] = [];
    for (const e of entries) {
      const topicId = (e.metadata as Record<string, unknown> | null)?._taxonomyId as number | undefined;
      if (topicId === undefined) continue;
      const cf = fieldsOf(e.metadata);
      if (allergyTopics.has(topicId)) {
        const allergen = text(cf.allergen) || entryTitleText(e.content);
        if (!allergen || seen.has(allergen.toLowerCase())) continue;
        seen.add(allergen.toLowerCase());
        const severity = typeof cf.severity === 'number' && cf.severity >= 1 && cf.severity <= 10 ? cf.severity : null;
        allergies.push({ allergen, reaction: text(cf.reaction), severity });
      } else if (menuTopics.has(topicId)) {
        const weekStart = text(cf.weekStart);
        const days = cf.days && typeof cf.days === 'object' ? Object.values(cf.days as Record<string, unknown>) : [];
        const meals = days.flatMap(day => (day && typeof day === 'object'
          ? Object.values(day as Record<string, unknown>).map(slot => text((slot as { mealName?: unknown } | null)?.mealName))
          : [])).filter(Boolean);
        if (/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) menuWeeks.push({ weekStart, meals });
      } else if (recipeTopics.has(topicId)) {
        const title = text(cf.recipeName) || entryTitleText(e.content);
        if (!title) continue;
        const ingredients = Array.isArray(cf.ingredients)
          ? (cf.ingredients as RecipeIngredient[]).map(i => text(i?.name)).filter(Boolean)
          : [];
        recipes.push({ id: e.id, title, ingredients });
      }
    }
    return { allergies, recipes, menuWeeks };
  }, [entries, topics]);
}
