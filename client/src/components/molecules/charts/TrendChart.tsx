import styled from 'styled-components';

/* Quiet line chart (the reports style): faint gridlines, tertiary-grey tick labels,
   the main series in its colour with a soft area wash and dots (the last one larger),
   and any comparison series as pale "ghost" lines behind it. Pure SVG; null values
   break the line. Every colour is a CSS value, so both themes work. */

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
}

const W = 640;
const H = 240;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

const Svg = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  text {
    font-family: var(--font-label);
    font-size: 10px;
    letter-spacing: 0.06em;
    fill: var(--text-tertiary);
  }
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 10px;
  font-family: var(--font-label);
  font-size: 12px;
  color: var(--text-secondary);
  i { display: inline-block; width: 14px; height: 2px; vertical-align: middle; margin-right: 6px; }
`;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find(s => s * mag >= v) ?? 10;
  return step * mag;
}

export function TrendChart({ labels, series, yMax, yTicks, formatTick = v => String(v), ariaLabel }: TrendChartProps) {
  const n = labels.length;
  const all = series.flatMap(s => s.values).filter((v): v is number => v !== null);
  const top = yMax ?? niceMax(Math.max(0, ...all));
  const ticks = yTicks ?? [0, 0.25, 0.5, 0.75, 1].map(f => +(top * f).toFixed(2));
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
    <div>
      <Svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 3} textAnchor="end">{formatTick(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => showLabel(i) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{l}</text>
        ))}
        {ghosts.map((s, gi) => (
          <path key={s.label} d={path(s.values)} fill="none" stroke="var(--border-strong)"
            strokeWidth={1.25} opacity={gi === 0 ? 1 : 0.6} />
        ))}
        {main && (
          <>
            {lastIdx > 0 && (() => {
              /* Area wash under the first unbroken run up to the last point */
              const firstIdx = main.values.findIndex(v => v !== null);
              const run = main.values.slice(firstIdx, lastIdx + 1);
              if (run.some(v => v === null)) return null;
              const d = `${path(main.values.map((v, i) => (i < firstIdx || i > lastIdx ? null : v)))} L${x(lastIdx)} ${y(0)} L${x(firstIdx)} ${y(0)} Z`;
              return <path d={d} fill={mainColor} fillOpacity={0.1} stroke="none" />;
            })()}
            <path d={path(main.values)} fill="none" stroke={mainColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {main.values.map((v, i) => v !== null && (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === lastIdx ? 4 : n > 31 ? 0 : 2.5} fill={mainColor} />
            ))}
          </>
        )}
      </Svg>
      {series.length > 1 && (
        <Legend>
          {main && <span><i style={{ background: mainColor }} />{main.label}</span>}
          {ghosts.map((s, gi) => (
            <span key={s.label}><i style={{ background: 'var(--border-strong)', opacity: gi === 0 ? 1 : 0.6 }} />{s.label}</span>
          ))}
        </Legend>
      )}
    </div>
  );
}
