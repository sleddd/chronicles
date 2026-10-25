/* Import a training tracker spreadsheet (CSV), one phase per file:

     Phase 1 - 10 hours - 6 weeks,,,
     ,Aerobic ( 5 hrs ) ,Leg & Glute ( 2hrs ),…
     Week One,,,
     Mon - 8.18.25,1 hour ( 4.70 mi ) ,25min,-
     Tues - 8.19.25 - Bookclub ,-,-

   Each cell with a time becomes an Exercise session in that column's
   category ("1 hour ( 4.70 mi )" → 60 min, 4.7 mi). Cells without a time
   ("SICK", "Rave", "hike") are listed as skipped. mergeTrainingPlan folds the
   phase and its categories into a new or existing plan. Pure. */

import type { TrainingCategory, TrainingPhase, TrainingPlanFieldValues } from '../types/fields.js';
import { parseCsvRow, splitCsvLines } from './csv.js';
import { toDateStr } from './dateUtils.js';

export interface ImportedSession {
  date: string;
  category: string;
  minutes: number;
  distance: number | null;
  unit: 'miles' | 'km';
  exerciseType: string;
  intensity: 'low' | 'medium' | 'high';
  notes: string;
  importKey: string;
}

export interface TrainingImport {
  phaseName: string;
  weeks: number;
  totalHours: number | null;
  categories: { name: string; hours: number | null }[];
  sessions: ImportedSession[];
  skipped: { date: string; category: string; text: string }[];
  firstDate: string;
}

const HOURS = /(\d+(?:\.\d+)?)\.?\s*(?:hours?|hrs?|hr)\b/i;
const MINUTES = /(\d+(?:\.\d+)?)\.?\s*(?:minutes?|mins?)\b/i;
const DISTANCE = /(\d+(?:\.\d+)?)\s*(miles?|mil|mi|km|kilometers?)\b/i;
const RANGE = /\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*(?:miles?|mil|mi|km)/i;
const DAY_ROW = /^\s*[A-Za-z]+\.?\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*(?:-\s*(.*))?$/;
const PHASE_ROW = /^\s*(phase\s*[\w.]+)\s*(?:-\s*([\d.]+)\s*(?:hours?|hrs?))?\s*(?:-\s*(\d+)\s*weeks?)?/i;

/** "Aerobic ( 5 hrs )" → { name: "Aerobic", hours: 5 }; "( 30 min )" → 0.5 */
function parseHeader(cell: string): { name: string; hours: number | null } {
  const minutes = cellMinutes(cell.match(/\((.*?)\)/)?.[1] ?? '');
  return { name: cell.replace(/\(.*?\)/g, '').trim(), hours: minutes === null ? null : minutes / 60 };
}

/** A cell's time in minutes, or null when it has none */
export function cellMinutes(text: string): number | null {
  const h = text.match(HOURS);
  const m = text.match(MINUTES);
  if (!h && !m) return null;
  return Math.round((h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0));
}

function cellDistance(text: string): { distance: number; unit: 'miles' | 'km' } | null {
  if (RANGE.test(text)) return null;
  const d = text.match(DISTANCE);
  if (!d) return null;
  return { distance: parseFloat(d[1]), unit: /^k/i.test(d[2]) ? 'km' : 'miles' };
}

/** What's left once the time and distance are taken out ("swimming", "rocks and hiking") */
function cellNote(text: string): string {
  if (RANGE.test(text)) return text.trim();
  const rest = text.replace(HOURS, '').replace(MINUTES, '').replace(DISTANCE, '')
    .replace(/[()]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–,.]+|[\s\-–,.]+$/g, '');
  return /[a-z]/i.test(rest) ? rest : '';
}

/** The activity a session most likely was: from its words, else its category */
export function guessExerciseType(text: string, category: string): string {
  const t = text.toLowerCase();
  if (/swim/.test(t)) return 'swimming';
  if (/yoga/.test(t)) return 'yoga';
  if (/\brun|jog/.test(t)) return 'running';
  if (/walk/.test(t)) return 'walking';
  if (/cycl|bike|biking/.test(t)) return 'cycling';
  const c = category.toLowerCase();
  if (/leg|glute|strength|core/.test(c)) return 'strength';
  if (/aerob|anaerob|power|cardio/.test(c)) return 'cardio';
  return 'other';
}

