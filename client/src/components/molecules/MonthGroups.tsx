import type { ReactNode } from 'react';
import styled from 'styled-components';

/* The app's list layout (every list but the journal's): entries grouped under
   a thin Work Sans month heading ("October 2026") with a firmer rule under it,
   then the rows (EntryListCard). Items must already be sorted newest first.
   Props only. */

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
}

export function MonthGroups<T>({ items, dateOf, keyOf, children }: MonthGroupsProps<T>) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
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
    </>
  );
}
