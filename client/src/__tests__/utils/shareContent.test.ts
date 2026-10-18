import { describe, it, expect } from 'vitest';
import { stripMediaForShare, shareContentHasMedia } from '@/utils/shareContent';

describe('stripMediaForShare', () => {
  it('removes photos, drawings, SVG and media, keeping the text', () => {
    const html = '<p>Hello</p><p><img src="blob:x"></p><div data-type="drawing" data-svg="&lt;svg&gt;"></div><svg><circle/></svg><p>World</p><figure><img src="x"></figure><video src="v"></video>';
    const out = stripMediaForShare(html);
    expect(out).toBe('<p>Hello</p><p>World</p>');
    expect(shareContentHasMedia(out)).toBe(false);
  });
  it('drops inline background images', () => {
    expect(stripMediaForShare('<p style="background:url(data:image/png;base64,AA)">Hi</p>')).toBe('<p>Hi</p>');
  });
});

describe('shareContentHasMedia', () => {
  it.each([
    '<img src="x">', '<IMG SRC=x>', '<svg></svg>', '<div data-type="drawing"></div>',
    '<p style="background:url(https://x/y.png)">', 'data:image/png;base64,AA', '<picture>', '<iframe src=x>',
  ])('flags %s', c => expect(shareContentHasMedia(c)).toBe(true));
  it('passes plain text and formatting', () => {
    expect(shareContentHasMedia('<p><strong>Plain</strong> text — an image of hope</p>')).toBe(false);
  });
});
