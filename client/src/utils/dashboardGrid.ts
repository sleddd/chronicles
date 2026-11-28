/*
 * The dashboard's zones in thirds: rows, each laid out on its own — one card full width, two cards
 * two thirds / one third, three a third each (a card's column width can also be dragged by its
 * right edge, and a row may leave room empty). Where a dragged card is let go decides it: on a
 * card's left / right side beside it in its row (a row already three across sends its last card
 * to a row under it); on its top / bottom half a row of its own above / below that row; on the
 * strip between two rows, a full-width row there. One card a cell — older stacked columns are
 * unstacked into rows. Pure.
 */
import { topRowSpans, rowsOf } from './dashboardRows.js';

export interface GridCell { w: number; keys: string[] }
export type GridRow = GridCell[];

/** Cards that take the two thirds of a two-column row */
const WIDE = new Set(['wellness']);

/** Widths that fit: a card's own width (a third, two thirds, full) is kept while the row's widths
 *  add up to three or less — a row can leave room empty. Otherwise one cell full, three a third
 *  each, two cells two thirds / one third */
function fixRow(row: GridRow): GridRow {
  const valid = row.every(c => c.w === 1 || c.w === 2 || c.w === 3);
  if (valid && row.reduce((n, c) => n + c.w, 0) <= 3) return row;
  if (row.length === 1) return [{ ...row[0], w: 3 }];
  if (row.length >= 3) return row.map(c => ({ ...c, w: 1 }));
  const [a, b] = row;
  if (a.w + b.w === 3 && (a.w === 1 || a.w === 2)) return row;
  const wideA = a.keys.some(k => WIDE.has(k)) || (!b.keys.some(k => WIDE.has(k)) && a.w >= b.w);
  return [{ ...a, w: wideA ? 2 : 1 }, { ...b, w: wideA ? 1 : 2 }];
}

/** No empty cells or rows, no more than three cells a row, and one card a cell: a column of stacked
 *  cards (from older layouts) is unstacked into rows — its first cards stay in the row at their
 *  widths, the ones under them make rows of their own (shared out again), so every row can be
 *  laid out on its own (a row of two thirds / one third over a row of three, say) */
function tidy(rows: GridRow[]): GridRow[] {
  const out: GridRow[] = [];
  for (const raw of rows) {
    const cells = raw.filter(c => c.keys.length > 0);
    if (!cells.length) continue;
    const depth = Math.max(...cells.map(c => c.keys.length));
    for (let i = 0; i < depth; i++) {
      const level = cells.filter(c => c.keys[i] !== undefined).map(c => ({ w: c.w, keys: [c.keys[i]] }));
      // A fourth cell and on: rows of their own under it
      const kept = level.slice(0, 3);
      out.push(i === 0 ? fixRow(kept) : spread(kept));
      for (const c of level.slice(3)) out.push([{ w: 3, keys: c.keys }]);
    }
  }
  return out;
}

/** Every card in order: row by row, column by column, top to bottom */
export function flattenGrid(rows: GridRow[]): string[] {
  return rows.flatMap(r => r.flatMap(c => c.keys));
}

/**
 * The zone's rows to draw: the saved rows kept to the cards showing there (`keys`, in the zone's
 * order), anything new as a full-width row at the end. With nothing saved, the cards pair up as
 * before (the wellness check-in two thirds beside Shortcuts…).
 */
export function gridFrom(saved: unknown, keys: string[], columns: string[] = []): GridRow[] {
  const want = new Set(keys);
  const seen = new Set<string>();
  const rows: GridRow[] = [];
  if (Array.isArray(saved)) {
    for (const r of saved) {
      if (!Array.isArray(r)) continue;
      const row: GridRow = [];
      for (const c of r) {
        if (!c || typeof c !== 'object' || !Array.isArray((c as GridCell).keys)) continue;
        const cellKeys = (c as GridCell).keys.filter(k => typeof k === 'string' && want.has(k) && !seen.has(k));
        cellKeys.forEach(k => seen.add(k));
        const w = Number((c as GridCell).w);
        row.push({ w: w === 1 || w === 2 || w === 3 ? w : 3, keys: cellKeys });
      }
      rows.push(row);
    }
  } else {
    const lead = keys.filter(k => !columns.includes(k));
    const spans = topRowSpans(lead);
    for (const r of rowsOf(lead, spans)) rows.push(r.map(k => ({ w: spans.get(k) ?? 3, keys: [k] })));
    lead.forEach(k => seen.add(k));
  }
  // The cards of the old two columns (or the default ones) not placed yet: rows of three across
  const loose = columns.filter(k => want.has(k) && !seen.has(k));
  if (loose.length) {
    for (let i = 0; i < loose.length; i += 3) {
      const chunk = loose.slice(i, i + 3);
      chunk.forEach(k => seen.add(k));
      rows.push(spread(chunk.map(k => ({ w: 1, keys: [k] }))));
    }
  }
  for (const k of keys) if (!seen.has(k)) rows.push([{ w: 3, keys: [k] }]);
  return tidy(rows);
}

