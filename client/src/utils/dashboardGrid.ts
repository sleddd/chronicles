/*
 * The dashboard's zones in thirds (under the Quick entry, Your Agenda's top row): rows of up to
 * three columns ("cells"), each a stack of cards. A row of one cell is full width; two cells share
 * it two thirds / one third; three cells a third each. Where a dragged card is let go decides it:
 * on a card's left / right side a new column beside it (or into that column once the row has
 * three); on its top / bottom half above / below it in its column — or, for a full-width card, a
 * full-width row of its own above / below; on the strip between two rows, a full-width row there.
 * Pure.
 */
import { topRowSpans, rowsOf } from './dashboardRows.js';

export interface GridCell { w: number; keys: string[] }
export type GridRow = GridCell[];

/** Cards that take the two thirds of a two-column row */
const WIDE = new Set(['wellness']);

/** Widths that add up: one cell full, three a third each, two cells two thirds / one third */
function fixRow(row: GridRow): GridRow {
  if (row.length === 1) return [{ ...row[0], w: 3 }];
  if (row.length >= 3) return row.map(c => ({ ...c, w: 1 }));
  const [a, b] = row;
  if (a.w + b.w === 3 && (a.w === 1 || a.w === 2)) return row;
  const wideA = a.keys.some(k => WIDE.has(k)) || (!b.keys.some(k => WIDE.has(k)) && a.w >= b.w);
  return [{ ...a, w: wideA ? 2 : 1 }, { ...b, w: wideA ? 1 : 2 }];
}

/** No empty cells or rows, no more than three cells a row, a lone full-width cell holds one card */
function tidy(rows: GridRow[]): GridRow[] {
  const out: GridRow[] = [];
  for (const raw of rows) {
    const row = raw.filter(c => c.keys.length > 0);
    if (!row.length) continue;
    // A fourth cell and on: rows of their own under it
    const extra = row.slice(3);
    const kept = row.slice(0, 3);
    if (kept.length === 1 && kept[0].keys.length > 1) out.push(...kept[0].keys.map(k => [{ w: 3, keys: [k] }]));
    else out.push(fixRow(kept));
    for (const c of extra) out.push(...c.keys.map(k => [{ w: 3, keys: [k] }]));
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
export function gridFrom(saved: unknown, keys: string[]): GridRow[] {
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
    const spans = topRowSpans(keys);
    for (const r of rowsOf(keys, spans)) rows.push(r.map(k => ({ w: spans.get(k) ?? 3, keys: [k] })));
    keys.forEach(k => seen.add(k));
  }
  for (const k of keys) if (!seen.has(k)) rows.push([{ w: 3, keys: [k] }]);
  return tidy(rows);
}

const PLACEHOLDER = '\u0000new';

function without(rows: GridRow[], key: string): GridRow[] {
  return rows.map(r => r.map(c => ({ ...c, keys: c.keys.filter(k => k !== key) })));
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

/** Dropped on `target`: beside it ('before' / 'after' — left / right) or above / below it */
export function dropOnCard(rows: GridRow[], key: string, target: string, place: 'before' | 'after' | 'above' | 'below'): GridRow[] {
  if (key === target) return rows;
  const placed = rows.map(r => r.map(c => ({ ...c, keys: [...c.keys] })));
  const r = placed.findIndex(row => row.some(c => c.keys.includes(target)));
  if (r < 0) return dropOnGap(rows, key, rows.length);
  const row = placed[r];
  const c = row.findIndex(cell => cell.keys.includes(target));
  const cell = row[c];
  const i = cell.keys.indexOf(target);
  const besideRoom = row.filter(x => !(x.keys.length === 1 && x.keys[0] === key)).length < 3;
  if ((place === 'before' || place === 'after') && besideRoom) {
    // A new column beside the target's: the target's column keeps its share, the new one takes the rest
    const fresh: GridCell = { w: WIDE.has(key) ? 2 : 1, keys: [PLACEHOLDER] };
    if (row.length === 1) cell.w = WIDE.has(key) ? 1 : 2;
    row.splice(place === 'before' ? c : c + 1, 0, fresh);
  } else if (place === 'before' || place === 'after' || cell.w < 3 || cell.keys.length > 1) {
    // Into the target's column, above or below it (a full row of three columns stacks too)
    cell.keys.splice(place === 'before' || place === 'above' ? i : i + 1, 0, PLACEHOLDER);
  } else {
    // A full-width card: a full-width row of its own above / below its row
    placed.splice(place === 'above' ? r : r + 1, 0, [{ w: 3, keys: [PLACEHOLDER] }]);
  }
  return swapIn(without(placed, key), key);
}
