/* Search + sort for the Planning tab you're in (board and list alike). Pure. */

export type PlanSort = 'newest' | 'oldest' | 'title' | 'due' | 'priority';

export const PLAN_SORTS: { value: PlanSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
];

export interface PlanRow {
  title: string;
  /** Everything the search box matches against (title, parent, …) */
  text: string;
  /** YYYY-MM-DD target date / deadline, '' when unset */
  due: string;
  /** Task priority ('urgent' … 'none'), '' for goals and milestones */
  priority: string;
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
  };
  return [...matched].sort(cmp[sort]).map(x => x.item);
}
