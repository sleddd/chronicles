/* The daily inventory (Lifehacker's Daily Personal Inventory) scored from
   what's already logged: the wellness check-in (good day = mood, rested =
   sleep quality, hours slept, water, and "Your day" — woke in the night, ate
   too much / too little, work day, social time, procrastination), the Meals
   log (breakfast / lunch / dinner eaten and how healthy) and Exercise.

   Each answer becomes a score out of 100 the way the sheet's score row does —
   1–5 ratings × 20, hours slept ÷ 8, glasses ÷ 8, yes = 100 — except that
   waking in the night and procrastinating are turned round (less is better)
   and sleep, water and minutes stop at 100. A day's score is the average of
   the questions it answers. Only what's answered counts: a meal question
   needs a meal logged that day, a 0 on the check-in means not answered.
   Pure. */

export type InventoryKey =
  | 'day' | 'rested' | 'sleep' | 'woke' | 'breakfast' | 'breakfastHealth' | 'lunch' | 'lunchHealth'
  | 'dinner' | 'dinnerHealth' | 'eating' | 'water' | 'exercised' | 'exerciseMinutes' | 'work' | 'social' | 'procrastination';

export const INVENTORY_QUESTIONS: { key: InventoryKey; label: string }[] = [
  { key: 'day', label: 'How good was your day?' },
  { key: 'rested', label: 'How rested did you feel when you woke up?' },
  { key: 'sleep', label: 'How many hours did you sleep?' },
  { key: 'woke', label: 'Did you wake up during the night?' },
  { key: 'breakfast', label: 'Did you eat breakfast?' },
  { key: 'breakfastHealth', label: 'How healthy was your breakfast?' },
  { key: 'lunch', label: 'Did you eat lunch?' },
  { key: 'lunchHealth', label: 'How healthy was your lunch?' },
  { key: 'dinner', label: 'Did you eat dinner?' },
  { key: 'dinnerHealth', label: 'How healthy was your dinner?' },
  { key: 'eating', label: 'Did you eat too much or too little?' },
  { key: 'water', label: 'How many glasses of water did you drink?' },
  { key: 'exercised', label: 'Did you exercise?' },
  { key: 'exerciseMinutes', label: 'For how many minutes did you exercise?' },
  { key: 'work', label: 'How was your work day?' },
  { key: 'social', label: 'How were your social interactions?' },
  { key: 'procrastination', label: 'How much did you procrastinate?' },
];

export const SLEEP_TARGET = 8;
export const WATER_TARGET = 8;
export const EXERCISE_TARGET = 30;

export interface InventoryWellness {
  date: string;
  moodScore?: number;
  sleepQuality?: number;
  sleepHours?: number;
  waterGlasses?: number;
  wokeAtNight?: boolean | null;
  eating?: string;
  workDay?: number;
  social?: number;
  procrastination?: number;
}

export interface InventoryMeal { day: string; mealType: string; healthiness?: number }
export interface InventoryExercise { day: string; minutes: number }

/** One day's answers (raw) and scores (0–100) */
export interface InventoryDay {
  date: string;
  answers: Partial<Record<InventoryKey, number | boolean | string>>;
  scores: Partial<Record<InventoryKey, number>>;
  /** The average of the scores, or null when nothing was answered */
  score: number | null;
}

const rating = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 5 ? v : null);
const capped = (v: number, target: number) => Math.min(100, Math.round(v / target * 100));

/** The days in [from, to] with anything answered, oldest first */
export function inventoryDays(
  wellness: InventoryWellness[], meals: InventoryMeal[], exercise: InventoryExercise[],
  range: { from: string; to: string },
): InventoryDay[] {
  const inRange = (d: string) => d >= range.from && d <= range.to;
  const days = new Map<string, InventoryDay>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) { d = { date, answers: {}, scores: {}, score: null }; days.set(date, d); }
    return d;
  };
  const answer = (d: InventoryDay, key: InventoryKey, raw: number | boolean | string, score: number) => {
    d.answers[key] = raw;
    d.scores[key] = score;
  };

  for (const w of wellness) {
    if (!inRange(w.date)) continue;
    const d = day(w.date);
    const mood = rating(w.moodScore);
    if (mood) answer(d, 'day', mood, mood * 20);
    const rested = rating(w.sleepQuality);
    if (rested) answer(d, 'rested', rested, rested * 20);
    if (w.sleepHours && w.sleepHours > 0) answer(d, 'sleep', w.sleepHours, capped(w.sleepHours, SLEEP_TARGET));
    if (w.waterGlasses && w.waterGlasses > 0) answer(d, 'water', w.waterGlasses, capped(w.waterGlasses, WATER_TARGET));
    if (typeof w.wokeAtNight === 'boolean') answer(d, 'woke', w.wokeAtNight, w.wokeAtNight ? 0 : 100);
    if (w.eating === 'too_little' || w.eating === 'just_right' || w.eating === 'too_much') {
      answer(d, 'eating', w.eating, w.eating === 'just_right' ? 100 : 0);
    }
    const work = rating(w.workDay);
    if (work) answer(d, 'work', work, work * 20);
    const social = rating(w.social);
    if (social) answer(d, 'social', social, social * 20);
    const pro = rating(w.procrastination);
    if (pro) answer(d, 'procrastination', pro, (6 - pro) * 20);
  }

  // Meals: eaten or not, on days with a meal logged; how healthy, when rated
  const mealDays = new Map<string, InventoryMeal[]>();
  for (const m of meals) {
    if (!inRange(m.day) || m.mealType === 'supplement' || m.mealType === 'medication') continue;
    mealDays.set(m.day, [...(mealDays.get(m.day) ?? []), m]);
  }
  for (const [date, list] of mealDays) {
    const d = day(date);
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      const these = list.filter(m => m.mealType === meal);
      answer(d, meal, these.length > 0, these.length > 0 ? 100 : 0);
      const rated = these.map(m => rating(m.healthiness)).filter((v): v is number => v !== null);
      if (rated.length) {
        const avg = rated.reduce((a, b) => a + b, 0) / rated.length;
        answer(d, `${meal}Health`, avg, Math.round(avg * 20));
      }
    }
  }

  // Exercise: minutes that day — "no" counts on days that answered anything else
  const minutes = new Map<string, number>();
  for (const x of exercise) if (inRange(x.day)) minutes.set(x.day, (minutes.get(x.day) ?? 0) + (x.minutes || 0));
  for (const date of new Set([...days.keys(), ...minutes.keys()])) {
    const m = minutes.get(date) ?? 0;
    const d = day(date);
    answer(d, 'exercised', m > 0, m > 0 ? 100 : 0);
    answer(d, 'exerciseMinutes', m, capped(m, EXERCISE_TARGET));
  }

  const out = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of out) {
    const scores = Object.values(d.scores);
    d.score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }
  return out;
}

