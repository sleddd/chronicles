/* The Health dashboard's widget layout: rows of one or two widgets, rearranged by
   dragging. Wide widgets (the wellness check-in, medications, the exercise
   schedule) fill a row on their own; beside a one-column widget they take two
   thirds of it. Two one-column widgets share a row half and half. Pure. */

export type HealthWidget = 'wellness' | 'quickLog' | 'symptom' | 'meds' | 'habits' | 'change' | 'exercise';

export const HEALTH_WIDGETS: readonly HealthWidget[] = ['wellness', 'quickLog', 'symptom', 'meds', 'habits', 'change', 'exercise'];

/** Widgets that are full width on a row of their own (two thirds beside a one-column one) */
export const WIDE_WIDGETS: ReadonlySet<HealthWidget> = new Set<HealthWidget>(['wellness', 'meds', 'exercise']);

export const DEFAULT_HEALTH_LAYOUT: HealthWidget[][] = [
  ['wellness'],
  ['quickLog', 'symptom'],
  ['meds'],
  ['habits', 'change'],
  ['exercise'],
];

/** At most this many widgets share a row */
export const MAX_PER_ROW = 2;

const isWidget = (v: unknown): v is HealthWidget => typeof v === 'string' && (HEALTH_WIDGETS as readonly string[]).includes(v);

/**
 * A saved layout made safe to draw: only known widgets that are showing, each
 * once, no empty rows, no row over MAX_PER_ROW (the extra moves to a row of its
 * own under it), and any showing widget the saved layout doesn't have goes in
 * at its default row (as a row of its own).
 */
export function normalizeLayout(saved: unknown, shown: readonly HealthWidget[]): HealthWidget[][] {
  const show = new Set(shown);
  const seen = new Set<HealthWidget>();
  const rows: HealthWidget[][] = [];
  const source = Array.isArray(saved) && saved.length ? saved : DEFAULT_HEALTH_LAYOUT;
  for (const r of source) {
    if (!Array.isArray(r)) continue;
    const row: HealthWidget[] = [];
    for (const k of r) {
      if (!isWidget(k) || !show.has(k) || seen.has(k)) continue;
      seen.add(k);
      row.push(k);
    }
    for (let i = 0; i < row.length; i += MAX_PER_ROW) rows.push(row.slice(i, i + MAX_PER_ROW));
  }
  // Showing but not placed (new, or switched back on): its default row's place, on a row of its own
  for (const k of shown) {
    if (seen.has(k)) continue;
    seen.add(k);
    const at = DEFAULT_HEALTH_LAYOUT.findIndex(r => r.includes(k));
    rows.splice(Math.min(Math.max(at, 0), rows.length), 0, [k]);
  }
  return rows;
}

/** The row's grid columns: one widget fills it; two share it by weight (wide = 2, one-column = 1) */
export function rowColumns(row: readonly HealthWidget[]): string {
  if (row.length <= 1) return 'minmax(0, 1fr)';
  return row.map(k => `minmax(0, ${WIDE_WIDGETS.has(k) ? 2 : 1}fr)`).join(' ');
}

const without = (layout: HealthWidget[][], key: HealthWidget) => layout.map(r => r.filter(k => k !== key));

/** `key` on a row of its own, in the gap before row `gap` of `layout` (rows.length = at the end) */
export function moveToRow(layout: HealthWidget[][], key: HealthWidget, gap: number): HealthWidget[][] {
  const rows = without(layout, key);
  rows.splice(Math.max(0, Math.min(gap, rows.length)), 0, [key]);
  return rows.filter(r => r.length);
}

/**
 * `key` beside `target` in target's row (before or after it). A row that would
 * go over MAX_PER_ROW keeps `key` and `target`; the other widget moves to a row
 * of its own just under it.
 */
export function moveBeside(layout: HealthWidget[][], key: HealthWidget, target: HealthWidget, side: 'before' | 'after'): HealthWidget[][] {
  if (key === target) return layout;
  const rows = without(layout, key);
  const r = rows.findIndex(row => row.includes(target));
  if (r < 0) return layout;
  const row = [...rows[r]];
  row.splice(row.indexOf(target) + (side === 'after' ? 1 : 0), 0, key);
  const keep = row.filter(k => k === key || k === target);
  const spill = row.filter(k => k !== key && k !== target);
  rows.splice(r, 1, keep, ...spill.map(k => [k]));
  return rows.filter(x => x.length);
}
