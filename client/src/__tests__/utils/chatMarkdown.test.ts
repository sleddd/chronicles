import { describe, it, expect } from 'vitest';
import { parseChatMarkdown, parseInline } from '../../utils/chatMarkdown.js';

describe('parseInline', () => {
  it('parses bold, italic and code, keeping code literal', () => {
    expect(parseInline('a **b** *c* `d **e**`')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'italic', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'd **e**' },
    ]);
  });

  it('leaves lone asterisks and snake_case alone', () => {
    expect(parseInline('5 * 3 and file_name_here')).toEqual([{ kind: 'text', text: '5 * 3 and file_name_here' }]);
  });
});

describe('parseChatMarkdown', () => {
  it('splits paragraphs, headings and lists', () => {
    const blocks = parseChatMarkdown('## Plan\nFirst line\nsecond line\n\n- one\n- **two**\n\n1. a\n2. b\nAfter');
    expect(blocks.map(b => b.kind)).toEqual(['heading', 'p', 'ul', 'ol', 'p']);
    expect(blocks[1]).toEqual({ kind: 'p', lines: [[{ kind: 'text', text: 'First line' }], [{ kind: 'text', text: 'second line' }]] });
    expect(blocks[2].kind === 'ul' && blocks[2].items).toHaveLength(2);
    expect(blocks[3].kind === 'ol' && blocks[3].start).toBe(1);
  });

  it('keeps a /save suggestion as a code span', () => {
    const [p] = parseChatMarkdown('Want to keep it?\n`/save Journal Walk after lunch`');
    expect(p.kind === 'p' && p.lines[1]).toEqual([{ kind: 'code', text: '/save Journal Walk after lunch' }]);
  });

  it('never produces HTML — tags stay as text', () => {
    const [p] = parseChatMarkdown('<img src=x onerror=alert(1)>');
    expect(p).toEqual({ kind: 'p', lines: [[{ kind: 'text', text: '<img src=x onerror=alert(1)>' }]] });
  });
});
