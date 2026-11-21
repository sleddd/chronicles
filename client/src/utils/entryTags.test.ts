import { describe, it, expect } from 'vitest';
import { cleanTag, tagsInUse, tagsOf, withTag, withoutTag } from './entryTags.js';
import { entryOutline } from './entryOutline.js';

describe('entry tags', () => {
  it('keeps tags tidy, once each', () => {
    expect(cleanTag('  React\n hooks  ')).toBe('React hooks');
    expect(tagsOf({ tags: ['PHP', 'php', 3, ' CSS '] })).toEqual(['PHP', 'CSS']);
    expect(tagsOf({ tags: 'PHP' })).toEqual([]);
    expect(withTag(['PHP'], 'php')).toEqual(['PHP']);
    expect(withTag(['PHP'], ' CSS ')).toEqual(['PHP', 'CSS']);
    expect(withoutTag(['PHP', 'CSS'], 'css')).toEqual(['PHP']);
  });

  it('lists the tags in use, most used first', () => {
    expect(tagsInUse([{ tags: ['PHP', 'CSS'] }, { tags: ['php'] }, undefined, { tags: ['React'] }])).toEqual(['PHP', 'CSS', 'React']);
  });
});

describe('entryOutline', () => {
  it('takes the first line as the title and the next as its note, counting lines', () => {
    const o = entryOutline('<p>Code exercises</p><p>Reverse a linked list</p><ul><li><p>Then recursively</p></li></ul>');
    expect(o).toEqual({ title: 'Code exercises', titleCode: false, note: 'Reverse a linked list', noteCode: false, lines: 3 });
  });

  it('marks code, and counts a code block line by line', () => {
    const o = entryOutline('<p>Debounce helper</p><pre><code>const debounce = (fn, ms = 200) =&gt; {\n  return fn;\n}</code></pre>');
    expect(o.title).toBe('Debounce helper');
    expect(o.note).toBe('const debounce = (fn, ms = 200) => {');
    expect(o.noteCode).toBe(true);
    expect(o.lines).toBe(4);
    expect(entryOutline('<pre><code>export function Card() {}</code></pre>').titleCode).toBe(true);
  });

  it('reads plain text with no blocks', () => {
    expect(entryOutline('one\ntwo').lines).toBe(2);
    expect(entryOutline('').lines).toBe(0);
  });
});
