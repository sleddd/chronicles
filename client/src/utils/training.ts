/* Training plans (Health → Exercise → Training): a plan is a Training Plan
   entry — start date, activity categories, and phases, each with a length in
   weeks and the hours to put into each category across the whole phase. The
   tracker reads ordinary Exercise entries: a session counts toward the
   category it names (trainingCategory, by name), else the category whose
   activities include its exerciseType. Phases run back to back from the
   start date. Pure. */

import type { TrainingCategory, TrainingPhase } from '../types/fields.js';
import { toDateStr } from './dateUtils.js';

export interface PlanPhase extends TrainingPhase {
  /** First day, "YYYY-MM-DD" */
  start: string;
  /** Day after the last, "YYYY-MM-DD" */
  end: string;
  weekCount: number;
}

export interface TrainingPlan {
  id: number;
  name: string;
  start: string;
  eventDate: string;
  categories: TrainingCategory[];
  phases: PlanPhase[];
  active: boolean;
  createdAt: number;
}

export interface Session {
  id: number;
  date: string;
  minutes: number;
  distance: number;
  unit: 'mi' | 'km';
  exerciseType: string;
  category: string;
  title: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const num = (v: unknown) => { const n = parseFloat(str(v)); return Number.isFinite(n) ? n : 0; };

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86_400_000);
}

/** The categories and phases of the mountaineering tracker this was built
 *  from: Phase 1 is 6 weeks and 10 hours. Later phases start blank. */
export function mountaineeringTemplate(newId: () => string = () => crypto.randomUUID()) {
  const categories: TrainingCategory[] = [
    { id: newId(), name: 'Aerobic', exerciseTypes: ['walking', 'running', 'cycling', 'swimming', 'cardio'] },
    { id: newId(), name: 'Leg & glute', exerciseTypes: ['strength'] },
    { id: newId(), name: 'Core stability', exerciseTypes: ['yoga'] },
    { id: newId(), name: 'Ankle mobility & balance', exerciseTypes: [] },
    { id: newId(), name: 'Anaerobic power', exerciseTypes: [] },
  ];
  const phase1 = ['5', '2', '1.5', '1', '0.5'];
  const phases: TrainingPhase[] = [1, 2, 3, 4].map(n => ({
    id: newId(),
    name: `Phase ${n}`,
    weeks: '6',
    targets: n === 1 ? Object.fromEntries(categories.map((c, i) => [c.id, phase1[i]])) : {},
  }));
  return { categories, phases };
}

/** Phases with their dates, back to back from the plan's start. */
export function datedPhases(start: string, phases: TrainingPhase[]): PlanPhase[] {
  let at = start;
  return phases.map(p => {
    const weekCount = Math.max(1, Math.round(num(p.weeks)) || 1);
    const end = addDays(at, weekCount * 7);
    const out = { ...p, targets: p.targets ?? {}, start: at, end, weekCount };
    at = end;
    return out;
  });
}

