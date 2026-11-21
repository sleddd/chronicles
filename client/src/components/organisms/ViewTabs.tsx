import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useUIStore } from '../../stores/uiStore.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { cardLabel } from '../../styles/cardLabel.js';
import { useJournalSelect } from '../../stores/journalSelectStore.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useBulkDeleteEntries } from '../../hooks/useBulkDeleteEntries.js';
import { Checkbox } from '../atoms/Checkbox.js';

type TabValue = Parameters<ReturnType<typeof useUIStore.getState>['setViewMode']>[0];

type TabEntry = {
  value: TabValue;
  icon: string;
  title: string;
  isToday?: boolean;
};

const tabs: TabEntry[] = [
  { value: 'date',      icon: 'wb_sunny', title: 'Today', isToday: true },
  { value: 'all',       icon: 'list',     title: 'All entries' },
  { value: 'favorites', icon: 'bookmark', title: 'Bookmarked entries' },
];

/* The journal list's head: a rounded search box, then one quiet row naming what
   the list shows ("SAT, NOV 14 ×" — × clears the day — "ALL ENTRIES",
   "BOOKMARKS") with ⋯ holding Today / All / Bookmarks and Select entries.
   While selecting, the same row reads "2 SELECTED" with Delete and Done.
   Typing searches; the tune button opens the topic and date filters (the
   Search panel). New entry lives in the page's title row. */
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  padding: 16px var(--s-4, 16px) 0;
  /* The list pane's colour (a shade under the editor's), solid — no blur over the photo */
  background: var(--list-bg, var(--bg-app));
`;

const ViewRow = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* A standard row: faint hairlines above and below (like the list's rows), edge to edge */
  min-height: 44px;
  margin: -6px calc(-1 * var(--s-4, 16px)) 0;
  padding: 0 calc(var(--s-4, 16px) - 2px) 0 20px;
  border-top: 1px solid color-mix(in srgb, var(--border-subtle) 50%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 50%, transparent);
`;

const RowLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  ${cardLabel}
`;

/* The × after a day's name: clears the day (shows All entries) */
const ClearBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
`;

const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
`;

/* Delete / Done while selecting: the small outlined pills of the title row's New entry */
const RowPill = styled.button<{ $tone: 'danger' | 'accent' }>`
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 1px solid ${({ $tone }) => ($tone === 'danger' ? 'var(--border-pill, var(--border-default))' : 'var(--color-accent-line)')};
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: ${({ $tone }) => ($tone === 'danger' ? 'var(--color-danger, #c0392b)' : 'var(--color-accent-line)')};
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { border-color: ${({ $tone }) => ($tone === 'danger' ? 'var(--color-danger, #c0392b)' : 'var(--color-accent-line)')}; }
  &:disabled { opacity: 0.45; cursor: default; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

/* Under the row while a delete waits for its second click */
const ConfirmNote = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin: 0 calc(-1 * var(--s-4, 16px));
  padding: 4px 20px 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-secondary);
`;

const MenuBtn = styled.button<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-right: -6px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ $open }) => ($open ? 'var(--color-accent-link)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

const Menu = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 200px;
  padding: 6px;
  border: 1px solid var(--border-pop);
  border-radius: 10px;
  background: var(--bg-tile);
  box-shadow: var(--shadow-lg);
`;

const MenuItem = styled.button<{ $on: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 6px;
  background: ${({ $on }) => ($on ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $on }) => ($on ? 'var(--text-primary)' : 'var(--text-secondary)')};
  text-align: left;
  cursor: pointer;
  & > span:first-child { color: var(--text-muted); }
  &:hover { background: var(--bg-hover); }
`;

const MenuRule = styled.div`
  height: 1px;
  margin: 6px 4px;
  background: var(--border-pop);
`;

/* The search is the list head's whole first row: no pill, no fill, edge to edge, its
   text lined up with the rows'; the icon turns accent while typing / searching */
const SearchBox = styled.label<{ $active: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  /* The entry rows' padding: 17px above and below (the filters button doesn't add to it) */
  margin: -16px calc(-1 * var(--s-4, 16px)) 0;
  padding: 17px calc(var(--s-4, 16px) - 2px) 17px 20px;
  & > button { margin-block: -4px; }
  border: none;
  border-radius: 0;
  background: transparent;
  cursor: text;
  color: ${({ $active }) => ($active ? 'var(--color-accent-link)' : 'var(--text-muted)')};
  &:focus-within { color: var(--color-accent-link); }
`;

const SearchInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-placeholder); }
  &::-webkit-search-cancel-button { display: none; }