const PLACEHOLDER = '\u0000new';

/** Widths for a row whose cards changed by dragging: one cell full, three a third each, two cells
 *  two thirds / one third (a card's own width set with its width button is kept until then) */
function spread(row: GridRow): GridRow {
  const keep = row.length === 2 && row[0].w + row[1].w === 3;
  return fixRow(keep ? row : row.map(c => ({ ...c, w: 0 })));
}

function without(rows: GridRow[], key: string): GridRow[] {
  return rows.map(r => {
    const next = r.map(c => ({ ...c, keys: c.keys.filter(k => k !== key) }));
    // A column left empty by the drag: the row's other columns share its room again
    const kept = next.filter(c => c.keys.length > 0);
    return kept.length < r.length && kept.length > 0 ? spread(kept) : next;
  });
}

function swapIn(rows: GridRow[], key: string): GridRow[] {
  return tidy(rows.map(r => r.map(c => ({ ...c, keys: c.keys.map(k => (k === PLACEHOLDER ? key : k)) }))));
}

/** Dropped on the strip before row `index` (rows.length = after the last): a full-width row there */
export function dropOnGap(rows: GridRow[], key: string, index: number): GridRow[] {
  const at = Math.max(0, Math.min(index, rows.length));
  const placed = [...rows.slice(0, at), [{ w: 3, keys: [PLACEHOLDER] }], ...rows.slice(at)];
  return swapIn(without(placed, key), key);
}

/** Dropped on `target`: beside it in its row ('before' / 'after' — left / right), or a row of its own
 *  above / below the target's row ('above' / 'below'; 'rowAbove' / 'rowBelow' the same) */
export function dropOnCard(rows: GridRow[], key: string, target: string, place: 'before' | 'after' | 'above' | 'below' | 'rowAbove' | 'rowBelow'): GridRow[] {
  if (key === target) return rows;
  const placed = rows.map(r => r.map(c => ({ ...c, keys: [...c.keys] })));
  const r = placed.findIndex(row => row.some(c => c.keys.includes(target)));
  if (r < 0) return dropOnGap(rows, key, rows.length);
  if (place === 'rowAbove') place = 'above';
  if (place === 'rowBelow') place = 'below';
  const row = placed[r];
  const c = row.findIndex(cell => cell.keys.includes(target));
  if (place === 'before' || place === 'after') {
    // Beside it, in its row: beside a lone card two thirds / one third, else a third each
    const others = row.filter(x => !(x.keys.length === 1 && x.keys[0] === key));
    if (row.length === 1) row[0].w = WIDE.has(key) ? 1 : 2;
    row.splice(place === 'before' ? c : c + 1, 0, { w: row.length === 1 ? (WIDE.has(key) ? 2 : 1) : 1, keys: [PLACEHOLDER] });
    // A row already three across: its last card (not the one dropped on) moves to a row under it
    if (others.length >= 3) {
      const last = [...row].reverse().find(x => !x.keys.includes(PLACEHOLDER) && !x.keys.includes(target) && !x.keys.includes(key))!;
      row.splice(row.indexOf(last), 1);
      placed.splice(r + 1, 0, [{ w: 3, keys: last.keys }]);
    }
  } else {
    // Above / below it: a row of its own there (drag cards beside it to share the row)
    placed.splice(place === 'above' ? r : r + 1, 0, [{ w: 3, keys: [PLACEHOLDER] }]);
  }
  return swapIn(without(placed, key), key);
}

/** A column's width, from dragging its right edge: 3 = a full-width row of its own (under its row,
 *  its cards each a full row); 1 / 2 = a third / two thirds, the row's other columns narrowing to
 *  fit (and, when they can't, the last moving to a row under it). A row may then leave room empty */
export function setWidth(rows: GridRow[], key: string, w: 1 | 2 | 3): GridRow[] {
  const placed = rows.map(r => r.map(c => ({ ...c, keys: [...c.keys] })));
  const r = placed.findIndex(row => row.some(c => c.keys.includes(key)));
  if (r < 0) return rows;
  const row = placed[r];
  const cell = row.find(c => c.keys.includes(key))!;
  if (w === 3 && row.length > 1) {
    row.splice(row.indexOf(cell), 1);
    placed.splice(r + 1, 0, [{ w: 3, keys: cell.keys }]);
    return tidy(placed);
  }
  cell.w = w;
  const moved: GridRow[] = [];
  const sum = () => row.reduce((n, c) => n + c.w, 0);
  while (sum() > 3) {
    const other = row.filter(c => c !== cell && c.w > 1).sort((a, b) => b.w - a.w)[0];
    if (other) { other.w -= 1; continue; }
    const last = [...row].reverse().find(c => c !== cell)!;
    row.splice(row.indexOf(last), 1);
    moved.unshift([last]);
  }
  placed.splice(r + 1, 0, ...moved);
  return tidy(placed);
}
