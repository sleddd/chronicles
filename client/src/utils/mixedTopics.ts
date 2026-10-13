/**
 * True when the given topic ids span more than one topic. Lists use it to show
 * each row's topic label only when it tells rows apart — a single-topic list
 * (e.g. all Exercise) shows just the date.
 */
export function hasMixedTopics(topicIds: Iterable<unknown>): boolean {
  const seen = new Set<unknown>();
  for (const id of topicIds) {
    seen.add(id);
    if (seen.size > 1) return true;
  }
  return false;
}

/** The `_taxonomyId` of each entry, for `hasMixedTopics`. */
export function entryTopicIds(entries: { metadata?: unknown }[]): unknown[] {
  return entries.map(e => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId);
}
