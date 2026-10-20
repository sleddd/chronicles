import styled from 'styled-components';

/* Quiet line chart (the reports style): faint gridlines over a firmer baseline,
   muted sentence-case tick labels, the main series in its colour with dots (the
   last one larger), and any comparison series as dashed grey "ghost" lines behind
   it. The legend is drawn by the caller (`ChartLegend`) in its card's title row.
   Optional markers draw a dotted vertical line + a small diamond where something
   changed, labelled on hover. Pure SVG; null values break the line. Every
   colour is a CSS value. */

export interface TrendSeries {
  label: string;
  values: (number | null)[];
  /** Line colour for the main series (CSS value). Ghosts ignore it. */
  color?: string;
  /** A comparison line drawn pale behind the main one */
  ghost?: boolean;
}

interface TrendChartProps {
  /** One label per point; only some are printed when there are many */
  labels: string[];
  series: TrendSeries[];
  /** Top of the y axis; defaults to the largest value rounded up */
  yMax?: number;
  /** Tick values; defaults to 4 even steps */
  yTicks?: number[];
  formatTick?: (v: number) => string;
  ariaLabel: string;
  /** Dotted vertical lines at points where something changed (label shows on hover) */
  markers?: { index: number; label: string }[];
}

const W = 900;
const H = 230;
const PAD = { l: 44, r: 8, t: 10, b: 36 };

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

/* "— Daily  - - 7-day average": sits at the right of a chart card's title row */
const LegendRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  span { display: inline-flex; align-items: center; gap: 8px; }
`;

const Swatch = styled.i<{ $color: string; $dashed?: boolean }>`
  display: inline-block;
  width: 14px;
  height: 0;
  border-top: 2px ${({ $dashed }) => ($dashed ? 'dashed' : 'solid')} ${({ $color }) => $color};
`;

export function ChartLegend({ series }: { series: TrendSeries[] }) {
  const main = series.find(s => !s.ghost);
  return (
    <LegendRow>
      {main && <span><Swatch $color={main.color ?? 'var(--color-accent)'} />{main.label}</span>}
      {series.filter(s => s.ghost).map(s => <span key={s.label}><Swatch $color="var(--text-placeholder)" $dashed />{s.label}</span>)}
    </LegendRow>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find(s => s * mag >= v) ?? 10;
  return step * mag;
}

export function TrendChart({ labels, series, yMax, yTicks, formatTick = v => String(v), ariaLabel, markers = [] }: TrendChartProps) {
  const n = labels.length;
  const all = series.flatMap(s => s.values).filter((v): v is number => v !== null);
  const top = yMax ?? niceMax(Math.max(0, ...all));
  const ticks = yTicks ?? [0, 0.5, 1].map(f => +(top * f).toFixed(2));
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - Math.min(v, top) / top);

  /* Path through the points, starting a new segment after each gap. */
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  /* Print at most ~8 x labels, always including the last. */
  const every = Math.max(1, Math.ceil(n / 8));
  const showLabel = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2);

  const ghosts = series.filter(s => s.ghost);
  const main = series.find(s => !s.ghost);
  const mainColor = main?.color ?? 'var(--color-accent)';
  const lastIdx = main ? main.values.reduce<number>((last, v, i) => (v === null ? last : i), -1) : -1;

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)}
            stroke={t === 0 ? 'var(--border-card)' : 'var(--border-subtle)'} strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end">{formatTick(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => showLabel(i) && (
        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{l}</text>
      ))}
      {markers.filter(m => m.index >= 0 && m.index < n).map((m, i) => (
        <g key={`m${i}`} data-marker>
          <title>{m.label}</title>
          <line x1={x(m.index)} x2={x(m.index)} y1={PAD.t} y2={y(0)} stroke="var(--text-muted)" strokeWidth={1.25} strokeDasharray="2 4" />
          <path d={`M${x(m.index)} ${PAD.t - 6} l5 5 l-5 5 l-5 -5 z`} fill="var(--text-muted)" />
          {/* a wide invisible strip so the hover label is easy to reach */}
          <rect x={x(m.index) - 8} y={PAD.t - 6} width={16} height={y(0) - PAD.t + 6} fill="transparent" />
        </g>
      ))}
      {ghosts.map((s, gi) => (
        <path key={s.label} d={path(s.values)} fill="none" stroke="var(--text-placeholder)"
          strokeWidth={1.5} strokeDasharray="5 6" opacity={gi === 0 ? 1 : 0.6} />
      ))}
      {main && (
        <>
          <path d={path(main.values)} fill="none" stroke={mainColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {main.values.map((v, i) => v !== null && (
            <circle key={i} cx={x(i)} cy={y(v)} r={i === lastIdx ? 5.5 : n > 31 ? 0 : 4.5} fill={mainColor} />
          ))}
        </>
      )}
    </Svg>
  );
}
