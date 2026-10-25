/* Health → Exercise → History: what you did over a period, like Med history —
   one row per exercise (the schedule item's name, else the activity), with
   sessions, days, time, distance and the last time, opening into its sessions.
   Pure. */

import type { Session } from './training.js';
import { exerciseTypeLabel } from './exerciseSummary.js';

export interface ExerciseHistoryRow {
  key: string;
  name: string;
  /** "Walking · Aerobic" — the activity when it isn't the name, and the usual category */
  detail: string;
  sessions: number;
  days: number;
  minutes: number;
  /** Total distance in miles (km converted) */
  miles: number;
  last: string;
  /** Newest first */
  events: Session[];
}

const KM_PER_MILE = 1.609344;
const mostCommon = (list: string[]) => {
  const n = new Map<string, number>();
  for (const v of list) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

/** Sessions in [from, to] (inclusive) grouped by exercise, most sessions first */
export function buildExerciseHistory(sessions: Session[], range: { from: string; to: string }): ExerciseHistoryRow[] {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    if (s.date < range.from || s.date > range.to) continue;
    const key = s.name.trim().replace(/\s+/g, ' ').toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const rows: ExerciseHistoryRow[] = [];
  for (const [key, list] of groups) {
    const events = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));
    const activity = exerciseTypeLabel(mostCommon(list.map(s => s.exerciseType)));
    const name = mostCommon(list.map(s => s.name)) || events[0].name;
    rows.push({
      key,
      name,
      detail: [activity.toLowerCase() !== name.toLowerCase() ? activity : '', mostCommon(list.map(s => s.category))].filter(Boolean).join(' · '),
      sessions: list.length,
      days: new Set(list.map(s => s.date)).size,
      minutes: list.reduce((t, s) => t + s.minutes, 0),
      miles: list.reduce((t, s) => t + (s.unit === 'km' ? s.distance / KM_PER_MILE : s.distance), 0),
      last: events[0].date,
      events,
    });
  }
  return rows.sort((a, b) => b.sessions - a.sessions || b.minutes - a.minutes || a.name.localeCompare(b.name));
}

/** Rows where every word typed is in the name or its detail */
export function searchExerciseHistory(rows: ExerciseHistoryRow[], query: string): ExerciseHistoryRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter(r => {
    const text = `${r.name} ${r.detail}`.toLowerCase();
    return words.every(w => text.includes(w));
  });
}

export function exerciseHistoryTotals(rows: ExerciseHistoryRow[]): { sessions: number; exercises: number; minutes: number } {
  return {
    sessions: rows.reduce((t, r) => t + r.sessions, 0),
    exercises: rows.length,
    minutes: rows.reduce((t, r) => t + r.minutes, 0),
  };
}
