import { useEffect, useMemo, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import type { DecryptedPost } from '@shared/crypto/types';
import { EmptyState } from '../atoms/EmptyState.js';
import { FilterPick } from '../molecules/FilterPick.js';
import { LoadMore } from '../molecules/LoadMore.js';
import { PlanGroup, PlanRow, PlanTable, type PlanColumn } from '../molecules/PlanTable.js';
import { RoundSearch } from '../molecules/RoundSearch.js';
import { SwipeActions } from '../molecules/SwipeActions.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { useUIStore } from '../../stores/uiStore.js';
import { DEFAULT_ACCENT_COLOR } from '../../styles/accent.js';
import { deleteEntryWithImages } from '../../utils/entryActions.js';
import { entryOutline } from '../../utils/entryOutline.js';
import { builtinEntryName } from '../../utils/stripHtml.js';
import { groupTopicRows, sortTopicRows } from '../../utils/topicList.js';
import { shortDay } from '../../utils/planTable.js';
import { toDateStr } from '../../utils/dateUtils.js';

/*
 * A list of entries as the topic page's table (views/TopicDetailView): a filter row — Group
 * (Month / None), Sort (Newest / Oldest / Title A–Z) and a rounded search at its right end —
 * then the entry's title and a muted line, the page's own columns and the date, under month
 * headings that fold. A row's title opens it in the journal; swipe deletes. 100 rows at a time.
 * Used by Recipes and Shopping lists, each with its own columns.
 */

type Group = 'month' | 'none';
type Sort = 'newest' | 'oldest' | 'title';
const GROUPS: { value: Group; label: string }[] = [{ value: 'month', label: 'Month' }, { value: 'none', label: 'None' }];
const SORTS: { value: Sort; label: string }[] = [{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'title', label: 'Title A–Z' }];
const PAGE = 100;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin: 24px 0 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-subtle);
`;

const Search = styled(RoundSearch)`
  margin-left: auto;
  width: 320px;
  @media (max-width: 768px) { margin-left: 0; width: 100%; order: -1; }
`;

export interface EntryTableColumn extends PlanColumn {
  /** What the cell shows for an entry */
  cell: (entry: DecryptedPost) => ReactNode;
}

export function EntryTableList({ label, entries, columns, noteOf, prefsKey, filters, emptyMessage }: {
  /** The table's name ("Recipes") — also the search's */
  label: string;
  entries: readonly DecryptedPost[];
  /** The page's own columns, between the title and the date */
  columns: EntryTableColumn[];
  /** The muted line beside the title (else the entry's next line) */
  noteOf?: (entry: DecryptedPost) => string | undefined;
  /** Where Group and Sort are remembered, per browser */
  prefsKey: string;
  /** More pickers before Group (Shopping lists: Current / Completed) */
  filters?: ReactNode;
  emptyMessage: string;
}) {
  const openInJournal = useOpenInJournal();
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;
  const [query, setQuery] = useState('');
  const [prefs, setPrefs] = useState(() => readPrefs(prefsKey));
  const setPref = (next: Partial<Prefs>) => {
    const all = { ...prefs, ...next };
    setPrefs(all);
    try { localStorage.setItem(prefsKey, JSON.stringify(all)); } catch { /* storage unavailable */ }
  };

  const rows = useMemo(() => entries.map(e => {
    const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
    const outline = entryOutline(e.content);
    return {
      id: e.id,
      entry: e,
      title: outline.title || builtinEntryName(cf) || 'Untitled',
      note: noteOf ? noteOf(e) ?? '' : outline.note,
      lines: outline.lines,
      tags: [] as string[],
      created: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
    };
  }), [entries, noteOf]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return sortTopicRows(rows.filter(r => words.every(w => `${r.title} ${r.note}`.toLowerCase().includes(w))), prefs.sort);
  }, [rows, query, prefs.sort]);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [query, prefs.sort, prefs.group]);
  const groups = useMemo(() => groupTopicRows(shown.slice(0, limit), prefs.group, new Date().getFullYear()), [shown, limit, prefs.group]);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const toggleFold = (key: string) => setFolded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const today = toDateStr(new Date());
  const tableColumns: PlanColumn[] = [{ label: singularLabel(label), width: '' }, ...columns, { label: 'Date', width: '90px', end: true }];

  return (<>
    <FilterRow role="group" aria-label={`Show ${label}`}>
      {filters}
      <FilterPick name="Group" value={GROUPS.find(g => g.value === prefs.group)?.label ?? 'Month'} set={false}>
        <select aria-label="Group by" value={prefs.group} onChange={e => setPref({ group: e.target.value as Group })}>
          {GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </FilterPick>
      <FilterPick name="Sort" value={SORTS.find(x => x.value === prefs.sort)?.label ?? 'Newest'} set={false}>
        <select aria-label="Sort" value={prefs.sort} onChange={e => setPref({ sort: e.target.value as Sort })}>
          {SORTS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </FilterPick>
      <Search ariaLabel={`Search ${label}`} value={query} onChange={setQuery} placeholder={`Search ${label.toLowerCase()}`} />
    </FilterRow>

    {entries.length === 0 ? (
      <EmptyState message={emptyMessage} />
    ) : shown.length === 0 ? (
      <EmptyState message="Nothing matches that search." />
    ) : (
      <PlanTable label={label} columns={tableColumns}>
        {groups.map(g => {
          const body = g.rows.map(r => (
            <SwipeActions key={`${g.key}:${r.id}`} accentColor={accentColor} onDelete={() => { void deleteEntryWithImages(r.id).catch(err => console.error('Failed to delete entry:', err)); }}>
              <PlanRow oneLine title={r.title} note={r.note || undefined} onOpen={() => openInJournal(r.id)}
                cells={[...columns.map(c => c.cell(r.entry)), shortDay(toDateStr(r.created), today)]}
                endCells={[...columns.map(c => !!c.end), true]} />
            </SwipeActions>
          ));
          if (!g.title) return body;
          return (
            <PlanGroup key={g.key} title={g.title} aside={`${g.rows.length} ${g.rows.length === 1 ? 'entry' : 'entries'}`}
              open={!folded.has(g.key)} onToggle={() => toggleFold(g.key)}>
              {body}
            </PlanGroup>
          );
        })}
        <LoadMore shown={Math.min(limit, shown.length)} total={shown.length} onMore={() => setLimit(l => l + PAGE)} />
      </PlanTable>
    )}
  </>);
}

/** "Recipes" → "Recipe", "Shopping lists" → "List" (the first column's name) */
function singularLabel(label: string): string {
  const last = label.split(' ').pop() ?? label;
  const word = last.endsWith('s') ? last.slice(0, -1) : last;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

interface Prefs { group: Group; sort: Sort }
function readPrefs(key: string): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}') as Partial<Prefs>;
    return {
      group: GROUPS.some(g => g.value === saved.group) ? saved.group! : 'month',
      sort: SORTS.some(x => x.value === saved.sort) ? saved.sort! : 'newest',
    };
  } catch { return { group: 'month', sort: 'newest' }; }
}
