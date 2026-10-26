import styled from 'styled-components';

/* Macro distribution: a legend (dot + name) top-left over a ring split by each
   macro's share, with "45%" labels on short leader lines outside it — the
   mockup's look. Shares are by calories (protein and carbs 4 kcal/g, fat 9).
   Props only. */

export interface MacroSlice { key: string; label: string; grams: number; kcal: number; color: string }

const Wrap = styled.div`
  position: relative;
  min-width: 0;
`;

const Legend = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  li { display: flex; align-items: center; gap: 8px; }
  i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  small { font-size: 13px; color: var(--text-muted); }
`;

const Svg = styled.svg`
  display: block;
  width: 100%;
  max-width: 360px;
  height: auto;
  margin: 0 auto;
  overflow: visible;
  text { font-family: var(--font-sans); font-size: 13px; fill: var(--text-secondary); }
`;

const W = 300;
const H = 220;
const CX = W / 2;
const CY = H / 2 + 6;
const R = 72;
const RING = 22;

const point = (angle: number, r: number) => [CX + r * Math.cos(angle), CY + r * Math.sin(angle)] as const;

export function MacroDonut({ slices }: { slices: MacroSlice[] }) {
  const total = slices.reduce((t, s) => t + s.kcal, 0);
  const circumference = 2 * Math.PI * R;
  let start = -Math.PI / 2; // 12 o'clock, clockwise
  const arcs = slices.filter(s => s.kcal > 0).map(s => {
    const share = s.kcal / total;
    const a0 = start;
    start += share * 2 * Math.PI;
    return { ...s, share, a0, a1: start };
  });
  let offset = 0;

  return (
    <Wrap>
      <Legend aria-label="Macros">
        {slices.map(s => (
          <li key={s.key}><i style={{ background: s.color }} />{s.label}<small>{Math.round(s.grams)} g</small></li>
        ))}
      </Legend>
      <Svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={arcs.map(a => `${a.label} ${Math.round(a.share * 100)}%`).join(', ')}>
        {arcs.map(a => {
          const len = a.share * circumference;
          const dash = `${len} ${circumference - len}`;
          const el = (
            <circle key={a.key} cx={CX} cy={CY} r={R} fill="none" stroke={a.color} strokeWidth={RING}
              strokeDasharray={dash} strokeDashoffset={-offset} transform={`rotate(-90 ${CX} ${CY})`} />
          );
          offset += len;
          return el;
        })}
        {arcs.map(a => {
          // A leader line from the ring's middle out, then a short level run to the label
          const mid = (a.a0 + a.a1) / 2;
          const right = Math.cos(mid) >= 0;
          const [x1, y1] = point(mid, R);
          const [x2, y2] = point(mid, R + RING / 2 + 16);
          const x3 = x2 + (right ? 22 : -22);
          return (
            <g key={`l-${a.key}`}>
              <polyline points={`${x1},${y1} ${x2},${y2} ${x3},${y2}`} fill="none" stroke="var(--text-secondary)" strokeWidth={1} />
              <text x={x3 + (right ? 6 : -6)} y={y2 + 4} textAnchor={right ? 'start' : 'end'}>{Math.round(a.share * 100)}%</text>
            </g>
          );
        })}
      </Svg>
    </Wrap>
  );
}
