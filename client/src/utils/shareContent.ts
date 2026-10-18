import { shareContentHasMedia } from '@shared/validation/schemas.js';

/* Shares never include images: photos, drawings (SVG) or other embedded media
   are removed from the entry's HTML before it is sent. The server rejects
   anything that still carries one (shareContentHasMedia, createShareSchema). */

const MEDIA_SELECTOR = 'img, svg, picture, source, video, audio, iframe, object, embed, canvas, image, [data-type="drawing"]';

/** The entry's HTML with every image, drawing and embedded media removed. */
export function stripMediaForShare(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll(MEDIA_SELECTOR).forEach(el => el.remove());
  // Inline backgrounds can carry images too
  doc.body.querySelectorAll<HTMLElement>('[style]').forEach(el => {
    if (/url\(/i.test(el.getAttribute('style') ?? '')) el.removeAttribute('style');
  });
  // Figures and paragraphs left empty by the removal
  doc.body.querySelectorAll('figure, p').forEach(el => {
    if (!el.textContent?.trim() && !el.querySelector('br, hr')) el.remove();
  });
  return doc.body.innerHTML;
}

export { shareContentHasMedia };
