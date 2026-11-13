/* Goal categories: the areas of life a goal belongs to (Health, Career…). A
   short built-in list plus the person's own, saved encrypted as the
   `goalCategories` setting. A goal carries one (`goalCategory`); its
   milestones, tasks and habits linked to it take the goal's. Pure helpers. */

export const DEFAULT_GOAL_CATEGORIES = ['Health', 'Career', 'Finances', 'Relationships', 'Growth', 'Home'] as const;

/** What's saved: categories the person added, and built-in ones they hid */
export interface GoalCategoryConfig { added: string[]; hidden: string[] }

export const EMPTY_GOAL_CATEGORIES: GoalCategoryConfig = { added: [], hidden: [] };

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

export const sameCategory = (a: string, b: string) => key(a) === key(b);

/** The saved setting, well-formed (it is user data from the server) */
export function parseGoalCategories(raw: unknown): GoalCategoryConfig {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return { added: strings(o.added), hidden: strings(o.hidden) };
}

/** The categories to offer: built-in ones not hidden, then the person's own */
export function goalCategoryList(config: GoalCategoryConfig | null | undefined): string[] {
  const c = config ?? EMPTY_GOAL_CATEGORIES;
  const hidden = new Set(c.hidden.map(key));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...DEFAULT_GOAL_CATEGORIES, ...c.added]) {
    const k = key(s);
    if (!k || hidden.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out;
}

/** Save a category of the person's own (bringing back a hidden built-in one of that name) */
export function addGoalCategory(config: GoalCategoryConfig, label: string): GoalCategoryConfig {
  const name = label.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) return config;
  const hidden = config.hidden.filter(h => key(h) !== key(name));
  const isDefault = DEFAULT_GOAL_CATEGORIES.some(d => key(d) === key(name));
  const added = isDefault || config.added.some(a => key(a) === key(name)) ? config.added : [...config.added, name];
  return { added, hidden };
}

/** Remove a category: the person's own is deleted, a built-in one is hidden. Goals keep the name they carry. */
export function removeGoalCategory(config: GoalCategoryConfig, label: string): GoalCategoryConfig {
  const k = key(label);
  if (DEFAULT_GOAL_CATEGORIES.some(d => key(d) === k)) {
    return config.hidden.some(h => key(h) === k) ? config : { ...config, hidden: [...config.hidden, label.trim()] };
  }
  return { ...config, added: config.added.filter(a => key(a) !== k) };
}

/** A goal's category from its fields ('' = none) */
export function goalCategoryOf(cf: Record<string, unknown> | undefined): string {
  return typeof cf?.goalCategory === 'string' ? cf.goalCategory.trim() : '';
}

/** The list plus any category still on a goal but no longer in it (so it stays pickable) */
export function categoriesInUse(list: string[], used: string[]): string[] {
  const out = [...list];
  for (const u of used) if (u.trim() && !out.some(x => sameCategory(x, u))) out.push(u.trim());
  return out;
}

/** A category's place in the list; ones not in it follow, and no category comes last */
export function categoryRank(category: string, list: string[]): number {
  if (!category.trim()) return list.length + 1;
  const i = list.findIndex(x => sameCategory(x, category));
  return i === -1 ? list.length : i;
}

/**
 * Items grouped under their category, in the list's order — categories not in
 * the list after it, "No category" last. Empty groups are left out and each
 * group keeps the items' incoming order.
 */
export function groupByCategory<T>(items: T[], categoryOf: (item: T) => string, list: string[]): { category: string; items: T[] }[] {
  const names = categoriesInUse(list, items.map(categoryOf));
  const groups = [...names, ''].map(category => ({
    category, items: items.filter(i => (category ? sameCategory(categoryOf(i), category) : !categoryOf(i).trim())),
  }));
  return groups.filter(g => g.items.length > 0);
}
