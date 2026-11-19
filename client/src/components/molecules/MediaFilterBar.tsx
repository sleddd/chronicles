import type { ReactNode } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { Chip, Chips } from './fields/formKit.js';
import { glassControl } from '../../styles/wallpaper.js';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
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
  /** '' = any tag (the owner's page only) */
  tag?: string;
}

export const EMPTY_MEDIA_FILTERS: MediaFilters = { type: '', shelf: '', minRating: 0, sort: 'newest', tag: '' };

const TYPE_CHIPS: { value: MediaType; label: string }[] = [
  { value: 'book', label: 'Books' }, { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'TV shows' }, { value: 'music', label: 'Music' },
];
const SORT_WORDS: Record<MediaSort, string> = { newest: 'Newest first', rating: 'Highest rated', title: 'Title A–Z', type: 'By type', tag: 'By tag' };
const RATINGS = [5, 4.5, 4, 3.5, 3, 2];

export const MediaToolBox = styled.div<{ $phone: boolean }>`
  display: flex;
  flex-wrap: ${({ $phone }) => ($phone ? 'wrap' : 'nowrap')};
  align-items: center;
  margin-top: 8px;
  padding: 8px;
  /* The card / input outline in light (fainter ones vanished on the plain page);
     the ordinary hairline in dark */
  border: 1px solid var(--border-card);
  html[data-theme='dark'] & { border-color: var(--border-subtle); }
  border-radius: 10px;
  ${glassControl}
  /* The glass mixin brings its own firmer outline on the photo; this box keeps a soft one */
  html[data-wallpaper] & { border-color: rgba(255, 255, 255, 0.5); }
  html[data-wallpaper][data-theme='dark'] & { border-color: rgba(255, 255, 255, 0.14); }
  /* Light, on the photo: smoked glass like the page's buttons and the section tabs — a dark
     see-through fill with a blur, white text */
  html[data-wallpaper][data-theme='light'] & {
    /* No fill — just the blur of the photo (as the section tabs) — and the theme's own
       text colours, no shadow: a filter that's set reads in the standard text colour too, not the accent */
    --color-accent-soft: var(--text-primary);
    background: transparent;
    border-color: transparent;
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }

  /* No photo: just the outline, no fill (either theme) */
  html:not([data-wallpaper]) & { background: transparent; }
  /* Dark, on the photo: clear glass — just the blur and a whisper of dark fill, white text,
     its faint light outline */
  html[data-wallpaper][data-theme='dark'] & {
    /* Mostly see-through: little more than the blur */
    background: rgba(18, 20, 26, 0.14);
    border-color: rgba(255, 255, 255, 0.14);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    --text-primary: #fff;
    --text-secondary: rgba(255, 255, 255, 0.9);
    --text-muted: rgba(255, 255, 255, 0.78);
    --text-hint: rgba(255, 255, 255, 0.72);
    --text-placeholder: rgba(255, 255, 255, 0.72);
    --border-subtle: rgba(255, 255, 255, 0.18);
    --border-card: rgba(255, 255, 255, 0.18);
    --bg-tab-active: rgba(255, 255, 255, 0.16);
    color: #fff;
    & input, & select { color: #fff; }
    & input::placeholder { color: rgba(255, 255, 255, 0.72); }
  }
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
  /* No accent ring while typing in the search (the caret shows where you are) */
  input:focus, input:focus-visible { outline: none; box-shadow: none; }
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

const TypeRow = styled(Chips)<{ $phone: boolean; $roomy?: boolean }>`
  margin-top: ${({ $roomy }) => ($roomy ? 32 : 24)}px;
  ${NAV_COMPACT} { margin-top: 34px; }
  ${({ $phone }) => ($phone ? 'flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-right: -16px; padding-right: 16px; &::-webkit-scrollbar { display: none; }' : '')}
  ${Chip} { height: 36px; padding: 0 18px; flex: none; }
  /* The forms' chips are faded on purpose; here they sit on the page (or the
     photo), so the unchosen ones keep a clear outline */
  ${Chip}[aria-pressed='false'] { border-color: var(--border-pill, var(--control-border)); }
  html[data-wallpaper] & ${Chip}[aria-pressed='false'] { border-color: rgba(255, 255, 255, 0.55); }
  html[data-wallpaper][data-theme='dark'] & ${Chip}[aria-pressed='false'] { border-color: rgba(255, 255, 255, 0.24); }
  ${Chip}[aria-pressed='false']:hover { border-color: var(--text-muted); }
  /* Light, on the photo: lightly frosted (see-through, never a full fill) with full-strength
     text and a firm outline, so the chips don't disappear against the picture */
  html[data-wallpaper][data-theme='light'] & ${Chip} {
    background: rgba(255, 255, 255, 0.22);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    color: var(--text-primary);
  }
  html[data-wallpaper][data-theme='light'] & ${Chip}[aria-pressed='false'] { border-color: var(--border-pill, var(--control-border)); }
  html[data-wallpaper][data-theme='light'] & ${Chip}[aria-pressed='true'] { color: var(--color-accent-soft); }
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
  /** A little more room above the type chips (the owner's page) */
  roomy?: boolean;
  query: string;
  onQuery: (q: string) => void;
  filters: MediaFilters;
  onFilters: (next: MediaFilters) => void;
  phone: boolean;
  searchPlaceholder?: string;
  aside?: ReactNode;
  /** The owner's tags: shows an "All tags" picker and the By tag sort (left out on the public page, which has no tags) */
  tags?: string[];
}

export function MediaFilterBar({ query, onQuery, filters, onFilters, phone, searchPlaceholder = 'Search titles, creators, genres', aside, tags, roomy }: MediaFilterBarProps) {
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
          {tags && tags.length > 0 && (
            <Pick $set={!!filters.tag} $phone={phone}>
              <span>{filters.tag || 'All tags'}</span>{chevron}
              <select aria-label="Tag" value={filters.tag ?? ''} onChange={e => set({ tag: e.target.value })}>
                <option value="">All tags</option>
                {tags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Pick>
          )}
          <Pick $set={filters.sort !== 'newest'} $phone={phone}>
            <span>{SORT_WORDS[filters.sort]}</span>{chevron}
            <select aria-label="Sort" value={filters.sort} onChange={e => set({ sort: e.target.value as MediaSort })}>
              {MEDIA_SORTS.filter(s => s.value !== 'tag' || (tags && tags.length > 0)).map(s => <option key={s.value} value={s.value}>{SORT_WORDS[s.value]}</option>)}
            </select>
          </Pick>
          {aside && !phone && <Aside $phone={false}>{aside}</Aside>}
        </Picks>
      </MediaToolBox>
      <TypeRow $phone={phone} $roomy={roomy} role="group" aria-label="Type">
        <Chip type="button" $active={!filters.type} aria-pressed={!filters.type} onClick={() => set({ type: '' })}>All</Chip>
        {TYPE_CHIPS.map(t => (
          <Chip key={t.value} type="button" $active={filters.type === t.value} aria-pressed={filters.type === t.value} onClick={() => set({ type: t.value })}>{t.label}</Chip>
        ))}
      </TypeRow>
    </>
  );
}
