import styled from 'styled-components';

/* Quiet bar chart in the reports style (TrendChart's sibling): faint gridlines
   over a firmer baseline, 0 / half / max ticks, muted labels, one bar per
   period in its colour and an optional dashed grey line at the target. A bar
   that reaches the target is the full colour, one short of it is paler. Pure
   SVG, every colour a CSS value. Props only. */

interface CountBarsProps {
  /** One label per bar; only some are printed when there are many */
  labels: string[];
  values: number[];
  /** A dashed line at this height (the weekly or daily target) */
  target?: number;
  color?: string;
  ariaLabel: string;
  /** Says what a bar is, for its hover label ("Nov 8: 3 times") */
  unitLabel?: (value: number) => string;
}

const W = 900;
const H = 230;
const PAD = { l: 44, r: 8, t: 12, b: 36 };

const Svg = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  text {
    font-family: var(--font-sans);
    font-size: 12px;
    fill: var(--text-muted);
  }
`;

/** The axis top: a round number at or above the largest value (and the target) */
function niceTop(max: number): number {
  if (max <= 2) return 2;
  if (max <= 4) return 4;
  if (max <= 10) return Math.ceil(max / 2) * 2;
  const step = max <= 40 ? 10 : max <= 100 ? 20 : 50;
  return Math.ceil(max / step) * step;
}

export function CountBars({ labels, values, target, color = 'var(--color-accent-fill, var(--color-accent))', ariaLabel, unitLabel = v => String(v) }: CountBarsProps) {
  const n = values.length;
  const top = niceTop(Math.max(0, target ?? 0, ...values));
  const ticks = [0, top / 2, top];
  const inner = W - PAD.l - PAD.r;
  const slot = n > 0 ? inner / n : inner;
  const barW = Math.max(2, Math.min(46, slot * 0.62));
  const x = (i: number) => PAD.l + slot * i + (slot - barW) / 2;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - Math.min(v, top) / top);
  const every = Math.max(1, Math.ceil(n / 8));
  const showLabel = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2);

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)}
            stroke={t === 0 ? 'var(--border-card)' : 'var(--border-subtle)'} strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
        </g>
      ))}
      {values.map((v, i) => v > 0 && (
        <rect key={i} x={x(i)} y={y(v)} width={barW} height={y(0) - y(v)} rx={Math.min(3, barW / 2)}
          fill={color} opacity={target !== undefined && v < target ? 0.5 : 1}>
          <title>{`${labels[i]}: ${unitLabel(v)}`}</title>
        </rect>
      ))}
      {target !== undefined && target > 0 && (
        <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="var(--text-placeholder)" strokeWidth={1.5} strokeDasharray="5 6" />
      )}
      {labels.map((l, i) => showLabel(i) && (
        <text key={i} x={x(i) + barW / 2} y={H - 6} textAnchor="middle">{l}</text>
      ))}
    </Svg>
  );
}
