/* What comes before symptoms — Health → Reports. Pure helpers on decrypted
   data, computed in the browser.

   A trigger is anything logged before a symptom: a food (a meal's name and
   each of its ingredients), a medication or supplement (a ticked dose, or a
   Meals row logged as medication / supplement) or a kind of exercise. For each
   symptom we count how many of its occurrences had the trigger in the window
   before it ("before 4 of 5 times"). Everyday things are never hidden — each
   row also says how often the trigger usually happens, so a pill taken daily
   reads differently from a food eaten now and then. */

import type { DecryptedExercise, DecryptedFood, DecryptedMedicationLog, DecryptedSymptom } from './correlationAnalysis.js';

export const TRIGGER_WINDOWS = [
  { value: '4', label: 'Within 4 hours' },
  { value: '24', label: 'Within a day' },
  { value: '48', label: 'Within 2 days' },
] as const;
export type TriggerWindow = typeof TRIGGER_WINDOWS[number]['value'];

export type TriggerKind = 'food' | 'medication' | 'exercise';

export const TRIGGER_KIND_LABEL: Record<TriggerKind, string> = { food: 'Food', medication: 'Medication', exercise: 'Exercise' };

export interface TriggerEvent { key: string; name: string; kind: TriggerKind; at: number; day: string }

