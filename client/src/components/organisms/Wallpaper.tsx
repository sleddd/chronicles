import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useUIStore } from '../../stores/uiStore.js';
import { CUSTOM_WALLPAPER, DEFAULT_WALLPAPERS, shownWallpaper, wallpaperById, wallpaperSrc } from '../../utils/wallpapers.js';
import { useImagesReady } from '../../hooks/useImagesReady.js';
import { useDecryptedImage } from '../../hooks/useDecryptedImage.js';
import { useEntriesStore } from '../../stores/entriesStore.js';

/* The chosen wallpaper (Settings → Theme → Background, off by default): the
   photo across the top of the page it's placed in, fading into the page
   colour, scrolling away with the page. Its parent is a positioned stacking
   context (isolation: isolate) so the photo sits under the page's content but
   over its background. While it shows, <html data-wallpaper> turns the
   cards and controls over it to glass (styles/wallpaper.ts). */

const Layer = styled.div<{ $src: string; $shown: boolean; $height: string; $solid?: number; $shade: number; $footFade?: boolean }>`
  position: absolute;
  inset: 0 0 auto 0;
  height: ${({ $height }) => $height};
  z-index: -1;
  pointer-events: none;
  opacity: ${({ $shown }) => ($shown ? 1 : 0)};
  /* The photo itself, on its own layer under the shade */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url(${({ $src }) => $src}) center 65% / cover no-repeat;
  }
  transition: opacity 0.4s ease;
  /* A long, eased fade (no visible edge): solid at the top, thinning out
     gradually from a quarter of the way down */
  --fade: linear-gradient(to bottom, #000 0%, #000 22%, rgba(0, 0, 0, 0.88) 34%, rgba(0, 0, 0, 0.7) 46%,
    rgba(0, 0, 0, 0.48) 58%, rgba(0, 0, 0, 0.28) 70%, rgba(0, 0, 0, 0.12) 82%, rgba(0, 0, 0, 0.03) 92%, transparent 100%);
  -webkit-mask-image: var(--fade);
  mask-image: var(--fade);
  /* Light theme fades differ by page (the photo itself never moves):
     - content pages: full strength behind the title row (LIGHT_TITLE_ROW, so the white title reads),
       then a quick fade that has all but gone by the tabs, and is gone by 62% — so the tabs and
       what's under them (the Planner's days, a list's first rows) sit on the page, not on the photo
     - the journal ($footFade): full strength for its top four-fifths, blending out over the last fifth
     - the dashboard ($solid, below): solid down to the Quick entry, then its usual fade */
  ${({ $solid, $footFade }) => ($solid !== undefined ? '' : $footFade ? `
    html[data-theme='light'] & {
      --fade: linear-gradient(to bottom, #000 0%, #000 80%, rgba(0, 0, 0, 0.82) 86%, rgba(0, 0, 0, 0.55) 91%,
        rgba(0, 0, 0, 0.25) 96%, transparent 100%);
    }
  ` : `
    html[data-theme='light'] & {
      /* Eased (no visible line where it starts): it begins a little above the title row's foot and
         thins out gradually through the tabs */
      --fade: linear-gradient(to bottom, #000 0, #000 ${LIGHT_TITLE_ROW - 40}px, rgba(0, 0, 0, 0.95) ${LIGHT_TITLE_ROW - 24}px,
        rgba(0, 0, 0, 0.86) ${LIGHT_TITLE_ROW - 8}px, rgba(0, 0, 0, 0.72) ${LIGHT_TITLE_ROW + 10}px,
        rgba(0, 0, 0, 0.55) ${LIGHT_TITLE_ROW + 30}px, rgba(0, 0, 0, 0.38) ${LIGHT_TITLE_ROW + 52}px,
        rgba(0, 0, 0, 0.22) ${LIGHT_TITLE_ROW + 76}px, rgba(0, 0, 0, 0.1) ${LIGHT_TITLE_ROW + 102}px,
        rgba(0, 0, 0, 0.03) ${LIGHT_TITLE_ROW + 130}px, transparent 62%);
    }
  `)}
  /* The same dark shade in both themes, so the white title and buttons read on the photo in light
     theme as they do in dark — no page-colour wash */
  /* A light shade at the top, so the white title reads on a bright photo */
  /* A bright photo ($shade, measured when it loads) gets as much more as its
     white text needs; a dark one keeps these */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, ${({ $shade }) => `rgba(0, 0, 0, ${Math.max(0.35, $shade + 0.01)}), rgba(0, 0, 0, ${Math.max(0.29, $shade - 0.01)}) 60%, rgba(0, 0, 0, ${Math.max(0.17, $shade * 0.6 - 0.01)})`});
  }
  /* Solid down to a point (the dashboard's Quick entry, written straight on the
     photo), then the same eased fade over the last FADE px; shaded a step
     deeper in both themes so the white text over it reads */
  ${({ $solid, $shade }) => ($solid === undefined ? '' : `
    --fade: linear-gradient(to bottom, #000 0, #000 ${$solid}px, rgba(0, 0, 0, 0.88) ${$solid + FADE * 0.14}px,
      rgba(0, 0, 0, 0.62) ${$solid + FADE * 0.34}px, rgba(0, 0, 0, 0.32) ${$solid + FADE * 0.58}px,
      rgba(0, 0, 0, 0.1) ${$solid + FADE * 0.82}px, transparent ${$solid + FADE}px);
    &::after {
      background: linear-gradient(to bottom, rgba(0, 0, 0, ${Math.max(0.35, $shade + 0.01)}), rgba(0, 0, 0, ${Math.max(0.29, $shade - 0.01)}) ${$solid}px, rgba(0, 0, 0, ${Math.max(0.15, $shade * 0.6 - 0.01)}));
    }
  `)}
  /* The picture sits at center 65% in both themes (55% before — lifted a little) — there is no light-only position */
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
/** Light theme, content pages: how far down the photo stays solid — to the foot of the title and its
 *  controls; it has all but faded by the section tabs under them (dark text in light), ~50px lower */
const LIGHT_TITLE_ROW = 80;
/** The photo's height on an ordinary page */
const STANDARD_HEIGHT = 'min(520px, 60vh)';

/** height: how far down the page the photo reaches before it has faded out.
 *  solid: instead, stay solid down to this many px, then fade over FADE px.
 *  follow: scroll away with the page. Most pages scroll inside a panel of their
 *  own (a full-height overflow box), not the element the photo sits in, so the
 *  photo follows that panel's scroll (smaller scrolling boxes — tables, the
 *  menu grid — are ignored). The journal passes false: its title row stays put. */
/** `footFade`: light theme keeps the photo at full strength, fading only at its foot (the journal) */
type LayerProps = { height?: string; follow?: boolean; solid?: number; footFade?: boolean };

export function Wallpaper(props: LayerProps = {}) {
  const choice = useUIStore(s => shownWallpaper(s.wallpaper, s.themeMode));
  // The person's own photo has its own component: only it needs the key to open the photo
  if (choice === CUSTOM_WALLPAPER) return <OwnWallpaper {...props} />;
  const stock = wallpaperById(choice);
  return <PhotoLayer {...props} paper={stock?.id ?? null} src={stock ? wallpaperSrc(stock.id) : ''} />;
}

/* The person's own photo: opened from their bucket, only while Entry Images is on and set up.
   When it can't be shown (photos switched off, the photo gone) the theme's default shows
   instead — but nothing while it is still on its way, so no other photo flashes first */
function OwnWallpaper(props: LayerProps) {
  const fallback = useUIStore(s => DEFAULT_WALLPAPERS[s.themeMode]);
  const own = useUIStore(s => s.customWallpaper);
  const synced = useUIStore(s => s.wallpaperSynced);
  const settled = useEntriesStore(s => s.isInitialized);
  const imagesReady = useImagesReady();
  const opened = useDecryptedImage(imagesReady && own ? own.key : null, own?.iv ?? null, own?.mimeType ?? null);
  if (opened.url) return <PhotoLayer {...props} paper={CUSTOM_WALLPAPER} src={opened.url} />;
  const lost = !!opened.error || (synced && (!own || (settled && !imagesReady)));
  const stock = lost ? wallpaperById(fallback) : undefined;
  return <PhotoLayer {...props} paper={stock?.id ?? null} src={stock ? wallpaperSrc(stock.id) : ''} />;
}

function PhotoLayer({ height = STANDARD_HEIGHT, follow = true, solid, footFade, paper, src }: LayerProps & { paper: string | null; src: string }) {
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
    root.setAttribute('data-wallpaper', paper);
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
  return <Layer ref={layerRef} $src={src} $shown={loaded === src} $height={solid === undefined ? height : `${solid + FADE}px`} $solid={solid} $shade={shade} $footFade={footFade} aria-hidden="true" data-print-hide />;
}
