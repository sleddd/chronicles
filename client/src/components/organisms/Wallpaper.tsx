import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useUIStore } from '../../stores/uiStore.js';
import { shownWallpaper, wallpaperById, wallpaperSrc } from '../../utils/wallpapers.js';

/* The chosen wallpaper (Settings → Theme → Background, off by default): the
   photo across the top of the page it's placed in, fading into the page
   colour, scrolling away with the page. Its parent is a positioned stacking
   context (isolation: isolate) so the photo sits under the page's content but
   over its background. While it shows, <html data-wallpaper> turns the
   cards and controls over it to glass (styles/wallpaper.ts). */

const Layer = styled.div<{ $src: string; $shown: boolean; $height: string; $solid?: number; $shade: number }>`
  position: absolute;
  inset: 0 0 auto 0;
  height: ${({ $height }) => $height};
  z-index: -1;
  pointer-events: none;
  opacity: ${({ $shown }) => ($shown ? 1 : 0)};
  /* The photo itself (its own layer, so dimming it never greys the wash over it) */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url(${({ $src }) => $src}) center 55% / cover no-repeat;
  }
  /* Light theme: a bright photo (white sky, snow) is faded a little — dimmer and
     softer — so it doesn't glare against the light page; the brighter, the more */
  html[data-theme='light'] &::before {
    filter: ${({ $shade }) => `brightness(${(1 - Math.min(0.6, $shade) * 0.25).toFixed(3)}) contrast(${(1 - Math.min(0.6, $shade) * 0.15).toFixed(3)})`};
  }
  transition: opacity 0.4s ease;
  /* A long, eased fade (no visible edge): solid at the top, thinning out
     gradually from a quarter of the way down */
  --fade: linear-gradient(to bottom, #000 0%, #000 22%, rgba(0, 0, 0, 0.88) 34%, rgba(0, 0, 0, 0.7) 46%,
    rgba(0, 0, 0, 0.48) 58%, rgba(0, 0, 0, 0.28) 70%, rgba(0, 0, 0, 0.12) 82%, rgba(0, 0, 0, 0.03) 92%, transparent 100%);
  -webkit-mask-image: var(--fade);
  mask-image: var(--fade);
  /* Light: the photo sits exactly as in dark (same box, same crop); only the fade
     starts lower — solid to 30% of the way down — then eases out gently the
     rest of the way, never a sharp line */
  html[data-theme='light'] & {
    --fade: linear-gradient(to bottom, #000 0%, #000 30%, rgba(0, 0, 0, 0.9) 37.5%, rgba(0, 0, 0, 0.76) 45%,
      rgba(0, 0, 0, 0.6) 52.5%, rgba(0, 0, 0, 0.45) 60%, rgba(0, 0, 0, 0.32) 67.5%, rgba(0, 0, 0, 0.21) 75%,
      rgba(0, 0, 0, 0.12) 82.5%, rgba(0, 0, 0, 0.05) 90%, rgba(0, 0, 0, 0.015) 96%, transparent 100%);
  }
  /* A light shade at the top, so the white title reads on a bright photo */
  /* A bright photo ($shade, measured when it loads) gets as much more as its
     white text needs; a dark one keeps these */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    /* Light: darker behind the white title and the controls beside it (the top
       130px), then a wash of the page colour from where the content starts — sooner
       and fuller, so the photo blends into the light page and the dark text of
       lists and cards always sits on a light ground over it */
    background: linear-gradient(to bottom, ${({ $shade }) => `rgba(0, 0, 0, ${Math.max(0.26, $shade)}) 0, rgba(0, 0, 0, ${Math.max(0.12, $shade * 0.85)}) 180px,
      color-mix(in srgb, var(--bg-app) 30%, transparent) 280px, color-mix(in srgb, var(--bg-app) 52%, transparent) 380px,
      color-mix(in srgb, var(--bg-app) 72%, transparent) 500px, color-mix(in srgb, var(--bg-app) 88%, transparent) 100%`});
  }
  /* Dark: deeper, so a bright photo still sits in the dark page */
  html[data-theme='dark'] &::after {
    background: linear-gradient(to bottom, ${({ $shade }) => `rgba(0, 0, 0, ${Math.max(0.42, $shade + 0.08)}), rgba(0, 0, 0, ${Math.max(0.36, $shade + 0.06)}) 60%, rgba(0, 0, 0, ${Math.max(0.24, $shade * 0.6 + 0.06)})`});
  }
  /* Solid down to a point (the dashboard's Quick entry, written straight on the
     photo), then the same eased fade over the last FADE px; shaded a step
     deeper in both themes so the white text over it reads */
  ${({ $solid, $shade }) => ($solid === undefined ? '' : `
    --fade: linear-gradient(to bottom, #000 0, #000 ${$solid}px, rgba(0, 0, 0, 0.88) ${$solid + FADE * 0.14}px,
      rgba(0, 0, 0, 0.62) ${$solid + FADE * 0.34}px, rgba(0, 0, 0, 0.32) ${$solid + FADE * 0.58}px,
      rgba(0, 0, 0, 0.1) ${$solid + FADE * 0.82}px, transparent ${$solid + FADE}px);
    &::after, html[data-theme='dark'] &::after {
      background: linear-gradient(to bottom, rgba(0, 0, 0, ${Math.max(0.42, $shade + 0.08)}), rgba(0, 0, 0, ${Math.max(0.36, $shade + 0.06)}) ${$solid}px, rgba(0, 0, 0, ${Math.max(0.22, $shade * 0.6 + 0.06)}));
    }
    /* Light: past the solid part a long, gentle fade, washing into the page colour
       as it goes — never a sharp line */
    html[data-theme='light'] & {
      --fade: linear-gradient(to bottom, #000 0, #000 ${$solid + LIGHT_HOLD}px, rgba(0, 0, 0, 0.86) ${$solid + LIGHT_HOLD + (FADE - LIGHT_HOLD) * 0.12}px,
        rgba(0, 0, 0, 0.68) ${$solid + LIGHT_HOLD + (FADE - LIGHT_HOLD) * 0.26}px, rgba(0, 0, 0, 0.5) ${$solid + LIGHT_HOLD + (FADE - LIGHT_HOLD) * 0.42}px,
        rgba(0, 0, 0, 0.32) ${$solid + LIGHT_HOLD + (FADE - LIGHT_HOLD) * 0.58}px, rgba(0, 0, 0, 0.17) ${$solid + LIGHT_HOLD + (FADE - LIGHT_HOLD) * 0.74}px,
        rgba(0, 0, 0, 0.06) ${$solid + LIGHT_HOLD + (FADE - LIGHT_HOLD) * 0.88}px, transparent ${$solid + FADE}px);
    }
    html[data-theme='light'] &::after {
      background: linear-gradient(to bottom, rgba(0, 0, 0, ${Math.max(0.36, $shade)}), rgba(0, 0, 0, ${Math.max(0.3, $shade)}) ${$solid + LIGHT_HOLD}px,
        color-mix(in srgb, var(--bg-app) 35%, transparent) ${$solid + LIGHT_HOLD + (FADE - LIGHT_HOLD) * 0.25}px,
        color-mix(in srgb, var(--bg-app) 65%, transparent) ${$solid + LIGHT_HOLD + (FADE - LIGHT_HOLD) * 0.55}px,
        color-mix(in srgb, var(--bg-app) 88%, transparent) ${$solid + FADE}px);
    }
  `)}
  @media print { display: none; }
`;

