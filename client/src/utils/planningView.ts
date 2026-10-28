/* Search + sort for the Planning tab you're in (board and list alike). Pure. */

export type PlanSort = 'newest' | 'oldest' | 'title' | 'due' | 'priority' | 'type';

export const PLAN_SORTS: { value: PlanSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Type' },
];

export interface PlanRow {
  title: string;
  /** Everything the search box matches against (title, parent, …) */
  text: string;
  /** YYYY-MM-DD target date / deadline, '' when unset */
  due: string;
  /** Task priority ('urgent' … 'none'), '' for goals and milestones */
  priority: string;
  /** Task type's place in the type list (taskTypeRank); goals and milestones leave it out */
  typeRank?: number;
  created: number;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Items whose text holds every word of the query (any case), in the chosen
 * order. 'newest' keeps the incoming order (newest first, or a board's own
 * drag order); undated items sort after dated ones; ties fall back to newest.
 */
export function searchAndSort<T>(items: T[], row: (t: T) => PlanRow, query: string, sort: PlanSort): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = items.map((item, index) => ({ item, index, r: row(item) }));
  const matched = words.length
    ? rows.filter(({ r }) => { const t = r.text.toLowerCase(); return words.every(w => t.includes(w)); })
    : rows;
  const byNewest = (a: typeof rows[number], b: typeof rows[number]) => a.index - b.index;
  const cmp: Record<PlanSort, (a: typeof rows[number], b: typeof rows[number]) => number> = {
    newest: byNewest,
    oldest: (a, b) => a.r.created - b.r.created,
    title: (a, b) => a.r.title.localeCompare(b.r.title, undefined, { sensitivity: 'base' }) || byNewest(a, b),
    due: (a, b) => (!a.r.due ? 1 : 0) - (!b.r.due ? 1 : 0) || a.r.due.localeCompare(b.r.due) || byNewest(a, b),
    priority: (a, b) => (PRIORITY_RANK[a.r.priority] ?? 4) - (PRIORITY_RANK[b.r.priority] ?? 4) || byNewest(a, b),
    type: (a, b) => (a.r.typeRank ?? 0) - (b.r.typeRank ?? 0) || byNewest(a, b),
  };
  return [...matched].sort(cmp[sort]).map(x => x.item);
}

/* ── Saved views: a named Planning setup to reopen in one click ── */

export type PlanTabKey = 'goals' | 'milestones' | 'tasks' | 'todos';

export interface SavedPlanView {
  id: string;
  name: string;
  tab: PlanTabKey;
  view: 'board' | 'list';
  query: string;
  sort: PlanSort;
  goalId: number | null;
  milestoneId: number | null;
  /** The tab's status filter ('' = all): a task status on Tasks/Todos, a board status on Goals/Milestones */
  status: string;
  /** Task type filter ('' = all); older saved views have none */
  taskType?: string;
}

export type PlanViewState = Omit<SavedPlanView, 'id' | 'name'>;

export const PLAN_TAB_PATHS: Record<PlanTabKey, string> = {
  goals: '/goals', milestones: '/goals/milestones', tasks: '/goals/tasks', todos: '/goals/todos',
};

/** True when the current setup is exactly the saved one */
export function isSameView(a: PlanViewState, b: PlanViewState): boolean {
  return a.tab === b.tab && a.view === b.view && a.query.trim() === b.query.trim() && a.sort === b.sort
    && a.goalId === b.goalId && a.milestoneId === b.milestoneId && a.status === b.status
    && (a.taskType ?? '') === (b.taskType ?? '');
}

/** Keep only well-formed saved views (the setting is user data from the server) */
export function parseSavedViews(raw: unknown): SavedPlanView[] {
  if (!Array.isArray(raw)) return [];
  const tabs = Object.keys(PLAN_TAB_PATHS);
  return raw.filter((v): v is SavedPlanView =>
    !!v && typeof v === 'object' && typeof (v as SavedPlanView).id === 'string'
    && typeof (v as SavedPlanView).name === 'string' && tabs.includes((v as SavedPlanView).tab));
}
