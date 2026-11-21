/*
 * A topic's page as a table (views/TopicDetailView): its entries sorted,
 * then grouped by month, by tag, or not at all. Pure.
 */

export type TopicSort = 'newest' | 'oldest' | 'title' | 'lines';
export type TopicGroup = 'month' | 'tag' | 'none';

export interface TopicRow {
  id: number;
  title: string;
  lines: number;
  tags: string[];
  created: Date;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function sortTopicRows<T extends TopicRow>(rows: T[], sort: TopicSort): T[] {
  const time = (r: T) => r.created.getTime();
  const out = [...rows];
  if (sort === 'oldest') out.sort((a, b) => time(a) - time(b));
  else if (sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || time(b) - time(a));
  else if (sort === 'lines') out.sort((a, b) => b.lines - a.lines || time(b) - time(a));
  else out.sort((a, b) => time(b) - time(a));
  return out;
}

/**
 * The rows under headings, in the order given: by month ("November", with
 * the year when it isn't this one), by tag (an entry under each of its tags,
 * tags A–Z, "No tag" last), or one group with no heading.
 */
export function groupTopicRows<T extends TopicRow>(rows: T[], group: TopicGroup, thisYear: number): { key: string; title: string; rows: T[] }[] {
  if (group === 'none') return [{ key: 'all', title: '', rows }];
  const groups = new Map<string, { key: string; title: string; rows: T[] }>();
  const put = (key: string, title: string, row: T) => {
    const g = groups.get(key) ?? { key, title, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  };
  for (const r of rows) {
    if (group === 'month') {
      const y = r.created.getFullYear();
      const m = r.created.getMonth();
      put(`${y}-${m}`, y === thisYear ? MONTHS[m] : `${MONTHS[m]} ${y}`, r);
    } else if (r.tags.length === 0) put('', 'No tag', r);
    else for (const t of r.tags) put(t.toLowerCase(), t, r);
  }
  const list = [...groups.values()];
  if (group === 'tag') list.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.title.localeCompare(b.title)));
  return list;
}
