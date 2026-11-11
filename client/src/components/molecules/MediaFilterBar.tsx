import { useState } from 'react';
import styled from 'styled-components';
import { RoundSearch } from './RoundSearch.js';
import { FilterPick } from './FilterPick.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { glassControl } from '../../styles/wallpaper.js';
import {
  MEDIA_SORTS, MEDIA_TYPES, SHELVES, mediaTypeInfo, shelfFilterLabel, formatRating,
  type MediaShelf, type MediaSort, type MediaType,
} from '../../utils/media.js';

/* The media journal's tool row, shared by the owner's page and a public
   shelf: the search and the Type / Shelf / Rating / Sort pills sharing the
   row's full width on desktop; on phones the search on its own line, then the
   Shelf pill and a square ⋯ that unfolds Type, Rating and Sort two to a row.
   Props only — the pages keep the state (and the public page sends it to the
   server). */

export interface MediaFilters {
  type: MediaType | '';
  shelf: MediaShelf;
  minRating: number;
  sort: MediaSort;
}

export const EMPTY_MEDIA_FILTERS: MediaFilters = { type: '', shelf: '', minRating: 0, sort: 'newest' };

const Tools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 10px;
  margin-top: 8px;
`;

const Search = styled(RoundSearch)<{ $phone: boolean }>`
  flex: ${({ $phone }) => ($phone ? '1 1 100%' : '1.6 1 220px')};
  max-width: none;
  min-width: 0;
`;

/* One pill's share of the row; on the phone fold, two to a row */
const Slot = styled.div<{ $half?: boolean }>`
  flex: ${({ $half }) => ($half ? '1 1 45%' : '1 1 0')};
  min-width: 0;
`;

const MoreBtn = styled.button<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid ${({ $open }) => ($open ? 'var(--color-accent-line)' : 'var(--border-card)')};
  border-radius: 8px;
  background: ${({ $open }) => ($open ? 'var(--color-accent-subtle)' : 'transparent')};
  color: ${({ $open }) => ($open ? 'var(--color-accent-line)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { border-color: ${({ $open }) => ($open ? 'var(--color-accent-line)' : 'var(--border-strong)')}; color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  ${glassControl}
`;

interface MediaFilterBarProps {
  query: string;
  onQuery: (q: string) => void;
  filters: MediaFilters;
  onFilters: (next: MediaFilters) => void;
  phone: boolean;
  searchPlaceholder?: string;
}

export function MediaFilterBar({ query, onQuery, filters, onFilters, phone, searchPlaceholder = 'Search your shelves' }: MediaFilterBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const set = (patch: Partial<MediaFilters>) => onFilters({ ...filters, ...patch });
  const ratingLabel = filters.minRating ? `${formatRating(filters.minRating)}+ stars` : 'Any';

  const typePick = (
    <FilterPick grow name="Type" value={filters.type ? mediaTypeInfo(filters.type).label : 'All'} set={!!filters.type}>
      <select aria-label="Type" value={filters.type} onChange={e => set({ type: e.target.value as MediaType | '' })}>
        <option value="">All</option>
        {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
    </FilterPick>
  );
  const shelfPick = (
    <FilterPick grow name="Shelf" value={filters.shelf ? shelfFilterLabel(filters.shelf as Exclude<MediaShelf, ''>) : 'All'} set={!!filters.shelf}>
      <select aria-label="Shelf" value={filters.shelf} onChange={e => set({ shelf: e.target.value as MediaShelf })}>
        <option value="">All</option>
        {SHELVES.map(s => <option key={s.value} value={s.value}>{shelfFilterLabel(s.value)}</option>)}
      </select>
    </FilterPick>
  );
  const ratingPick = (
    <FilterPick grow name="Rating" value={ratingLabel} set={filters.minRating > 0}>
      <select aria-label="Rating" value={filters.minRating} onChange={e => set({ minRating: Number(e.target.value) })}>
        <option value={0}>Any</option>
        {[5, 4.5, 4, 3.5, 3, 2].map(r => <option key={r} value={r}>{formatRating(r)}+ stars</option>)}
      </select>
    </FilterPick>
  );
  const sortPick = (
    <FilterPick grow name="Sort" value={MEDIA_SORTS.find(s => s.value === filters.sort)?.label ?? 'Newest'} set={filters.sort !== 'newest'}>
      <select aria-label="Sort" value={filters.sort} onChange={e => set({ sort: e.target.value as MediaSort })}>
        {MEDIA_SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </FilterPick>
  );
  const moreSet = (filters.type ? 1 : 0) + (filters.minRating ? 1 : 0) + (filters.sort !== 'newest' ? 1 : 0);

  if (phone) {
    return (
      <>
        <Tools>
          <Search $phone value={query} onChange={onQuery} placeholder={searchPlaceholder} ariaLabel="Search media" />
          <Slot>{shelfPick}</Slot>
          <MoreBtn type="button" $open={moreOpen || moreSet > 0} aria-expanded={moreOpen}
            aria-label={moreSet ? `More filters (${moreSet} set)` : 'More filters'} title="Type, rating and sort"
            onClick={() => setMoreOpen(o => !o)}>
            <Icon name="more-horizontal" size={18} strokeWidth={2} />
          </MoreBtn>
        </Tools>
        {moreOpen && <Tools><Slot $half>{typePick}</Slot><Slot $half>{ratingPick}</Slot><Slot $half>{sortPick}</Slot></Tools>}
      </>
    );
  }
  return (
    <Tools>
      <Search $phone={false} value={query} onChange={onQuery} placeholder={searchPlaceholder} ariaLabel="Search media" />
      <Slot>{typePick}</Slot><Slot>{shelfPick}</Slot><Slot>{ratingPick}</Slot><Slot>{sortPick}</Slot>
    </Tools>
  );
}
