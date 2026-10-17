import styled from 'styled-components';
import type { ReactNode } from 'react';

/* Report stat tile: tracked caption, thin Work Sans figure, a 4px progress bar in
   the metric's own colour, then the name. Every tile has a hairline outline; the chosen
   one (with onSelect, e.g. to switch a TrendChart) lifts onto --bg-hover with a brighter one. */

const Tile = styled.button<{ $selected?: boolean; $static?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 16px 14px 14px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: ${({ $selected }) => ($selected ? 'var(--bg-hover)' : 'transparent')};
  border: 1px solid ${({ $selected }) => ($selected ? 'var(--border-strong)' : 'var(--border-default)')};
  border-radius: var(--r-lg, 6px);
  cursor: ${({ $static }) => ($static ? 'default' : 'pointer')};
  transition: background 200ms ease, border-color 200ms ease;

  ${({ $static, $selected }) => (!$static && !$selected ? '&:hover { background: var(--bg-hover); }' : '')}
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Delta = styled.span<{ $dir?: 'up' | 'down' }>`
  font-family: var(--font-label);
  font-size: 11px;
  color: var(--text-tertiary);
  min-height: 15px;
  &::before {
    content: ${({ $dir }) => ($dir === 'up' ? "'▲ '" : $dir === 'down' ? "'▼ '" : "''")};
    font-size: 8px;
    color: ${({ $dir }) => ($dir === 'down' ? 'var(--color-warning)' : 'var(--color-accent)')};
  }
`;

const Figure = styled.span`
  font-family: var(--font-display);
  font-weight: 200;
  font-size: 40px;
  line-height: 1.05;
  margin: 2px 0 8px;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  overflow-wrap: anywhere;
  small { font-size: 16px; color: var(--text-tertiary); margin-left: 2px; }
  @media (max-width: 480px) { font-size: 32px; }
`;

const Track = styled.span`
  display: block;
  height: 4px;
  background: var(--bg-sunken); /* --border-subtle vanishes on a card's fill */
  border-radius: 2px;
  overflow: hidden;
`;

const Fill = styled.span<{ $pct: number; $color: string }>`
  display: block;
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ $color }) => $color};
  border-radius: 2px;
  transition: width 300ms ease-out;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Name = styled.span`
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 18px;
  color: var(--text-primary);
  margin-top: 10px;
`;

const Caption = styled.span`
  font-family: var(--font-label);
  font-size: 12px;
  color: var(--text-tertiary);
`;

export const StatTileRow = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 4}, minmax(0, 1fr));
  gap: 8px;
  @media (max-width: 620px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

export interface StatTileProps {
  /** The figure, e.g. "7.2" */
  value: ReactNode;
  /** Small suffix after the figure, e.g. "h" or "/5" */
  unit?: string;
  /** Metric name under the bar, e.g. "Sleep" */
  name: string;
  /** Muted line under the name, e.g. "Avg per night" */
  caption?: ReactNode;
  /** Line above the figure, e.g. "4% vs last month" */
  delta?: { text: string; dir?: 'up' | 'down' };
  /** 0..1 — fills the bar; omit for no bar */
  progress?: number;
  /** Bar colour (CSS value); defaults to the accent */
  color?: string;
  selected?: boolean;
  onSelect?: () => void;
}

export function StatTile({ value, unit, name, caption, delta, progress, color, selected, onSelect }: StatTileProps) {
  const isStatic = !onSelect;
  return (
    <Tile
      as={isStatic ? 'div' : 'button'}
      type={isStatic ? undefined : 'button'}
      $static={isStatic}
      $selected={selected}
      aria-pressed={isStatic ? undefined : !!selected}
      onClick={onSelect}
    >
      <Delta $dir={delta?.dir}>{delta?.text ?? ''}</Delta>
      <Figure>{value}{unit && <small>{unit}</small>}</Figure>
      {progress !== undefined && (
        <Track><Fill $pct={Math.max(0, Math.min(1, progress)) * 100} $color={color ?? 'var(--color-accent)'} /></Track>
      )}
      <Name>{name}</Name>
      {caption && <Caption>{caption}</Caption>}
    </Tile>
  );
}
