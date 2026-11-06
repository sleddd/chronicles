/* The dashboard's Stats card: how much was logged over a period. Pure. */

import { toDateStr } from './dateUtils.js';

export type StatsPeriod = 'week' | 'month' | 'all';

export interface StatsEntry {
  createdAt: Date | string;
  metadata?: unknown;
}

export interface StatsDose { date: string; status: string }

export interface DashboardStats {
  entries: number;
  journal: number;
  meals: number;
  doses: number;
  exercise: number;
  symptoms: number;
  checkIns: number;
}

/** The first day (YYYY-MM-DD) a period counts from; null = all time */
export function periodStart(period: StatsPeriod, today: Date): string | null {
  if (period === 'all') return null;
  if (period === 'month') return toDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
  const d = new Date(today);
  d.setDate(d.getDate() - 6); // the last 7 days, today included
  return toDateStr(d);
}

const fieldsOf = (meta: Record<string, unknown>) => (meta._customFields as Record<string, unknown> | undefined) ?? {};

/** The day an entry counts on: its own date field (eaten / occurred / check-in day), else the day it was written */
function dayOf(e: StatsEntry, meta: Record<string, unknown>, key?: string): string {
  const v = key ? fieldsOf(meta)[key] : undefined;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return toDateStr(e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt));
}

export function dashboardStats(
  entries: StatsEntry[],
  topics: { id: number; name: string }[],
  doses: StatsDose[],
  period: StatsPeriod,
  today: Date,
): DashboardStats {
  const from = periodStart(period, today);
  const to = toDateStr(today);
  const within = (day: string) => (from === null || day >= from) && day <= to;
  const idsNamed = (...names: string[]) => new Set(topics.filter(t => names.includes(t.name.trim().toLowerCase())).map(t => t.id));
  const journal = idsNamed('journal');
  const meals = idsNamed('meals');
  const exercise = idsNamed('exercise');
  const symptoms = idsNamed('symptom', 'symptoms');

  const s: DashboardStats = { entries: 0, journal: 0, meals: 0, doses: 0, exercise: 0, symptoms: 0, checkIns: 0 };
  for (const e of entries) {
    const meta = (e.metadata as Record<string, unknown> | undefined) ?? {};
    const tid = meta._taxonomyId as number | undefined;
    if (within(dayOf(e, meta))) {
      s.entries++;
      if (tid === undefined || journal.has(tid)) {
        if (meta._widgetType !== 'wellness-checkin' && meta._widgetType !== 'saved-chat') s.journal++;
      }
    }
    if (meta._widgetType === 'wellness-checkin') {
      if (within(dayOf(e, meta, 'date'))) s.checkIns++;
      continue;
    }
    if (tid === undefined) continue;
    if (meals.has(tid)) {
      // Food only: medicines, supplements and rows synced from a ticked dose count as doses
      const type = String(fieldsOf(meta).mealType ?? '').toLowerCase();
      if (type !== 'medication' && type !== 'supplement' && !meta._doseLink && within(dayOf(e, meta, 'consumedDate'))) s.meals++;
    } else if (exercise.has(tid)) {
      if (within(dayOf(e, meta, 'performedDate'))) s.exercise++;
    } else if (symptoms.has(tid)) {
      if (within(dayOf(e, meta, 'occurredDate'))) s.symptoms++;
    }
  }
  s.doses = doses.filter(d => d.status === 'taken' && within(d.date)).length;
  return s;
}
