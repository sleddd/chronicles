/* Mantras: a Mantra topic whose entries are the mantras themselves (the entry
   text). The dashboard's Mantra card shows one a day, in turn. Pure helpers. */

export const MANTRA_TOPIC = 'Mantra';
export const MANTRA_ICON = 'spa';

export const isMantraTopic = (name: string | undefined) =>
  !!name && ['mantra', 'mantras'].includes(name.trim().toLowerCase());

/** Today's place in a list of `count` mantras: each day the next one, in turn */
export function dailyMantraIndex(count: number, now = new Date()): number {
  if (count <= 0) return 0;
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  return day % count;
}

/** Step `by` from index `i` round a list of `count` (wraps both ways) */
export const stepIndex = (i: number, by: number, count: number) => (count ? ((i + by) % count + count) % count : 0);
