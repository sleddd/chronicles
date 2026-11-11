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
import { publicShelfUrl } from '../services/publicShelf.js';
import { showFlash } from '../services/flashNotice.js';
import { copyText } from '../utils/clipboard.js';
import { MediaFilterBar, EMPTY_MEDIA_FILTERS, type MediaFilters } from '../components/molecules/MediaFilterBar.js';
import { MediaPosterCard, PosterGrid } from '../components/molecules/MediaPosterCard.js';
import { LoadMore } from '../components/molecules/LoadMore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { useDecryptedImage } from '../hooks/useDecryptedImage.js';
import { useSaveFields } from '../hooks/useSaveFields.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { usePublicShelfStore } from '../stores/publicShelfStore.js';
import { stripHtml } from '../utils/stripHtml.js';
import { focusPosition } from '../components/organisms/EntryImageGallery.js';
import { glassControl, onPhoto } from '../styles/wallpaper.js';
import { NAV_COMPACT } from '../styles/breakpoints.js';
import { ON_PUBLIC_SHELF, isOnPublicShelf } from '../services/publicShelf.js';
import { PUBLIC_SHELF_PAGE_SIZE } from '@shared/validation/schemas';
import {
  EMPTY_MEDIA_FILTER, MEDIA_SORTS, MEDIA_TYPES, SHELVES, filterMedia, sortMedia, mediaItems, mediaTopicIds,
  type MediaFilter, type MediaItem, type MediaShelf, type MediaSort, type MediaType,
} from '../utils/media.js';

/* The media journal: books, movies, TV shows and music as posters on shelves —
   cover, the stars (tap to re-rate), the Shelf status (a picker) and, while
   something is under way, its progress. Search, Type / Shelf / Rating filters
   and Sort; 24 cards at a time, more as you scroll. A bookmark on each card puts it on the one
   public shelf (PublicShelfControl); tapping a cover opens the entry. */

const VIEW_KEY = 'media-view-v1';

type Saved = MediaFilters;

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return EMPTY_MEDIA_FILTERS;
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      type: MEDIA_TYPES.some(t => t.value === v.type) ? v.type as MediaType : '',
      shelf: SHELVES.some(s => s.value === v.shelf) ? v.shelf as MediaShelf : '',
      minRating: typeof v.minRating === 'number' ? v.minRating : 0,
      sort: MEDIA_SORTS.some(s => s.value === v.sort) ? v.sort as MediaSort : 'newest',
    };
  } catch { return EMPTY_MEDIA_FILTERS; }
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
  ${NAV_COMPACT} { padding: 20px 0 16px; }
`;

/* The one page title that stays on phones (the top bar says "Media"; this
   page's link field sits with it) — so no `view-title` class, and the
   wallpaper's white treatment applied here instead */
const Title = styled.h1`
  flex: none;
  ${onPhoto}
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

/* The title with, once the public shelf is on, its link field beside it */
const TitleBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1 1 auto;
  min-width: 0;
  @media (max-width: 640px) { flex-wrap: wrap; gap: 12px; }
`;

/* The public shelf's address in a filled read-only field with a copy button
   inside — the app's filled input look, as the sign-in and settings fields */
const ShelfLink = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 360px;
  min-width: 180px;
  height: 40px;
  padding: 0 5px 0 18px;
  border-radius: 999px;
  /* A faded fill: the page (or the photo behind it) shows through */
  background: color-mix(in srgb, var(--bg-sunken) 45%, transparent);
  border: 1px solid var(--border-field);
  ${glassControl}
  html[data-wallpaper] & {
    background: color-mix(in srgb, var(--bg-app) 38%, transparent);
    -webkit-backdrop-filter: blur(8px) saturate(1.05);
    backdrop-filter: blur(8px) saturate(1.05);
  }
  &:focus-within { border-color: var(--color-accent); }
  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
    text-overflow: ellipsis;
  }
  button {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  button:hover { color: var(--text-primary); background: var(--bg-hover); }
  button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  button[data-copied='true'] { color: var(--color-accent); }
`;

/* The public-shelf bookmark over a cover's corner: accent and solid while the
   item is on the shelf, a grey outline otherwise, on a soft disc so it reads
   over any cover */
