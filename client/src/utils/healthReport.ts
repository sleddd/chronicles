/* Health → Reports, the daily inventory report. Pure helpers on decrypted
   data, computed in the browser.

   Everything works on days. A day is "logged" when the daily inventory has an
   answer for it or a symptom was logged that day, and only logged days count:
   a symptom's absence on a day nobody wrote anything says nothing.

   - Question rows: each answered inventory question for today, the last 7
     days and the chosen range, plus (when comparing) how mood or a symptom
     differs on days above and below the person's own average.
   - Metric tiles and chart series: mood, sleep, social time, exercise, stress
     and the compared symptom.
   - Day triggers: foods, medications and exercise followed by a symptom (the
     same day, or within one or two days) far more often than other days.
   - Exercise and medication: symptoms, mood and sleep on days with vs without.
   - Symptoms at a glance: a day-by-day grid per symptom, what each usually
     comes with and the groups that tend to land on the same days.

   These are links, not causes — the copy says so wherever it shows. */

import {
  MOOD_WORDS, QUALITY_WORDS, RESTED_WORDS, PROCRASTINATION_WORDS, STRESS_WORDS, HEALTHY_WORDS, INVENTORY_QUESTIONS,
  type InventoryDay, type InventoryKey,
} from './dailyInventory.js';
import type { TriggerEvent, TriggerKind } from './foodSymptoms.js';

/* ── Days ── */

