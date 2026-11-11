import type { ReactNode } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { Chip, Chips } from './fields/formKit.js';
import { glassControl } from '../../styles/wallpaper.js';
import {
  MEDIA_SORTS, SHELVES, shelfFilterLabel, formatRating,
  type MediaShelf, type MediaSort, type MediaType,
} from '../../utils/media.js';

/* The media journal's tool row, shared by the owner's page and a public
   shelf: one outlined box holding the search (a filled field), then the Shelf
   / Rating / Sort choices as bare pickers split by rules — "All shelves ⌄" —
   and, on the owner's page, the grid | list switch at its end (`aside`); under
   the box the types as a row of chips (All, Books, Movies, TV shows, Music).
   On phones the search takes the box's first row, the pickers the second, and
   the chips scroll sideways. Props only — the pages keep the state (and the
   public page sends it to the server). */

export interface MediaFilters {
  type: MediaType | '';
  shelf: MediaShelf;
  minRating: number;
  sort: MediaSort;
}

export const EMPTY_MEDIA_FILTERS: MediaFilters = { type: '', shelf: '', minRating: 0, sort: 'newest' };

const TYPE_CHIPS: { value: MediaType; label: string }[] = [
  { value: 'book', label: 'Books' }, { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'TV shows' }, { value: 'music', label: 'Music' },
];
const SORT_WORDS: Record<MediaSort, string> = { newest: 'Newest first', rating: 'Highest rated', title: 'Title A–Z', type: 'By type' };
const RATINGS = [5, 4.5, 4, 3.5, 3, 2];

export const MediaToolBox = styled.div<{ $phone: boolean }>`
  display: flex;
  flex-wrap: ${({ $phone }) => ($phone ? 'wrap' : 'nowrap')};
  align-items: center;
  margin-top: 8px;
  padding: 8px;
  /* The lightest of outlines: half-way between the faintest hairline and the
     page itself in light; the ordinary hairline in dark */
  border: 1px solid color-mix(in srgb, var(--border-faint) 50%, var(--bg-app));
  html[data-theme='dark'] & { border-color: var(--border-subtle); }
  border-radius: 10px;
  ${glassControl}
  /* The glass mixin brings its own firmer outline on the photo; this box keeps a soft one */
  html[data-wallpaper] & { border-color: rgba(255, 255, 255, 0.5); }
  html[data-wallpaper][data-theme='dark'] & { border-color: rgba(255, 255, 255, 0.14); }
`;

