import type { DecryptedPost } from '@shared/crypto/types';
import { NUTRIENTS, nutrientNumber, type NutrientGoals, type NutrientKey } from '../types/nutrition.js';
import { stripHtml } from './stripHtml.js';
import { toDateStr } from './dateUtils.js';

export const MEAL_TYPE_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'supplement', label: 'Supplement' },
] as const;

/** One logged food/drink/supplement, flattened for the Meals log. */
export interface FoodRow {
  id: number;
  /** YYYY-MM-DD the item was eaten (consumedDate, else the entry's creation day) */
  day: string;
  item: string;
  mealType: string;
  notes: string;
  values: Record<NutrientKey, number | null>;
  cf: Record<string, unknown>;
  createdAt: number;
}

export interface DaySummary {
  totals: Record<NutrientKey, number>;
  /** At least one row on the day has a value for this nutrient */
  has: Record<NutrientKey, boolean>;
}

/** Local-date helpers on YYYY-MM-DD strings. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function customFields(entry: DecryptedPost): Record<string, unknown> {
  return ((entry.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
}

/** The day an entry belongs to in the log. */
export function entryDay(entry: DecryptedPost, dateKey: string): string {
  const v = customFields(entry)[dateKey];
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return toDateStr(entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt));
}

/** All entries of a topic as food rows, oldest first within a day. */
export function foodRowsFrom(entries: DecryptedPost[], topicId: number | undefined): FoodRow[] {
  if (topicId === undefined) return [];
  return entries
    .filter(e => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId === topicId)
    .map(e => {
      const cf = customFields(e);
      const values = {} as Record<NutrientKey, number | null>;
      for (const n of NUTRIENTS) values[n.key] = nutrientNumber(cf[n.key]);
      const created = e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt);
      const timeKey = typeof cf.consumedTime === 'string' && cf.consumedTime ? cf.consumedTime : '';
      return {
        id: e.id,
        day: entryDay(e, 'consumedDate'),
        item: stripHtml(e.content).trim() || String(cf.mealDescription ?? '').trim() || 'Food',
        mealType: String(cf.mealType ?? '').toLowerCase(),
        notes: String(cf.notes ?? ''),
        values,
        cf,
        createdAt: timeKey ? parseDay(entryDay(e, 'consumedDate')).getTime() + timeToMs(timeKey) : created.getTime(),
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
}

function timeToMs(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) * 60_000;
}

export function summarizeDay(rows: FoodRow[]): DaySummary {
  const totals = {} as Record<NutrientKey, number>;
  const has = {} as Record<NutrientKey, boolean>;
  for (const n of NUTRIENTS) { totals[n.key] = 0; has[n.key] = false; }
  for (const r of rows) {
    for (const n of NUTRIENTS) {
      const v = r.values[n.key];
      if (v !== null) { totals[n.key] += v; has[n.key] = true; }
    }
  }
  return { totals, has };
}

/** A day reaches a goal when it has a value and the total is at least the goal. */
export function goalMet(goals: NutrientGoals, key: NutrientKey, summary: DaySummary): boolean {
  const g = goals[key];
  return g !== null && g !== undefined && summary.has[key] && summary.totals[key] >= g;
}

/** Group rows by day (newest day first), limited to days on or after `fromDay`. */
export function rowsByDay(rows: FoodRow[], fromDay: string): [string, FoodRow[]][] {
  const map = new Map<string, FoodRow[]>();
  for (const r of rows) {
    if (r.day < fromDay) continue;
    map.set(r.day, [...(map.get(r.day) ?? []), r]);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}
