import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { DrawingNode } from '@/components/tiptap/DrawingNode';

// The journal editor's extension set (minus UI-only plugins), unmocked, so a
// TipTap upgrade that changes how saved entries load or serialize shows up here
let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

function roundTrip(html: string): string {
  editor = new Editor({
    extensions: [StarterKit.configure({ link: false, underline: false, trailingNode: false }), DrawingNode],
    content: html,
  });
  return editor.getHTML();
}

describe('TipTap round-trip of saved entry HTML', () => {
  it.each([
    '<p>Plain <strong>bold</strong> <em>italic</em> <s>strike</s> <code>code</code></p>',
    '<ul><li><p>one</p></li><li><p>two</p></li></ul>',
    '<ol><li><p>first</p></li></ol>',
    '<blockquote><p>quoted</p></blockquote>',
    '<pre><code>let x = 1;</code></pre>',
    '<h2>Heading</h2><p>after</p>',
    '<p>above</p><hr><p>below</p>',
  ])('keeps %s unchanged', (html) => {
    expect(roundTrip(html)).toBe(html);
  });

  it('does not add a trailing empty paragraph after a block', () => {
    expect(roundTrip('<blockquote><p>q</p></blockquote>')).toBe('<blockquote><p>q</p></blockquote>');
  });

  it('does not turn link markup into live links (Link is off)', () => {
    expect(roundTrip('<p><a href="javascript:alert(1)">x</a></p>')).toBe('<p>x</p>');
  });

  it('keeps a drawing node and its SVG, stable across saves', () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"></path></svg>';
    const once = roundTrip(`<div data-type="drawing" svgcontent="${svg.replace(/"/g, '&quot;')}"></div>`);
    expect(once).toContain('data-type="drawing"');
    expect(editor!.getJSON().content?.[0].attrs?.svgContent).toBe(svg);
    editor!.destroy();
    expect(roundTrip(once)).toBe(once);
  });

  it('ignores __proto__ attribute keys (GHSA mergeAttributes fix)', () => {
    editor = new Editor({ extensions: [StarterKit.configure({ link: false, underline: false, trailingNode: false })] });
    const json = JSON.parse('{"type":"doc","content":[{"type":"paragraph","attrs":{"__proto__":{"onclick":"alert(1)"}},"content":[{"type":"text","text":"hi"}]}]}');
    editor.commands.setContent(json);
    expect(editor.getHTML()).toBe('<p>hi</p>');
  });
});