/** "2026-10-01", -2 → "2026-09-29" */
export function addDays(day: string, by: number): string {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + by);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Every day from `from` to `to`, inclusive */
export function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 1000; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Oct 7" */
export function shortDay(day: string): string {
  return new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const half = (x: number) => Math.round(x * 2) / 2;
const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
const plural = (n: number, a: string, b: string) => (n === 1 ? a : b);
/** Keep an acronym ("GERD") as written, lower-case anything else */
export const lc = (s: string) => (s === s.toUpperCase() ? s : s.toLowerCase());

/* ── Severity ── */

export type SeverityBand = 'mild' | 'moderate' | 'severe';
export const severityBand = (n: number): SeverityBand => (n <= 3 ? 'mild' : n <= 6 ? 'moderate' : 'severe');
const bandWord = (b: SeverityBand) => b.charAt(0).toUpperCase() + b.slice(1);

/* ── Scope: everything the report reads ── */

export interface ReportSymptom { name: string; severity: number; occurredAt: string }

/** day → normalised symptom name → its name and the worst severity that day */
export type SymptomDays = Map<string, Map<string, { name: string; severity: number }>>;

export function symptomDays(symptoms: ReportSymptom[]): SymptomDays {
  const out: SymptomDays = new Map();
  for (const s of symptoms) {
    const k = norm(s.name);
    if (!k) continue;
    const day = s.occurredAt.slice(0, 10);
    const m = out.get(day) ?? new Map();
    const cur = m.get(k);
    m.set(k, { name: cur?.name ?? s.name.trim(), severity: Math.max(cur?.severity ?? 0, s.severity || 5) });
    out.set(day, m);
  }
  return out;
}

export interface ReportScope {
  today: string;
  /** The chosen range (inclusive) */
  range: { from: string; to: string };
  /** Inventory days covering the range and the last 7 days */
  inventory: InventoryDay[];
  /** Symptoms covering the range and the last 7 days */
  symptoms: SymptomDays;
}

const invMap = new WeakMap<InventoryDay[], Map<string, InventoryDay>>();
function invByDay(scope: ReportScope): Map<string, InventoryDay> {
  let m = invMap.get(scope.inventory);
  if (!m) { m = new Map(scope.inventory.map(d => [d.date, d])); invMap.set(scope.inventory, m); }
  return m;
}

const answer = (scope: ReportScope, day: string, key: InventoryKey) => invByDay(scope).get(day)?.answers[key];

/** Days in [from, to] with an inventory answer or a symptom */
export function loggedDays(scope: ReportScope, from: string, to: string): string[] {
  const inv = invByDay(scope);
  return dayList(from, to).filter(d => (inv.get(d)?.score ?? null) !== null || (scope.symptoms.get(d)?.size ?? 0) > 0);
}

const hasSymptom = (scope: ReportScope, day: string, key: string) => (scope.symptoms.get(day)?.get(key)?.severity ?? 0) > 0;

/** The symptoms logged in the range, most days first */
export function rankedSymptoms(scope: ReportScope): { key: string; name: string; days: number }[] {
  const counts = new Map<string, { name: string; days: number }>();
  for (const day of dayList(scope.range.from, scope.range.to)) {
    for (const [k, v] of scope.symptoms.get(day) ?? []) {
      const c = counts.get(k) ?? { name: v.name, days: 0 };
      c.days++;
      counts.set(k, c);
    }
  }
  return [...counts].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
}

/* ── What to compare with ── */

/** Mood, or a symptom (by its normalised key) */
export type CompareTarget = { kind: 'mood' } | { kind: 'symptom'; key: string; name: string };

/** The outcome on a logged day: mood 1–5, or the symptom's severity (0 = none) */
function outcome(scope: ReportScope, day: string, t: CompareTarget): number | null {
  if (t.kind === 'mood') {
    const m = answer(scope, day, 'day');
    return typeof m === 'number' ? m : null;
  }
  return scope.symptoms.get(day)?.get(t.key)?.severity ?? 0;
}

interface Group { score: number; text: string }

function group(scope: ReportScope, days: string[], t: CompareTarget): Group | null {
  const vals = days.map(d => outcome(scope, d, t)).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  if (t.kind === 'mood') {
    const a = avg(vals);
    return { score: a, text: MOOD_WORDS[Math.round(a) - 1] };
  }
  const yes = vals.filter(v => v > 0).length;
  return { score: yes / vals.length, text: `${yes} of ${vals.length}` };
}

/* ── Questions ── */

type QuestionKind = 'num' | 'min' | 'yn' | 'eating' | 'scale';

interface QuestionSpec {
  kind: QuestionKind;
  unit?: string;
  words?: string[];
  /** The split's two sides, for the comparison sentence ({c} = the person's average) */
  hi: string;
  lo: string;
}

const MEAL_HEALTH = (meal: string): QuestionSpec => ({ kind: 'scale', words: HEALTHY_WORDS, hi: `days with a healthier ${meal}`, lo: 'other days' });

const SPECS: Partial<Record<InventoryKey, QuestionSpec>> = {
  sleep: { kind: 'num', unit: 'h', hi: 'days with over {c} h of sleep', lo: 'days with {c} h or less' },
  water: { kind: 'num', unit: 'glasses', hi: 'days with over {c} glasses of water', lo: 'days with {c} or fewer' },
  exerciseMinutes: { kind: 'min', hi: 'days you exercised', lo: "days you didn't" },
  breakfast: { kind: 'yn', hi: 'days you ate breakfast', lo: "days you didn't" },
  lunch: { kind: 'yn', hi: 'days you ate lunch', lo: "days you didn't" },
  dinner: { kind: 'yn', hi: 'days you ate dinner', lo: "days you didn't" },
  rested: { kind: 'scale', words: RESTED_WORDS, hi: 'days you woke more rested', lo: 'other days' },
  social: { kind: 'scale', words: QUALITY_WORDS, hi: 'days with better social time', lo: 'other days' },
  day: { kind: 'scale', words: MOOD_WORDS, hi: 'better days', lo: 'harder days' },
  woke: { kind: 'yn', hi: 'days you woke in the night', lo: 'days you slept through' },
  dreamed: { kind: 'yn', hi: 'days you dreamed', lo: "days you didn't" },
  eating: { kind: 'eating', hi: 'days you ate just right', lo: 'days you ate too much or too little' },
  breakfastHealth: MEAL_HEALTH('breakfast'),
  lunchHealth: MEAL_HEALTH('lunch'),
  dinnerHealth: MEAL_HEALTH('dinner'),
  work: { kind: 'scale', words: QUALITY_WORDS, hi: 'better work days', lo: 'other days' },
  procrastination: { kind: 'scale', words: PROCRASTINATION_WORDS, hi: 'days you procrastinated more', lo: 'other days' },
  stress: { kind: 'scale', words: STRESS_WORDS, hi: 'more stressed days', lo: 'calmer days' },
};

/** The design's eight first, then the rest of the inventory */
const ORDER: InventoryKey[] = [
  'sleep', 'water', 'exerciseMinutes', 'breakfast', 'lunch', 'dinner', 'rested', 'social',
  'day', 'woke', 'dreamed', 'eating', 'breakfastHealth', 'lunchHealth', 'dinnerHealth', 'work', 'procrastination', 'stress',
];

const LABELS: Partial<Record<InventoryKey, string>> = {
  rested: 'Rested when you woke',
  social: 'Social time',
  day: 'How good was your day?',
};

const EATING_WORDS: Record<string, string> = { too_little: 'Too little', just_right: 'Just right', too_much: 'Too much' };

function formatOne(spec: QuestionSpec, v: unknown): string {
  if (v === undefined || v === null) return '—';
  switch (spec.kind) {
    case 'num': return `${half(v as number)} ${spec.unit}`;
    case 'min': return (v as number) > 0 ? `${v} min` : 'None';
    case 'yn': return v ? 'Yes' : 'No';
    case 'eating': return EATING_WORDS[v as string] ?? '—';
    case 'scale': return spec.words![Math.round(v as number) - 1] ?? '—';
  }
}

function formatMany(spec: QuestionSpec, vals: unknown[]): string {
  const xs = vals.filter(v => v !== undefined && v !== null);
  if (!xs.length) return '—';
  const n = xs.length;
  switch (spec.kind) {
    case 'num': return `${half(avg(xs as number[]))} ${spec.unit}`;
    case 'min': { const a = Math.round(avg(xs as number[])); return a ? `${a} min a day` : 'None'; }
    case 'yn': return `${xs.filter(Boolean).length} of ${n} ${plural(n, 'day', 'days')}`;
    case 'eating': return `Just right on ${xs.filter(v => v === 'just_right').length} of ${n} ${plural(n, 'day', 'days')}`;
    case 'scale': return spec.words![Math.round(avg(xs as number[])) - 1] ?? '—';
  }
}

export type Comparison = { ready: true; sentence: string } | { ready: false; need: string };

export interface QuestionRow {
  key: InventoryKey;
  label: string;
  today: string;
  week: string;
  period: string;
  /** How the compared outcome differs; null when not comparing (or comparing a question with itself) */
  compare: Comparison | null;
}

const MIN_SIDE = 3;

function compareQuestion(scope: ReportScope, key: InventoryKey, spec: QuestionSpec, days: string[], t: CompareTarget, outcomeName: string): Comparison {
  const answered = days.filter(d => answer(scope, d, key) !== undefined && outcome(scope, d, t) !== null);
  const val = (d: string) => answer(scope, d, key);
  let hi: string[];
  let lo: string[];
  let c = '';
  if (spec.kind === 'yn') { hi = answered.filter(d => val(d) === true); lo = answered.filter(d => val(d) === false); }
  else if (spec.kind === 'min') { hi = answered.filter(d => (val(d) as number) > 0); lo = answered.filter(d => !((val(d) as number) > 0)); }
  else if (spec.kind === 'eating') { hi = answered.filter(d => val(d) === 'just_right'); lo = answered.filter(d => val(d) !== 'just_right'); }
  else {
    const cut = answered.length ? avg(answered.map(d => val(d) as number)) : 0;
    c = String(half(cut));
    hi = answered.filter(d => (val(d) as number) > cut);
    lo = answered.filter(d => (val(d) as number) <= cut);
  }
  const hiText = spec.hi.replace('{c}', c);
  const loText = spec.lo.replace('{c}', c);
  if (hi.length < MIN_SIDE || lo.length < MIN_SIDE) {
    const short = hi.length < MIN_SIDE ? hi : lo;
    const k = MIN_SIDE - short.length;
    const phrase = hi.length < MIN_SIDE ? hiText : loText;
    return { ready: false, need: `Needs ${k} more ${k === 1 ? phrase.replace(/^days/, 'day') : phrase}` };
  }
  const gh = group(scope, hi, t)!;
  const gl = group(scope, lo, t)!;
  if (t.kind === 'symptom') {
    return { ready: true, sentence: `${outcomeName} on ${gh.text} ${hiText}, and ${gl.text} ${loText}.` };
  }
  if (Math.abs(gh.score - gl.score) < 0.5 || gh.text === gl.text) {
    return { ready: true, sentence: `Mood about the same either way (usually ${gl.text.toLowerCase()}).` };
  }
  return { ready: true, sentence: `Mood usually ${gh.text.toLowerCase()} on ${hiText}, ${gl.text.toLowerCase()} on ${loText}.` };
}

/** One row per inventory question answered in the range or the last 7 days */
export function questionRows(scope: ReportScope, target: CompareTarget | null): QuestionRow[] {
  const week = dayList(addDays(scope.today, -6), scope.today);
  const range = dayList(scope.range.from, scope.range.to);
  const logged = loggedDays(scope, scope.range.from, scope.range.to);
  const label = (k: InventoryKey) => LABELS[k] ?? INVENTORY_QUESTIONS.find(q => q.key === k)!.label;
  const out: QuestionRow[] = [];
  for (const key of ORDER) {
    const spec = SPECS[key]!;
    const rangeVals = range.map(d => answer(scope, d, key));
    const weekVals = week.map(d => answer(scope, d, key));
    if (![...rangeVals, ...weekVals].some(v => v !== undefined)) continue;
    const same = target?.kind === 'mood' && key === 'day';
    out.push({
      key, label: label(key),
      today: formatOne(spec, answer(scope, scope.today, key)),
      week: formatMany(spec, weekVals),
      period: formatMany(spec, rangeVals),
      compare: !target || same ? null
        : compareQuestion(scope, key, spec, logged, target, target.kind === 'symptom' ? target.name : 'Mood'),
    });
  }
  return out;
}

/* ── Metric tiles and the chart ── */

export type MetricKey = 'symptom' | 'mood' | 'sleep' | 'social' | 'exercise' | 'stress';

const METRIC_ANSWER: Record<Exclude<MetricKey, 'symptom'>, InventoryKey> = {
  mood: 'day', sleep: 'sleep', social: 'social', exercise: 'exerciseMinutes', stress: 'stress',
};

export interface MetricTile {
  key: MetricKey;
  name: string;
  value: string;
  unit?: string;
  caption: string;
  /** 0..1 for the rule */
  progress: number;
  today: string;
  week: string;
}

/** A metric's value on a day, or null when it wasn't logged */
export function metricValue(scope: ReportScope, key: MetricKey, day: string, symptomKey?: string): number | null {
  if (key === 'symptom') {
    if (!symptomKey) return null;
    const logged = (invByDay(scope).get(day)?.score ?? null) !== null || (scope.symptoms.get(day)?.size ?? 0) > 0;
    return logged ? scope.symptoms.get(day)?.get(symptomKey)?.severity ?? 0 : null;
  }
  const v = answer(scope, day, METRIC_ANSWER[key]);
  return typeof v === 'number' ? v : null;
}

export function metricSeries(scope: ReportScope, key: MetricKey, days: string[], symptomKey?: string): (number | null)[] {
  return days.map(d => metricValue(scope, key, d, symptomKey));
}

/** The tiles across the top: the compared symptom first (when one is), then mood, sleep, social time, exercise, stress */
export function metricTiles(scope: ReportScope, symptom?: { key: string; name: string }): MetricTile[] {
  const range = dayList(scope.range.from, scope.range.to);
  const week = dayList(addDays(scope.today, -6), scope.today);
  const vals = (key: MetricKey, days: string[]) =>
    days.map(d => metricValue(scope, key, d, symptom?.key)).filter((v): v is number => v !== null);
  const mean = (key: MetricKey, days: string[]) => { const xs = vals(key, days); return xs.length ? avg(xs) : null; };
  const word = (words: string[], x: number | null) => (x === null ? '—' : words[Math.round(x) - 1]);
  const today = (key: MetricKey) => metricValue(scope, key, scope.today, symptom?.key);
  const tiles: MetricTile[] = [];

  if (symptom) {
    const logged = loggedDays(scope, scope.range.from, scope.range.to);
    const wkLogged = loggedDays(scope, week[0], scope.today);
    const n = logged.filter(d => hasSymptom(scope, d, symptom.key)).length;
    const t = today('symptom');
    tiles.push({
      key: 'symptom', name: symptom.name, value: String(n), unit: plural(n, 'day', 'days'),
      caption: `of ${logged.length} logged`, progress: logged.length ? n / logged.length : 0,
      today: t === null ? '—' : t > 0 ? bandWord(severityBand(t)) : 'None',
      week: `${wkLogged.filter(d => hasSymptom(scope, d, symptom.key)).length} of ${wkLogged.length}`,
    });
  }

  const mood = mean('mood', range);
  tiles.push({ key: 'mood', name: 'Mood', value: word(MOOD_WORDS, mood), caption: 'usual mood', progress: (mood ?? 0) / 5,
    today: word(MOOD_WORDS, today('mood')), week: word(MOOD_WORDS, mean('mood', week)) });
  const sleep = mean('sleep', range);
  const hours = (x: number | null) => (x === null ? '—' : `${half(x)} h`);
  tiles.push({ key: 'sleep', name: 'Sleep', value: sleep === null ? '—' : one(sleep), unit: sleep === null ? undefined : 'h',
    caption: 'avg per night', progress: (sleep ?? 0) / 8, today: hours(today('sleep')), week: hours(mean('sleep', week)) });
  const social = mean('social', range);
  tiles.push({ key: 'social', name: 'Social time', value: word(QUALITY_WORDS, social), caption: 'usual', progress: (social ?? 0) / 5,
    today: word(QUALITY_WORDS, today('social')), week: word(QUALITY_WORDS, mean('social', week)) });
  const ex = mean('exercise', range);
  const exWeek = mean('exercise', week);
  const exToday = today('exercise');
  tiles.push({ key: 'exercise', name: 'Exercise', value: ex === null ? '—' : String(Math.round(ex)), unit: ex === null ? undefined : 'min',
    caption: 'avg a day', progress: Math.min(1, (ex ?? 0) / 30),
    today: exToday === null ? '—' : `${exToday} min`, week: exWeek === null ? '—' : `${Math.round(exWeek)} min/day` });
  const stress = mean('stress', range);
  tiles.push({ key: 'stress', name: 'Stress', value: word(STRESS_WORDS, stress), caption: 'usual', progress: (stress ?? 0) / 5,
    today: word(STRESS_WORDS, today('stress')), week: word(STRESS_WORDS, mean('stress', week)) });
  return tiles;
}

/* ── Day triggers ── */

export interface DayTrigger {
  kind: TriggerKind;
  trigger: string;
  symptom: string;
  /** Days with the trigger that the symptom followed, out of `times` */
  hits: number;
  times: number;
  /** How often the symptom followed other days, 0..1 */
  otherRate: number;
}

export type TriggerSensitivity = 'cautious' | 'balanced' | 'eager';

const SENS: Record<TriggerSensitivity, { hits: number; rate: number; times: number; gap: number }> = {
  cautious: { hits: 5, rate: 0.8, times: 4, gap: 0.5 },
  balanced: { hits: 4, rate: 0.7, times: 3, gap: 0.4 },
  eager: { hits: 3, rate: 0.55, times: 2, gap: 0.25 },
};

export const MIN_TRIGGER_DAYS = 3;

/** Foods, medications and exercise a symptom followed (the same day up to `windowDays` after) far more often than other days */
export function dayTriggers(events: TriggerEvent[], scope: ReportScope, windowDays: number, sensitivity: TriggerSensitivity = 'balanced'): {
  triggers: DayTrigger[];
  /** Things logged on 1–2 days — too few to tell */
  tooFew: number;
} {
  const logged = loggedDays(scope, scope.range.from, scope.range.to);
  const loggedSet = new Set(logged);
  const s = SENS[sensitivity];
  const info = new Map<string, { name: string; kind: TriggerKind }>();
  const trigDays = new Map<string, Set<string>>();
  for (const e of events) {
    if (!loggedSet.has(e.day)) continue;
    const cur = info.get(e.key);
    if (!cur || (cur.kind === 'food' && e.kind === 'medication')) info.set(e.key, { name: e.name, kind: e.kind });
    const set = trigDays.get(e.key) ?? new Set<string>();
    set.add(e.day);
    trigDays.set(e.key, set);
  }
  const symptoms = rankedSymptoms(scope).filter(x => x.days >= 2);
  const followed = (key: string, day: string) => {
    for (let i = 0; i <= windowDays; i++) if (hasSymptom(scope, addDays(day, i), key)) return true;
    return false;
  };

  const out: (DayTrigger & { lift: number })[] = [];
  let tooFew = 0;
  for (const [key, days] of trigDays) {
    if (days.size < MIN_TRIGGER_DAYS) { tooFew++; continue; }
    const ate = [...days];
    const other = logged.filter(d => !days.has(d));
    if (other.length < MIN_TRIGGER_DAYS) continue; // logged nearly every day: nothing to compare against
    let best: (DayTrigger & { lift: number }) | null = null;
    for (const sym of symptoms) {
      const hits = ate.filter(d => followed(sym.key, d)).length;
      const r = hits / ate.length;
      const orr = other.filter(d => followed(sym.key, d)).length / other.length;
      const enough = hits >= s.hits || (hits >= s.hits - 1 && r === 1 && orr <= 0.15);
      if (!enough || r < s.rate || r < Math.max(s.times * orr, orr + s.gap)) continue;
      const row = { kind: info.get(key)!.kind, trigger: info.get(key)!.name, symptom: sym.name, hits, times: ate.length, otherRate: orr, lift: r - orr };
      if (!best || row.lift > best.lift) best = row;
    }
    if (best) out.push(best);
  }
  out.sort((a, b) => b.lift - a.lift || b.hits - a.hits);
  return { triggers: out.map(({ lift: _lift, ...t }) => t), tooFew };
}

/* ── Exercise ── */

export type Tone = 'better' | 'worse' | 'same';

export interface ExerciseReport {
  sessions: number;
  minutes: number;
  /** Days exercised per week over the range */
  perWeek: number;
  /** 3+ logged days with exercise and 3+ without */
  enough: boolean;
  rows: { name: string; on: string; off: string; tone: Tone }[];
  lessOften: string[];
  moreOften: string[];
}

export function exerciseReport(scope: ReportScope, sessions: { day: string; minutes: number }[]): ExerciseReport {
  const inRange = sessions.filter(x => x.day >= scope.range.from && x.day <= scope.range.to);
  // A logged session counts as exercising that day, even with no minutes typed
  const exDays = new Set(inRange.map(x => x.day));
  const logged = loggedDays(scope, scope.range.from, scope.range.to);
  const on = logged.filter(d => exDays.has(d));
  const off = logged.filter(d => !exDays.has(d));
  const rangeDays = dayList(scope.range.from, scope.range.to).length;
  const report: ExerciseReport = {
    sessions: inRange.length,
    minutes: inRange.reduce((t, x) => t + (x.minutes || 0), 0),
    perWeek: Math.round(exDays.size / Math.max(1, rangeDays / 7) * 10) / 10,
    enough: on.length >= MIN_SIDE && off.length >= MIN_SIDE,
    rows: [], lessOften: [], moreOften: [],
  };
  if (!report.enough) return report;

  const nums = (days: string[], f: (d: string) => unknown) => days.map(f).filter((v): v is number => typeof v === 'number');
  const moodOn = nums(on, d => answer(scope, d, 'day'));
  const moodOff = nums(off, d => answer(scope, d, 'day'));
  if (moodOn.length && moodOff.length) {
    const a = avg(moodOn), b = avg(moodOff);
    report.rows.push({ name: 'Mood', on: MOOD_WORDS[Math.round(a) - 1], off: MOOD_WORDS[Math.round(b) - 1], tone: a - b >= 0.5 ? 'better' : b - a >= 0.5 ? 'worse' : 'same' });
  }
  // The check-in's sleep is the night before, so the night after a day is the next day's answer
  const sleepOn = nums(on, d => answer(scope, addDays(d, 1), 'sleep'));
  const sleepOff = nums(off, d => answer(scope, addDays(d, 1), 'sleep'));
  if (sleepOn.length && sleepOff.length) {
    const a = avg(sleepOn), b = avg(sleepOff);
    report.rows.push({ name: 'Sleep that night', on: `${half(a)} h`, off: `${half(b)} h`, tone: a - b >= 0.5 ? 'better' : b - a >= 0.5 ? 'worse' : 'same' });
  }
  const count = (d: string) => scope.symptoms.get(d)?.size ?? 0;
  const a = avg(on.map(count)), b = avg(off.map(count));
  const sw = (x: number) => `${one(x)} ${plural(Number(one(x)), 'symptom', 'symptoms')}`;
  report.rows.push({ name: 'Symptoms', on: sw(a), off: sw(b), tone: b - a >= 0.5 ? 'better' : a - b >= 0.5 ? 'worse' : 'same' });

  const diffs = rankedSymptoms(scope).map(sym => ({
    name: sym.name,
    d: on.filter(day => hasSymptom(scope, day, sym.key)).length / on.length - off.filter(day => hasSymptom(scope, day, sym.key)).length / off.length,
  })).filter(x => Math.abs(x.d) >= 0.2).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  report.lessOften = diffs.filter(x => x.d < 0).map(x => x.name);
  report.moreOften = diffs.filter(x => x.d > 0).map(x => x.name);
  return report;
}

/* ── Medication ── */

export interface MedRow {
  name: string;
  /** Logged days it was taken, out of `of` */
  taken: number;
  of: number;
  /** Symptoms clearly less / more common on days it was taken (two at most each) */
  lessOften: string[];
  moreOften: string[];
  /** Why there's nothing to compare, when there isn't */
  note: string | null;
}

/* Hypergeometric tail: of N logged days, K had the symptom; taken on n of them, k with it */
function logFact(n: number) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
const logC = (n: number, k: number) => logFact(n) - logFact(k) - logFact(n - k);
const hyp = (N: number, K: number, n: number, k: number) => Math.exp(logC(K, k) + logC(N - K, n - k) - logC(N, n));
function pUpper(N: number, K: number, n: number, k: number) { let s = 0; for (let j = k; j <= Math.min(K, n); j++) s += hyp(N, K, n, j); return s; }
function pLower(N: number, K: number, n: number, k: number) { let s = 0; for (let j = Math.max(0, n - (N - K)); j <= k; j++) s += hyp(N, K, n, j); return s; }

const MED_SIDE = 5;
const MED_P = 0.01;

/** Per medication: symptoms on days it was taken compared with days it wasn't */
export function medicationReport(scope: ReportScope, doses: { name: string; day: string }[]): MedRow[] {
  const logged = loggedDays(scope, scope.range.from, scope.range.to);
  const loggedSet = new Set(logged);
  const byMed = new Map<string, { name: string; days: Set<string> }>();
  for (const d of doses) {
    if (!loggedSet.has(d.day)) continue;
    const k = norm(d.name);
    if (!k) continue;
    const cur = byMed.get(k) ?? { name: d.name.trim(), days: new Set<string>() };
    cur.days.add(d.day);
    byMed.set(k, cur);
  }
  const symptoms = rankedSymptoms(scope);
  const N = logged.length;
  return [...byMed.values()].sort((a, b) => b.days.size - a.days.size || a.name.localeCompare(b.name)).map(m => {
    const on = logged.filter(d => m.days.has(d));
    const row: MedRow = { name: m.name, taken: on.length, of: N, lessOften: [], moreOften: [], note: null };
    if (on.length < MED_SIDE) { row.note = 'Too few days to tell yet'; return row; }
    if (N - on.length < MED_SIDE) { row.note = 'Taken almost every day, so there is nothing to compare against'; return row; }
    const found = symptoms.flatMap(sym => {
      const K = logged.filter(d => hasSymptom(scope, d, sym.key)).length;
      if (K < 4) return [];
      const k = on.filter(d => hasSymptom(scope, d, sym.key)).length;
      const up = pUpper(N, K, on.length, k);
      const down = pLower(N, K, on.length, k);
      if (up < MED_P) return [{ name: sym.name, more: true, p: up }];
      if (down < MED_P) return [{ name: sym.name, more: false, p: down }];
      return [];
    }).sort((a, b) => a.p - b.p);
    row.moreOften = found.filter(x => x.more).slice(0, 2).map(x => x.name);
    row.lessOften = found.filter(x => !x.more).slice(0, 2).map(x => x.name);
    if (!row.moreOften.length && !row.lessOften.length) row.note = 'No clear difference in symptoms';
    return row;
  });
}

/* ── Symptoms at a glance ── */

export type GlanceCell = SeverityBand | 'none' | 'unlogged';

export interface GlanceRow {
  name: string;
  days: number;
  /** Mild / Moderate / Severe from the average of its days */
  usual: string;
  /** The symptom that most often shares its days, beyond chance */
  often: string | null;
  cells: GlanceCell[];
}

export interface SymptomGlance {
  rows: GlanceRow[];
  /** A square per day, or per week over long ranges */
  unit: 'day' | 'week';
  first: string;
  last: string;
  /** Groups of two or three that tend to land on the same days */
  clusters: { names: string; days: string }[];
}

const LIFT = 0.25;
const MIN_TOGETHER = 3;

export function symptomGlance(scope: ReportScope): SymptomGlance {
  const days = dayList(scope.range.from, scope.range.to);
  const logged = loggedDays(scope, scope.range.from, scope.range.to);
  const loggedSet = new Set(logged);
  const ranked = rankedSymptoms(scope);
  const unit = days.length > 62 ? 'week' : 'day';
  const chunks: string[][] = [];
  for (let i = 0; i < days.length; i += unit === 'week' ? 7 : 1) chunks.push(days.slice(i, i + (unit === 'week' ? 7 : 1)));
  const on = (key: string) => logged.filter(d => hasSymptom(scope, d, key));
  const rate = (key: string) => on(key).length / Math.max(1, logged.length);
  const counts = new Map(ranked.map(r => [r.key, r.days]));

  const partner = (a: string) => {
    const base = on(a);
    let best: { name: string; lift: number } | null = null;
    for (const b of ranked) {
      if (b.key === a || b.days < MIN_TOGETHER) continue;
      const t = base.filter(d => hasSymptom(scope, d, b.key)).length;
      const lift = t / Math.max(1, base.length) - rate(b.key);
      if (t >= MIN_TOGETHER && lift >= LIFT && (!best || lift > best.lift)) best = { name: b.name, lift };
    }
    return best?.name ?? null;
  };

  const rows: GlanceRow[] = ranked.map(r => {
    const sevs = on(r.key).map(d => scope.symptoms.get(d)!.get(r.key)!.severity);
    return {
      name: r.name, days: r.days,
      usual: sevs.length ? bandWord(severityBand(Math.round(avg(sevs)))) : '—',
      often: r.days >= MIN_TOGETHER ? partner(r.key) : null,
      cells: chunks.map(chunk => {
        if (!chunk.some(d => loggedSet.has(d))) return 'unlogged';
        const worst = Math.max(0, ...chunk.map(d => scope.symptoms.get(d)?.get(r.key)?.severity ?? 0));
        return worst > 0 ? severityBand(worst) : 'none';
      }),
    };
  });

  // Pairs that share days beyond chance, then grown into groups of three where every pair holds
  const pool = ranked.filter(r => r.days >= MIN_TOGETHER);
  const pairs: { a: string; b: string; lift: number; t: number }[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const [rare, other] = pool[i].days <= pool[j].days ? [pool[i], pool[j]] : [pool[j], pool[i]];
      const base = on(rare.key);
      const t = base.filter(d => hasSymptom(scope, d, other.key)).length;
      const lift = t / Math.max(1, base.length) - rate(other.key);
      if (t >= MIN_TOGETHER && lift >= LIFT) pairs.push({ a: rare.key, b: other.key, lift, t });
    }
  }
  const pk = (x: string, y: string) => [x, y].sort().join('|');
  const pset = new Set(pairs.map(p => pk(p.a, p.b)));
  const name = new Map(ranked.map(r => [r.key, r.name]));
  const used = new Set<string>();
  const clusters: SymptomGlance['clusters'] = [];
  for (const p of [...pairs].sort((x, y) => y.lift - x.lift || y.t - x.t)) {
    if (clusters.length >= 5 || used.has(p.a) || used.has(p.b)) continue;
    const g = [p.a, p.b];
    const third = pool.map(r => r.key)
      .filter(c => !g.includes(c) && !used.has(c) && g.every(m => pset.has(pk(m, c))))
      .sort((x, y) => (counts.get(y) ?? 0) - (counts.get(x) ?? 0))[0];
    if (third && logged.filter(d => [...g, third].every(k => hasSymptom(scope, d, k))).length >= MIN_TOGETHER) g.push(third);
    g.forEach(k => used.add(k));
    const base = on(g[0]).length;
    const together = logged.filter(d => g.every(k => hasSymptom(scope, d, k))).length;
    const names = g.map(k => name.get(k)!);
    clusters.push({
      names: names.length === 2 ? `${names[0]} and ${lc(names[1])}` : `${names[0]}, ${lc(names[1])} and ${lc(names[2])}`,
      days: `${together} of ${base} ${lc(names[0])} days`,
    });
  }
  return { rows, unit, first: days[0] ?? '', last: days[days.length - 1] ?? '', clusters };
}
