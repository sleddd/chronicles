/* Health → Symptoms: what you noticed over a period, laid out like Exercise
   history — one row per symptom (an entry listing several counts toward each),
   with times, days, average and worst severity and the last time, opening into
   its occurrences. Pure — the view gathers the events. */

import { splitSymptoms } from './symptomChips.js';

export interface SymptomEvent {
  /** The entry's id (opens it) */
  id: number;
  name: string;
  date: string;
  /** HH:MM, '' when not given */
  time: string;
  /** 1–10, null when not given */
  severity: number | null;
  /** Minutes it lasted, 0 when not given */
  minutes: number;
  notes: string;
  /** The other symptoms logged in the same entry */
  with: string[];
}

export interface SymptomHistoryRow {
  key: string;
  name: string;
  /** "Usually moderate · often with Fatigue" */
  detail: string;
  times: number;
  days: number;
  /** Average severity to one decimal, null when none was given */
  average: number | null;
  worst: number | null;
  last: string;
  /** Newest first */
  events: SymptomEvent[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function severityWord(n: number): string {
  return n <= 3 ? 'Mild' : n <= 6 ? 'Moderate' : 'Severe';
}

const mostCommon = (list: string[]) => {
  const n = new Map<string, number>();
  for (const v of list) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

/** A Symptom entry's fields as events, one per symptom it lists */
export function symptomEventsFrom(entry: { id: number; day: string; title: string; cf: Record<string, unknown> }): SymptomEvent[] {
  const { cf } = entry;
  const label = (typeof cf.symptomName === 'string' && cf.symptomName.trim() ? cf.symptomName : entry.title).slice(0, 120);
  const names = splitSymptoms(label);
  const list = names.length ? names : [label.trim() || 'Symptom'];
  const sev = Number(cf.severity);
  const minutes = Number(cf.duration);
  return list.map(name => ({
    id: entry.id,
    name,
    date: typeof cf.occurredDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cf.occurredDate) ? cf.occurredDate : entry.day,
    time: typeof cf.occurredTime === 'string' ? cf.occurredTime.slice(0, 5) : '',
    severity: Number.isFinite(sev) && sev >= 1 ? Math.min(10, Math.round(sev)) : null,
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0,
    notes: typeof cf.notes === 'string' ? cf.notes.trim() : '',
    with: list.filter(n => norm(n) !== norm(name)),
  }));
}

/** Events in [from, to] (inclusive) grouped by symptom, most often first */
export function buildSymptomHistory(events: SymptomEvent[], range: { from: string; to: string }): SymptomHistoryRow[] {
  const groups = new Map<string, SymptomEvent[]>();
  for (const e of events) {
    if (e.date < range.from || e.date > range.to) continue;
    const key = norm(e.name);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const rows: SymptomHistoryRow[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    const rated = list.map(e => e.severity).filter((n): n is number => n !== null);
    const average = rated.length ? Math.round((rated.reduce((t, n) => t + n, 0) / rated.length) * 10) / 10 : null;
    const often = mostCommon(list.flatMap(e => e.with));
    rows.push({
      key,
      name: mostCommon(list.map(e => e.name)) || sorted[0].name,
      detail: [average !== null ? `Usually ${severityWord(average).toLowerCase()}` : '', often ? `often with ${often}` : '']
        .filter(Boolean).join(' · ').replace(/^often/, 'Often'),
      times: list.length,
      days: new Set(list.map(e => e.date)).size,
      average,
      worst: rated.length ? Math.max(...rated) : null,
      last: sorted[0].date,
      events: sorted,
    });
  }
  return rows.sort((a, b) => b.times - a.times || (b.average ?? 0) - (a.average ?? 0) || a.name.localeCompare(b.name));
}

/** Rows where every word typed is in the name or its detail */
export function searchSymptomHistory(rows: SymptomHistoryRow[], query: string): SymptomHistoryRow[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return rows;
  return rows.filter(r => {
    const text = `${r.name} ${r.detail}`.toLowerCase();
    return words.every(w => text.includes(w));
  });
}

export function symptomHistoryTotals(rows: SymptomHistoryRow[]): { times: number; symptoms: number; days: number } {
  return {
    times: rows.reduce((t, r) => t + r.times, 0),
    symptoms: rows.length,
    days: new Set(rows.flatMap(r => r.events.map(e => e.date))).size,
  };
}
