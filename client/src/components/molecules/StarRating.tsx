import { useId, useState, type KeyboardEvent } from 'react';
import styled from 'styled-components';
import { clampRating, formatRating } from '../../utils/media.js';

/* Five stars in halves — the media journal's rating, on the form and on each
   shelf card. Filled stars are the accent, empty ones a grey outline. Tap a
   star's left half for a half star, its right half for the whole one; tapping
   the value already set clears it. One slider for the keyboard (arrows step
   by a half, Home / End, Backspace clears). Props only. */

const STAR = 'M12 2.6l2.85 6.1 6.65.8-4.9 4.6 1.3 6.6L12 17.5l-5.9 3.2 1.3-6.6-4.9-4.6 6.65-.8z';

const Wrap = styled.div<{ $readOnly?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  ${({ $readOnly }) => ($readOnly ? '' : 'cursor: pointer;')}
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; border-radius: 4px; }
`;

const Star = styled.span<{ $size: number }>`
  position: relative;
  display: inline-block;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
`;

const Half = styled.button`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  &:first-of-type { left: 0; }
  &:last-of-type { right: 0; }
  &:focus { outline: none; }
`;

const Value = styled.span`
  margin-left: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  readOnly?: boolean;
  /** Show the number after the stars ("4.5") */
  showValue?: boolean;
  label?: string;
  className?: string;
}

export function StarRating({ value, onChange, size = 22, readOnly, showValue, label = 'Rating', className }: StarRatingProps) {
  const current = clampRating(value);
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? current;
  const clipBase = useId();
  const interactive = !readOnly && !!onChange;

  const pick = (v: number) => {
    if (!interactive) return;
    onChange!(v === current ? 0 : v);
    setPreview(null);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, current + 0.5);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, current - 0.5);
    else if (e.key === 'Home') next = 0.5;
    else if (e.key === 'End') next = 5;
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') next = 0;
    if (next === null) return;
    e.preventDefault();
    onChange!(next);
  };

  return (
    <Wrap
      className={className}
      $readOnly={!interactive}
      role={interactive ? 'slider' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 5 : undefined}
      aria-valuenow={interactive ? current : undefined}
      aria-valuetext={`${formatRating(current)} of 5 stars`}
      onKeyDown={onKey}
      onMouseLeave={() => setPreview(null)}
    >
      {[1, 2, 3, 4, 5].map(i => {
        const fill = Math.max(0, Math.min(1, shown - (i - 1)));
        const clipId = `${clipBase}-${i}`;
        return (
          <Star key={i} $size={size} aria-hidden={interactive ? undefined : true}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR} fill="none" stroke="var(--control-border)" strokeWidth="1.4" strokeLinejoin="round" />
              {fill > 0 && (
                <>
                  <clipPath id={clipId}><rect x="0" y="0" width={24 * fill} height="24" /></clipPath>
                  <path d={STAR} fill="var(--color-accent)" stroke="var(--color-accent)" strokeWidth="1.4" strokeLinejoin="round" clipPath={`url(#${clipId})`} />
                </>
              )}
            </svg>
            {interactive && (
              <>
                <Half type="button" tabIndex={-1} aria-label={`${formatRating(i - 0.5)} stars`}
                  onMouseEnter={() => setPreview(i - 0.5)} onClick={e => { e.stopPropagation(); pick(i - 0.5); }} />
                <Half type="button" tabIndex={-1} aria-label={`${i} star${i === 1 ? '' : 's'}`}
                  onMouseEnter={() => setPreview(i)} onClick={e => { e.stopPropagation(); pick(i); }} />
              </>
            )}
          </Star>
        );
      })}
      {showValue && <Value>{current > 0 ? formatRating(current) : 'Unrated'}</Value>}
    </Wrap>
  );
}
