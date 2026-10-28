/* Task types: "Regular task" and "Small victory" built in, plus the person's
   own, saved encrypted as the `taskTypes` setting (a list of names). A task
   stores its type's name as `taskType` ('' = no type). Pure helpers. */

export const DEFAULT_TASK_TYPES = ['Regular task', 'Small victory'] as const;

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The types to offer: the built-in ones, then the person's own */
export function taskTypeList(custom: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of [...DEFAULT_TASK_TYPES, ...(Array.isArray(custom) ? custom : [])]) {
    if (typeof t !== 'string') continue;
    const k = key(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim().replace(/\s+/g, ' '));
  }
  return out;
}

export const isDefaultTaskType = (name: string) => DEFAULT_TASK_TYPES.some(d => key(d) === key(name));

/** Save a type of the person's own (a built-in or existing name adds nothing) */
export function addTaskType(custom: string[], label: string): string[] {
  const name = label.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name || isDefaultTaskType(name) || custom.some(c => key(c) === key(name))) return custom;
  return [...custom, name];
}

/** Remove one of the person's own types (built-in ones stay) */
export function removeTaskType(custom: string[], label: string): string[] {
  return custom.filter(c => key(c) !== key(label));
}

/** A task's type as written on it, '' when unset */
export function taskTypeOf(fields: Record<string, unknown> | undefined): string {
  const t = fields?.taskType;
  return typeof t === 'string' ? t.trim() : '';
}

/** Same type, ignoring case and spacing */
export const sameTaskType = (a: string, b: string) => key(a) === key(b);

/** Sort rank for a type: the list's order, unknown types after it, no type last */
export function taskTypeRank(type: string, types: string[]): number {
  if (!key(type)) return types.length + 1;
  const i = types.findIndex(t => key(t) === key(type));
  return i === -1 ? types.length : i;
}
