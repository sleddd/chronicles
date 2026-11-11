import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { TopBarAction } from '../components/organisms/TopBarAction.js';
import { RoundSearch } from '../components/molecules/RoundSearch.js';
import { FilterPick } from '../components/molecules/FilterPick.js';
import { StarRating } from '../components/molecules/StarRating.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { useDecryptedImage } from '../hooks/useDecryptedImage.js';
import { useSaveFields } from '../hooks/useSaveFields.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { stripHtml } from '../utils/stripHtml.js';
import { focusPosition } from '../components/organisms/EntryImageGallery.js';
import { glassCard, glassControl, onPhoto } from '../styles/wallpaper.js';
import {
  EMPTY_MEDIA_FILTER, MEDIA_SORTS, MEDIA_TYPES, SHELVES, filterMedia, sortMedia, mediaItems, mediaTopicIds, mediaSubtitle,
  mediaTypeInfo, shelfLabel, shelfFilterLabel, formatRating,
  type MediaFilter, type MediaItem, type MediaShelf, type MediaSort, type MediaType,
} from '../utils/media.js';

/* The media journal: books, movies, TV shows and music as cards on shelves —
   cover, title, who made it, the stars (tap to re-rate) and the shelf (a
   picker). Search, Type / Shelf / Rating filters and Sort; tapping the cover
   or title opens the entry in the journal. */

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

/* A poster grid: five across on desktop, fewer as the screen narrows */
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 24px;
  margin-top: 28px;
  @media (max-width: 1100px) { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
  @media (max-width: 860px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
`;

/* A shelf card: a lifted panel holding the cover, the stars and the shelf */
const Card = styled.article`
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  background: var(--bg-panel);
  ${glassCard}
`;

/* The cover fills the card's width, 2:3; with none, the title is written on the tile */
const CoverBtn = styled.button`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  aspect-ratio: 2 / 3;
  padding: 14px 12px;
  border: 1px solid var(--border-card);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tile);
  color: var(--text-muted);
  text-align: center;
  cursor: pointer;
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  &:hover { border-color: var(--control-border); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* The title on a cover-less tile */
const TileTitle = styled.span`
  font-family: var(--font-display);
  font-size: clamp(15px, 1.6cqi, 19px);
  font-weight: 300;
  line-height: 1.25;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
`;

const TileSub = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

/* Stars over the shelf pill, centred under the cover, with air around them */
const Foot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 8px 0 6px;
`;

/* The shelf as a small outlined pill: "Reading ⌄", the select invisible over it */
const ShelfPill = styled.label<{ $set: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  max-width: 100%;
  padding: 0 8px 0 10px;
  & > span:first-of-type { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  border: 1px solid ${({ $set }) => ($set ? 'var(--color-accent-line)' : 'var(--border-pill, var(--border-card))')};
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: ${({ $set }) => ($set ? 'var(--color-accent-soft)' : 'var(--text-soft)')};
  cursor: pointer;
  &:hover { border-color: ${({ $set }) => ($set ? 'var(--color-accent-line)' : 'var(--control-border)')}; }
  &:focus-within { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  & > span:last-of-type { display: inline-flex; }
  select { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; font-size: 16px; }
  option { color: var(--text-primary); background: var(--bg-surface); }
  ${glassControl}
`;

/* ── Pieces ── */

function CardCover({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const img = item.image;
  const { url } = useDecryptedImage(img?.key ?? null, img?.iv ?? null, img?.mimeType ?? null);
  const src = url ?? item.cover;
  const sub = mediaSubtitle(item);
  const tip = sub ? `${item.title} · ${sub}` : item.title;
  return (
    <CoverBtn type="button" onClick={onOpen} aria-label={`Open ${item.title}`} title={tip}>
      {src ? (
        <img src={src} alt="" style={img && url ? { objectPosition: focusPosition(img) } : undefined} />
      ) : (
        <>
          <MaterialIcon $size={28} aria-hidden="true">{mediaTypeInfo(item.type).glyph}</MaterialIcon>
          <TileTitle>{item.title}</TileTitle>
          {sub && <TileSub>{sub}</TileSub>}
        </>
      )}
    </CoverBtn>
  );
}

function MediaCard({ item, onOpen, onRate, onShelve }: {
  item: MediaItem; onOpen: () => void; onRate: (r: number) => void; onShelve: (s: MediaShelf) => void;
}) {
  return (
    <Card>
      <CardCover item={item} onOpen={onOpen} />
      <Foot>
        <StarRating value={item.rating} onChange={onRate} size={18} label={`Rating for ${item.title}`} />
        <ShelfPill $set={!!item.shelf}>
          <span>{shelfLabel(item.shelf, item.type)}</span>
          <span aria-hidden="true"><Icon name="chevron-down" size={13} strokeWidth={2} /></span>
          <select aria-label={`Shelf for ${item.title}`} value={item.shelf} onChange={e => onShelve(e.target.value as MediaShelf)}>
            <option value="">No shelf</option>
            {SHELVES.map(s => <option key={s.value} value={s.value}>{shelfLabel(s.value, item.type)}</option>)}
          </select>
        </ShelfPill>
      </Foot>
    </Card>
  );
}

/* ── View ── */

export function MediaView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const saveFields = useSaveFields();

  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [query, setQuery] = useState('');
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(saved)); } catch { /* private mode */ } }, [saved]);

  const topicIds = useMemo(() => mediaTopicIds(allTopics), [allTopics]);
  const topicId = topicIds[0];
  const items = useMemo(() => mediaItems(entries, topicIds, stripHtml), [entries, topicIds]);
  const filter: MediaFilter = { ...EMPTY_MEDIA_FILTER, type: saved.type, shelf: saved.shelf, minRating: saved.minRating, query };
  const shown = useMemo(() => sortMedia(filterMedia(items, filter), saved.sort), [items, filter.type, filter.shelf, filter.minRating, query, saved.sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback(async (item: MediaItem, fields: Record<string, unknown>) => {
    const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === item.id);
    if (!entry) return;
    await saveFields(entry, { ...item.fields, ...fields });
  }, [saveFields]);

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
              <Count>{filtering ? `${shown.length} of ${items.length}` : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}</Count>
            </Tools>
          )}

          {items.length === 0 ? (
            <EmptyState message="Nothing on your shelves yet." submessage="Add a book, movie, TV show or album and it shows up here." />
          ) : shown.length === 0 ? (
            <EmptyState message="Nothing matches those filters." />
          ) : (
            <Grid>
              {shown.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  onOpen={() => openInJournal(item.id)}
                  onRate={r => { void patch(item, { rating: r }); }}
                  onShelve={s => { void patch(item, { shelf: s }); }}
                />
              ))}
            </Grid>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
