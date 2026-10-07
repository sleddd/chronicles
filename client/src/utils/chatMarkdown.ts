/**
 * A tiny, safe Markdown subset for chat replies: paragraphs, headings,
 * bullet and numbered lists, **bold**, *italic* and `code`. It produces a
 * plain data tree that the chat renders as React elements — no HTML is ever
 * injected, so model output can't smuggle markup into the page.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'italic'; children: Inline[] }
  | { kind: 'code'; text: string };

export type Block =
  | { kind: 'p'; lines: Inline[][] }
  | { kind: 'heading'; children: Inline[] }
  | { kind: 'ul'; items: Inline[][] }
  | { kind: 'ol'; start: number; items: Inline[][] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/** Inline spans: `code` first (its contents stay literal), then **bold**, then *italic* / _italic_. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    const tok = m[0];
    if (m[1]) out.push({ kind: 'code', text: tok.slice(1, -1) });
    else if (m[2]) out.push({ kind: 'bold', children: parseInline(tok.slice(2, -2)) });
    else out.push({ kind: 'italic', children: parseInline(tok.slice(1, -1)) });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function parseChatMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: Inline[][] = [];
  const flush = () => { if (para.length) { blocks.push({ kind: 'p', lines: para }); para = []; } };

  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }

    const h = line.match(HEADING);
    if (h) { flush(); blocks.push({ kind: 'heading', children: parseInline(h[1]) }); continue; }

    const b = line.match(BULLET);
    if (b) {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === 'ul') prev.items.push(parseInline(b[1]));
      else blocks.push({ kind: 'ul', items: [parseInline(b[1])] });
      continue;
    }

    const n = line.match(NUMBERED);
    if (n) {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === 'ol') prev.items.push(parseInline(n[2]));
      else blocks.push({ kind: 'ol', start: Number(n[1]), items: [parseInline(n[2])] });
      continue;
    }

    para.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}
