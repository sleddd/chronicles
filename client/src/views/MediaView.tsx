import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { TopBarAction } from '../components/organisms/TopBarAction.js';
import { PublicShelfControl } from '../components/organisms/PublicShelfControl.js';
import { RoundSearch } from '../components/molecules/RoundSearch.js';
import { FilterPick } from '../components/molecules/FilterPick.js';
import { MediaPosterCard, PosterGrid } from '../components/molecules/MediaPosterCard.js';
import { PagerBar } from '../components/molecules/PagerBar.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { useDecryptedImage } from '../hooks/useDecryptedImage.js';
import { useSaveFields } from '../hooks/useSaveFields.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { usePublicShelfStore } from '../stores/publicShelfStore.js';
import { stripHtml } from '../utils/stripHtml.js';
import { focusPosition } from '../components/organisms/EntryImageGallery.js';
import { onPhoto } from '../styles/wallpaper.js';
import { ON_PUBLIC_SHELF, isOnPublicShelf, pageOf } from '../services/publicShelf.js';
import {
  EMPTY_MEDIA_FILTER, MEDIA_SORTS, MEDIA_TYPES, SHELVES, filterMedia, sortMedia, mediaItems, mediaTopicIds,
  mediaTypeInfo, shelfFilterLabel, formatRating,
  type MediaFilter, type MediaItem, type MediaShelf, type MediaSort, type MediaType,
} from '../utils/media.js';

/* The media journal: books, movies, TV shows and music as posters on shelves —
   cover, the stars (tap to re-rate), the Shelf status (a picker) and, while
   something is under way, its progress. Search, Type / Shelf / Rating filters
   and Sort; 24 cards a page. A bookmark on each card puts it on the one
   public shelf (PublicShelfControl); tapping a cover opens the entry. */

const VIEW_KEY = 'media-view-v1';

type Saved = { type: MediaType | ''; shelf: MediaShelf; minRating: number; sort: MediaSort };

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return { type: '', shelf: '', minRating: 0, sort: 'newest' };
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      type: MEDIA_TYPES.some(t => t.value === v.type) ? v.type as MediaType : '',
      shelf: SHELVES.some(s => s.value === v.shelf) ? v.shelf as MediaShelf : '',
      minRating: typeof v.minRating === 'number' ? v.minRating : 0,
      sort: MEDIA_SORTS.some(s => s.value === v.sort) ? v.sort as MediaSort : 'newest',
    };
  } catch { return { type: '', shelf: '', minRating: 0, sort: 'newest' }; }
}

/* ── Layout (as the topic pages) ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px 64px;
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

const Head = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 53px 0 20px;
`;

const Title = styled.h1.attrs({ className: 'view-title' })`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  padding-bottom: 0.2em;
  margin: 0 0 -0.2em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  @media (max-width: 480px) { font-size: 34px; }
`;

const Tools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 10px;
  margin-top: 8px;
`;

const Search = styled(RoundSearch)`
  flex: 1 1 220px;
  max-width: 360px;
`;

const Count = styled.span`
  margin-left: auto;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  ${onPhoto}
`;

/* The public-shelf bookmark over a cover's corner: accent and solid while the
   item is on the shelf, a grey outline otherwise, on a soft disc so it reads
   over any cover */
