/**
 * Today's wins (dashboard card): what you achieved each day, stored as one
 * entry a day in the Wins topic — `wins` items in its fields, and a text of
 * "Wins: 11/04/2026" over the wins as a list, so the journal lists, searches
 * and shows them like any other entry.
 */

export interface WinItem { id: string; text: string }

const pad = (n: number) => String(n).padStart(2, '0');

/** A day's title: "Wins: 11/04/2026" */
export function winsTitle(date = new Date()): string {
  return `Wins: ${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The entry text: the title, then each win as a list item */
export function winsContent(title: string, wins: WinItem[]): string {
  const items = wins.map(w => w.text.trim()).filter(Boolean);
  return `<p>${escapeHtml(title)}</p>${items.length ? `<ul>${items.map(t => `<li><p>${escapeHtml(t)}</p></li>`).join('')}</ul>` : ''}`;
}

/** The title already on an entry's text ("Wins: …"), else today's */
export function winsTitleOf(content: string, fallback = new Date()): string {
  const m = /Wins: \d{2}\/\d{2}\/\d{4}/.exec(content);
  return m ? m[0] : winsTitle(fallback);
}

/** Only well-formed items (the fields are user data) */
export function winsOf(fields: Record<string, unknown> | undefined): WinItem[] {
  const raw = fields?.wins;
  if (!Array.isArray(raw)) return [];
  return raw.filter((w): w is WinItem => !!w && typeof w === 'object' && typeof (w as WinItem).id === 'string' && typeof (w as WinItem).text === 'string');
}