/* The search: bare inside the box — the icon and the input, no fill of its own */
const Search = styled.label<{ $phone: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: ${({ $phone }) => ($phone ? '1 1 0' : '1 1 240px')};
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  border-radius: 8px;
  color: var(--text-muted);
  &:focus-within { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  input {
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
  input::placeholder { color: var(--text-hint); }
  input::-webkit-search-cancel-button { display: none; }
  ${({ $phone }) => ($phone ? 'margin-bottom: 8px;' : '')}
`;

/* The pickers' row: each bare, a hairline between them and before the first */
const Picks = styled.div<{ $phone: boolean }>`
  display: flex;
  align-items: center;
  flex: ${({ $phone }) => ($phone ? '1 1 100%' : '0 0 auto')};
  min-width: 0;
  /* A rule between the search and the pickers (on phones they have their own row) */
  ${({ $phone }) => ($phone ? '' : 'margin-left: 8px; border-left: 1px solid var(--border-subtle);')}
`;

/* A bare picker: the choice as text with its chevron right after it, the real
   <select> invisible over both (as the dashboard's card pickers) */
const Pick = styled.label<{ $set: boolean; $phone: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ $phone }) => ($phone ? '4px' : '6px')};
  flex: ${({ $phone }) => ($phone ? '1 1 0' : '0 0 auto')};
  min-width: 0;
  height: 36px;
  padding: 0 ${({ $phone }) => ($phone ? '4px' : '18px')};
  border-left: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: ${({ $phone }) => ($phone ? '14px' : '15px')};
  color: ${({ $set }) => ($set ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:first-child { border-left: none; }
  & > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  svg { flex: none; color: var(--text-muted); }
  &:hover { color: ${({ $set }) => ($set ? 'var(--color-accent-soft)' : 'var(--text-primary)')}; }
  select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    appearance: none;
    border: none;
    font-size: 16px; /* iOS doesn't zoom into a 16px control */
    cursor: pointer;
  }
  option { color: var(--text-primary); background: var(--bg-surface); }
  &:focus-within { outline: 2px solid var(--color-accent); outline-offset: -2px; border-radius: 6px; }
`;

/* What sits after the pickers (the owner's grid | list switch), ruled off;
   on phones it sits beside the search instead, leaving the pickers their row */
const Aside = styled.div<{ $phone: boolean }>`
  display: flex;
  align-items: center;
  flex: none;
  padding-left: 12px;
  margin-left: 6px;
  border-left: 1px solid var(--border-subtle);
  ${({ $phone }) => ($phone ? 'margin-bottom: 8px;' : '')}
`;

/* The grid | list switch: FilterTabs' look — the chosen one lifted onto --bg-tab-active, no accent */
const Views = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-card);
  border-radius: 8px;
`;

const ViewBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: ${({ $active }) => ($active ? 'var(--bg-tab-active)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const TypeRow = styled(Chips)<{ $phone: boolean }>`
  margin-top: 24px;
  ${({ $phone }) => ($phone ? 'flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-right: -16px; padding-right: 16px; &::-webkit-scrollbar { display: none; }' : '')}
  ${Chip} { height: 36px; padding: 0 18px; flex: none; }
`;

export type MediaLayout = 'grid' | 'list';

/** The grid | list switch for the owner's page, passed to the bar as its `aside` */
export function MediaViewSwitch({ value, onChange }: { value: MediaLayout; onChange: (v: MediaLayout) => void }) {
  return (
    <Views role="group" aria-label="Layout">
      <ViewBtn type="button" $active={value === 'grid'} aria-pressed={value === 'grid'} aria-label="Grid" title="Grid" onClick={() => onChange('grid')}>
        <Icon name="layout-grid" size={16} strokeWidth={2} />
      </ViewBtn>
      <ViewBtn type="button" $active={value === 'list'} aria-pressed={value === 'list'} aria-label="List" title="List" onClick={() => onChange('list')}>
        <Icon name="list" size={16} strokeWidth={2} />
      </ViewBtn>
    </Views>
  );
}

interface MediaFilterBarProps {
  query: string;
  onQuery: (q: string) => void;
  filters: MediaFilters;
  onFilters: (next: MediaFilters) => void;
  phone: boolean;
  searchPlaceholder?: string;
  aside?: ReactNode;
}

export function MediaFilterBar({ query, onQuery, filters, onFilters, phone, searchPlaceholder = 'Search titles, creators, genres', aside }: MediaFilterBarProps) {
  const set = (patch: Partial<MediaFilters>) => onFilters({ ...filters, ...patch });
  const chevron = <Icon name="chevron-down" size={14} strokeWidth={2} />;
  return (
    <>
      <MediaToolBox $phone={phone}>
        <Search $phone={phone}>
          <Icon name="search" size={16} strokeWidth={2} />
          <input type="search" aria-label="Search media" value={query} placeholder={searchPlaceholder}
            onChange={e => onQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); onQuery(''); } }} />
        </Search>
        {aside && phone && <Aside $phone>{aside}</Aside>}
        <Picks $phone={phone}>
          <Pick $set={!!filters.shelf} $phone={phone}>
            <span>{filters.shelf ? shelfFilterLabel(filters.shelf as Exclude<MediaShelf, ''>) : 'All shelves'}</span>{chevron}
            <select aria-label="Shelf" value={filters.shelf} onChange={e => set({ shelf: e.target.value as MediaShelf })}>
              <option value="">All shelves</option>
              {SHELVES.map(s => <option key={s.value} value={s.value}>{shelfFilterLabel(s.value)}</option>)}
            </select>
          </Pick>
          <Pick $set={filters.minRating > 0} $phone={phone}>
            <span>{filters.minRating ? `${formatRating(filters.minRating)}+ stars` : 'Any rating'}</span>{chevron}
            <select aria-label="Rating" value={filters.minRating} onChange={e => set({ minRating: Number(e.target.value) })}>
              <option value={0}>Any rating</option>
              {RATINGS.map(r => <option key={r} value={r}>{formatRating(r)}+ stars</option>)}
            </select>
          </Pick>
          <Pick $set={filters.sort !== 'newest'} $phone={phone}>
            <span>{SORT_WORDS[filters.sort]}</span>{chevron}
            <select aria-label="Sort" value={filters.sort} onChange={e => set({ sort: e.target.value as MediaSort })}>
              {MEDIA_SORTS.map(s => <option key={s.value} value={s.value}>{SORT_WORDS[s.value]}</option>)}
            </select>
          </Pick>
          {aside && !phone && <Aside $phone={false}>{aside}</Aside>}
        </Picks>
      </MediaToolBox>
      <TypeRow $phone={phone} role="group" aria-label="Type">
        <Chip type="button" $active={!filters.type} aria-pressed={!filters.type} onClick={() => set({ type: '' })}>All</Chip>
        {TYPE_CHIPS.map(t => (
          <Chip key={t.value} type="button" $active={filters.type === t.value} aria-pressed={filters.type === t.value} onClick={() => set({ type: t.value })}>{t.label}</Chip>
        ))}
      </TypeRow>
    </>
  );
}