/* ── How much tint a photo needs ──
   White text needs 4.5:1 (small text) against what's behind it: a luminance of
   at most 0.183 once the black tint is laid over. Measured on a small copy of
   the photo at its bright end (the 85th percentile pixel, so a bright patch of
   sky counts, not just the average): a near-white photo needs ~0.54, a dark
   one nothing extra. Capped so the photo never turns to black. */
const MAX_SHADE = 0.6;

const shadeCache = new Map<string, number>();

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (r: number, g: number, b: number) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** The black tint (0–1) white text needs over a pixel of this colour (sRGB, 0–1) */
export function shadeFor(r: number, g: number, b: number): number {
  if (luminance(r, g, b) <= 0.183) return 0;
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const a = (lo + hi) / 2;
    if (luminance(r * (1 - a), g * (1 - a), b * (1 - a)) > 0.183) lo = a; else hi = a;
  }
  return hi;
}

function measureShade(img: HTMLImageElement): number {
  try {
    const w = 64, h = 40;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const px: [number, number, number, number][] = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      px.push([luminance(r, g, b), r, g, b]);
    }
    px.sort((x, y) => x[0] - y[0]);
    const [, r, g, b] = px[Math.floor(px.length * 0.85)];
    return Math.min(MAX_SHADE, Math.round(shadeFor(r, g, b) * 100) / 100);
  } catch {
    return 0; // a canvas that can't be read (jsdom, a tainted image): the usual tint
  }
}

/** How far the photo takes to fade out below its solid part (`solid`) */
const FADE = 260;
/** Light theme: the fade below the solid part starts this much further down
 *  (the photo's box, and so its size and crop, stay the dark theme's) */
const LIGHT_HOLD = 55;

/** height: how far down the page the photo reaches before it has faded out.
 *  solid: instead, stay solid down to this many px, then fade over FADE px.
 *  follow: scroll away with the page. Most pages scroll inside a panel of their
 *  own (a full-height overflow box), not the element the photo sits in, so the
 *  photo follows that panel's scroll (smaller scrolling boxes — tables, the
 *  menu grid — are ignored). The journal passes false: its title row stays put. */
export function Wallpaper({ height = 'min(520px, 60vh)', follow = true, solid }: { height?: string; follow?: boolean; solid?: number } = {}) {
  const id = useUIStore(s => shownWallpaper(s.wallpaper, s.themeMode));
  const paper = wallpaperById(id);
  const src = paper ? wallpaperSrc(paper.id) : '';
  const [loaded, setLoaded] = useState<string | null>(null);
  const [shade, setShade] = useState(0);
  const layerRef = useRef<HTMLDivElement>(null);

  // Scroll away with the page's own scrolling panel
  useEffect(() => {
    const layer = layerRef.current;
    const host = layer?.parentElement;
    if (!layer || !host || !follow) return;
    layer.style.transform = '';
    const onScroll = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || t === host) return;
      if (t.clientHeight < host.clientHeight * 0.7) return; // a table, a grid — not the page
      layer.style.transform = t.scrollTop ? `translateY(${-t.scrollTop}px)` : '';
    };
    host.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => host.removeEventListener('scroll', onScroll, { capture: true });
  }, [follow, paper]); // each page mounts its own layer, so it starts unscrolled

  useEffect(() => {
    if (!paper) return;
    const root = document.documentElement;
    root.setAttribute('data-wallpaper', paper.id);
    return () => { root.removeAttribute('data-wallpaper'); };
  }, [paper]);

  // Fade in once the photo has loaded
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      if (!shadeCache.has(src)) shadeCache.set(src, measureShade(img));
      setShade(shadeCache.get(src)!);
      setLoaded(src);
    };
    img.src = src;
    return () => { img.onload = null; };
  }, [src]);

  if (!paper) return null;
  return <Layer ref={layerRef} $src={src} $shown={loaded === src} $height={solid === undefined ? height : `${solid + FADE}px`} $solid={solid} $shade={shade} aria-hidden="true" data-print-hide />;
}
