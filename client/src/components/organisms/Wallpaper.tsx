import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useUIStore } from '../../stores/uiStore.js';
import { wallpaperById, wallpaperSrc } from '../../utils/wallpapers.js';

/* The chosen wallpaper (Settings → Theme → Background, off by default): the
   photo across the top of the page it's placed in, fading into the page
   colour, scrolling away with the page. Its parent is a positioned stacking
   context (isolation: isolate) so the photo sits under the page's content but
   over its background. While it shows, <html data-wallpaper> turns the
   cards and controls over it to glass (styles/wallpaper.ts). */

const Layer = styled.div<{ $src: string; $shown: boolean; $height: string }>`
  position: absolute;
  inset: 0 0 auto 0;
  height: ${({ $height }) => $height};
  z-index: -1;
  pointer-events: none;
  background: url(${({ $src }) => $src}) center 55% / cover no-repeat;
  opacity: ${({ $shown }) => ($shown ? 1 : 0)};
  transition: opacity 0.4s ease;
  /* A long, eased fade (no visible edge): solid at the top, thinning out
     gradually from a quarter of the way down */
  --fade: linear-gradient(to bottom, #000 0%, #000 22%, rgba(0, 0, 0, 0.88) 34%, rgba(0, 0, 0, 0.7) 46%,
    rgba(0, 0, 0, 0.48) 58%, rgba(0, 0, 0, 0.28) 70%, rgba(0, 0, 0, 0.12) 82%, rgba(0, 0, 0, 0.03) 92%, transparent 100%);
  -webkit-mask-image: var(--fade);
  mask-image: var(--fade);
  /* A light shade at the top, so the white title reads on a bright photo */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.26), rgba(0, 0, 0, 0.08) 55%, transparent);
  }
  /* Dark: deeper, so a bright photo still sits in the dark page */
  html[data-theme='dark'] &::after {
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.36), rgba(0, 0, 0, 0.3) 60%, rgba(0, 0, 0, 0.2));
  }
  @media print { display: none; }
`;

/** height: how far down the page the photo reaches before it has faded out.
 *  follow: scroll away with the page. Most pages scroll inside a panel of their
 *  own (a full-height overflow box), not the element the photo sits in, so the
 *  photo follows that panel's scroll (smaller scrolling boxes — tables, the
 *  menu grid — are ignored). The journal passes false: its title row stays put. */
export function Wallpaper({ height = 'min(520px, 60vh)', follow = true }: { height?: string; follow?: boolean } = {}) {
  const id = useUIStore(s => s.wallpaper);
  const paper = wallpaperById(id);
  const src = paper ? wallpaperSrc(paper.id) : '';
  const [loaded, setLoaded] = useState<string | null>(null);
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
    img.onload = () => setLoaded(src);
    img.src = src;
    return () => { img.onload = null; };
  }, [src]);

  if (!paper) return null;
  return <Layer ref={layerRef} $src={src} $shown={loaded === src} $height={height} aria-hidden="true" data-print-hide />;
}
