import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useParams } from 'react-router-dom';
import { PublicTemplate } from '../components/templates/PublicTemplate.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MediaPosterCard, PosterGrid } from '../components/molecules/MediaPosterCard.js';
import { LoadMore } from '../components/molecules/LoadMore.js';
import { MediaFilterBar, MediaToolBox, EMPTY_MEDIA_FILTERS, type MediaFilters } from '../components/molecules/MediaFilterBar.js';
import { Chip } from '../components/molecules/fields/formKit.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { publicShelf as publicShelfApi, type PublicShelfPage, type PublicShelfQuery } from '../services/api.js';

/* Someone's public shelf, opened from its link: the title, the same search
   and Type / Shelf / Rating / Sort as the owner's page, and the posters —
   covers, stars and the Shelf status, nothing else to press — 24 at a time,
   the next 24 fetched as the foot scrolls into view. The narrowing happens on
   the server (one request per page, each cached for a minute), so a visitor
   never downloads the whole shelf. Always the light theme. No sign-in. */

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 40px 0 48px;
  overflow-wrap: anywhere;
  @media (max-width: 480px) { font-size: 34px; }
`;

const Message = styled.p`
  margin: 64px 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: var(--text-secondary);
`;

/* The visitor's type chips: the chosen one in the bright accent, the rest a
   soft grey outline — no fill on any of them */
const Filters = styled.div`
  /* The box keeps the light hairline whatever theme the visitor's browser remembers */
  ${MediaToolBox} { border-color: var(--border-subtle) !important; }
  ${Chip} { background: transparent; border-color: var(--border-subtle); color: var(--text-muted); }
  ${Chip}:hover { border-color: var(--border-default); color: var(--text-secondary); }
  ${Chip}[aria-pressed='true'], ${Chip}[aria-pressed='true']:hover { border-color: var(--color-accent); color: var(--color-accent); }
`;

const Centre = styled.div`
  display: flex;
  justify-content: center;
  padding: 80px 0;
`;

/** Keep the page out of search results while it's open (index.html says index, follow) */
function useNoIndex(title: string | null) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]');
    const was = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', 'noindex, nofollow');
    const prevTitle = document.title;
    if (title) document.title = `${title} · Chronicles`;
    return () => {
      if (meta && was !== null) meta.setAttribute('content', was);
      document.title = prevTitle;
    };
  }, [title]);
}

const toQuery = (filters: MediaFilters, q: string): PublicShelfQuery => ({
  type: filters.type || undefined, shelf: filters.shelf || undefined,
  rating: filters.minRating || undefined, sort: filters.sort, q: q.trim() || undefined,
});

type State =
  | { status: 'loading'; title: string | null }
  | { status: 'error' }
  | { status: 'done'; data: PublicShelfPage; items: PublicShelfPage['items']; loadingMore: boolean };

export function PublicShelfView() {
  const { token = '' } = useParams<{ token: string }>();
  const phone = useMediaQuery('(max-width: 768px)');
  const [filters, setFilters] = useState<MediaFilters>(EMPTY_MEDIA_FILTERS);
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState(''); // the search as last sent (typing waits 300 ms)
  const [state, setState] = useState<State>({ status: 'loading', title: null });
  const knownTitle = state.status === 'done' ? state.data.title : state.status === 'loading' ? state.title : null;
  // Whether this shelf has anything at all — the filters show only then
  const [hasAny, setHasAny] = useState(false);
  useNoIndex(knownTitle);
  // The observer can fire twice before React re-renders: one request at a time
  const inFlight = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setSent(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    inFlight.current = false;
    setState(s => ({ status: 'loading', title: s.status === 'done' ? s.data.title : s.status === 'loading' ? s.title : null }));
    publicShelfApi.getPage(token, 1, toQuery(filters, sent))
      .then(data => {
        if (cancelled) return;
        setState({ status: 'done', data, items: data.items, loadingMore: false });
        if (data.total > 0) setHasAny(true);
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [token, filters, sent]);

  const loadMore = () => {
    if (state.status !== 'done' || inFlight.current || state.data.page >= state.data.pages) return;
    const next = state.data.page + 1;
    inFlight.current = true;
    setState({ ...state, loadingMore: true });
    publicShelfApi.getPage(token, next, toQuery(filters, sent))
      .then(data => setState(s => (s.status === 'done' ? { status: 'done', data, items: [...s.items, ...data.items], loadingMore: false } : s)))
      .catch(() => setState(s => (s.status === 'done' ? { ...s, loadingMore: false } : s)))
      .finally(() => { inFlight.current = false; });
  };

  const filtering = !!(filters.type || filters.shelf || filters.minRating || sent.trim());

  return (
    <PublicTemplate>
      {state.status === 'error' && <Message>This shelf isn’t available.</Message>}
      {state.status !== 'error' && knownTitle && <Title>{knownTitle}</Title>}
      {state.status !== 'error' && hasAny && (
        <Filters><MediaFilterBar query={query} onQuery={setQuery} filters={filters} onFilters={setFilters} phone={phone} searchPlaceholder="Search this shelf" /></Filters>
      )}
      {state.status === 'loading' && <Centre><Spinner size={36} /></Centre>}
      {state.status === 'done' && (
        state.data.total === 0 ? (
          <Message>{filtering ? 'Nothing matches those filters.' : 'Nothing on this shelf yet.'}</Message>
        ) : (
          <>
            <PosterGrid>
              {state.items.map((item, i) => (
                <MediaPosterCard
                  key={i}
                  readOnly
                  item={{ title: item.title, type: item.type, creator: item.creator, year: item.year, rating: item.rating, shelf: item.shelf }}
                  coverSrc={item.cover ?? null}
                />
              ))}
            </PosterGrid>
            <LoadMore shown={state.items.length} total={state.data.total} hasMore={state.data.page < state.data.pages} loading={state.loadingMore} onMore={loadMore} />
          </>
        )
      )}
    </PublicTemplate>
  );
}
