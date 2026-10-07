import styled from 'styled-components';

/* Spreadsheet-style entry lists, matching the Meals log table: one row per
   entry with a stacked Topic-over-Date column and an Entry column, hairline
   rules, 14px text, and a tracked-uppercase header row. Shared by EntryCard (journal list) and
   EntryListCard (topic, task and health lists) so every list lines up. */

/** Topic over Date | Entry | trailing controls */
export const ENTRY_ROW_COLUMNS = 'minmax(0, 112px) minmax(0, 1fr) auto';

/** "Oct 7" this year, "Oct 7 '25" for other years. */
export function formatRowDate(d: Date, now = new Date()): string {
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.getFullYear() === now.getFullYear() ? md : `${md} '${String(d.getFullYear()).slice(-2)}`;
}

/** Shared cell padding so header and rows align. */
export const ENTRY_ROW_PADDING = '12px 10px 12px 4px';
/** Inset variant for edge-to-edge panels (journal list) — matches its 20px toolbar gutter. */
export const ENTRY_ROW_INSET_PADDING = '12px 20px';

const Head = styled.div<{ $inset?: boolean }>`
  display: grid;
  grid-template-columns: ${ENTRY_ROW_COLUMNS};
  gap: 12px;
  align-items: end;
  padding: ${({ $inset }) => ($inset ? '6px 20px 10px' : '6px 10px 10px 4px')};
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  white-space: nowrap;
`;

/** Column header row for an entry list. */
export function EntryTableHead({ className, inset }: { className?: string; inset?: boolean }) {
  return (
    <Head className={className} $inset={inset} role="presentation">
      <span>Topic / Date</span>
      <span>Entry</span>
      <span />
    </Head>
  );
}

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
  color: var(--text-secondary);
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
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-tertiary)')};
`;

export const EntryCell = styled.div`
  min-width: 0;
`;

export const EntryTitle = styled.div<{ $completed?: boolean }>`
  font-family: var(--font-sans);
  font-size: 14px;
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
