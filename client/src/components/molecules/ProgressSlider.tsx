import styled from 'styled-components';

/* A 4px progress rule that is also a slider — the wellness check-in's
   pattern: drag it or use the arrow keys (an invisible <input type="range">
   lies over the rule, with an accent dot at the value). Used for how far
   through a book, film or album someone is. Props only. */

const Slider = styled.div<{ $tall: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: ${({ $tall }) => ($tall ? 28 : 20)}px;
  touch-action: none; /* a sideways drag moves the value, not the page */
`;

const Track = styled.div`
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--progress-track, var(--bg-sunken));
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  border-radius: 2px;
  background: var(--color-accent-fill, var(--color-accent));
  transition: width 160ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

/* Kept inside the rule at both ends (like a native thumb) */
const Thumb = styled.span<{ $pct: number; $size: number }>`
  --thumb: ${({ $size }) => $size}px;
  position: absolute;
  top: 50%;
  left: calc(${({ $pct }) => $pct}% + (50 - ${({ $pct }) => $pct}) * var(--thumb) / 100);
  width: var(--thumb);
  height: var(--thumb);
  margin: calc(var(--thumb) / -2) 0 0 calc(var(--thumb) / -2);
  border-radius: 50%;
  background: var(--color-accent-fill, var(--color-accent));
  pointer-events: none;
  transition: left 160ms ease, transform 120ms;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Range = styled.input`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  &:focus-visible + ${Thumb} { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  &:active + ${Thumb} { transform: scale(1.25); }
`;

interface ProgressSliderProps {
  /** 0–100 */
  value: number;
  onChange: (value: number) => void;
  /** Fired when a drag or key press ends — the moment to save */
  onCommit?: (value: number) => void;
  label: string;
  /** Read out instead of the bare number ("45% read") */
  valueText?: string;
  step?: number;
  /** A roomier hit area (the form); the cards use the small one */
  tall?: boolean;
  className?: string;
}

export function ProgressSlider({ value, onChange, onCommit, label, valueText, step = 1, tall = false, className }: ProgressSliderProps) {
  const pct = Math.max(0, Math.min(100, value));
  const commit = (e: { currentTarget: HTMLInputElement }) => onCommit?.(Number(e.currentTarget.value));
  return (
    <Slider className={className} $tall={tall}>
      <Track><Fill $pct={pct} /></Track>
      <Range type="range" min={0} max={100} step={step} value={pct}
        aria-label={label} aria-valuetext={valueText ?? `${pct}%`}
        onChange={e => onChange(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <Thumb $pct={pct} $size={tall ? 14 : 12} aria-hidden="true" />
    </Slider>
  );
}
