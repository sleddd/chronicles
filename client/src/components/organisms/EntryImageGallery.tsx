import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { Spinner } from '../atoms/Spinner.js';
import { useDecryptedImage } from '../../hooks/useDecryptedImage.js';
import type { EntryImage } from '../../services/imageStorage.js';

/* ── Hero banner (featured image) ── */

const BannerWrap = styled.div`
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
`;

const BannerImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

export function EntryHeroBanner({ image }: { image: EntryImage }) {
  const { url, loading } = useDecryptedImage(image.key, image.iv, image.mimeType);
  return (
    <BannerWrap>
      {url ? <BannerImg src={url} alt="" /> : loading ? <Spinner size={24} /> : null}
    </BannerWrap>
  );
}

/* ── Thumbnail strip ── */

const StripWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: var(--s-5, 20px);
  padding-top: var(--s-4, 16px);
  border-top: 1px solid var(--border-subtle);
`;

const ThumbTile = styled.div`
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: var(--r-lg, 2px);
  background: var(--bg-sunken);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const ThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: pointer;
`;

const ThumbControls = styled.div`
  position: absolute;
  top: 4px;
  right: 4px;
  left: 4px;
  display: flex;
  justify-content: space-between;
  opacity: 0;
  transition: opacity 120ms ease;

  ${ThumbTile}:hover &, ${ThumbTile}:focus-within & { opacity: 1; }
  @media (hover: none) { opacity: 1; }
`;

const ThumbBtn = styled.button<{ $active?: boolean; $armed?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--r-md, 1px);
  background: rgba(0, 0, 0, 0.55);
  color: ${({ $active, $armed }) =>
    $armed ? 'var(--color-danger, #dc3232)' :
    $active ? 'var(--color-accent)' : '#fff'};
  cursor: pointer;

  svg { fill: ${({ $active }) => ($active ? 'currentColor' : 'none')}; }
`;

function Thumb({
  image, isFeatured, onSetFeatured, onRemove, onOpen,
}: {
  image: EntryImage;
  isFeatured: boolean;
  onSetFeatured: (key: string | null) => void;
  onRemove: (key: string) => void;
  onOpen: () => void;
}) {
  const { url, loading, error } = useDecryptedImage(image.thumbKey, image.thumbIv, image.mimeType);
  // Two-step armed remove — first tap arms, second removes (no window.confirm)
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <ThumbTile>
      {url ? (
        <ThumbImg src={url} alt="" onClick={onOpen} />
      ) : loading ? (
        <Spinner size={16} />
      ) : error ? (
        <Icon name="image" size={20} strokeWidth={2} style={{ color: 'var(--text-disabled)' }} />
      ) : null}
      <ThumbControls>
        <ThumbBtn
          type="button"
          $active={isFeatured}
          title={isFeatured ? 'Remove featured image' : 'Set as featured image'}
          aria-label={isFeatured ? 'Remove featured image' : 'Set as featured image'}
          onClick={() => onSetFeatured(isFeatured ? null : image.key)}
        >
          <Icon name="star" size={13} strokeWidth={2} />
        </ThumbBtn>
        <ThumbBtn
          type="button"
          $armed={armed}
          title={armed ? 'Tap again to remove' : 'Remove image'}
          aria-label={armed ? 'Tap again to remove image' : 'Remove image'}
          onClick={() => {
            if (armed) onRemove(image.key);
            else setArmed(true);
          }}
        >
          <Icon name={armed ? 'trash' : 'x'} size={13} strokeWidth={2.5} />
        </ThumbBtn>
      </ThumbControls>
    </ThumbTile>
  );
}

export function EntryImageStrip({
  images, featuredKey, uploading, onSetFeatured, onRemove, onOpen,
}: {
  images: EntryImage[];
  featuredKey: string | null;
  uploading: boolean;
  onSetFeatured: (key: string | null) => void;
  onRemove: (key: string) => void;
  onOpen: (index: number) => void;
}) {
  if (images.length === 0 && !uploading) return null;
  return (
    <StripWrap>
      {images.map((img, i) => (
        <Thumb
          key={img.key}
          image={img}
          isFeatured={featuredKey === img.key}
          onSetFeatured={onSetFeatured}
          onRemove={onRemove}
          onOpen={() => onOpen(i)}
        />
      ))}
      {uploading && (
        <ThumbTile aria-label="Uploading image">
          <Spinner size={18} />
        </ThumbTile>
      )}
    </StripWrap>
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
