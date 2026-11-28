/* Minimal CSV reading/writing for Settings → Data → Export / Import Entries. */

// Spreadsheets run a cell starting with one of these as a formula (CSV
// injection) — some after leading spaces, and some take the full-width forms
// too. Exported cells get a leading apostrophe; import takes it off.
const FORMULA_START = /^(?:[\t\r]|\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/;

/** One CSV cell: formula-guarded, quoted when it holds a quote, comma or line break. */
export function csvCell(val: string): string {
  // A value already starting ' + formula is guarded too, so import's unguard
  // gives back exactly what was written
  const guarded = FORMULA_START.test(val.replace(/^'+/, '')) ? `'${val}` : val;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Undo `csvCell`'s formula guard on a parsed field. */
export function unguardCsvCell(val: string): string {
  return val.startsWith("'") && FORMULA_START.test(val.slice(1).replace(/^'+/, '')) ? val.slice(1) : val;
}

/** Split one CSV record into fields (quotes, "" escapes and commas in quotes). */
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields.map(unguardCsvCell);
}

/** Split CSV text into records, keeping line breaks inside quoted fields. */
export function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

/**
 * Column names an imported file may not set as an entry's custom fields: the
 * app's own keys (they start with "_": dose and schedule links, import keys,
 * the bookmark…), the public-shelf flag — which would publish the row without
 * the owner's tap — and names that mean something to JavaScript objects.
 */
export function isReservedImportColumn(header: string): boolean {
  const name = header.trim();
  return name.startsWith('_') || ['onpublicshelf', 'constructor', 'prototype', '__proto__'].includes(name.toLowerCase())
    || STRUCTURED_FIELDS.has(name.toLowerCase());
}

/**
 * The forms' fields that hold a list or an object (a shopping list's items, a
 * medication's reminder times, a recipe's steps…). An import writes text and
 * yes / no only, so a column of one of these names would put text where every
 * view expects a list — which once took the whole app down on each load. Such
 * a column is left out; the row's other columns are imported as usual.
 */
const STRUCTURED_FIELDS = new Set([
  'items', 'scheduletimes', 'repeatdays', 'ingredients', 'days', 'steps', 'phases', 'categories',
  'routineitemsdone', 'checklist', 'wins', 'priorities', 'cover', 'meals', 'nutrientsource', 'slots', 'times',
  'tags', 'linkedrecipeids', 'linkedshoppinglistids', 'payments', 'sessions', 'areas', 'blockers',
]);

const IMPORT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMPORT_TIME = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * An imported row's custom fields, made safe to file. The file may be someone
 * else's, and its columns land in the same fields the forms write, so:
 *
 * - a date or time field (a name ending in Date / Time, or one of the other
 *   date keys) keeps its value only when it is a date or a time. Those values
 *   are written as they are into the calendar feed and compared as text
 *   elsewhere, so free text there is dropped;
 * - a row filed under Event or Meeting (`calendarTopic`) never goes to Google
 *   Calendar or the Apple feed on its own: it starts with "Sync to calendar"
 *   off, whatever the file says, and the owner turns it on per entry. A file
 *   from elsewhere can't put events on the owner's calendar, and an export
 *   brought back in doesn't push every event a second time.
 */
export function guardImportedFields(fields: Record<string, unknown>, { calendarTopic }: { calendarTopic: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      const isDate = /Date$/.test(key) || key === 'startOn' || key === 'repeatUntil';
      const isTime = /Time$/.test(key);
      if (isDate && !IMPORT_DATE.test(value)) continue;
      if (isTime && !IMPORT_TIME.test(value)) continue;
    }
    out[key] = value;
  }
  if (calendarTopic) out.noCalendarSync = true;
  return out;
}

/*
 * A custom field's value as the text of one export cell. Fields that hold a
 * list or an object (a recipe's ingredients and steps, a shopping list's
 * items, a to-do list, wins, priorities, a training plan's categories and
 * phases, a meal's nutrient sources, a media cover) are written out in words:
 * `String()` on them gave "[object Object]". Pure.
 *
 * `row` is the entry's whole fields record: an object keyed by another item's
 * id (a phase's hours per category) is written with that item's name.
 */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const words = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
// Never the picture itself: a cover is a data URL of many kilobytes
const isData = (v: unknown): boolean => typeof v === 'string' && v.startsWith('data:');
const LEAD_KEYS = new Set(['id', 'key', 'checked', 'done', 'amount', 'name', 'title', 'label', 'text']);

function namesIn(row: Record<string, unknown> | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const v of Object.values(row ?? {})) {
    if (!Array.isArray(v)) continue;
    for (const item of v) if (isObj(item) && typeof item.id === 'string' && words(item.name)) out.set(item.id, words(item.name));
  }
  return out;
}

function fieldText(v: unknown, names: Map<string, string>, depth: number): string {
  if (v == null || isData(v) || depth > 6) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.map(i => fieldText(i, names, depth + 1)).filter(Boolean).join(depth === 0 ? ' | ' : ', ');
  const o = v as Record<string, unknown>;
  // What the item is: "2 cups rice", "Title: text", "[x] Milk"
  const main = words(o.name) || words(o.title) || words(o.label);
  const text = words(o.text);
  let lead = [words(o.amount), main && text ? `${main}: ${text}` : main || text].filter(Boolean).join(' ');
  if (lead && ('checked' in o || 'done' in o)) lead = `${o.checked === true || o.done === true ? '[x]' : '[ ]'} ${lead}`;
  const rest: string[] = [];
  for (const [k, val] of Object.entries(o)) {
    if (k.startsWith('_') || (lead && LEAD_KEYS.has(k))) continue;
    const t = fieldText(val, names, depth + 1);
    if (t) rest.push(`${names.get(k) ?? k}: ${t}`);
  }
  if (!lead) return rest.join(', ');
  return rest.length ? `${lead} (${rest.join(', ')})` : lead;
}

export function csvFieldText(value: unknown, row?: Record<string, unknown>): string {
  return fieldText(value, namesIn(row), 0);
}
