import { describe, it, expect, beforeEach } from 'vitest';
import { entryOutline, clearEntryOutlineCache } from '@/utils/entryOutline';

describe('entryOutline', () => {
  beforeEach(() => clearEntryOutlineCache());

  it('takes the first two lines and counts paragraphs', () => {
    const o = entryOutline('<h1>Title</h1><p>Second line</p><p>Third</p>');
    expect(o).toMatchObject({ title: 'Title', note: 'Second line', titleCode: false, noteCode: false, lines: 3 });
  });

  it('keeps the paragraphs of a quote apart', () => {
    const o = entryOutline('<blockquote><p>a</p><p>b</p></blockquote>');
    expect(o).toMatchObject({ title: 'a', note: 'b', lines: 2 });
  });

  it('reads nested lists item by item', () => {
    const o = entryOutline('<ul><li><p>one</p><ul><li><p>two</p></li><li><p>three</p></li></ul></li></ul>');
    expect(o).toMatchObject({ title: 'one', note: 'two', lines: 3 });
    const bare = entryOutline('<ul><li>first<ul><li>inner</li></ul></li><li>last</li></ul>');
    expect(bare).toMatchObject({ title: 'first', note: 'inner', lines: 3 });
  });

  it('counts a code block one line per line, in code type', () => {
    const o = entryOutline('<pre><code>\nconst a = 1;\nconst b = 2;</code></pre><p>after</p>');
    expect(o).toMatchObject({ title: 'const a = 1;', titleCode: true, note: 'after', noteCode: false, lines: 4 });
  });

  it('skips empty paragraphs and reads plain text by its lines', () => {
    expect(entryOutline('<p></p><p>  </p><p>only</p>')).toMatchObject({ title: 'only', note: '', lines: 1 });
    expect(entryOutline('first\nsecond\n\nthird')).toMatchObject({ title: 'first', note: 'second', lines: 3 });
  });
});