export interface SymptomTrigger {
  trigger: string;
  kind: TriggerKind;
  symptom: string;
  /** Occurrences of the symptom the trigger came before */
  before: number;
  /** Occurrences of the symptom */
  of: number;
  /** before / of */
  share: number;
  /** Share of logged days the trigger happened on */
  usual: number;
  /** Average hours from the trigger to the symptom */
  avgHours: number;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const time = (iso: string) => new Date(iso).getTime();
const dayOf = (iso: string) => iso.slice(0, 10);

/** Everything that could come before a symptom, as dated events */
export function triggerEvents(foods: DecryptedFood[], medLogs: DecryptedMedicationLog[], exercises: DecryptedExercise[]): TriggerEvent[] {
  const out: TriggerEvent[] = [];
  const push = (raw: string, kind: TriggerKind, iso: string, seen?: Set<string>) => {
    const name = clean(raw ?? '');
    const k = norm(name);
    if (!k || k.length > 80 || seen?.has(k)) return;
    seen?.add(k);
    // Foods and medications share a name space ("Iron" eaten or taken is one thing)
    out.push({ key: `${kind === 'exercise' ? 'x' : 'f'}:${k}`, name, kind, at: time(iso), day: dayOf(iso) });
  };
  for (const f of foods) {
    const isMed = f.mealType === 'medication' || f.mealType === 'supplement';
    const seen = new Set<string>();
    push(f.name, isMed ? 'medication' : 'food', f.consumedAt, seen);
    if (!isMed) for (const ing of f.ingredients) push(ing, 'food', f.consumedAt, seen);
  }
  for (const m of medLogs) push(m.medicationName, 'medication', m.takenAt);
  for (const e of exercises) push(cap(e.exerciseType || ''), 'exercise', e.performedAt);
  return out;
}

/** For each symptom (or just one), what came before it and how often */
export function symptomTriggers(
  symptoms: DecryptedSymptom[],
  events: TriggerEvent[],
  windowHours: number,
  { symptom, minTimes = 2, minShare = 0.25 }: { symptom?: string; minTimes?: number; minShare?: number } = {},
): SymptomTrigger[] {
  if (!symptoms.length || !events.length) return [];
  const windowMs = windowHours * 3600000;

  // How often each trigger usually happens: its days out of all logged days
  const days = new Set<string>();
  for (const s of symptoms) days.add(dayOf(s.occurredAt));
  const trigDays = new Map<string, Set<string>>();
  const info = new Map<string, { name: string; kind: TriggerKind }>();
  for (const e of events) {
    days.add(e.day);
    if (!info.has(e.key) || (info.get(e.key)!.kind === 'food' && e.kind === 'medication')) info.set(e.key, { name: e.name, kind: e.kind });
    const set = trigDays.get(e.key) ?? new Set<string>();
    set.add(e.day);
    trigDays.set(e.key, set);
  }

  const bySymptom = new Map<string, { name: string; times: number[] }>();
  for (const s of symptoms) {
    const k = norm(s.name);
    if (!k || (symptom && k !== norm(symptom))) continue;
    const cur = bySymptom.get(k) ?? { name: clean(s.name), times: [] };
    cur.times.push(time(s.occurredAt));
    bySymptom.set(k, cur);
  }

  const sorted = [...events].sort((a, b) => a.at - b.at);
  const rows: SymptomTrigger[] = [];
  for (const { name: symptomName, times } of bySymptom.values()) {
    const counts = new Map<string, { n: number; gaps: number[] }>();
    for (const st of times) {
      const nearest = new Map<string, number>();
      for (const e of sorted) {
        const d = st - e.at;
        if (d <= 0 || d > windowMs) continue;
        if (!nearest.has(e.key) || d < nearest.get(e.key)!) nearest.set(e.key, d);
      }
      for (const [k, d] of nearest) {
        const c = counts.get(k) ?? { n: 0, gaps: [] };
        c.n++;
        c.gaps.push(d / 3600000);
        counts.set(k, c);
      }
    }
    for (const [k, { n, gaps }] of counts) {
      const share = n / times.length;
      if (n < minTimes || share < minShare) continue;
      rows.push({
        trigger: info.get(k)!.name, kind: info.get(k)!.kind, symptom: symptomName, before: n, of: times.length, share,
        usual: (trigDays.get(k)?.size ?? 0) / Math.max(1, days.size),
        avgHours: gaps.reduce((a, b) => a + b, 0) / gaps.length,
      });
    }
  }
  // What stands out most from its usual comes first
  return rows.sort((a, b) => (b.share - b.usual) - (a.share - a.usual) || b.share - a.share || b.before - a.before);
}

/** A trigger came before the symptom clearly more often than it usually happens */
export const standsOut = (t: SymptomTrigger) => t.share - t.usual >= 0.25;

/** "~3 h before", "~40 min before", "~2 days before" */
export function beforeLabel(hours: number): string {
  if (hours < 1) return `~${Math.max(5, Math.round(hours * 12) * 5)} min before`;
  if (hours < 36) return `~${Math.round(hours)} h before`;
  return `~${Math.round(hours / 24)} days before`;
}

/* ── Reviews: the owner confirms a trigger or marks it not a trigger ──
   Saved encrypted as the `symptomTriggerReviews` setting. Confirmed ones stay
   pinned at the top (even in a period they weren't seen), dismissed ones leave
   the list until restored. */

export type TriggerVerdict = 'confirmed' | 'dismissed';

export interface TriggerReview {
  verdict: TriggerVerdict;
  /** When it was marked (YYYY-MM-DD) */
  at: string;
  kind: TriggerKind;
  trigger: string;
  symptom: string;
}

export type TriggerReviews = Record<string, TriggerReview>;

type TriggerRef = Pick<SymptomTrigger, 'kind' | 'trigger' | 'symptom'>;

export const triggerKey = (t: TriggerRef) => `${t.kind}|${norm(t.trigger)}|${norm(t.symptom)}`;

/** Mark a trigger (null clears the mark) */
export function setTriggerReview(reviews: TriggerReviews, t: TriggerRef, verdict: TriggerVerdict | null, today: string): TriggerReviews {
  const next = { ...reviews };
  const k = triggerKey(t);
  if (verdict) next[k] = { verdict, at: today, kind: t.kind, trigger: t.trigger, symptom: t.symptom };
  else delete next[k];
  return next;
}

export interface ReviewedTriggers {
  /** Confirmed: this period's rows, then ones not seen in it (row null) */
  confirmed: { review: TriggerReview; row: SymptomTrigger | null }[];
  /** Not reviewed yet */
  open: SymptomTrigger[];
  /** Marked not a trigger */
  dismissed: { review: TriggerReview; row: SymptomTrigger | null }[];
}

/** Split this period's rows by the owner's reviews */
export function applyTriggerReviews(rows: SymptomTrigger[], reviews: TriggerReviews | null | undefined): ReviewedTriggers {
  const r = reviews ?? {};
  const byKey = new Map(rows.map(row => [triggerKey(row), row]));
  const out: ReviewedTriggers = { confirmed: [], open: [], dismissed: [] };
  for (const row of rows) {
    const review = r[triggerKey(row)];
    if (!review) out.open.push(row);
    else (review.verdict === 'confirmed' ? out.confirmed : out.dismissed).push({ review, row });
  }
  for (const [k, review] of Object.entries(r)) {
    if (byKey.has(k) || !review || typeof review !== 'object') continue;
    if (review.verdict === 'confirmed') out.confirmed.push({ review, row: null });
    else if (review.verdict === 'dismissed') out.dismissed.push({ review, row: null });
  }
  return out;
}
