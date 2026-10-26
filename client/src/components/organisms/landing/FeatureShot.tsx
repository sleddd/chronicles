import { useState } from 'react';
import styled from 'styled-components';
import { MaterialIcon } from '../../atoms/MaterialIcon.js';
import { useSwipe } from '../../../hooks/useSwipe.js';

/* A real screenshot of one view for the landing page's feature rows, lifted
   off the white by a soft shadow (no tray). The crops live in
   src/assets/landing/features/<key>.jpg (light theme, test account; JPEG so the
   PWA doesn't precache them) and a missing file renders nothing. Given several
   keys it becomes a small slideshow that starts on the first and never moves on
   its own: the ‹ › arrows on its edges, a sideways swipe, the arrow keys or the
   dots under it switch screens (a crossfade, instant for reduced motion). Not an atom — it keeps its own slide state. */

const FILES = import.meta.glob<string>('../../../assets/landing/features/*.jpg', { eager: true, query: '?url', import: 'default' });

/* Crop sizes (any unit — only the shape matters), so the page doesn't jump as
   the lazy images load. Update with the files. */
const SIZES: Record<string, [number, number]> = {
  'ai': [1400, 748], 'calendar-day': [1268, 1100], 'calendar-week': [1268, 1100], 'calendar': [1268, 1100],
  'dashboard-2': [1268, 1300], 'dashboard': [1268, 1300],
  'finance-bills': [1268, 1440], 'finance-savings': [1268, 1440],
  'finance': [1268, 1440], 'health-dashboard': [1268, 1300], 'health-meals': [1268, 1300],
  'health-med-history': [1268, 1300], 'health-reports-symptoms': [1268, 1300], 'health-reports': [1268, 1300],
  'health-exercise': [1268, 1300], 'health-exercise-history': [1268, 1300], 'health-symptoms': [1268, 1300],
  'journal': [1268, 1000], 'kitchen-menu': [1268, 1400], 'kitchen-recipe': [1268, 1400],
  'kitchen-shopping': [1268, 1400], 'kitchen': [1268, 1400], 'planning-milestones': [1268, 900],
  'planning-tasks': [1268, 900], 'planning-todos': [1268, 900], 'planning': [1268, 900], 'topics': [1268, 1000],
};

const Shot = styled.img`
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid #e6e8eb;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(20, 24, 32, 0.05), 0 18px 44px rgba(20, 24, 32, 0.12);
  @media (max-width: 768px) { border-radius: 8px; }
`;

/* The slideshow frame takes the shape of the screen showing, so each one fills
   it (the frame resizes when a dot switches screens) */
const Frame = styled.div`
  position: relative;
  overflow: hidden;
  border: 1px solid #e6e8eb;
  border-radius: 12px;
  background: #f4f5f7;
  box-shadow: 0 2px 6px rgba(20, 24, 32, 0.05), 0 18px 44px rgba(20, 24, 32, 0.12);
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
    opacity: 0;
    transition: opacity 0.6s ease;
  }
  img[data-active='true'] { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { img { transition: none; } }
  @media (max-width: 768px) { border-radius: 8px; }
`;

/* Holds the frame and the arrows that hang off its edges (the frame clips) */
const Stage = styled.div`
  position: relative;
`;

/* White round buttons centred on the frame's left and right edges, like the hero's */
const Arrow = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => $side}: -20px;
  transform: translateY(-50%);
  z-index: 1;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e6e8eb;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.96);
  color: #174a49;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(20, 24, 32, 0.12);
  &:hover { background: #ffffff; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
  @media (max-width: 768px) { width: 32px; height: 32px; ${({ $side }) => $side}: -12px; span { font-size: 20px !important; } }
`;

const Dots = styled.div`
  display: flex;
  justify-content: center;
  gap: 2px;
  margin-top: 14px;
  button {
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    &::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--border-default); transition: background 150ms; }
    &[aria-current='true']::before { background: var(--color-accent); }
    &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; border-radius: 50%; }
  }
`;

interface FeatureShotProps {
  /** One screenshot key, or several for a small slideshow */
  shot: string | string[];
  alt: string | string[];
}

export function FeatureShot({ shot, alt }: FeatureShotProps) {
  const keys = (Array.isArray(shot) ? shot : [shot]).filter(k => FILES[`../../../assets/landing/features/${k}.jpg`]);
  const alts = Array.isArray(alt) ? alt : [alt];
  const [index, setIndex] = useState(0);
  const count = keys.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);
  const swipe = useSwipe(() => go(index + 1), () => go(index - 1));


  if (count === 0) return null;
  const src = (k: string) => FILES[`../../../assets/landing/features/${k}.jpg`];
  const size = (k: string) => SIZES[k] ?? [1188, 800];

  if (count === 1) {
    const [width, height] = size(keys[0]);
    return <Shot src={src(keys[0])} alt={alts[0]} width={width} height={height} loading="lazy" decoding="async" />;
  }

  const [w, h] = size(keys[index]);
  return (
    <div aria-roledescription="carousel" aria-label={alts.join(' and ')}
      onKeyDown={e => { if (e.key === 'ArrowRight') go(index + 1); if (e.key === 'ArrowLeft') go(index - 1); }}>
      <Stage {...swipe}>
        <Frame style={{ aspectRatio: `${w} / ${h}` }}>
          {keys.map((k, i) => (
            <img key={k} src={src(k)} alt={alts[i] ?? alts[0]} data-active={i === index} aria-hidden={i !== index}
              loading="lazy" decoding="async" />
          ))}
        </Frame>
        <Arrow type="button" $side="left" aria-label="Previous screen" onClick={() => go(index - 1)}>
          <MaterialIcon aria-hidden $size={24}>chevron_left</MaterialIcon>
        </Arrow>
        <Arrow type="button" $side="right" aria-label="Next screen" onClick={() => go(index + 1)}>
          <MaterialIcon aria-hidden $size={24}>chevron_right</MaterialIcon>
        </Arrow>
      </Stage>
      <Dots>
        {keys.map((k, i) => (
          <button key={k} type="button" aria-label={`Show ${alts[i] ?? `screen ${i + 1}`}`} aria-current={i === index} onClick={() => go(i)} />
        ))}
      </Dots>
    </div>
  );
}
