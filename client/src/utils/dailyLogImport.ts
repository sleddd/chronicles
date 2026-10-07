import { NUTRIENTS, type NutrientGoals, type NutrientKey } from '../types/nutrition.js';
import { toDateStr } from './dateUtils.js';

/**
 * One-time import of the "Daily log" food tracker (a Claude artifact) into
 * the journal. The export is plain JSON: its days, each with a map of logged
 * items, plus the daily goals. Mapping:
 *   Food / Supplement / Medication → Meals entries (nutrients kept as typed)
 *   Symptom → Symptom entries, Note → Journal entries.
 * Every created entry carries `_importKey` in its metadata so a re-run skips
 * items already imported.
 */

/** Artifact field → Chronicles nutrient key. */
const NUTRIENT_FROM: Record<string, NutrientKey> = {
  kcal: 'calories', iron: 'iron', vitD: 'vitaminD', b12: 'vitaminB12', vitC: 'vitaminC',
};

export interface DailyLogItem {
  item?: string;
  type?: string;
  notes?: string;
  created?: string;
  kcal?: number | null;
  iron?: number | null;
  vitD?: number | null;
  b12?: number | null;
  vitC?: number | null;
}

export interface DailyLogExport {
  goals?: Partial<Record<keyof typeof NUTRIENT_FROM, number | null>>;
  days: Record<string, { date?: string; entries?: Record<string, DailyLogItem | null> }>
    | { date: string; entries?: Record<string, DailyLogItem | null> }[];
}

export interface PlannedEntry {
  /** Stable id of the source item ("dailylog:<day>:<item id>") */
  importKey: string;
  topic: 'Meals' | 'Symptom' | 'Journal';
  content: string;
  customFields: Record<string, unknown>;
  /** ISO timestamp to create the entry at */
  createdAt: string;
}

export interface ImportPlan {
  entries: PlannedEntry[];
  goals: NutrientGoals | null;
  days: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function numberText(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/** Parse an export (as text) into the entries to create. Throws on a file that isn't one. */
export function planDailyLogImport(json: string): ImportPlan {
  let data: DailyLogExport;
  try { data = JSON.parse(json) as DailyLogExport; } catch { throw new Error('That file isn’t valid JSON.'); }
  if (!data || typeof data !== 'object' || !data.days || typeof data.days !== 'object') {
    throw new Error('That file isn’t a Daily log export (no days found).');
  }
  const dayDocs = Array.isArray(data.days)
    ? data.days.map(d => [d.date, d] as const)
    : Object.entries(data.days).map(([k, d]) => [d?.date ?? k, d] as const);

  const entries: PlannedEntry[] = [];
  let days = 0;
  for (const [day, doc] of dayDocs) {
    if (typeof day !== 'string' || !DAY_RE.test(day) || !doc?.entries) continue;
    let counted = false;
    for (const [id, raw] of Object.entries(doc.entries)) {
      if (!raw || typeof raw !== 'object') continue; // deleted in the artifact
      const item = String(raw.item ?? '').trim();
      if (!item) continue;
      const notes = String(raw.notes ?? '').trim();
      const created = raw.created ? new Date(raw.created) : null;
      // Keep the logged time when it falls on the item's day; else noon that day
      const sameDay = created && !Number.isNaN(created.getTime()) && toDateStr(created) === day;
      const at = sameDay ? created! : new Date(`${day}T12:00:00`);
      const time = sameDay ? hhmm(created!) : '';
      const base = { importKey: `dailylog:${day}:${id}`, createdAt: at.toISOString() };
      const type = String(raw.type ?? 'Food').toLowerCase();

      if (type === 'symptom') {
        entries.push({
          ...base, topic: 'Symptom', content: `<p>${escapeHtml(item)}</p>`,
          customFields: { occurredDate: day, occurredTime: time, notes },
        });
      } else if (type === 'note') {
        const body = notes ? `<p>${escapeHtml(item)}</p><p>${escapeHtml(notes)}</p>` : `<p>${escapeHtml(item)}</p>`;
        entries.push({ ...base, topic: 'Journal', content: body, customFields: {} });
      } else {
        const cf: Record<string, unknown> = {
          mealDescription: item,
          mealType: type === 'supplement' ? 'supplement' : type === 'medication' ? 'medication' : '',
          consumedDate: day,
          consumedTime: time,
          notes,
        };
        const source: Record<string, 'manual'> = {};
        for (const [from, key] of Object.entries(NUTRIENT_FROM)) {
          const v = numberText(raw[from as keyof DailyLogItem]);
          cf[key] = v;
          if (v) source[key] = 'manual';
        }
        if (Object.keys(source).length) cf.nutrientSource = source;
        entries.push({ ...base, topic: 'Meals', content: `<p>${escapeHtml(item)}</p>`, customFields: cf });
      }
      counted = true;
    }
    if (counted) days++;
  }
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let goals: NutrientGoals | null = null;
  if (data.goals && typeof data.goals === 'object') {
    const g = {} as NutrientGoals;
    let any = false;
    for (const n of NUTRIENTS) {
      const from = Object.keys(NUTRIENT_FROM).find(k => NUTRIENT_FROM[k] === n.key)!;
      const v = (data.goals as Record<string, unknown>)[from];
      g[n.key] = typeof v === 'number' && Number.isFinite(v) ? v : null;
      if (g[n.key] !== null) any = true;
    }
    if (any) goals = g;
  }
  return { entries, goals, days };
}
