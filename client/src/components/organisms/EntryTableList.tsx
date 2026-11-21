import { useEffect, useMemo, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import type { DecryptedPost } from '@shared/crypto/types';
import { EmptyState } from '../atoms/EmptyState.js';
import { FilterPick } from '../molecules/FilterPick.js';
import { LoadMore } from '../molecules/LoadMore.js';
import { PlanGroup, PlanRow, PlanTable, type PlanColumn } from '../molecules/PlanTable.js';
import { RoundSearch } from '../molecules/RoundSearch.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { SwipeActions } from '../molecules/SwipeActions.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { useUIStore } from '../../stores/uiStore.js';
import { DEFAULT_ACCENT_COLOR } from '../../styles/accent.js';
import { deleteEntryWithImages } from '../../utils/entryActions.js';
import { entryOutline } from '../../utils/entryOutline.js';
import { builtinEntryName } from '../../utils/stripHtml.js';
import { groupTopicRows, sortTopicRows, type TopicGroup, type TopicSort } from '../../utils/topicList.js';
import { tagsInUse, sameTag } from '../../utils/entryTags.js';
import { shortDay } from '../../utils/planTable.js';
import { toDateStr } from '../../utils/dateUtils.js';

/*
 * A list of entries as a table: a filter row — Group (Month / Tag / None), Tags, Sort
 * (Newest / Oldest / Title A–Z / Longest) and a rounded search at its right end — then the
 * entry's title and a muted line, the page's own columns and the date, under headings that
 * fold. A row's title opens it in the journal; swipe deletes. 100 rows at a time.
 * Used by a topic's page (views/TopicDetailView), Recipes and Shopping lists, each with its
 * own columns; tags (and grouping by them) and Longest only where the page asks for them.
 */

type Sort = TopicSort;
const GROUPS: { value: TopicGroup; label: string }[] = [{ value: 'month', label: 'Month' }, { value: 'tag', label: 'Tag' }, { value: 'none', label: 'None' }];
const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'title', label: 'Title A–Z' }, { value: 'lines', label: 'Longest' },
];
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

/* The shared rounded search box, at the filter row's right end (its own line, full width, on phones) */
const Search = styled(RoundSearch)`
  margin-left: auto;
  width: 320px;
  @media (max-width: 768px) { margin-left: 0; width: 100%; order: -1; }
`;

/* A bookmarked entry's mark before its title */
const Mark = styled.span`
  display: inline-flex;
  flex: none;
  color: var(--color-accent);
`;

export interface EntryTableColumn extends PlanColumn {
  /** What the cell shows for an entry (today as YYYY-MM-DD, worked out once per draw) */
  cell: (entry: DecryptedPost, today: string) => ReactNode;
}

