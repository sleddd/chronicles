import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useParams } from 'react-router-dom';
import { PublicTemplate } from '../components/templates/PublicTemplate.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MediaPosterCard, PosterGrid } from '../components/molecules/MediaPosterCard.js';
import { LoadMore } from '../components/molecules/LoadMore.js';
import { publicShelf as publicShelfApi, type PublicShelfPage } from '../services/api.js';

/* Someone's public shelf, opened from its link: the title, how many items,
   and the posters — covers, stars and the Shelf status, nothing to press —
   24 at a time, the next 24 fetched as the foot scrolls into view. Always the
   light theme (PublicTemplate). One request per page; the server caches each
   for a minute. No sign-in, no stores. */

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 40px 0 10px;
  overflow-wrap: anywhere;
  @media (max-width: 480px) { font-size: 34px; }
`;

const Count = styled.p`
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
`;

const Message = styled.p`
  margin: 64px 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: var(--text-secondary);
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

export function PublicShelfView() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'done'; data: PublicShelfPage; items: PublicShelfPage['items']; loadingMore: boolean }>({ status: 'loading' });
  useNoIndex(state.status === 'done' ? state.data.title : null);
  // The observer can fire twice before React re-renders: one request at a time
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    inFlight.current = false;
    setState({ status: 'loading' });
    publicShelfApi.getPage(token, 1)
      .then(data => { if (!cancelled) setState({ status: 'done', data, items: data.items, loadingMore: false }); })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [token]);

  const loadMore = () => {
    if (state.status !== 'done' || inFlight.current || state.data.page >= state.data.pages) return;
    const next = state.data.page + 1;
    inFlight.current = true;
    setState({ ...state, loadingMore: true });
    publicShelfApi.getPage(token, next)
      .then(data => setState(s => (s.status === 'done' ? { status: 'done', data, items: [...s.items, ...data.items], loadingMore: false } : s)))
      .catch(() => setState(s => (s.status === 'done' ? { ...s, loadingMore: false } : s)))
      .finally(() => { inFlight.current = false; });
  };

  return (
    <PublicTemplate>
      {state.status === 'loading' && <Centre><Spinner size={36} /></Centre>}
      {state.status === 'error' && <Message>This shelf isn’t available.</Message>}
      {state.status === 'done' && (
        <>
          <Title>{state.data.title}</Title>
          <Count>{state.data.total === 1 ? '1 item' : `${state.data.total} items`}</Count>
          {state.data.total === 0 ? (
            <Message>Nothing on this shelf yet.</Message>
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
          )}
        </>
      )}
    </PublicTemplate>
  );
}
