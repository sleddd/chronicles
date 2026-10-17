import styled from 'styled-components';

/* Spreadsheet-style entry lists, matching the Meals log table: one row per
   entry with a stacked Topic-over-Date column and an Entry column, hairline
   rules and 16px entry text — no header row. Shared by EntryCard (journal list) and
   EntryListCard (topic, task and health lists) so every list lines up. */

/** Topic over Date | Entry | trailing controls */
export const ENTRY_ROW_COLUMNS = 'minmax(0, 88px) minmax(0, 1fr) auto';

/** "Oct 07" (month + 2-digit day, no year) — the row date on every entry list. */
export function formatListDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

/** Shared row padding. */
export const ENTRY_ROW_PADDING = '16px 10px 16px 4px';
/** Inset variant for edge-to-edge panels (journal list) — matches its 20px toolbar gutter. */
export const ENTRY_ROW_INSET_PADDING = '22px 20px';

/* Cell pieces both row components use */

/** First column: the topic label with the date underneath */
export const MetaCell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
`;

export const DateCell = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-meta);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

export const TopicCell = styled.span<{ $active?: boolean }>`
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12rem;
  text-transform: uppercase;
  color: var(--text-meta);
`;

export const EntryCell = styled.div`
  min-width: 0;
`;

export const EntryTitle = styled.div<{ $completed?: boolean }>`
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.35;
  color: ${({ $completed }) => ($completed ? 'var(--text-tertiary)' : 'var(--text-primary)')};
  text-decoration: ${({ $completed }) => ($completed ? 'line-through' : 'none')};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const EntryPreview = styled.div`
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
