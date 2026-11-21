import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { TopBarAction } from '../components/organisms/TopBarAction.js';
import { PublicShelfControl } from '../components/organisms/PublicShelfControl.js';
import { FollowedShelves } from '../components/organisms/FollowedShelves.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { shelfTokenFrom } from '../utils/followedShelves.js';
import { renamePublicShelf, turnOnPublicShelfHere } from '../hooks/usePublicShelfSync.js';
import { PUBLIC_SHELF_TITLE_MAX } from '@shared/validation/schemas';
import { publicShelfUrl } from '../services/publicShelf.js';
import { showFlash } from '../services/flashNotice.js';
import { copyText } from '../utils/clipboard.js';
import { MediaFilterBar, MediaViewSwitch, EMPTY_MEDIA_FILTERS, type MediaFilters, type MediaLayout } from '../components/molecules/MediaFilterBar.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
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
import { glassPill, onPhoto, onPhotoInDark } from '../styles/wallpaper.js';
import { NAV_COMPACT } from '../styles/breakpoints.js';
import { ON_PUBLIC_SHELF, isOnPublicShelf } from '../services/publicShelf.js';
import { PUBLIC_SHELF_PAGE_SIZE } from '@shared/validation/schemas';
import {
  EMPTY_MEDIA_FILTER, MEDIA_SORTS, MEDIA_TYPES, SHELVES, allMediaTags, filterMedia, sortMedia, mediaItems, mediaTopicIds, mediaSubtitle, shelfLabel, formatRating,
  type MediaFilter, type MediaItem, type MediaShelf, type MediaSort, type MediaType,
} from '../utils/media.js';

/* The media journal: books, movies, TV shows and music as posters on shelves —
   cover, the stars (tap to re-rate), the Shelf status (a picker) and, while
   something is under way, its progress — or, with the list layout, the app's
   flush list rows. Under the title a meta row: the public shelf's name (rename
   it in place) · a grey Public shelf link, with Copy shelf link
   and Add media across from it. Then the tool row (MediaFilterBar) and the
   type chips; 24 cards at a time, more as you scroll. A bookmark on each card
   puts it on the one public shelf (PublicShelfControl); tapping a cover opens
   the entry. */

const VIEW_KEY = 'media-view-v1';

type Saved = MediaFilters & { layout: MediaLayout };
const EMPTY_SAVED: Saved = { ...EMPTY_MEDIA_FILTERS, layout: 'grid' };

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return EMPTY_SAVED;
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      type: MEDIA_TYPES.some(t => t.value === v.type) ? v.type as MediaType : '',
      shelf: SHELVES.some(s => s.value === v.shelf) ? v.shelf as MediaShelf : '',
      minRating: typeof v.minRating === 'number' ? v.minRating : 0,
      sort: MEDIA_SORTS.some(s => s.value === v.sort) ? v.sort as MediaSort : 'newest',
      // The chosen tag is never remembered: a tag is private (it names what the
      // person is reading or watching) and this record outlives the session.
      // One stored by an older build is ignored here and dropped on the next write
      tag: '',
      layout: v.layout === 'list' ? 'list' : 'grid',
    };
  } catch { return EMPTY_SAVED; }
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
  padding: 53px 0 36px;
  ${NAV_COMPACT} { padding: 20px 0 28px; }
  /* With no wallpaper, a hairline closes the title row (the photo marks it otherwise) */
  html:not([data-wallpaper]) & {
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 28px;
    margin-bottom: 24px;
  }
`;

/* The one page title that stays on phones (the top bar says "Media"; this
   page's shelf row sits with it) — so no `view-title` class, and the
   wallpaper's white treatment applied here instead */
const Title = styled.h1`
  ${onPhoto}
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

/* Under the title: the shelf's name · Public shelf, with the actions across (no item count) */
const MetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-top: 56px;
  ${NAV_COMPACT} { margin-top: 32px; }
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0 14px;
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
  ${onPhotoInDark}
  /* The dots between the parts */
  & > * + *::before { content: '·'; margin-right: 14px; color: var(--text-faint, var(--text-muted)); }
`;

/* The Public shelf link: the globe and the words in grey (never the accent; white on a wallpaper), opening the public page */
const PublicLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  color: var(--text-secondary);
  text-decoration: none;
  white-space: nowrap;
  /* On the wallpaper in dark it reads in white like the rest of the row, a touch see-through */
  ${onPhotoInDark}
  html[data-wallpaper][data-theme='dark'] & { opacity: 0.88; }
  &:hover { color: var(--text-primary); text-decoration: underline; opacity: 1; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 4px; }
`;

/* The list layout: the app's flush rows (title, a muted line, the date), under a top rule */
const ListBox = styled.div`
  margin-top: 40px;
  border-top: 1px solid var(--border-subtle);
`;