const Bookmark = styled.button<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
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
  onProgress: (p: number) => void; onBookmark: (el: HTMLElement | null) => void;
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
          onClick={e => onBookmark(e.currentTarget)}>
          <Icon name="bookmark" size={18} strokeWidth={2} />
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
  const [shownCount, setShownCount] = useState(PUBLIC_SHELF_PAGE_SIZE);
  const [panelOpen, setPanelOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const phone = useMediaQuery('(max-width: 768px)');
  const [copied, setCopied] = useState(false);
  const shelfUrl = publicShelf ? publicShelfUrl(publicShelf.token) : '';
  const copyLink = async () => {
    if (await copyText(shelfUrl)) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    else showFlash('Couldn’t copy the link — select it and copy by hand.');
  };
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(saved)); } catch { /* private mode */ } }, [saved]);
  // A new search, filter or sort starts from the top again
  useEffect(() => { setShownCount(PUBLIC_SHELF_PAGE_SIZE); }, [query, saved.type, saved.shelf, saved.minRating, saved.sort]);

  const topicIds = useMemo(() => mediaTopicIds(allTopics), [allTopics]);
  const topicId = topicIds[0];
  const items = useMemo(() => mediaItems(entries, topicIds, stripHtml), [entries, topicIds]);
  const filter: MediaFilter = { ...EMPTY_MEDIA_FILTER, type: saved.type, shelf: saved.shelf, minRating: saved.minRating, query };
  const shown = useMemo(() => sortMedia(filterMedia(items, filter), saved.sort), [items, filter.type, filter.shelf, filter.minRating, query, saved.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => shown.slice(0, shownCount), [shown, shownCount]);
  const pendingItem = useMemo(() => items.find(i => i.id === pendingItemId) ?? null, [items, pendingItemId]);

  const patch = useCallback(async (item: MediaItem, fields: Record<string, unknown>) => {
    const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === item.id);
    if (!entry) return;
    await saveFields(entry, { ...item.fields, ...fields });
  }, [saveFields]);

  // The bookmark: off the shelf → on it (the first one asks, in the panel); on → off
  const toggleBookmark = useCallback((item: MediaItem, el: HTMLElement | null) => {
    if (isOnPublicShelf(item)) { void patch(item, { [ON_PUBLIC_SHELF]: false }); return; }
    if (publicShelf) { void patch(item, { [ON_PUBLIC_SHELF]: true }); return; }
    setPendingItemId(item.id);
    setAnchor(el);
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


  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <TitleBlock>
              <Title>Media Journal</Title>
              {publicShelf && (
                <ShelfLink>
                  <input readOnly value={shelfUrl} aria-label="Your public shelf link" onFocus={e => e.currentTarget.select()} />
                  <button type="button" onClick={copyLink} data-copied={copied} aria-label={copied ? 'Copied' : 'Copy the public shelf link'} title={copied ? 'Copied' : 'Copy link'}>
                    <Icon name={copied ? 'check' : 'copy'} size={16} strokeWidth={2} />
                  </button>
                </ShelfLink>
              )}
            </TitleBlock>
            {topicId != null && (
              <TopBarAction>
                <PillButton type="button" onClick={() => newEntry(topicId)}>Add media</PillButton>
              </TopBarAction>
            )}
          </Head>

          {items.length > 0 && (
            <MediaFilterBar query={query} onQuery={setQuery} filters={saved} onFilters={setSaved} phone={phone} />
          )}
          <PublicShelfControl open={panelOpen} onOpenChange={setPanel} anchor={anchor} pendingItem={pendingItem} onTurnedOn={turnedOn} />

          {items.length === 0 ? (
            <EmptyState message="Nothing on your shelves yet." submessage="Add a book, movie, TV show or album and it shows up here." />
          ) : shown.length === 0 ? (
            <EmptyState message="Nothing matches those filters." />
          ) : (
            <>
              <PosterGrid>
                {visible.map(item => (
                  <OwnerCard
                    key={item.id}
                    item={item}
                    onOpen={() => openInJournal(item.id)}
                    onRate={r => { void patch(item, { rating: r }); }}
                    onShelve={s => { void patch(item, { shelf: s }); }}
                    onProgress={p => { void patch(item, { progress: p }); }}
                    onBookmark={el => toggleBookmark(item, el)}
                  />
                ))}
              </PosterGrid>
              <LoadMore shown={visible.length} total={shown.length} onMore={() => setShownCount(n => n + PUBLIC_SHELF_PAGE_SIZE)} />
            </>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
