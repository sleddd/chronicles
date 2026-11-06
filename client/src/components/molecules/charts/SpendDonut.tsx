import styled from 'styled-components';
import { formatCents, type SpendSlice } from '../../../utils/finance.js';

/* Where the month's money goes: a ring split by category beside a legend of
   name, amount and share, biggest first. Props only. */

/* Category colours from the chart palette; "Everything else" is the grey ghost */
const COLORS = ['var(--chart-blue)', 'var(--chart-green)', 'var(--chart-amber)', 'var(--chart-violet)', 'var(--mood-1)'];
const colorFor = (s: SpendSlice, i: number) => (s.key === '__rest__' ? 'var(--chart-ghost)' : COLORS[i % COLORS.length]);

const Wrap = styled.div`
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  align-items: center;
  gap: 32px;
  @media (max-width: 560px) { grid-template-columns: 1fr; gap: 20px; justify-items: center; }
`;

const Svg = styled.svg`
  display: block;
  width: 180px;
  height: 180px;
  text { font-family: var(--font-display); font-weight: 300; fill: var(--text-secondary); }
`;

const Legend = styled.ul`
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  li {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto 48px;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  li:last-child { border-bottom: none; }
  i { width: 10px; height: 10px; border-radius: 50%; }
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  b { font-weight: 500; font-variant-numeric: tabular-nums; }
  small { font-size: 13px; color: var(--text-muted); text-align: right; font-variant-numeric: tabular-nums; }
`;

const SIZE = 180;
const C = SIZE / 2;
const R = 70;
const RING = 22;

export function SpendDonut({ slices, totalCents }: { slices: SpendSlice[]; totalCents: number }) {
  const circumference = 2 * Math.PI * R;
  let offset = 0;
  return (
    <Wrap>
      <Svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
        aria-label={slices.map(s => `${s.name} ${Math.round(s.share * 100)}%`).join(', ')}>
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--border-subtle)" strokeWidth={RING} />
        {slices.map((s, i) => {
          const len = s.share * circumference;
          const el = (
            <circle key={s.key} cx={C} cy={C} r={R} fill="none" stroke={colorFor(s, i)} strokeWidth={RING}
              strokeDasharray={`${len} ${circumference - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${C} ${C})`} />
          );
          offset += len;
          return el;
        })}
        <text x={C} y={C + 7} textAnchor="middle" fontSize={18}>{formatCents(totalCents)}</text>
      </Svg>
      <Legend aria-label="Spending by category">
        {slices.map((s, i) => (
          <li key={s.key}>
            <i style={{ background: colorFor(s, i) }} />
            <span>{s.name}</span>
            <b>{formatCents(s.cents)}</b>
            <small>{Math.round(s.share * 100)}%</small>
          </li>
        ))}
      </Legend>
    </Wrap>
  );
}
