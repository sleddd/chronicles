import { useCallback, useRef, type KeyboardEvent } from 'react';
import styled from 'styled-components';
import { useUIStore } from '../../stores/uiStore.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';

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

/* The journal list's tool row (60px, same hairline as the editor's top bar so
   the two read as one): a search box, then Today / All / Bookmarks as one
   segmented group of icons. Typing searches; the tune button opens the topic
   and date filters (the Search panel) without typing. New entry lives in the
   page's title row. */
const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  height: 60px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 var(--s-4, 16px);
`;

const SearchBox = styled.label<{ $active: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 6px 0 12px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--border-card)')};
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  &:focus-within { border-color: var(--color-accent); }
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
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

/* Today / All / Bookmarks — one outlined group; the current one is lifted
   onto --bg-active with its icon bright (--text-primary, never the accent) */
const Segments = styled.div`
  flex: none;
  display: flex;
  gap: 2px;
  height: 36px;
  padding: 3px;
  border: 1px solid var(--border-card);
  border-radius: 8px;
`;

const Segment = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-muted)')};
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
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

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (nextIndex !== null) {
      e.preventDefault();
      handleTabClick(tabs[nextIndex]);
    }
  }, [handleTabClick]);

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
      <Segments role="tablist" aria-label="Show">
        {tabs.map((tab, i) => {
          const active = isTabActive(tab);
          return (
            <Segment
              key={tab.title}
              role="tab"
              aria-selected={active}
              aria-label={tab.title}
              $active={active}
              title={tab.title}
              onClick={() => handleTabClick(tab)}
              onKeyDown={e => handleKeyDown(e, i)}
            >
              <MaterialIcon $size={20} aria-hidden="true">{tab.icon}</MaterialIcon>
            </Segment>
          );
        })}
      </Segments>
    </Container>
  );
}
