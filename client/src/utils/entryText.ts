import type { UserFieldDef } from '../types/userFields.js';
import { summarizeUserFields } from './stripHtml.js';
import { exerciseSummary } from './exerciseSummary.js';

/*
 * Topics whose entries have no text area: their text is generated from their
 * fields. Shared by the journal editor (EntryForm) and the dashboard Quick
 * Entry so both name entries the same way.
 */

/** Topic (lower-cased name) → the built-in field that IS the entry's name */
export const NAME_FIELD_BY_TOPIC: Record<string, string> = {
  meals: 'mealDescription',
  medication: 'medicationName',
  allergy: 'allergen',
  event: 'eventName', events: 'eventName',
  meeting: 'meetingName', meetings: 'meetingName',
  goal: 'goalObjective', goals: 'goalObjective',
  milestone: 'milestoneObjective', milestones: 'milestoneObjective',
};

const QUOTE_TOPICS = ['quote', 'quotes'];
const BOOK_TOPICS = ['book', 'books'];

function fieldValue(defs: UserFieldDef[], values: Record<string, unknown>, labels: string[], fallbackToFirst = false): string {
  const preferred = defs.find(d => labels.some(l => d.label.toLowerCase().includes(l)));
  const ordered = preferred ? [preferred, ...(fallbackToFirst ? defs.filter(d => d !== preferred) : [])] : (fallbackToFirst ? defs : []);
  for (const def of ordered) {
    const v = values[def.id];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

/** "“Quote” — Author" / "Title — Author" for quote and book topics, else ''. */
export function fieldLedSummary(topicName: string, defs: UserFieldDef[], values: Record<string, unknown>): string {
  const t = topicName.toLowerCase();
  if (QUOTE_TOPICS.includes(t)) {
    const quote = fieldValue(defs, values, ['quote', 'text']) || fieldValue(defs, values, ['quote'], true);
    const author = fieldValue(defs, values, ['author', 'by', 'source', 'who']);
    return quote ? `“${quote}”${author ? ` — ${author}` : ''}` : '';
  }
  if (BOOK_TOPICS.includes(t)) {
    const title = fieldValue(defs, values, ['book', 'title', 'name'], true);
    const author = fieldValue(defs, values, ['author', 'by', 'writer']);
    return title ? `${title}${author ? ` — ${author}` : ''}` : '';
  }
  return '';
}

/** The text a fields-only entry should carry (its title in every list), or ''. */
export function generatedEntryText(topicName: string, fields: Record<string, unknown>, defs: UserFieldDef[] = []): string {
  const t = topicName.toLowerCase();
  const nameKey = NAME_FIELD_BY_TOPIC[t];
  if (nameKey) {
    const v = fields[nameKey];
    return typeof v === 'string' ? v.trim() : '';
  }
  if (t === 'exercise') return exerciseSummary({ exerciseType: 'running', distanceUnit: 'miles', ...fields });
  const userValues = (fields._userFields as Record<string, unknown>) ?? {};
  return fieldLedSummary(t, defs, userValues) || summarizeUserFields(defs, userValues);
}
