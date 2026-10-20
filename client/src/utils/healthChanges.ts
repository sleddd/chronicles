/* "Changed something on this date" — the event log beside the daily stream.

   Medications record their own changes: every save compares the medication
   with how it was and adds what changed (started, stopped, dose, how often,
   reminder times) to `_changes` in its fields, encrypted with the entry. The
   journal autosaves while you type, so changes of one kind on one day merge
   into one (the first "from", the latest "to"), and a change undone the same
   day disappears. Anything else ("Cut out dairy") is an entry in the Changes
   topic. Reports and Med history line these up against the data. Pure. */

export type MedChangeKind = 'started' | 'stopped' | 'dose' | 'frequency' | 'times';

export interface MedChange {
  /** YYYY-MM-DD */
  date: string;
  kind: MedChangeKind;
  from?: string;
  to?: string;
}

/** One change on the timeline, from a medication or the Changes topic */
export interface HealthChange {
  date: string;
  /** "Aspirin dose 325 mg → 650 mg", "Started Magnesium", "Cut out dairy" */
  text: string;
  source: 'medication' | 'other';
  /** The entry it lives on */
  entryId: number;
}

const FREQUENCY_LABEL: Record<string, string> = {
  once_daily: 'Once daily', twice_daily: 'Twice daily', three_times_daily: 'Three times daily',
  as_needed: 'As needed', weekly: 'Weekly', custom: 'Custom',
};

const freqLabel = (v: unknown) => FREQUENCY_LABEL[String(v ?? '')] ?? String(v ?? '');
const clean = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
const times = (v: unknown) => (Array.isArray(v) ? [...v].map(String).sort().join(', ') : '');
const active = (f: Record<string, unknown> | null | undefined) => !!f && f.isActive !== false;

export function isMedChange(c: unknown): c is MedChange {
  return !!c && typeof c === 'object' && typeof (c as MedChange).date === 'string' && typeof (c as MedChange).kind === 'string';
}

/** The changes saved on a medication's fields */
export function medChangesOf(fields: Record<string, unknown> | null | undefined): MedChange[] {
  const raw = fields?._changes;
  return Array.isArray(raw) ? raw.filter(isMedChange) : [];
}

/* Add a change of `kind` today, merging with one of the same kind already made
   today (keeping its "from"); drop it when it ends where it started. */
function merge(list: MedChange[], change: MedChange): MedChange[] {
  const i = list.findIndex(c => c.date === change.date && c.kind === change.kind);
  if (i < 0) return [...list, change];
  const merged = { ...list[i], to: change.to };
  const out = [...list];
  if ((merged.from ?? '') === (merged.to ?? '')) out.splice(i, 1);
  else out[i] = merged;
  return out;
}

/* Started and stopped on the same day cancel out */
function toggle(list: MedChange[], kind: 'started' | 'stopped', date: string, to?: string): MedChange[] {
  const opposite = kind === 'started' ? 'stopped' : 'started';
  const i = list.findIndex(c => c.date === date && c.kind === opposite);
  if (i >= 0) return list.filter((_, j) => j !== i);
  if (list.some(c => c.date === date && c.kind === kind)) return list;
  return [...list, { date, kind, ...(to ? { to } : {}) }];
}

/**
 * The medication's fields with what changed since `before` (null = a new
 * medication) added to `_changes`. The base list is the one in `after` (the
 * editor's copy, which is where a wrongly recorded change gets removed).
 */
export function withMedicationChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  today: string,
): Record<string, unknown> {
  let list = '_changes' in after || !before ? medChangesOf(after) : medChangesOf(before);
  if (!before) {
    if (active(after) && !list.some(c => c.kind === 'started')) list = toggle(list, 'started', today, clean(after.dosage) || undefined);
  } else {
    if (active(before) !== active(after)) list = toggle(list, active(after) ? 'started' : 'stopped', today);
    if (clean(before.dosage) !== clean(after.dosage)) list = merge(list, { date: today, kind: 'dose', from: clean(before.dosage), to: clean(after.dosage) });
    if (clean(before.frequency) !== clean(after.frequency)) list = merge(list, { date: today, kind: 'frequency', from: freqLabel(before.frequency), to: freqLabel(after.frequency) });
    if (times(before.scheduleTimes) !== times(after.scheduleTimes)) list = merge(list, { date: today, kind: 'times', from: times(before.scheduleTimes), to: times(after.scheduleTimes) });
  }
  if (!list.length && !('_changes' in after)) return after;
  return { ...after, _changes: list };
}

/** "Dose 325 mg → 650 mg", "Started", "How often Once daily → Twice daily" */
export function describeMedChange(c: MedChange): string {
  const arrow = (from?: string, to?: string) => `${from || 'none'} → ${to || 'none'}`;
  switch (c.kind) {
    case 'started': return c.to ? `Started · ${c.to}` : 'Started';
    case 'stopped': return 'Stopped';
    case 'dose': return `Dose ${arrow(c.from, c.to)}`;
    case 'frequency': return `How often ${arrow(c.from, c.to)}`;
    case 'times': return `Reminders ${arrow(c.from, c.to)}`;
    default: return 'Changed';
  }
}

interface EntryLike { id: number; content: string; metadata?: unknown; createdAt: Date | string }

/**
 * Every change between `from` and `to` (inclusive, YYYY-MM-DD): medication
 * changes (named after the medication) and Changes-topic entries (their date
 * field, else the day they were written). Newest first.
 */
export function collectHealthChanges(
  entries: EntryLike[],
  topics: { id: number; name: string }[],
  range: { from: string; to: string },
  plainText: (html: string) => string,
): HealthChange[] {
  const idOf = (...names: string[]) => topics.find(t => names.includes(t.name.toLowerCase()))?.id;
  const medId = idOf('medication');
  const changesId = idOf('changes', 'change');
  const out: HealthChange[] = [];
  const inRange = (d: string) => d >= range.from && d <= range.to;
  for (const e of entries) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const cf = (meta._customFields as Record<string, unknown>) ?? {};
    if (medId != null && meta._taxonomyId === medId) {
      const name = clean(cf.medicationName) || plainText(e.content).trim() || 'Medication';
      for (const c of medChangesOf(cf)) {
        if (!inRange(c.date)) continue;
        const text = c.kind === 'started' ? `Started ${name}${c.to ? ` · ${c.to}` : ''}`
          : c.kind === 'stopped' ? `Stopped ${name}` : `${name} ${describeMedChange(c).replace(/^./, ch => ch.toLowerCase())}`;
        out.push({ date: c.date, text, source: 'medication', entryId: e.id });
      }
    } else if (changesId != null && meta._taxonomyId === changesId) {
      const created = e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt);
      const date = clean(cf.changeDate) || localDay(created);
      const text = clean(cf.changeWhat) || plainText(e.content).trim();
      if (text && inRange(date)) out.push({ date, text, source: 'other', entryId: e.id });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.text.localeCompare(b.text));
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
