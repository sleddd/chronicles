import styled from 'styled-components';
import type { ReactNode } from 'react';

/* Report stat tile: a --bg-panel card with the metric's name top-left and a
   muted caption top-right, a large thin Work Sans figure with its unit, and a
   4px progress rule in the metric's own colour. The chosen one (with onSelect,
   e.g. to switch a TrendChart) gets a hairline outline. */

const Tile = styled.button<{ $selected?: boolean; $static?: boolean }>`
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 20px 22px 22px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--bg-panel);
  border: 1px solid ${({ $selected }) => ($selected ? 'var(--control-border)' : 'transparent')};
  border-radius: 12px;
  cursor: ${({ $static }) => ($static ? 'default' : 'pointer')};
  transition: border-color 200ms ease;
  ${({ $static, $selected }) => (!$static && !$selected ? '&:hover { border-color: var(--border-card); }' : '')}
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { padding: 18px; }
`;

const Head = styled.span`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
`;

const Name = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-soft);
`;

const Caption = styled.span`
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  text-align: right;
`;

const Delta = styled.span<{ $dir?: 'up' | 'down' }>`
  margin-top: 6px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  &::before {
    content: ${({ $dir }) => ($dir === 'up' ? "'▲ '" : $dir === 'down' ? "'▼ '" : "''")};
    font-size: 9px;
    color: ${({ $dir }) => ($dir === 'down' ? 'var(--color-warning)' : 'var(--color-accent)')};
  }
`;

const Figure = styled.span`
  margin: 14px 0 18px;
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 36px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  small { margin-left: 6px; font-family: var(--font-sans); font-size: 14px; font-weight: 400; color: var(--text-muted); }
  @media (max-width: 480px) { font-size: 32px; }
`;

const Track = styled.span`
  display: block;
  height: 4px;
  background: var(--bg-row-hover);
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

/* "Today  Great" / "7 days  Okay" under the rule */
const Rows = styled.span`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  span { display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; }
  b { font-weight: 400; color: var(--text-secondary); }
`;

export const StatTileRow = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 4}, minmax(0, 1fr));
  gap: 20px;
  @media (max-width: 900px) { gap: 12px; }
  @media (max-width: 680px) { grid-template-columns: minmax(0, 1fr); }
`;

export interface StatTileProps {
  /** The figure, e.g. "7.2" */
  value: ReactNode;
  /** Small suffix after the figure, e.g. "h" or "/ 5" */
  unit?: string;
  /** Metric name, top-left, e.g. "Sleep" */
  name: string;
  /** Muted note, top-right, e.g. "avg per night" */
  caption?: ReactNode;
  /** Line under the name, e.g. "4% vs last month" */
  delta?: { text: string; dir?: 'up' | 'down' };
  /** 0..1 — fills the rule; omit for no rule */
  progress?: number;
  /** Rule colour (CSS value); defaults to the accent */
  color?: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Label / value lines under the rule, e.g. [["Today", "8 h"], ["7 days", "7 h"]] */
  rows?: [string, string][];
}

export function StatTile({ value, unit, name, caption, delta, progress, color, selected, onSelect, rows }: StatTileProps) {
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
      <Head>
        <Name>{name}</Name>
        {caption && <Caption>{caption}</Caption>}
      </Head>
      {delta && <Delta $dir={delta.dir}>{delta.text}</Delta>}
      <Figure>{value}{unit && <small>{unit}</small>}</Figure>
      {progress !== undefined && (
        <Track><Fill $pct={Math.max(0, Math.min(1, progress)) * 100} $color={color ?? 'var(--color-accent)'} /></Track>
      )}
      {rows && rows.length > 0 && (
        <Rows>{rows.map(([label, v]) => <span key={label}>{label}<b>{v}</b></span>)}</Rows>
      )}
    </Tile>
  );
}
