import DOMPurify from 'dompurify';
import type { UserFieldDef } from '../types/userFields.js';

/** Strip HTML tags from a string, returning plain text. */
export function stripHtml(html: string): string {
  // Read the text straight off DOMPurify's (inert) fragment — no innerHTML
  // sink, so nothing here goes through Trusted Types a second time
  const frag = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], RETURN_DOM_FRAGMENT: true });
  return frag.textContent || '';
}

/** Built-in "primary label" field keys, in priority order — the name/description
 *  a structured entry carries when its text content is empty. */
const BUILTIN_NAME_KEYS = [
  'eventName', 'meetingName', 'goalObjective', 'milestoneObjective',
  'taskDescription', 'mealDescription', 'recipeName', 'medicationName', 'allergen', 'routineName', 'planName',
] as const;

/** The entry's built-in name/description field value, or '' when none is set. */
export function builtinEntryName(customFields: Record<string, unknown> | undefined | null): string {
  if (!customFields) return '';
  for (const key of BUILTIN_NAME_KEYS) {
    const v = customFields[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Build a one-line summary from user-defined field values, for preview display only. */
export function summarizeUserFields(defs: UserFieldDef[], values: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const def of defs) {
    const val = values[def.id];
    if (val === undefined || val === null || val === '') continue;
    if (def.type !== 'boolean') {
      parts.push(String(val));
    }
  }
  return parts.join(' · ');
}