`;

const TuneBtn = styled.button<{ $active: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

interface ViewTabsProps {
  onTodayClick?: () => void;
}

export function ViewTabs({ onTodayClick }: ViewTabsProps = {}) {
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const selectedDate = useUIStore(s => s.selectedDate);
  const setSelectedDate = useUIStore(s => s.setSelectedDate);
  const searchKeyword = useUIStore(s => s.searchKeyword) ?? '';
  const setSearchKeyword = useUIStore(s => s.setSearchKeyword);
  // The view to come back to when the search is cleared
  const beforeSearch = useRef<TabValue>('date');
  const searching = viewMode === 'search';

  const isTabActive = useCallback((tab: TabEntry) => {
    if (tab.isToday) return viewMode === 'date' && isSameDay(selectedDate, new Date());
    return viewMode === tab.value;
  }, [viewMode, selectedDate]);

  const handleTabClick = useCallback((tab: TabEntry) => {
    if (tab.isToday) {
      setSelectedDate(new Date());
      setViewMode('date');
      onTodayClick?.();
      return;
    }
    setViewMode(tab.value);
  }, [setViewMode, setSelectedDate, onTodayClick]);

  const enterSearch = () => {
    if (!searching) { beforeSearch.current = viewMode; setViewMode('search'); }
  };
  const leaveSearch = () => {
    setSearchKeyword?.('');
    setViewMode(beforeSearch.current === 'search' ? 'all' : beforeSearch.current);
  };

  const onSearchChange = (v: string) => {
    setSearchKeyword?.(v);
    if (v) enterSearch();
  };

  // ⋯: Today / All / Bookmarks — closes on a choice, a click outside or Escape
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => { if (!rowRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  // Select mode: "Select entries" in ⋯ starts it, Done (or Escape) ends it
  const selecting = useJournalSelect(st => st.selecting);
  const selectedIds = useJournalSelect(st => st.ids);
  const startSelecting = useJournalSelect(st => st.start);
  const stopSelecting = useJournalSelect(st => st.stop);
  const entries = useEntriesStore(st => st.decryptedEntries);
  const calendarSyncEnabled = useUIStore(st => st.calendarSyncEnabled);
  const { deleteEntries, deleting } = useBulkDeleteEntries();
  const [confirming, setConfirming] = useState(false);
  const [alsoRemote, setAlsoRemote] = useState(false);
  const selected = entries.filter(e => selectedIds.has(e.id));
  const count = selected.length;
  const hasSyncLinks = selected.some(e => !!((e.metadata?._customFields as Record<string, unknown> | undefined)?._sync));
  // A change of selection asks again
  useEffect(() => { setConfirming(false); }, [selectedIds]);
  useEffect(() => {
    if (selecting) return;
    setConfirming(false);
    setAlsoRemote(false);
  }, [selecting]);
  useEffect(() => {
    if (!selecting || menuOpen) return;
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !deleting) stopSelecting(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [selecting, menuOpen, deleting, stopSelecting]);
  const onDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    await deleteEntries(selected, alsoRemote);
    stopSelecting();
  };

  // What the list shows, named in the row
  const viewLabel = searching ? 'Search results'
    : viewMode === 'all' ? 'All entries'
    : viewMode === 'favorites' ? 'Bookmarks'
    : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Container>
      <SearchBox $active={searching}>
        <MaterialIcon $size={20} aria-hidden="true">search</MaterialIcon>
        <SearchInput
          type="search"
          value={searchKeyword}
          placeholder="Search"
          aria-label="Search entries"
          onChange={e => onSearchChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape' && searching) { e.preventDefault(); leaveSearch(); } }}
        />
        <TuneBtn type="button" $active={searching} aria-pressed={searching}
          aria-label={searching ? 'Close search filters' : 'Search filters (topic, dates)'}
          title={searching ? 'Close search' : 'Topic & date filters'}
          onClick={() => (searching ? leaveSearch() : enterSearch())}>
          <MaterialIcon $size={18} aria-hidden="true">{searching ? 'close' : 'tune'}</MaterialIcon>
        </TuneBtn>
      </SearchBox>
      <ViewRow ref={rowRef}>
        {selecting ? (
          <>
            <RowLabel aria-live="polite">{count} selected</RowLabel>
            <RowActions>
              <RowPill type="button" $tone="danger" disabled={count === 0 || deleting} onClick={onDelete}>
                {deleting ? 'Deleting…' : confirming ? `Delete ${count}?` : 'Delete'}
              </RowPill>
              <RowPill type="button" $tone="accent" disabled={deleting} onClick={stopSelecting}>Done</RowPill>
            </RowActions>
          </>
        ) : (
          <>
            <RowLabel>
              {viewLabel}
              {viewMode === 'date' && (
                <ClearBtn type="button" aria-label="Clear the day" title="Show all entries" onClick={() => setViewMode('all')}>
                  <MaterialIcon $size={16} aria-hidden="true">close</MaterialIcon>
                </ClearBtn>
              )}
            </RowLabel>
            <MenuBtn type="button" $open={menuOpen} aria-label="Show" title="View and select" aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}>
              <Icon name="more-horizontal" size={26} strokeWidth={2.6} />
            </MenuBtn>
          </>
        )}
        {menuOpen && !selecting && (
          <Menu role="menu" aria-label="Show">
            {tabs.map(tab => {
              const active = isTabActive(tab);
              return (
                <MenuItem key={tab.title} type="button" role="menuitemradio" aria-checked={active} aria-label={tab.title} $on={active}
                  onClick={() => { setMenuOpen(false); handleTabClick(tab); }}>
                  <MaterialIcon $size={20} aria-hidden="true">{tab.icon}</MaterialIcon>
                  {tab.title}
                </MenuItem>
              );
            })}
            <MenuRule role="separator" />
            <MenuItem type="button" role="menuitem" $on={false}
              onClick={() => { setMenuOpen(false); startSelecting(); }}>
              <MaterialIcon $size={20} aria-hidden="true">check_circle</MaterialIcon>
              Select entries
            </MenuItem>
          </Menu>
        )}
      </ViewRow>
      {selecting && confirming && calendarSyncEnabled && hasSyncLinks && (
        <ConfirmNote>
          <Checkbox checked={alsoRemote} onChange={setAlsoRemote} label="Also delete from Google Calendar" />
        </ConfirmNote>
      )}
    </Container>
  );
}
