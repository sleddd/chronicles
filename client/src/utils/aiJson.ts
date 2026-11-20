const asObject = (value: unknown): Record<string, unknown> | null =>
  (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);

/**
 * A JSON answer that stopped part-way (the model ran out of room): everything
 * up to the last value that was finished, with the open lists and objects
 * closed. Null when nothing in it was finished.
 */
function closeCutJson(text: string): string | null {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  let safeEnd = -1;
  let safeOpen: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') open.push('}');
    else if (c === '[') open.push(']');
    else if (c === '}' || c === ']') {
      if (open.pop() !== c) return null;
      if (open.length === 0) return text.slice(0, i + 1);
      safeEnd = i + 1;
      safeOpen = [...open];
    }
  }
  return safeEnd < 0 ? null : text.slice(0, safeEnd) + safeOpen.reverse().join('');
}

/**
 * The first JSON object in a model's answer (models sometimes wrap it in words
 * or a code fence), or null. An answer that was cut off part-way is read as
 * far as it got, and `onCutShort` is told.
 */
export function firstJsonObject(text: string, onCutShort?: () => void): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  const end = text.lastIndexOf('}');
  if (end > start) {
    try { return asObject(JSON.parse(text.slice(start, end + 1))); } catch { /* cut off, or not JSON: try what was finished */ }
  }
  const closed = closeCutJson(text.slice(start));
  if (!closed) return null;
  try {
    const value = asObject(JSON.parse(closed));
    if (value) onCutShort?.();
    return value;
  } catch {
    return null;
  }
}

/** A rough size for a request, for the cost note ("About 2,400 tokens"): four characters a token */
export function approxTokens(...texts: string[]): number {
  const chars = texts.reduce((n, t) => n + t.length, 0);
  return Math.max(100, Math.round(chars / 4 / 100) * 100);
}

/** One line of the share prompt: what kind of thing is sent, and exactly which ones */
export interface SharedLine {
  label: string;
  /** The items by name, shown when the line is opened (empty when there's nothing to name) */
  items: string[];
}

/** Model output shown as text: one line, no control characters, cut to a length */
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