const fieldsOf = (e: DecryptedPost) => (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;

export function EntryTableList({
  label, entries, columns, firstColumn, noteOf, ownText, tagsOf, longest = false, bookmarks = false, dateColumn = true,
  prefsKey, filters, emptyMessage,
}: {
  /** The table's name ("Recipes") — also the search's */
  label: string;
  entries: readonly DecryptedPost[];
  /** The page's own columns, between the title and the date */
  columns: EntryTableColumn[];
  /** The title column's name ("Recipe", "Entry") */
  firstColumn: string;
  /** The muted line beside the title (else the entry's next line) */
  noteOf?: (entry: DecryptedPost) => string | undefined;
  /** The title and muted line from the entry's own fields, when it has them (else its first lines) */
  ownText?: (entry: DecryptedPost) => { title: string; note: string } | null;
  /** The entry's tags: searched, a Tags picker and Group by tag */
  tagsOf?: (entry: DecryptedPost) => string[];
  /** Offer Sort by Longest (most lines first) */
  longest?: boolean;
  /** Mark bookmarked entries before their title */
  bookmarks?: boolean;
  /** A Date column at the end (off where the page's columns say when) */
  dateColumn?: boolean;
  /** Where Group and Sort are remembered, per browser (the tag picked isn't — tags are private) */
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
  // A remembered choice this list doesn't offer reads as the default
  const group: TopicGroup = prefs.group === 'tag' && !tagsOf ? 'month' : prefs.group;
  const sort: Sort = prefs.sort === 'lines' && !longest ? 'newest' : prefs.sort;
  const groups = GROUPS.filter(g => g.value !== 'tag' || tagsOf);
  const sorts = SORTS.filter(x => x.value !== 'lines' || longest);

  const rows = useMemo(() => entries.map(e => {
    const cf = fieldsOf(e);
    const outline = entryOutline(e.content);
    const own = ownText?.(e) ?? null;
    return {
      id: e.id,
      entry: e,
      title: own?.title || outline.title || builtinEntryName(cf) || 'Untitled',
      titleCode: !own && outline.titleCode,
      note: own ? own.note : noteOf ? noteOf(e) ?? '' : outline.note,
      noteCode: !own && !noteOf && outline.noteCode,
      lines: outline.lines,
      tags: tagsOf?.(e) ?? [],
      bookmarked: bookmarks && !!cf?._isFavorite,
      created: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
    };
  }), [entries, noteOf, ownText, tagsOf, bookmarks]);

  const [tagFilter, setTagFilter] = useState('');
  const tagChoices = useMemo(() => (tagsOf ? tagsInUse(entries.map(e => ({ tags: tagsOf(e) }))) : []), [entries, tagsOf]);
  // A tag no entry has any more (its last entry deleted or retagged) stops filtering
  useEffect(() => {
    if (tagFilter && !tagChoices.some(t => sameTag(t, tagFilter))) setTagFilter('');
  }, [tagFilter, tagChoices]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const passes = (r: typeof rows[number]) => (!tagFilter || r.tags.some(t => sameTag(t, tagFilter)))
      && words.every(w => `${r.title} ${r.note} ${r.tags.join(' ')}`.toLowerCase().includes(w));
    return sortTopicRows(rows.filter(passes), sort);
  }, [rows, query, tagFilter, sort]);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [query, tagFilter, sort, group]);
  const grouped = useMemo(() => groupTopicRows(shown.slice(0, limit), group, new Date().getFullYear()), [shown, limit, group]);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const toggleFold = (key: string) => setFolded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const today = toDateStr(new Date());
  const tableColumns: PlanColumn[] = [
    { label: firstColumn, width: '' },
    ...columns,
    ...(dateColumn ? [{ label: 'Date', width: '90px', end: true }] : []),
  ];

  return (<>
    <FilterRow role="group" aria-label={`Show ${label}`}>
      {filters}
      <FilterPick name="Group" value={GROUPS.find(g => g.value === group)?.label ?? 'Month'} set={false}>
        <select aria-label="Group by" value={group} onChange={e => setPref({ group: e.target.value as TopicGroup })}>
          {groups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </FilterPick>
      {tagChoices.length > 0 && (
        <FilterPick name="Tags" value={tagFilter || 'All'} set={!!tagFilter}>
          <select aria-label="Tags" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
            <option value="">All</option>
            {tagChoices.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FilterPick>
      )}
      <FilterPick name="Sort" value={SORTS.find(x => x.value === sort)?.label ?? 'Newest'} set={false}>
        <select aria-label="Sort" value={sort} onChange={e => setPref({ sort: e.target.value as Sort })}>
          {sorts.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
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
        {grouped.map(g => {
          const body = g.rows.map(r => (
            <SwipeActions key={`${g.key}:${r.id}`} accentColor={accentColor} onDelete={() => { void deleteEntryWithImages(r.id).catch(err => console.error('Failed to delete entry:', err)); }}>
              <PlanRow oneLine
                lead={r.bookmarked ? <Mark title="Bookmarked"><MaterialIcon $size={18} aria-label="Bookmarked">bookmark</MaterialIcon></Mark> : undefined}
                title={r.title} titleCode={r.titleCode} note={r.note || undefined} noteCode={r.noteCode}
                onOpen={() => openInJournal(r.id)}
                cells={[...columns.map(c => c.cell(r.entry, today)), ...(dateColumn ? [shortDay(toDateStr(r.created), today)] : [])]}
                endCells={[...columns.map(c => !!c.end), ...(dateColumn ? [true] : [])]} />
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

interface Prefs { group: TopicGroup; sort: Sort }
function readPrefs(key: string): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}') as Partial<Prefs>;
    return {
      group: GROUPS.some(g => g.value === saved.group) ? saved.group! : 'month',
      sort: SORTS.some(x => x.value === saved.sort) ? saved.sort! : 'newest',
    };
  } catch { return { group: 'month', sort: 'newest' }; }
}
