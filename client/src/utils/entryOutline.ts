import { stripHtml } from './stripHtml.js';

/*
 * What a text entry's list row shows (a topic's page): its first line as the
 * title, the next as a muted line, either one set in code type when it's a
 * code block, and how many lines the entry runs to. Cached by HTML, like
 * entryTitleText, and cleared when the session ends (it's decrypted text).
 */

export interface EntryOutline {
  title: string;
  /** The title is a line of code (the entry starts with a code block) */
  titleCode: boolean;
  /** The next line, '' when there's none */
  note: string;
  noteCode: boolean;
  /** Lines of text: a paragraph, heading or list item is one, a code block one per line */
  lines: number;
}

const BLOCK = /<pre\b[^>]*>([\s\S]*?)<\/pre>|<(p|h[1-6]|li|blockquote|div)\b[^>]*>([\s\S]*?)<\/\2>/gi;
const TITLE_MAX = 120;
const NOTE_MAX = 160;

function compute(html: string): EntryOutline {
  const blocks: { text: string; code: boolean }[] = [];
  let lines = 0;
  let found = false;
  for (const m of html.matchAll(BLOCK)) {
    found = true;
    if (m[1] !== undefined) {
      // A code block: its own lines, as written (the first non-empty one stands for it)
      const codeLines = stripHtml(m[1]).replace(/\n+$/, '').split('\n');
      lines += codeLines.length;
      const first = codeLines.find(l => l.trim()) ?? '';
      if (first) blocks.push({ text: first.trimEnd(), code: true });
    } else {
      const text = stripHtml(m[3]).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      lines += 1;
      blocks.push({ text, code: false });
    }
  }
  // Plain text with no blocks (an older or imported entry): its own lines
  if (!found) {
    const plain = stripHtml(html).split('\n').map(l => l.trim()).filter(Boolean);
    lines = plain.length;
    plain.forEach(text => blocks.push({ text, code: false }));
  }
  const [first, second] = blocks;
  return {
    title: (first?.text ?? '').slice(0, TITLE_MAX),
    titleCode: !!first?.code,
    note: (second?.text ?? '').slice(0, NOTE_MAX),
    noteCode: !!second?.code,
    lines,
  };
}

const cache = new Map<string, EntryOutline>();
const MAX = 5000;

export function entryOutline(html: string): EntryOutline {
  const hit = cache.get(html);
  if (hit) return hit;
  const outline = compute(html);
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(html, outline);
  return outline;
}

/** Forget every cached outline (decrypted text): called when the session ends */
export function clearEntryOutlineCache(): void {
  cache.clear();
}