export interface QuestionSummary {
  key: InventoryKey;
  label: string;
  /** Days that answered it */
  answered: number;
  /** Average score, 0–100 */
  score: number;
  /** The usual answer: "3.4 / 5", "6.8 h", "Yes on 3 of 7 days" */
  answer: string;
}

const avg = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
const one = (n: number) => (Math.round(n * 10) / 10).toString();

/** Per question: how often it was answered, its average score and usual answer */
export function summarizeInventory(days: InventoryDay[]): QuestionSummary[] {
  const out: QuestionSummary[] = [];
  for (const q of INVENTORY_QUESTIONS) {
    const answered = days.filter(d => d.scores[q.key] !== undefined);
    if (!answered.length) continue;
    const raw = answered.map(d => d.answers[q.key]);
    const n = answered.length;
    const yes = raw.filter(v => v === true).length;
    let answer: string;
    switch (q.key) {
      case 'sleep': answer = `${one(avg(raw as number[]))} h`; break;
      case 'water': answer = `${one(avg(raw as number[]))} glasses`; break;
      case 'exerciseMinutes': answer = `${Math.round(avg(raw as number[]))} min a day`; break;
      case 'woke': case 'breakfast': case 'lunch': case 'dinner': case 'exercised':
        answer = `Yes on ${yes} of ${n} day${n === 1 ? '' : 's'}`; break;
      case 'eating': {
        const right = raw.filter(v => v === 'just_right').length;
        answer = `Just right on ${right} of ${n} day${n === 1 ? '' : 's'}`; break;
      }
      default: answer = `${one(avg(raw as number[]))} / 5`;
    }
    out.push({ key: q.key, label: q.label, answered: n, score: Math.round(avg(answered.map(d => d.scores[q.key]!))), answer });
  }
  return out;
}

export interface BetterDay {
  label: string;
  /** Average "how good was your day" (1–5) on days with it, and on days without */
  withIt: number;
  without: number;
  daysWith: number;
  daysWithout: number;
}

/* Things that might go with a better day, tested against "How good was your day?" */
const FACTORS: { label: string; test: (d: InventoryDay) => boolean | null }[] = [
  { label: 'Exercised', test: d => (typeof d.answers.exercised === 'boolean' ? d.answers.exercised : null) },
  { label: `Slept 7 hours or more`, test: d => (typeof d.answers.sleep === 'number' ? d.answers.sleep >= 7 : null) },
  { label: 'Woke up rested', test: d => (typeof d.answers.rested === 'number' ? d.answers.rested >= 4 : null) },
  { label: 'Slept through the night', test: d => (typeof d.answers.woke === 'boolean' ? !d.answers.woke : null) },
  { label: 'Ate breakfast', test: d => (typeof d.answers.breakfast === 'boolean' ? d.answers.breakfast : null) },
  { label: `Drank ${WATER_TARGET} glasses or more`, test: d => (typeof d.answers.water === 'number' ? d.answers.water >= WATER_TARGET : null) },
  { label: 'Ate just right', test: d => (typeof d.answers.eating === 'string' ? d.answers.eating === 'just_right' : null) },
  { label: 'A good work day', test: d => (typeof d.answers.work === 'number' ? d.answers.work >= 4 : null) },
  { label: 'Good social time', test: d => (typeof d.answers.social === 'number' ? d.answers.social >= 4 : null) },
  { label: 'Procrastinated little', test: d => (typeof d.answers.procrastination === 'number' ? d.answers.procrastination <= 2 : null) },
];

/** What goes with better days: each factor needs 2+ days with it and 2+ without; biggest gap first */
export function betterDays(days: InventoryDay[], minDays = 2): BetterDay[] {
  const rated = days.filter(d => typeof d.answers.day === 'number');
  const out: BetterDay[] = [];
  for (const f of FACTORS) {
    const yes: number[] = [];
    const no: number[] = [];
    for (const d of rated) {
      const t = f.test(d);
      if (t === null) continue;
      (t ? yes : no).push(d.answers.day as number);
    }
    if (yes.length < minDays || no.length < minDays) continue;
    out.push({ label: f.label, withIt: avg(yes), without: avg(no), daysWith: yes.length, daysWithout: no.length });
  }
  return out.sort((a, b) => Math.abs(b.withIt - b.without) - Math.abs(a.withIt - a.without));
}
