import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { Spinner } from '../atoms/Spinner.js';
import { useDecryptedImage } from '../../hooks/useDecryptedImage.js';
import type { EntryImage } from '../../services/imageStorage.js';

/* ── Hero banner (featured image) ── */

/** CSS object-position for an image's focus point (centre by default) */
export function focusPosition(image: Pick<EntryImage, 'focusX' | 'focusY'>): string {
  return `${image.focusX ?? 50}% ${image.focusY ?? 50}%`;
}

const BannerWrap = styled.div<{ $adjusting?: boolean }>`
  position: relative;
  width: 100%;
  height: clamp(240px, 38vh, 400px);
  margin-top: 24px;
  border-radius: var(--r-lg, 2px);
  background: var(--bg-sunken);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  cursor: ${({ $adjusting }) => ($adjusting ? 'grab' : 'default')};
  touch-action: ${({ $adjusting }) => ($adjusting ? 'none' : 'auto')};
  &:active { cursor: ${({ $adjusting }) => ($adjusting ? 'grabbing' : 'default')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const BannerImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
`;

/* Controls over the photo: dark see-through pills so they read on any picture */
const BannerBtns = styled.div<{ $show: boolean }>`
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  @media (hover: hover) {
    opacity: ${({ $show }) => ($show ? 1 : 0)};
    transition: opacity 120ms ease;
    ${BannerWrap}:hover &, ${BannerWrap}:focus-within & { opacity: 1; }
  }
`;

const OverPill = styled.button`
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: rgba(20, 22, 28, 0.62);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  &:hover { background: rgba(20, 22, 28, 0.8); }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

const Hint = styled.div`
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  padding: 7px 14px;
  border-radius: 999px;
  background: rgba(20, 22, 28, 0.62);
  font-family: var(--font-sans);
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
`;

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

interface EntryHeroBannerProps {
  image: EntryImage;
  /** Given: the photo's crop can be adjusted (drag, or arrow keys) */
  onFocusChange?: (x: number, y: number) => void;
}

/**
 * The featured photo as a banner, cropped to fit around its focus point.
 * "Adjust crop" lets you drag the photo to choose what shows — drag it toward
 * the lower left to bring that corner into view.
 */
export function EntryHeroBanner({ image, onFocusChange }: EntryHeroBannerProps) {
  const { url, loading } = useDecryptedImage(image.key, image.iv, image.mimeType);
  const [adjusting, setAdjusting] = useState(false);
  const [focus, setFocus] = useState({ x: image.focusX ?? 50, y: image.focusY ?? 50 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // The drag's start and the point it has reached (read on release, not from a stale render)
  const drag = useRef<{ px: number; py: number; fx: number; fy: number; ox: number; oy: number; x: number; y: number } | null>(null);

  // Another photo, or the saved point changed elsewhere
  useEffect(() => { setFocus({ x: image.focusX ?? 50, y: image.focusY ?? 50 }); }, [image.key, image.focusX, image.focusY]);
  useEffect(() => { setAdjusting(false); }, [image.key]);
  // Adjusting: the banner takes focus, so the arrow keys work straight away
  useEffect(() => { if (adjusting) wrapRef.current?.focus(); }, [adjusting]);

  /* How far the cropped photo overhangs the banner (px) — dragging that far moves the focus end to end */
  const overhang = () => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const nw = imgRef.current?.naturalWidth || image.width || 0;
    const nh = imgRef.current?.naturalHeight || image.height || 0;
    if (!wrap || !nw || !nh) return { ox: 0, oy: 0 };
    const scale = Math.max(wrap.width / nw, wrap.height / nh);
    return { ox: nw * scale - wrap.width, oy: nh * scale - wrap.height };
  };

  const commit = (x: number, y: number) => { setFocus({ x, y }); onFocusChange?.(x, y); };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!adjusting) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, fx: focus.x, fy: focus.y, ...overhang(), x: focus.x, y: focus.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Dragging the photo right shows more of its left side, so the focus moves left
    d.x = d.ox > 0 ? clamp(d.fx - ((e.clientX - d.px) / d.ox) * 100) : d.fx;
    d.y = d.oy > 0 ? clamp(d.fy - ((e.clientY - d.py) / d.oy) * 100) : d.fy;
    setFocus({ x: d.x, y: d.y });
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.x !== d.fx || d.y !== d.fy) onFocusChange?.(d.x, d.y);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!adjusting) return;
    const step = e.shiftKey ? 1 : 5;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      commit(clamp(focus.x + moves[e.key][0]), clamp(focus.y + moves[e.key][1]));
    } else if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      setAdjusting(false);
    }
  };

  return (
    <BannerWrap ref={wrapRef} $adjusting={adjusting}
      tabIndex={adjusting ? 0 : undefined}
      aria-label={adjusting ? 'Featured photo crop. Drag the photo, or use the arrow keys, to choose what shows.' : undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}>
      {url
        ? <BannerImg ref={imgRef} src={url} alt="" draggable={false} style={{ objectPosition: `${focus.x}% ${focus.y}%` }} />
        : loading ? <Spinner size={24} /> : null}
      {url && onFocusChange && (
        <BannerBtns $show={adjusting} onPointerDown={e => e.stopPropagation()}>
          {adjusting ? (
            <>
              <OverPill type="button" onClick={() => commit(50, 50)}>Center</OverPill>
              <OverPill type="button" onClick={() => setAdjusting(false)}>Done</OverPill>
            </>
          ) : (
            <OverPill type="button" onClick={() => setAdjusting(true)}>Adjust crop</OverPill>
          )}
        </BannerBtns>
      )}
      {adjusting && <Hint>Drag the photo to choose what shows</Hint>}
    </BannerWrap>
  );
}

/* ── Photos under the text (no featured banner) ──
   One photo shows larger, at its own proportions; two or more sit in one row
   at the same height, each its natural width (wrapping when there are more).
   × removes (shown on hover, always on touch; a second tap confirms). */

const PhotosWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const PhotoTile = styled.div<{ $one: boolean; $w?: number }>`
  position: relative;
  flex: none;
  height: ${({ $one }) => ($one ? 'auto' : '110px')};
  ${({ $one, $w }) => ($one ? 'max-width: min(360px, 100%);' : $w ? `width: ${$w}px;` : 'min-width: 110px;')}
  border-radius: 10px;
  background: var(--bg-sunken);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  & > img { display: block; width: ${({ $one }) => ($one ? '100%' : 'auto')}; height: ${({ $one }) => ($one ? 'auto' : '100%')}; max-width: 100%; object-fit: cover; cursor: zoom-in; }
