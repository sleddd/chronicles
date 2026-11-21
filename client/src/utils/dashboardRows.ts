/*
 * The dashboard's top row (inside Your Agenda, across both widget columns):
 * the cards in it sit two to a row where they fit together, like the Health
 * dashboard's rows. The wellness check-in is wide — two thirds beside a
 * narrower card, else the full width; Shortcuts is a third beside the
 * wellness check-in, two thirds beside a narrow card (the daily quote), else
 * the full width; every other card takes the full width. On phones every card
 * is full width (the page's own rule). Pure.
 */

type Size = 'wide' | 'flex' | 'narrow';
const SIZES: Record<string, Size> = { wellness: 'wide', shortcuts: 'flex', quote: 'narrow' };

/** Which two sizes share a row, and the thirds each takes (first, second) */
function pair(a: Size, b: Size): [number, number] | null {
  if (a === 'wide' && (b === 'flex' || b === 'narrow')) return [2, 1];
  if (b === 'wide' && (a === 'flex' || a === 'narrow')) return [1, 2];
  if (a === 'flex' && b === 'narrow') return [2, 1];
  if (a === 'narrow' && b === 'flex') return [1, 2];
  return null;
}

/** Each card's width in thirds (1, 2 or 3), pairing cards next to each other in order */
export function topRowSpans(keys: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < keys.length; i++) {
    const a = SIZES[keys[i]];
    const b = i + 1 < keys.length ? SIZES[keys[i + 1]] : undefined;
    const fit = a && b ? pair(a, b) : null;
    if (fit) {
      out.set(keys[i], fit[0]);
      out.set(keys[i + 1], fit[1]);
      i++;
    } else out.set(keys[i], 3);
  }
  return out;
}

/** The rows the cards fall into, in order, at these widths (a row holds up to three thirds) */
export function rowsOf(keys: string[], spans: Map<string, number>): string[][] {
  const rows: string[][] = [];
  let room = 0;
  for (const k of keys) {
    const w = spans.get(k) ?? 3;
    if (w > room) { rows.push([k]); room = 3 - w; } else { rows[rows.length - 1].push(k); room -= w; }
  }
  return rows;
}
