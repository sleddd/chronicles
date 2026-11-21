import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { topicEntries, type TopicEntries } from '../utils/topicIndex.js';
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

/**
 * The entries of every topic with one of these names, one shared list per topic
 * (utils/topicIndex). The lists keep their identity while their topics are
 * unchanged, so a save elsewhere in the journal redoes nothing here.
 */
function useTopicsEntries(...names: string[]): TopicEntries[] {
  return useEntriesStore(useShallow(s => s.allTopics
    .filter(t => names.includes(t.name.trim().toLowerCase()))
    .map(t => topicEntries(s.decryptedEntries, t.id))));
}

export function useKitchenData(): { allergies: KitchenAllergy[]; recipes: KitchenRecipeIn[]; menuWeeks: MenuWeek[] } {
  const allergyLists = useTopicsEntries('allergy', 'allergies');
  const menuLists = useTopicsEntries('menu plan', 'menu plans', 'menu');
  const recipeLists = useTopicsEntries('recipe', 'recipes');

  const allergies = useMemo(() => {
    const out: KitchenAllergy[] = [];
    const seen = new Set<string>();
    for (const e of allergyLists.flat()) {
      const cf = fieldsOf(e.metadata);
      const allergen = text(cf.allergen) || entryTitleText(e.content);
      if (!allergen || seen.has(allergen.toLowerCase())) continue;
      seen.add(allergen.toLowerCase());
      const severity = typeof cf.severity === 'number' && cf.severity >= 1 && cf.severity <= 10 ? cf.severity : null;
      out.push({ allergen, reaction: text(cf.reaction), severity });
    }
    return out;
  }, [allergyLists]);

  const menuWeeks = useMemo(() => {
    const out: MenuWeek[] = [];
    for (const e of menuLists.flat()) {
      const cf = fieldsOf(e.metadata);
      const weekStart = text(cf.weekStart);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) continue;
      const days = cf.days && typeof cf.days === 'object' ? Object.values(cf.days as Record<string, unknown>) : [];
      const meals = days.flatMap(day => (day && typeof day === 'object'
        ? Object.values(day as Record<string, unknown>).map(slot => text((slot as { mealName?: unknown } | null)?.mealName))
        : [])).filter(Boolean);
      out.push({ weekStart, meals });
    }
    return out;
  }, [menuLists]);

  const recipes = useMemo(() => {
    const out: KitchenRecipeIn[] = [];
    for (const e of recipeLists.flat()) {
      const cf = fieldsOf(e.metadata);
      const title = text(cf.recipeName) || entryTitleText(e.content);
      if (!title) continue;
      const ingredients = Array.isArray(cf.ingredients)
        ? (cf.ingredients as RecipeIngredient[]).map(i => text(i?.name)).filter(Boolean)
        : [];
      out.push({ id: e.id, title, ingredients });
    }
    return out;
  }, [recipeLists]);

  return useMemo(() => ({ allergies, recipes, menuWeeks }), [allergies, recipes, menuWeeks]);
}
