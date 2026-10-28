import { describe, it, expect } from 'vitest';
import { trustedHTML, trustedScriptURL } from '@/security/trustedTypes';

describe('Trusted Types default policy', () => {
  it('keeps everything the editor writes, drawings included', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>';
    const entry = [
      '<h2>Day</h2><p>Some <strong>bold</strong>, <em>italic</em>, <s>struck</s> and <code>code</code>.</p>',
      '<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol><blockquote><p>q</p></blockquote>',
      '<pre><code>x = 1</code></pre><hr><p>line<br>break</p>',
    ].join('');
    expect(trustedHTML(entry)).toBe(entry);
    const drawing = document.createElement('div');
    drawing.setAttribute('data-type', 'drawing');
    drawing.setAttribute('svgcontent', svg);
    const out = document.createElement('div');
    out.innerHTML = trustedHTML(drawing.outerHTML);
    expect(out.firstElementChild?.getAttribute('data-type')).toBe('drawing');
    expect(out.firstElementChild?.getAttribute('svgcontent')).toBe(svg);
  });

  it('strips what would run as code', () => {
    const out = trustedHTML('<p>hi</p><img src="x" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><iframe src="https://evil.example"></iframe>');
    expect(out).not.toMatch(/onerror|<script|javascript:|<iframe/i);
    expect(out).toContain('<p>hi</p>');
  });

  it('allows only this site\'s own script URLs', () => {
    const base = 'https://chronicles.example/journal';
    expect(trustedScriptURL('/sw.js', base)).toBe('/sw.js');
    expect(trustedScriptURL('https://chronicles.example/assets/a.js', base)).toBe('https://chronicles.example/assets/a.js');
    expect(() => trustedScriptURL('https://evil.example/x.js', base)).toThrow();
    expect(() => trustedScriptURL('data:text/javascript,alert(1)', base)).toThrow();
  });
});

describe('links kept by the policy', () => {
  it('a link opening a new tab always carries rel=noopener', () => {
    const out = trustedHTML('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});
