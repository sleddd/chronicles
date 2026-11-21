import DOMPurify from 'dompurify';
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

/** Elements that start a line of their own; lists and quotes only hold them */
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'DIV', 'UL', 'OL', 'PRE']);
const TITLE_MAX = 120;
const NOTE_MAX = 160;

type Line = { text: string; code: boolean };

const isBlock = (node: Node): node is Element => node.nodeType === 1 && BLOCK_TAGS.has((node as Element).tagName);
/** A block that holds lines of its own (a list, a quote of paragraphs) */
const HOLDS_LINES = 'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, div';

/**
 * The entry's lines in order, from its leaf blocks: a paragraph, heading or list
 * item with no block inside it is one line, so a quote of two paragraphs or a
 * nested list is two lines, never merged. Text sitting beside blocks in a
 * container (a list item's own words before its sub-list) is a line too.
 */
function collect(parent: ParentNode, lines: Line[]): number {
  let count = 0;
  let run = '';
  const flush = () => {
    const text = run.replace(/\s+/g, ' ').trim();
    run = '';
    if (!text) return;
    count += 1;
    lines.push({ text, code: false });
  };
  for (const node of Array.from(parent.childNodes)) {
    if (!isBlock(node)) {
      run += node.textContent ?? '';
      continue;
    }
    flush();
    if (node.tagName === 'PRE') {
      // A code block: its own lines, as written (the first non-empty one stands for it)
      const codeLines = (node.textContent ?? '').replace(/\n+$/, '').split('\n');
      count += codeLines.length;
      const first = codeLines.find(l => l.trim()) ?? '';
      if (first) lines.push({ text: first.trimEnd(), code: true });
    } else if (node.querySelector(HOLDS_LINES)) {
      count += collect(node, lines);
    } else {
      run = node.textContent ?? '';
      flush();
    }
  }
  flush();
  return count;
}

function compute(html: string): EntryOutline {
  // Walk DOMPurify's inert fragment: no innerHTML or DOMParser (Trusted Types)
  const frag = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  const blocks: Line[] = [];
  let lines: number;
  if (frag.querySelector(HOLDS_LINES)) {
    lines = collect(frag, blocks);
  } else {
    // Plain text with no blocks (an older or imported entry): its own lines
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
