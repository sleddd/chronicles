/* Minimal CSV reading/writing for Settings → Data → Export / Import Entries. */

// Spreadsheets run a cell starting with one of these as a formula (CSV
// injection). Exported cells get a leading apostrophe; import takes it off.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: formula-guarded, quoted when it holds a quote, comma or line break. */
export function csvCell(val: string): string {
  const guarded = FORMULA_START.test(val) ? `'${val}` : val;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Undo `csvCell`'s formula guard on a parsed field. */
export function unguardCsvCell(val: string): string {
  return val.startsWith("'") && FORMULA_START.test(val.slice(1)) ? val.slice(1) : val;
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