const Bookmark = styled.button<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-panel) 78%, transparent);
  color: ${({ $on }) => ($on ? 'var(--color-accent)' : 'var(--text-muted)')};
  cursor: pointer;
  svg { fill: ${({ $on }) => ($on ? 'currentColor' : 'none')}; }
  &:hover { color: ${({ $on }) => ($on ? 'var(--color-accent)' : 'var(--text-primary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* ── Pieces ── */

/** The owner's card: resolves the entry's own photo (else the found cover) and passes the rest through */
function OwnerCard({ item, onOpen, onRate, onShelve, onProgress, onBookmark }: {
  item: MediaItem; onOpen: () => void; onRate: (r: number) => void; onShelve: (s: MediaShelf) => void;
  onProgress: (p: number) => void; onBookmark: () => void;
}) {
  const img = item.image;
  const { url } = useDecryptedImage(img?.key ?? null, img?.iv ?? null, img?.mimeType ?? null);
  const onShelf = isOnPublicShelf(item);
  return (
    <MediaPosterCard
      item={item}
      coverSrc={url ?? item.cover ?? null}
      coverStyle={img && url ? { objectPosition: focusPosition(img) } : undefined}
      onOpen={onOpen} onRate={onRate} onShelve={onShelve} onProgress={onProgress}
      corner={(
        <Bookmark type="button" $on={onShelf} aria-pressed={onShelf}
          aria-label={onShelf ? `Take ${item.title} off your public shelf` : `Add ${item.title} to your public shelf`}
          title={onShelf ? 'On your public shelf' : 'Add to your public shelf'}
          onClick={onBookmark}>
          <Icon name="bookmark" size={15} strokeWidth={2} />
        </Bookmark>
      )}
    />
  );
}

/* ── View ── */

export function MediaView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const publicShelf = usePublicShelfStore(s => s.publicShelf);
  const pendingItemId = usePublicShelfStore(s => s.pendingItemId);
  const setPendingItemId = usePublicShelfStore(s => s.setPendingItemId);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const saveFields = useSaveFields();

  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(saved)); } catch { /* private mode */ } }, [saved]);
  // A new search, filter or sort starts at the first page
  useEffect(() => { setPage(1); }, [query, saved.type, saved.shelf, saved.minRating, saved.sort]);

  const topicIds = useMemo(() => mediaTopicIds(allTopics), [allTopics]);
  const topicId = topicIds[0];
  const items = useMemo(() => mediaItems(entries, topicIds, stripHtml), [entries, topicIds]);
  const filter: MediaFilter = { ...EMPTY_MEDIA_FILTER, type: saved.type, shelf: saved.shelf, minRating: saved.minRating, query };
  const shown = useMemo(() => sortMedia(filterMedia(items, filter), saved.sort), [items, filter.type, filter.shelf, filter.minRating, query, saved.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const paged = useMemo(() => pageOf(shown, page), [shown, page]);
  const onShelfCount = useMemo(() => items.filter(isOnPublicShelf).length, [items]);
  const pendingItem = useMemo(() => items.find(i => i.id === pendingItemId) ?? null, [items, pendingItemId]);

  const patch = useCallback(async (item: MediaItem, fields: Record<string, unknown>) => {
    const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === item.id);
    if (!entry) return;
    await saveFields(entry, { ...item.fields, ...fields });
  }, [saveFields]);

  // The bookmark: off the shelf → on it (the first one asks, in the panel); on → off
  const toggleBookmark = useCallback((item: MediaItem) => {
    if (isOnPublicShelf(item)) { void patch(item, { [ON_PUBLIC_SHELF]: false }); return; }
    if (publicShelf) { void patch(item, { [ON_PUBLIC_SHELF]: true }); return; }
    setPendingItemId(item.id);
    setPanelOpen(true);
  }, [patch, publicShelf, setPendingItemId]);

  const setPanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    if (!open) setPendingItemId(null);
  }, [setPendingItemId]);

  const turnedOn = useCallback((item: MediaItem | null) => {
    if (item) void patch(item, { [ON_PUBLIC_SHELF]: true });
    setPendingItemId(null);
  }, [patch, setPendingItemId]);

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  if (isLoading || !isReady) return (
    <ContentTemplate>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Spinner size={40} />
      </div>
    </ContentTemplate>
  );

  const filtering = !!(saved.type || saved.shelf || saved.minRating || query.trim());
  const ratingLabel = saved.minRating ? `${formatRating(saved.minRating)}+ stars` : 'Any';

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Media Journal</Title>
            {topicId != null && (
              <TopBarAction>
                <PillButton type="button" onClick={() => newEntry(topicId)}>Add media</PillButton>
              </TopBarAction>
            )}
          </Head>

          {items.length > 0 && (
            <Tools>
              <Search value={query} onChange={setQuery} placeholder="Search your shelves" ariaLabel="Search media" />
              <FilterPick name="Type" value={saved.type ? mediaTypeInfo(saved.type).label : 'All'} set={!!saved.type}>
                <select aria-label="Type" value={saved.type} onChange={e => setSaved(s => ({ ...s, type: e.target.value as MediaType | '' }))}>
                  <option value="">All</option>
                  {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FilterPick>
              <FilterPick name="Shelf" value={saved.shelf ? shelfFilterLabel(saved.shelf as Exclude<MediaShelf, ''>) : 'All'} set={!!saved.shelf}>
                <select aria-label="Shelf" value={saved.shelf} onChange={e => setSaved(s => ({ ...s, shelf: e.target.value as MediaShelf }))}>
                  <option value="">All</option>
                  {SHELVES.map(s => <option key={s.value} value={s.value}>{shelfFilterLabel(s.value)}</option>)}
                </select>
              </FilterPick>
              <FilterPick name="Rating" value={ratingLabel} set={saved.minRating > 0}>
                <select aria-label="Rating" value={saved.minRating} onChange={e => setSaved(s => ({ ...s, minRating: Number(e.target.value) }))}>
                  <option value={0}>Any</option>
                  {[5, 4.5, 4, 3.5, 3, 2].map(r => <option key={r} value={r}>{formatRating(r)}+ stars</option>)}
                </select>
              </FilterPick>
              <FilterPick name="Sort" value={MEDIA_SORTS.find(s => s.value === saved.sort)?.label ?? 'Newest'} set={saved.sort !== 'newest'}>
                <select aria-label="Sort" value={saved.sort} onChange={e => setSaved(s => ({ ...s, sort: e.target.value as MediaSort }))}>
                  {MEDIA_SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </FilterPick>
              <PublicShelfControl count={onShelfCount} open={panelOpen} onOpenChange={setPanel} pendingItem={pendingItem} onTurnedOn={turnedOn} />
              <Count>{filtering ? `${shown.length} of ${items.length}` : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}</Count>
            </Tools>
          )}

          {items.length === 0 ? (
            <EmptyState message="Nothing on your shelves yet." submessage="Add a book, movie, TV show or album and it shows up here." />
          ) : shown.length === 0 ? (
            <EmptyState message="Nothing matches those filters." />
          ) : (
            <>
              <PosterGrid>
                {paged.items.map(item => (
                  <OwnerCard
                    key={item.id}
                    item={item}
                    onOpen={() => openInJournal(item.id)}
                    onRate={r => { void patch(item, { rating: r }); }}
                    onShelve={s => { void patch(item, { shelf: s }); }}
                    onProgress={p => { void patch(item, { progress: p }); }}
                    onBookmark={() => toggleBookmark(item)}
                  />
                ))}
              </PosterGrid>
              <PagerBar page={paged.page} pages={paged.pages} onChange={setPage} />
            </>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
