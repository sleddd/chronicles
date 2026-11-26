/**
 * What an account's storage held the last time it was counted, kept for a few
 * minutes so most saves don't count it again.
 *
 * Every capped save used to add up the whole table it writes to (every entry's
 * size on each 3-second autosave, every setting's text on each habit tick).
 * The caps are there to stop an account filling the database, not to bill by
 * the byte, so a save far below its cap doesn't need the exact figure.
 *
 * How it stays safe:
 *  - a figure is only ever an upper bound of what THIS process knows: each
 *    save made on the strength of it adds its whole size (a replaced record's
 *    old size is never taken off);
 *  - it is trusted only while figure + the new write stays under HALF the cap.
 *    Past that the save counts for real, in the same statement as the write;
 *  - it is dropped after USAGE_TTL_MS, and whenever this process makes a
 *    multi-row write for the account (`withTenantLock`).
 *
 * Another instance (or a path that never told us) can add up to a full cap
 * between counts, so the most an account can hold is 1.5 × its cap, for at
 * most the few minutes a figure lives. Nothing past the cap is ever written by
 * a save that counted.
 */
export type UsageKind = 'posts' | 'settings' | 'doses' | 'finance';

export interface Usage { bytes: number; rows: number }

const USAGE_TTL_MS = 5 * 60 * 1000;
const MAX_FIGURES = 20_000;

const figures = new Map<string, Usage & { at: number }>();
const keyOf = (schema: string, kind: UsageKind) => `${kind}:${schema}`;

/** The figure for an account's table, when there is a fresh one. */
export function knownUsage(schema: string, kind: UsageKind): Usage | null {
  const key = keyOf(schema, kind);
  const f = figures.get(key);
  if (!f) return null;
  if (Date.now() - f.at > USAGE_TTL_MS) { figures.delete(key); return null; }
  return f;
}

/**
 * True when a write of `bytes` (and `rows` new rows) is certain to fit: a
 * fresh figure exists and figure + write stays under half of each cap.
 */
export function fitsWithoutCounting(
  schema: string, kind: UsageKind, write: { bytes: number; rows?: number }, caps: { maxBytes: number; maxRows?: number },
): boolean {
  const f = knownUsage(schema, kind);
  if (!f) return false;
  if (f.bytes + write.bytes > caps.maxBytes / 2) return false;
  if (caps.maxRows !== undefined && f.rows + (write.rows ?? 0) > caps.maxRows / 2) return false;
  return true;
}

/** A save made without counting: its whole size goes on the figure (which keeps its age). */
export function addUsage(schema: string, kind: UsageKind, write: { bytes: number; rows?: number }): void {
  const f = figures.get(keyOf(schema, kind));
  if (!f) return;
  f.bytes += write.bytes;
  f.rows += write.rows ?? 0;
}

/** A real count, just made: what the table holds now (the write included). */
export function setUsage(schema: string, kind: UsageKind, usage: Usage): void {
  if (!Number.isFinite(usage.bytes) || !Number.isFinite(usage.rows)) return;
  if (figures.size >= MAX_FIGURES) figures.clear();
  figures.set(keyOf(schema, kind), { bytes: usage.bytes, rows: usage.rows, at: Date.now() });
}

/** Forget an account's figures (one kind, or all): the next save counts. */
export function forgetUsage(schema: string, kind?: UsageKind): void {
  if (kind) { figures.delete(keyOf(schema, kind)); return; }
  for (const k of ['posts', 'settings', 'doses', 'finance'] as const) figures.delete(keyOf(schema, k));
}

/** Forget everything (tests). */
export function forgetAllUsage(): void {
  figures.clear();
}
