import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';

/* ‹ Page 2 of 5 › under a paged grid — the app's round outlined arrow pair
   (as on the calendar and the mantra card) with the page between. Hidden
   when there is only one page. Props only. */

const Bar = styled.nav`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 28px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const Arrow = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-pill, var(--border-card));
  border-radius: 50%;
  background: var(--bg-control, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--control-border); color: var(--text-primary); }
  &:disabled { opacity: 0.4; cursor: default; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

interface PagerBarProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  className?: string;
}

export function PagerBar({ page, pages, onChange, className }: PagerBarProps) {
  if (pages <= 1) return null;
  return (
    <Bar className={className} aria-label="Pages">
      <Arrow type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <Icon name="chevron-left" size={18} strokeWidth={2} />
      </Arrow>
      <span aria-live="polite">Page {page} of {pages}</span>
      <Arrow type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        <Icon name="chevron-right" size={18} strokeWidth={2} />
      </Arrow>
    </Bar>
  );
}
