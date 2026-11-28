/*
 * What a task is waiting on ("Blocked by"). Kept in the task's encrypted
 * fields as `blockers`: each one is either another task (`taskId`) or a short
 * note of its own (`note`), never both, with a random id like a priority's.
 * At most BLOCKERS_PER_TASK. A task blocker is cleared once that task is done
 * or no longer exists; a note is cleared only by taking it off. Pure.
 */

export const BLOCKERS_PER_TASK = 10;
export const BLOCKER_NOTE_MAX = 200;

export interface TaskBlocker {
  id: string;
  /** Another task entry's id */
  taskId?: number;
  /** Something else it's waiting on, in a line */
  note?: string;
}

/** What a blocker needs to know about the other tasks: whether each is there, and whether it's done */
export interface BlockerTask {
  id: number;
  title: string;
  isCompleted: boolean;
}

export type BlockerTasks = ReadonlyMap<number, Pick<BlockerTask, 'isCompleted'> & Partial<Pick<BlockerTask, 'title'>>>;

type Fields = Record<string, unknown> | undefined;

/** A note as typed, made tidy: one line, single spaces, no control characters, at most 200 characters */
export function cleanBlockerNote(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BLOCKER_NOTE_MAX);
}

const sameNote = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isTaskId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** One blocker as stored, or null when it isn't well formed (the fields are user data) */
function cleanBlocker(raw: unknown): TaskBlocker | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id.trim().slice(0, 64) : '';
  if (!id) return null;
  const hasTask = b.taskId !== undefined && b.taskId !== null;
  const hasNote = b.note !== undefined && b.note !== null;
  // Exactly one of the two
  if (hasTask === hasNote) return null;
  if (hasTask) return isTaskId(b.taskId) ? { id, taskId: b.taskId } : null;
  const note = typeof b.note === 'string' ? cleanBlockerNote(b.note) : '';
  return note ? { id, note } : null;
}

/** The blockers in a task's fields: well-formed ones only, each task or note once, at most ten */
export function blockersOf(fields: Fields): TaskBlocker[] {
  const raw = fields?.blockers;
  if (!Array.isArray(raw)) return [];
  const out: TaskBlocker[] = [];
  for (const item of raw) {
    const b = cleanBlocker(item);
    if (!b) continue;
    const dup = out.some(x => x.id === b.id
      || (b.taskId !== undefined && x.taskId === b.taskId)
      || (b.note !== undefined && x.note !== undefined && sameNote(x.note, b.note)));
    if (!dup) out.push(b);
    if (out.length >= BLOCKERS_PER_TASK) break;
  }
  return out;
}

/**
 * `blockers` with one more at the end: another task, or a note. Nothing
 * changes when it's blank, the task itself (`selfId`), already there, or the
 * list is full.
 */
export function withBlocker(
  blockers: TaskBlocker[], add: { taskId: number } | { note: string },
  options: { id?: string; selfId?: number | null } = {},
): TaskBlocker[] {
  if (blockers.length >= BLOCKERS_PER_TASK) return blockers;
  const id = options.id ?? crypto.randomUUID();
  if ('taskId' in add) {
    if (!isTaskId(add.taskId) || add.taskId === options.selfId || blockers.some(b => b.taskId === add.taskId)) return blockers;
    return [...blockers, { id, taskId: add.taskId }];
  }
  const note = cleanBlockerNote(add.note);
  if (!note || blockers.some(b => b.note !== undefined && sameNote(b.note, note))) return blockers;
  return [...blockers, { id, note }];
}

export const withoutBlocker = (blockers: TaskBlocker[], id: string): TaskBlocker[] => blockers.filter(b => b.id !== id);

/** A task blocker is cleared once that task is done or gone; a note only by taking it off */
export function isBlockerCleared(blocker: TaskBlocker, tasks: BlockerTasks): boolean {
  if (blocker.taskId === undefined) return false;
  const task = tasks.get(blocker.taskId);
  return !task || task.isCompleted;
}

/** The blockers still in the way */
export const openBlockers = (fields: Fields, tasks: BlockerTasks): TaskBlocker[] =>
  blockersOf(fields).filter(b => !isBlockerCleared(b, tasks));

/** What a blocker says: the other task's title, or the note */
export function blockerLabel(blocker: TaskBlocker, tasks: BlockerTasks): string {
  if (blocker.note !== undefined) return blocker.note;
  const title = blocker.taskId !== undefined ? tasks.get(blocker.taskId)?.title?.trim() : '';
  return title || 'A deleted task';
}

/** "Blocked by Call the plumber" (+N for the rest still open), or undefined when nothing is in the way */
export function blockedByText(fields: Fields, tasks: BlockerTasks): string | undefined {
  const open = openBlockers(fields, tasks);
  if (open.length === 0) return undefined;
  const first = blockerLabel(open[0], tasks);
  return `Blocked by ${first}${open.length > 1 ? ` +${open.length - 1}` : ''}`;
}