/* Copy shelf link: the neutral pill, a smoked glass pill on a wallpaper (like Add media) */
const CopyLinkBtn = styled(PillButton)`
  ${glassPill}
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  margin-left: auto;
  /* On phones (Add media is up in the top bar) Copy shelf link sits on its own line, flush left */
  @media (max-width: 768px) { margin-left: 0; flex: 1 1 100%; }
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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

/* The shelf's name, first in the meta row — a quiet button in thin italic
   Work Sans with a pencil, which turns into a field of the same face to rename
   it in place (Enter / away saves, Escape cancels) */
const nameFace = `
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  font-style: italic;
  line-height: 32px;
`;

const NameBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(360px, 100%);
  height: 32px;
  padding: 0;
  border: none;
  background: none;
  ${nameFace}
  color: var(--text-primary);
  /* White on a wallpaper in dark, like the title over it (light keeps its standard colour) */
  ${onPhotoInDark}
  cursor: pointer;
  & > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The pencil in the same colour as the name (it inherits, white on a wallpaper too) */
  svg { flex: none; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 4px; border-radius: 4px; }
`;

const NameInput = styled.input`
  && {
    width: min(360px, 100%);
    height: 32px;
    padding: 0;
    ${nameFace}
    color: var(--text-primary);
    background: transparent !important;
    html[data-wallpaper][data-theme='dark'] & { color: #fff; }
    border: none !important;
    border-bottom: 1px solid var(--color-accent-line) !important;
    border-radius: 0;
    outline: none;
  }
`;

function ShelfName({ title }: { title: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => { if (!editing) setDraft(title); }, [title, editing]);
  const save = () => { renamePublicShelf(draft); setEditing(false); };
  if (!editing) {
    return (
      <NameBtn type="button" onClick={() => setEditing(true)} title="Rename your public shelf" aria-label={`Rename your public shelf, now “${title}”`}>
        <span>{title}</span>
        <Icon name="pencil" size={14} strokeWidth={2} />
      </NameBtn>
    );
  }
  return (
    <NameInput autoFocus value={draft} maxLength={PUBLIC_SHELF_TITLE_MAX} aria-label="Public shelf name"
      onChange={e => setDraft(e.target.value)} onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { setDraft(title); setEditing(false); } }} />
  );
}

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

