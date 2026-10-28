export interface PlannerFilterConfig {
  keyword: string;
  itemTypes: Array<'goals' | 'milestones' | 'tasks' | 'todos'>;
  goalStatus: string;
  taskStatus: string;
  priority: string;
  parentGoalId: number | null;
  parentMilestoneId: number | null;
}

export interface SavedPlannerFilter {
  id: string;
  name: string;
  config: PlannerFilterConfig;
}

export const EMPTY_PLANNER_FILTER: PlannerFilterConfig = {
  keyword: '',
  itemTypes: [],
  goalStatus: 'all',
  taskStatus: 'all',
  priority: 'all',
  parentGoalId: null,
  parentMilestoneId: null,
};

export function filtersEqual(a: PlannerFilterConfig, b: PlannerFilterConfig): boolean {
  return (
    a.keyword === b.keyword &&
    a.goalStatus === b.goalStatus &&
    a.taskStatus === b.taskStatus &&
    a.priority === b.priority &&
    a.parentGoalId === b.parentGoalId &&
    a.parentMilestoneId === b.parentMilestoneId &&
    a.itemTypes.length === b.itemTypes.length &&
    a.itemTypes.every(t => b.itemTypes.includes(t))
  );
}

export function isFilterEmpty(f: PlannerFilterConfig): boolean {
  return (
    !f.keyword.trim() &&
    f.itemTypes.length === 0 &&
    f.goalStatus === 'all' &&
    f.taskStatus === 'all' &&
    f.priority === 'all' &&
    f.parentGoalId === null &&
    f.parentMilestoneId === null
  );
}

const ITEM_TYPES = ['goals', 'milestones', 'tasks', 'todos'] as const;

// The typed search words are words from decrypted titles: they stay out of
// the address (browser history outlives sign-out and can sync to the browser
// maker's cloud) and wait in sessionStorage, which sign-out clears
const KEYWORD_STORE = 'planner-keyword-v1';

function storeKeyword(keyword: string): void {
  try {
    if (keyword) sessionStorage.setItem(KEYWORD_STORE, keyword);
    else sessionStorage.removeItem(KEYWORD_STORE);
  } catch { /* storage unavailable: the words just aren't kept */ }
}

function storedKeyword(): string {
  try { return sessionStorage.getItem(KEYWORD_STORE) ?? ''; } catch { return ''; }
}

/** The applied filter as a URL value (`?f=…`), so it survives opening an
 *  entry in the journal and coming back (the return path keeps the query).
 *  Everything but the search words, which are kept in this tab instead. */
export function encodePlannerFilter(f: PlannerFilterConfig): string {
  storeKeyword(f.keyword);
  const { keyword: _kept, ...rest } = f;
  return JSON.stringify(rest);
}

/** Parse `?f=…` back into a filter; null when missing or malformed. */
export function decodePlannerFilter(raw: string | null): PlannerFilterConfig | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PlannerFilterConfig>;
    if (!v || typeof v !== 'object') return null;
    const id = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const str = (x: unknown, d: string) => (typeof x === 'string' ? x : d);
    return {
      keyword: storedKeyword(),
      itemTypes: Array.isArray(v.itemTypes) ? v.itemTypes.filter((t): t is PlannerFilterConfig['itemTypes'][number] => (ITEM_TYPES as readonly string[]).includes(t as string)) : [],
      goalStatus: str(v.goalStatus, 'all'),
      taskStatus: str(v.taskStatus, 'all'),
      priority: str(v.priority, 'all'),
      parentGoalId: id(v.parentGoalId),
      parentMilestoneId: id(v.parentMilestoneId),
    };
  } catch {
    return null;
  }
}
