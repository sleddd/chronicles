import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Spinner } from '../atoms/Spinner.js';

/* Infinite scroll's foot: a sentinel that asks for the next page as it comes
   into view (IntersectionObserver, well before the bottom), a quiet "Show
   more" for the keyboard and for browsers without the observer, and a muted
   "Showing 24 of 30". Nothing when everything is shown. Props only. */

const Foot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 28px;
  min-height: 44px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const More = styled.button`
  height: 34px;
  padding: 0 18px;
  border: 1px solid var(--border-pill, var(--border-card));
  border-radius: 999px;
  background: var(--bg-control, transparent);
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--control-border); color: var(--text-primary); }
  &:disabled { opacity: 0.6; cursor: wait; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

interface LoadMoreProps {
  shown: number;
  total: number;
  /** Whether another page exists (default: shown < total) */
  hasMore?: boolean;
  loading?: boolean;
  onMore: () => void;
  className?: string;
}

export function LoadMore({ shown, total, hasMore, loading = false, onMore, className }: LoadMoreProps) {
  const ref = useRef<HTMLDivElement>(null);
  const more = hasMore ?? shown < total;
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;

  useEffect(() => {
    if (!more || loading || typeof IntersectionObserver === 'undefined' || !ref.current) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) onMoreRef.current();
    }, { rootMargin: '400px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [more, loading, shown]);

  if (!more && !loading) return null;
  return (
    <Foot ref={ref} className={className} aria-live="polite">
      {loading ? <Spinner size={20} /> : (
        <More type="button" onClick={onMore}>Show more</More>
      )}
      <span>Showing {Math.min(shown, total)} of {total}</span>
    </Foot>
  );
}