/** Training plans from the store's entries, newest first. */
export function trainingPlans(
  entries: { id: number; content: string; metadata?: unknown; createdAt: Date | string }[],
  topicId: number | undefined,
  textOf: (html: string) => string,
): TrainingPlan[] {
  if (topicId === undefined) return [];
  const out: TrainingPlan[] = [];
  for (const e of entries) {
    const meta = e.metadata as Record<string, unknown> | undefined;
    if (!meta || meta._taxonomyId !== topicId) continue;
    const cf = (meta._customFields as Record<string, unknown>) ?? {};
    const created = new Date(e.createdAt);
    const start = str(cf.startDate) || toDateStr(created);
    out.push({
      id: e.id,
      name: str(cf.planName) || textOf(e.content).trim().slice(0, 120) || 'Training plan',
      start,
      eventDate: str(cf.eventDate),
      categories: Array.isArray(cf.categories) ? (cf.categories as TrainingCategory[]).filter(c => c && str(c.name)) : [],
      phases: datedPhases(start, Array.isArray(cf.phases) ? (cf.phases as TrainingPhase[]) : []),
      active: cf.isActive !== false,
      createdAt: created.getTime(),
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt - a.createdAt);
}

/** Every category name across plans (for the Training category pickers). */
export function categoryNames(plans: TrainingPlan[]): string[] {
  const seen = new Map<string, string>();
  for (const p of plans) for (const c of p.categories) {
    const k = c.name.trim().toLowerCase();
    if (k && !seen.has(k)) seen.set(k, c.name.trim());
  }
  return [...seen.values()];
}

/** Exercise entries as sessions (date = performedDate, else the day written). */
export function sessionsFrom(
  entries: { id: number; content: string; metadata?: unknown; createdAt: Date | string }[],
  exerciseTopicId: number | undefined,
  textOf: (html: string) => string,
): Session[] {
  if (exerciseTopicId === undefined) return [];
  const out: Session[] = [];
  for (const e of entries) {
    const meta = e.metadata as Record<string, unknown> | undefined;
    if (!meta || meta._taxonomyId !== exerciseTopicId) continue;
    const cf = (meta._customFields as Record<string, unknown>) ?? {};
    out.push({
      id: e.id,
      date: str(cf.performedDate) || toDateStr(new Date(e.createdAt)),
      minutes: num(cf.duration),
      distance: num(cf.distance),
      unit: cf.distanceUnit === 'km' ? 'km' : 'mi',
      exerciseType: str(cf.exerciseType),
      category: str(cf.trainingCategory),
      title: textOf(e.content).trim(),
    });
  }
  return out;
}

/** The plan category a session counts toward, or null. */
export function categoryOf(s: Session, categories: TrainingCategory[]): string | null {
  if (s.category) {
    const named = categories.find(c => c.name.trim().toLowerCase() === s.category.toLowerCase());
    return named ? named.id : null;
  }
  return categories.find(c => c.exerciseTypes?.includes(s.exerciseType))?.id ?? null;
}

/** Index of the phase today falls in (-1 before the start, phases.length after the end). */
export function phaseIndexOn(plan: TrainingPlan, date: string): number {
  if (plan.phases.length === 0 || date < plan.phases[0].start) return -1;
  const i = plan.phases.findIndex(p => date >= p.start && date < p.end);
  return i === -1 ? plan.phases.length : i;
}

/** Minutes per category id between two dates (end exclusive). */
export function minutesByCategory(sessions: Session[], categories: TrainingCategory[], start: string, end: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (s.date < start || s.date >= end) continue;
    const c = categoryOf(s, categories);
    if (c) out[c] = (out[c] ?? 0) + s.minutes;
  }
  return out;
}

export interface PhaseDay {
  date: string;
  /** Sessions by category id */
  cells: Record<string, Session[]>;
}

export interface PhaseWeek {
  index: number;
  start: string;
  days: PhaseDay[];
  /** Minutes by category id */
  totals: Record<string, number>;
}

/** The phase week by week, like the spreadsheet: days down, categories across. */
export function phaseWeeks(phase: PlanPhase, sessions: Session[], categories: TrainingCategory[]): PhaseWeek[] {
  const weeks: PhaseWeek[] = [];
  for (let w = 0; w < phase.weekCount; w++) {
    const start = addDays(phase.start, w * 7);
    const days: PhaseDay[] = [];
    const totals: Record<string, number> = {};
    for (let d = 0; d < 7; d++) days.push({ date: addDays(start, d), cells: {} });
    for (const s of sessions) {
      const offset = daysBetween(start, s.date);
      if (offset < 0 || offset > 6) continue;
      const c = categoryOf(s, categories);
      if (!c) continue;
      (days[offset].cells[c] ??= []).push(s);
      totals[c] = (totals[c] ?? 0) + s.minutes;
    }
    weeks.push({ index: w, start, days, totals });
  }
  return weeks;
}

/** 90 → "1 h 30 min", 60 → "1 h", 25 → "25 min", 0 → "0 min" */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Hours for the whole phase in a category (0 when unset). */
export const targetHours = (phase: TrainingPhase, categoryId: string) => num(phase.targets?.[categoryId]);