/** Whole weeks from the first day to the last (at least one) */
function weeksSpanned(first: string, last: string): number {
  if (!first || !last) return 1;
  const days = Math.round((new Date(last + 'T12:00:00').getTime() - new Date(first + 'T12:00:00').getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

export function parseTrainingCsv(text: string): TrainingImport {
  const rows = splitCsvLines(text).map(parseCsvRow);
  let phaseName = '';
  let weeks = 0;
  let totalHours: number | null = null;
  let headers: { name: string; hours: number | null }[] | null = null;
  const sessions: ImportedSession[] = [];
  const skipped: TrainingImport['skipped'] = [];
  let firstDate = '';
  let lastDate = '';

  for (const row of rows) {
    const first = (row[0] ?? '').trim();
    if (!phaseName) {
      const p = first.match(PHASE_ROW);
      if (p) {
        phaseName = p[1].replace(/\s+/g, ' ').replace(/^phase/i, 'Phase');
        totalHours = p[2] ? parseFloat(p[2]) : null;
        weeks = p[3] ? parseInt(p[3], 10) : 0;
        continue;
      }
    }
    if (!headers && !first && row.slice(1).some(c => c.trim())) {
      headers = row.slice(1).map(c => parseHeader(c));
      continue;
    }
    const day = first.match(DAY_ROW);
    if (!day || !headers) continue;
    const year = day[3].length === 2 ? 2000 + parseInt(day[3], 10) : parseInt(day[3], 10);
    const date = toDateStr(new Date(year, parseInt(day[1], 10) - 1, parseInt(day[2], 10)));
    if (!firstDate || date < firstDate) firstDate = date;
    if (date > lastDate) lastDate = date;
    headers.forEach((h, i) => {
      const cell = (row[i + 1] ?? '').trim();
      if (!h.name || !cell || /^[-–]+$/.test(cell)) return;
      const minutes = cellMinutes(cell);
      if (minutes === null) { skipped.push({ date, category: h.name, text: cell.replace(/^[-–\s]+/, '') }); return; }
      const dist = cellDistance(cell);
      sessions.push({
        date,
        category: h.name,
        minutes,
        distance: dist?.distance ?? null,
        unit: dist?.unit ?? 'miles',
        exerciseType: guessExerciseType(cell, h.name),
        intensity: /anaerob|power|sprint/i.test(h.name) ? 'high' : 'medium',
        notes: cellNote(cell),
        importKey: `training:${(phaseName || 'phase').toLowerCase()}:${date}:${h.name.toLowerCase()}`,
      });
    });
  }

  if (!headers) throw new Error('No category row found (the row naming the activity columns)');
  if (!sessions.length && !skipped.length) throw new Error('No days found (rows like “Mon - 8.18.25”)');
  return {
    phaseName: phaseName || 'Phase 1',
    weeks: weeks || weeksSpanned(firstDate, lastDate),
    totalHours,
    categories: headers.filter(h => h.name),
    sessions,
    skipped,
    firstDate,
  };
}

const key = (s: string) => s.trim().toLowerCase();

/** The plan with this phase folded in: categories matched by name (new ones
 *  added), the phase matched by name (its weeks and hours replaced) or added. */
export function mergeTrainingPlan(
  plan: TrainingPlanFieldValues | null,
  imp: TrainingImport,
  planName: string,
  newId: () => string = () => crypto.randomUUID(),
): TrainingPlanFieldValues {
  const base: TrainingPlanFieldValues = plan ?? {
    planName, startDate: imp.firstDate, eventDate: '', categories: [], phases: [], isActive: true, notes: '',
  };
  const categories: TrainingCategory[] = [...(base.categories ?? [])];
  const idByName = new Map(categories.map(c => [key(c.name), c.id]));
  for (const c of imp.categories) {
    if (!idByName.has(key(c.name))) {
      const id = newId();
      categories.push({ id, name: c.name, exerciseTypes: [] });
      idByName.set(key(c.name), id);
    }
  }
  const phases: TrainingPhase[] = [...(base.phases ?? [])];
  const at = phases.findIndex(p => key(p.name) === key(imp.phaseName));
  const prev = at >= 0 ? phases[at] : null;
  const targets: Record<string, string> = { ...(prev?.targets ?? {}) };
  for (const c of imp.categories) if (c.hours !== null) targets[idByName.get(key(c.name))!] = String(c.hours);
  const phase: TrainingPhase = { id: prev?.id ?? newId(), name: prev?.name ?? imp.phaseName, weeks: String(imp.weeks), targets };
  if (at >= 0) phases[at] = phase; else phases.push(phase);
  const order = (p: TrainingPhase) => parseFloat(p.name.match(/\d+(?:\.\d+)?/)?.[0] ?? '') || Infinity;
  phases.sort((a, b) => order(a) - order(b));
  const startDate = !base.startDate || (imp.firstDate && phases[0]?.id === phase.id && imp.firstDate < base.startDate)
    ? imp.firstDate : base.startDate;
  return { ...base, categories, phases, startDate };
}