type MediaSection = 'mine' | 'following';
const SECTION_KEY = 'media-section-v1';
function loadSection(): MediaSection {
  try { return localStorage.getItem(SECTION_KEY) === 'following' ? 'following' : 'mine'; } catch { return 'mine'; }
}
function followFromHash(): string | null {
  const m = typeof location !== 'undefined' ? /^#follow=(.+)$/.exec(location.hash) : null;
  if (!m) return null;
  // A hand-made link can hold a broken escape ("%"), which decodeURIComponent throws on
  try { return shelfTokenFrom(decodeURIComponent(m[1])); } catch { return null; }
}
const SECTIONS: { value: MediaSection; label: string }[] = [
  { value: 'mine', label: 'My shelf' },
  { value: 'following', label: 'Following' },
];
/* Media Journal on the left, My shelf | Following across from it */
const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
`;

export function MediaView() {
  const { isReady, isLoading } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const publicShelf = usePublicShelfStore(s => s.publicShelf);
  const shelfTitle = usePublicShelfStore(s => s.title);
  const pendingItemId = usePublicShelfStore(s => s.pendingItemId);
  const setPendingItemId = usePublicShelfStore(s => s.setPendingItemId);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const saveFields = useSaveFields();

  const [saved, setSaved] = useState<Saved>(loadSaved);
  // My shelf | Following (remembered per browser). A public page's Follow
  // button lands here as #follow=<token> — after the #, so the token stays
  // out of the server's logs — and is taken out of the address at once
  const [section, setSection] = useState<MediaSection>(() => (followFromHash() ? 'following' : loadSection()));
  const [incoming, setIncoming] = useState<string | null>(followFromHash);
  useEffect(() => {
    if (location.hash.startsWith('#follow=')) history.replaceState(history.state, '', location.pathname + location.search);
  }, []);
  useEffect(() => { try { localStorage.setItem(SECTION_KEY, section); } catch { /* private mode */ } }, [section]);
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
  useEffect(() => {
    const { tag: _private, ...remembered } = saved; // eslint-disable-line @typescript-eslint/no-unused-vars
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(remembered)); } catch { /* private mode */ }
  }, [saved]);
  // A new search, filter or sort starts from the top again
  useEffect(() => { setShownCount(PUBLIC_SHELF_PAGE_SIZE); }, [query, saved.type, saved.shelf, saved.minRating, saved.sort, saved.tag]);

  const topicIds = useMemo(() => mediaTopicIds(allTopics), [allTopics]);
  const topicId = topicIds[0];
  const items = useMemo(() => mediaItems(entries, topicIds, stripHtml), [entries, topicIds]);
  const { layout, ...filters } = saved;
  // The tags in use on the shelf; a remembered tag that's no longer on anything is dropped
  const tags = useMemo(() => allMediaTags(items), [items]);
  const tag = saved.tag && tags.some(t => t.toLowerCase() === saved.tag!.toLowerCase()) ? saved.tag : '';
  const filter: MediaFilter = { ...EMPTY_MEDIA_FILTER, type: saved.type, shelf: saved.shelf, minRating: saved.minRating, query, tag };
  const sort: MediaSort = saved.sort === 'tag' && tags.length === 0 ? 'newest' : saved.sort;
  const shown = useMemo(() => sortMedia(filterMedia(items, filter), sort), [items, filter.type, filter.shelf, filter.minRating, filter.tag, query, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => shown.slice(0, shownCount), [shown, shownCount]);
  const pendingItem = useMemo(() => items.find(i => i.id === pendingItemId) ?? null, [items, pendingItemId]);

  const patch = useCallback(async (item: MediaItem, fields: Record<string, unknown>) => {
    const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === item.id);
    if (!entry) return;
    await saveFields(entry, { ...item.fields, ...fields });
  }, [saveFields]);

  // The bookmark: off the shelf → on it (the first one asks, in the panel); on → off
  const toggleBookmark = useCallback((item: MediaItem, el: HTMLElement | null) => {
    if (isOnPublicShelf(item)) {
      turnOnPublicShelfHere();
      void patch(item, { [ON_PUBLIC_SHELF]: false });
      return;
    }
    // With a shelf already on, a bookmark tap is the owner's go-ahead in this
    // browser too: it turns publishing on here and the page updates at once.
    // Not after Turn off was pressed here — then the prompt asks again
    if (publicShelf && turnOnPublicShelfHere()) { void patch(item, { [ON_PUBLIC_SHELF]: true }); return; }
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
            <TitleRow>
              <Title>Media Journal</Title>
              <FilterTabs options={SECTIONS} active={section} onChange={setSection} bordered={false} flush />
            </TitleRow>
            <MetaRow>
              <Meta>
                {publicShelf && <ShelfName title={shelfTitle} />}
                {publicShelf && (
                  <PublicLink href={shelfUrl} target="_blank" rel="noopener noreferrer" title="Open your public shelf in a new tab">
                    <Icon name="globe" size={15} strokeWidth={2} />Public shelf
                  </PublicLink>
                )}
              </Meta>
              <Actions>
                {publicShelf && (
                  <CopyLinkBtn type="button" $variant="neutral" onClick={copyLink} data-copied={copied} aria-label={copied ? 'Copied' : 'Copy the public shelf link'}>
                    <Icon name={copied ? 'check' : 'link'} size={14} strokeWidth={2.5} />{copied ? 'Copied' : 'Copy shelf link'}
                  </CopyLinkBtn>
                )}
                {topicId != null && (
                  <TopBarAction>
                    <PillButton type="button" $variant="solid" onClick={() => newEntry(topicId)}>Add media</PillButton>
                  </TopBarAction>
                )}
              </Actions>
            </MetaRow>
          </Head>

          {section === 'following' ? (
            <FollowedShelves ownToken={publicShelf?.token ?? null} incoming={incoming} onIncomingDone={() => setIncoming(null)} />
          ) : (<>
          {items.length > 0 && (
            <MediaFilterBar roomy query={query} onQuery={setQuery} filters={{ ...filters, tag, sort }} onFilters={next => setSaved(v => ({ ...v, ...next }))} phone={phone} tags={tags}
              aside={<MediaViewSwitch value={layout} onChange={l => setSaved(v => ({ ...v, layout: l }))} />} />
          )}
          <PublicShelfControl open={panelOpen} onOpenChange={setPanel} anchor={anchor} pendingItem={pendingItem} onTurnedOn={turnedOn} />

          {items.length === 0 ? (
            <EmptyState message="Nothing on your shelves yet." submessage="Add a book, movie, TV show or album and it shows up here." />
          ) : shown.length === 0 ? (
            <EmptyState message="Nothing matches those filters." />
          ) : (
            <>
              {layout === 'list' ? (
                <ListBox>
                  {visible.map(item => (
                    <EntryListCard key={item.id} flush roomy content={item.title} createdAt={item.createdAt} onClick={() => openInJournal(item.id)}
                      preview={[mediaSubtitle(item), item.rating ? `${formatRating(item.rating)} stars` : '', item.shelf ? shelfLabel(item.shelf, item.type) : ''].filter(Boolean).join(' · ')} />
                  ))}
                </ListBox>
              ) : (
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
              )}
              <LoadMore shown={visible.length} total={shown.length} onMore={() => setShownCount(n => n + PUBLIC_SHELF_PAGE_SIZE)} />
            </>
          )}
          </>)}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