`;

const PhotoRemove = styled.button<{ $armed: boolean }>`
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: ${({ $armed }) => ($armed ? 'var(--color-danger, #dc3232)' : '#fff')};
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease;
  ${PhotoTile}:hover &, ${PhotoTile}:focus-within &, &:focus-visible { opacity: 1; }
  @media (hover: none) { opacity: 1; }
`;

function Photo({ image, one, onRemove, onOpen }: { image: EntryImage; one: boolean; onRemove: (key: string) => void; onOpen: () => void }) {
  // One photo: the full image (it shows larger); a row: the thumbnails
  const { url, loading, error } = useDecryptedImage(one ? image.key : image.thumbKey, one ? image.iv : image.thumbIv, image.mimeType);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  // In a row, the tile takes the photo's width at 110px tall (no jump as it loads)
  const w = !one && image.width && image.height ? Math.round((110 * image.width) / image.height) : undefined;
  return (
    <PhotoTile $one={one} $w={w} style={one && !url ? { width: 240, height: 160 } : undefined}>
      {url ? <img src={url} alt="" onClick={onOpen} />
        : loading ? <Spinner size={16} />
        : error ? <Icon name="image" size={20} strokeWidth={2} style={{ color: 'var(--text-disabled)' }} /> : null}
      <PhotoRemove type="button" $armed={armed}
        title={armed ? 'Tap again to remove' : 'Remove image'} aria-label={armed ? 'Tap again to remove image' : 'Remove image'}
        onClick={() => (armed ? onRemove(image.key) : setArmed(true))}>
        <Icon name={armed ? 'trash' : 'x'} size={13} strokeWidth={2.5} />
      </PhotoRemove>
    </PhotoTile>
  );
}

export function EntryPhotos({ images, uploading, onRemove, onOpen }: {
  images: EntryImage[];
  uploading: boolean;
  onRemove: (key: string) => void;
  onOpen: (index: number) => void;
}) {
  if (images.length === 0 && !uploading) return null;
  const one = images.length === 1 && !uploading;
  return (
    <PhotosWrap>
      {images.map((img, i) => <Photo key={img.key} image={img} one={one} onRemove={onRemove} onOpen={() => onOpen(i)} />)}
      {uploading && <PhotoTile $one={false} aria-label="Uploading image"><Spinner size={18} /></PhotoTile>}
    </PhotosWrap>
  );
}

/* ── Lightbox ── */

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(10, 10, 12, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LightboxImg = styled.img`
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  display: block;
`;

const NavBtn = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => $side}: 16px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--r-full, 999px);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  transition: background 120ms ease;
  &:hover { background: rgba(255, 255, 255, 0.22); }
`;

const CloseBtn = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--r-full, 999px);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  &:hover { background: rgba(255, 255, 255, 0.22); }
`;

const Counter = styled.div`
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-label);
  font-size: 12px;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.75);
`;

/** Hidden preloader — resolves an adjacent image's decrypt into the module cache. */
function Preload({ image }: { image: EntryImage | null }) {
  useDecryptedImage(image?.key ?? null, image?.iv ?? null, image?.mimeType ?? null);
  return null;
}

export function EntryLightbox({
  images, startIndex, onClose,
}: {
  images: EntryImage[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() => Math.min(startIndex, images.length - 1));
  const touchStartX = useRef<number | null>(null);

  const prev = useCallback(() => setIndex(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, prev, next]);

  const current = images[index];
  const { url, loading, error } = useDecryptedImage(
    current?.key ?? null, current?.iv ?? null, current?.mimeType ?? null
  );

  if (!current) return null;

  const overlay = (
    <Scrim
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) > 48) (dx > 0 ? prev : next)();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
    >
      {url ? (
        <LightboxImg src={url} alt="" />
      ) : loading ? (
        <Spinner size={32} />
      ) : error ? (
        <span style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
          Could not load this image
        </span>
      ) : null}

      {/* Warm the cache for adjacent images so paging feels instant */}
      {images.length > 1 && <Preload image={images[(index + 1) % images.length]} />}
      {images.length > 2 && <Preload image={images[(index - 1 + images.length) % images.length]} />}

      {images.length > 1 && (
        <>
          <NavBtn type="button" $side="left" aria-label="Previous image" onClick={prev}>
            <Icon name="chevron-left" size={22} strokeWidth={2.5} />
          </NavBtn>
          <NavBtn type="button" $side="right" aria-label="Next image" onClick={next}>
            <Icon name="chevron-right" size={22} strokeWidth={2.5} />
          </NavBtn>
        </>
      )}
      <CloseBtn type="button" aria-label="Close gallery" onClick={onClose}>
        <Icon name="x" size={20} strokeWidth={2.5} />
      </CloseBtn>
      <Counter>{index + 1} / {images.length}</Counter>
    </Scrim>
  );

  // House rule: overlays portal to document.body to escape stacking contexts
  return createPortal(overlay, document.body);
}
