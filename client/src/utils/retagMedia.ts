import { mediaTags } from './media.js';

/* Renaming or removing a media tag on every item that has it — all or nothing.
   Each save is tried a few times (a busy server answers 429 for a moment); if one still
   fails, the items already changed get their old tags back, so the shelf is never left
   half renamed. Pure apart from the save / wait it's handed, so it's testable. */

export interface RetagEntry {
  id: number;
  metadata?: unknown;
}

export interface RetagDeps<E extends RetagEntry> {
  /** Every entry now (read afresh for each save, so a save never writes a stale copy) */
  entries: () => E[];
  /** Ids of the media topics: only their entries are touched */
  mediaTopicIds: number[];
  /** The open entry, changed in its form instead */
  skipId?: number | null;
  /** Save an entry's custom fields; true once saved */
  save: (entry: E, fields: Record<string, unknown>) => Promise<boolean>;
  /** Wait between tries (ms) */
  wait?: (ms: number) => Promise<void>;
}

export type RetagResult = 'done' | 'rolled-back' | 'partial';

const RETRY_DELAYS = [800, 2500];
const fieldsOf = (e: RetagEntry) => ((e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown> | undefined);
const topicOf = (e: RetagEntry) => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId as number | undefined;

/** The tags after the change, or null when the entry doesn't carry that tag */
export function retaggedTags(tags: string[], from: string, to: string | null): string[] | null {
  const key = from.trim().toLowerCase();
  if (!tags.some(t => t.toLowerCase() === key)) return null;
  return to === null ? tags.filter(t => t.toLowerCase() !== key) : mediaTags(tags.map(t => (t.toLowerCase() === key ? to : t)));
}

export async function retagMedia<E extends RetagEntry>(from: string, to: string | null, deps: RetagDeps<E>): Promise<RetagResult> {
  const wait = deps.wait ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  const media = new Set(deps.mediaTopicIds);
  const current = (id: number) => deps.entries().find(e => e.id === id);

  // Set an entry's tags, trying again after a pause when the save fails
  const setTags = async (id: number, tags: string[]): Promise<boolean> => {
    for (let attempt = 0; ; attempt++) {
      const e = current(id);
      if (!e) return true;  // deleted meanwhile: nothing to change
      if (await deps.save(e, { ...(fieldsOf(e) ?? {}), tags })) return true;
      if (attempt >= RETRY_DELAYS.length) return false;
      await wait(RETRY_DELAYS[attempt]);
    }
  };

  // The plan, worked out before anything is saved
  const plan: { id: number; before: string[]; after: string[] }[] = [];
  for (const e of deps.entries()) {
    if (e.id === deps.skipId) continue;
    const topic = topicOf(e);
    if (topic === undefined || !media.has(topic)) continue;
    const before = mediaTags(fieldsOf(e)?.tags);
    const after = retaggedTags(before, from, to);
    if (after) plan.push({ id: e.id, before, after });
  }

  const done: typeof plan = [];
  for (const step of plan) {
    if (await setTags(step.id, step.after)) { done.push(step); continue; }
    // Put back what was changed, newest first
    let restored = true;
    for (const d of [...done].reverse()) if (!(await setTags(d.id, d.before))) restored = false;
    return restored ? 'rolled-back' : 'partial';
  }
  return 'done';
}
