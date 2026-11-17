import { useState, type ReactNode } from 'react';
import { LoadMore } from './LoadMore.js';
import styled from 'styled-components';

/* The app's list layout (every list but the journal's): entries grouped under
   a thin Work Sans month heading ("October 2026") with a firmer rule under it,
   then the rows (EntryListCard). Items must already be sorted newest first.
   Only so many rows are drawn at once (a topic with years of entries would
   draw thousands): more as the list's foot scrolls into view (LoadMore). */

/** Rows drawn at a time */
export const MONTH_GROUPS_PAGE = 100;

const Month = styled.h2`
  margin: 36px 0 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-default);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  color: var(--text-secondary);
`;

const Group = styled.section`
  &:first-child > ${Month} { margin-top: 24px; }
`;

interface MonthGroupsProps<T> {
  items: T[];
  dateOf: (item: T) => Date;
  keyOf: (item: T) => string | number;
  children: (item: T) => ReactNode;
  /** Rows drawn at a time (default 100) */
  pageSize?: number;
}

export function MonthGroups<T>({ items, dateOf, keyOf, children, pageSize = MONTH_GROUPS_PAGE }: MonthGroupsProps<T>) {
  const [rows, setRows] = useState(pageSize);
  const shown = Math.min(rows, items.length);
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (let i = 0; i < shown; i++) {
    const item = items[i];
    const d = dateOf(item);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  return (
    <>
      {groups.map(g => (
        <Group key={g.key} aria-label={g.label}>
          <Month>{g.label}</Month>
          {g.items.map(item => <div key={keyOf(item)}>{children(item)}</div>)}
        </Group>
      ))}
      <LoadMore shown={shown} total={items.length} onMore={() => setRows(shown + pageSize)} />
    </>
  );
}
