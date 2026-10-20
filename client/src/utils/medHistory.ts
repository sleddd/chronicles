/* Medication history (Health → Med history): every dose ticked off in the
   schedule plus everything logged in Meals as a medication or supplement
   (that's where "as needed" meds and imported history live), grouped by
   medication name for a date range. Pure — the view loads the data. */

import type { DoseLogRecord } from '../services/api.js';
import type { FoodRow } from './foodLog.js';
import { toDateStr } from './dateUtils.js';

export type MedPeriod = 'month' | 'last-month' | '3-months' | 'year' | 'custom';

export const MED_PERIODS: { value: MedPeriod; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: '3-months', label: '3 months' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

/** YYYY-MM-DD bounds (inclusive) for a period, relative to `today` */
export function medPeriodRange(period: MedPeriod, today = new Date(), custom?: { from: string; to: string }): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const day = (yy: number, mm: number, dd: number) => toDateStr(new Date(yy, mm, dd));
  switch (period) {
    case 'month': return { from: day(y, m, 1), to: day(y, m + 1, 0) };
    case 'last-month': return { from: day(y, m - 1, 1), to: day(y, m, 0) };
    case '3-months': return { from: day(y, m - 2, 1), to: day(y, m + 1, 0) };
    case 'year': return { from: day(y, 0, 1), to: day(y, 11, 31) };
    case 'custom': {
      const from = custom?.from || day(y, m, 1);
      const to = custom?.to || day(y, m + 1, 0);
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

/** A medication entry: its id, name and dosage */
export interface MedInfo { id: number; name: string; dosage: string }

export type MedEventStatus = 'taken' | 'skipped';

/** One dose or logged item */
export interface MedEvent {
  key: string;
  day: string;
  /** HH:MM it was taken (or scheduled, for a skipped dose); '' when unknown */
  time: string;
  /** HH:MM it was scheduled; '' for items logged in Meals */
  scheduled: string;
  status: MedEventStatus;
  source: 'schedule' | 'meals';
}

export interface MedHistoryRow {
  /** Lower-case name — the grouping key */
  key: string;
  name: string;
  dosage: string;
  taken: number;
  skipped: number;
  /** Distinct days with at least one taken dose */
  days: number;
  lastTaken: string | null;
  /** Newest first */
  events: MedEvent[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function localTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Group the range's doses and Meals-logged medications by name. Doses that were
 * ticked off and synced into Meals (they carry `_doseLink`) are counted once,
 * from the schedule.
 */
export function buildMedHistory(
  doses: DoseLogRecord[],
  meds: MedInfo[],
  foodRows: FoodRow[],
  range: { from: string; to: string },
): MedHistoryRow[] {
  const medById = new Map(meds.map(m => [m.id, m]));
  const groups = new Map<string, MedHistoryRow>();
  const group = (name: string, dosage: string) => {
    const label = name.trim() || 'Unnamed medication';
    const key = norm(label);
    let g = groups.get(key);
    if (!g) {
      g = { key, name: label, dosage, taken: 0, skipped: 0, days: 0, lastTaken: null, events: [] };
      groups.set(key, g);
    }
    if (!g.dosage && dosage) g.dosage = dosage;
    return g;
  };

  for (const d of doses) {
    if (d.date < range.from || d.date > range.to) continue;
    if (d.status !== 'taken' && d.status !== 'skipped') continue;
    const med = medById.get(d.medicationPostId);
    const g = group(med?.name ?? 'Deleted medication', med?.dosage ?? '');
    const scheduled = (d.scheduledTime || '').slice(0, 5);
    g.events.push({
      key: `dose-${d.id}`,
      day: d.date,
      time: d.status === 'taken' ? (localTime(d.takenAt) || scheduled) : scheduled,
      scheduled,
      status: d.status,
      source: 'schedule',
    });
  }

  for (const r of foodRows) {
    if (r.day < range.from || r.day > range.to) continue;
    if (r.mealType !== 'medication' && r.mealType !== 'supplement') continue;
    if (r.cf._doseLink) continue; // already counted from the schedule
    const g = group(r.item, String(r.cf.dosage ?? ''));
    g.events.push({
      key: `meal-${r.id}`,
      day: r.day,
      time: typeof r.cf.consumedTime === 'string' ? r.cf.consumedTime.slice(0, 5) : '',
      scheduled: '',
      status: 'taken',
      source: 'meals',
    });
  }

  for (const g of groups.values()) {
    g.events.sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time));
    const takenDays = new Set<string>();
    for (const e of g.events) {
      if (e.status === 'taken') { g.taken++; takenDays.add(e.day); } else g.skipped++;
    }
    g.days = takenDays.size;
    g.lastTaken = g.events.find(e => e.status === 'taken')?.day ?? null;
  }

  return [...groups.values()].sort((a, b) => b.taken - a.taken || a.name.localeCompare(b.name));
}

/** Rows whose name or dosage has every word of the query */
export function searchMedHistory(rows: MedHistoryRow[], query: string): MedHistoryRow[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return rows;
  return rows.filter(r => {
    const hay = `${r.name} ${r.dosage}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

export function medHistoryTotals(rows: MedHistoryRow[]): { taken: number; skipped: number; medications: number } {
  return {
    taken: rows.reduce((n, r) => n + r.taken, 0),
    skipped: rows.reduce((n, r) => n + r.skipped, 0),
    medications: rows.filter(r => r.taken > 0).length,
  };
}
