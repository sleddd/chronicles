/**
 * Duplicate (the editor's ⋯ More menu): the fields a copy of an entry starts
 * with. Everything you typed stays — the name, notes, your own topic fields
 * (`_userFields`), items — but the copy starts fresh: a task back to To do,
 * a finished goal or milestone without its status, every ticked item
 * unticked (to-dos, priorities, shopping). What ties the original to
 * something else stays behind: its bookmark, its place on the public shelf, calendar-sync link, medication
 * change history and dose / schedule / import links.
 */

/** Keys that belong to the original only */
const LEFT_BEHIND = new Set([
  '_isFavorite', '_sync', '_changes', '_doseLink', '_routineLink', '_importKey',
  // A copy never goes on the public shelf by itself: only the owner's bookmark tap publishes
  'onPublicShelf',
  'isCompleted', 'isInProgress', 'isInReview', 'isBacklog', 'completedAt', 'completedOn',
]);

const untick = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(untick);
  if (value && typeof value === 'object') {
    const o = { ...(value as Record<string, unknown>) };
    if (o.checked === true) o.checked = false;
    if (o.done === true) o.done = false;
    return o;
  }
  return value;
};

export function duplicateEntryFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (LEFT_BEHIND.has(key)) continue;
    // A finished goal / milestone starts over (no status = New / Not started)
    if ((key === 'goalStatus' || key === 'milestoneStatus') && value === 'completed') continue;
    out[key] = Array.isArray(value) ? untick(value) : value;
  }
  return out;
}
