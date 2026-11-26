/*
 * An entry's "Hide from AI" switch lives in its encrypted metadata. Many save
 * paths build an entry's metadata afresh, and one that forgot the switch would
 * quietly share a hidden entry with AI again. So the switch is only ever
 * turned off on purpose:
 *
 *   `_aiHidden: true`   hidden
 *   `_aiHidden: false`  shared again, said out loud (the key is then left out)
 *   no key at all       whatever the entry already was
 *
 * Applied wherever an existing entry's metadata is replaced: the entries
 * store's update and the encrypt step of every save.
 */
export const AI_HIDDEN_META = '_aiHidden';

type Meta = Record<string, unknown>;

export function withAiHiddenKept<T extends Meta>(existing: Meta | null | undefined, next: T): T {
  if (Object.prototype.hasOwnProperty.call(next, AI_HIDDEN_META)) {
    if (next[AI_HIDDEN_META] === true) return next;
    const { [AI_HIDDEN_META]: _shared, ...rest } = next;
    return rest as T;
  }
  return existing?.[AI_HIDDEN_META] === true ? { ...next, [AI_HIDDEN_META]: true } : next;
}

/**
 * What an editor's save says about the switch: hidden while it is ticked, and
 * shared again only when it was unticked in that editor. Otherwise nothing, so
 * the entry keeps what it has — an editor left open since before the entry was
 * hidden on another device must not share it again just by saving.
 */
export function stampAiHidden(metadata: Meta, hidden: boolean, untickedHere: boolean): void {
  if (hidden) metadata[AI_HIDDEN_META] = true;
  else if (untickedHere) metadata[AI_HIDDEN_META] = false;
}
