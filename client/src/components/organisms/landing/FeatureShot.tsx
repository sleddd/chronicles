import { useState } from 'react';
import styled from 'styled-components';

/* A real screenshot of one view for the landing page's feature rows, lifted
   off the white by a soft shadow (no tray). The crops live in
   src/assets/landing/features/<key>.jpg (light theme, test account; JPEG so the
   PWA doesn't precache them) and a missing file renders nothing. Given several
   keys it becomes a small slideshow that starts on the first and never moves on
   its own: the dots under it switch screens (a crossfade, instant for reduced
   motion). Not an atom — it keeps its own slide state. */

const FILES = import.meta.glob<string>('../../../assets/landing/features/*.jpg', { eager: true, query: '?url', import: 'default' });

/* Crop sizes (any unit — only the shape matters), so the page doesn't jump as
   the lazy images load. Update with the files. */
const SIZES: Record<string, [number, number]> = {
  'ai': [1400, 748], 'calendar-day': [1268, 1100], 'calendar-week': [1268, 1100], 'calendar': [1268, 1100],
  'dashboard-2': [1268, 1300], 'dashboard': [1268, 1300],
  'finance-bills': [1268, 1440], 'finance-savings': [1268, 1440],
  'finance': [1268, 1440], 'health-dashboard': [1268, 1300], 'health-meals': [1268, 1300],
  'health-med-history': [1268, 1300], 'health-reports-symptoms': [1268, 1300], 'health-reports': [1268, 1300],
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


  if (count === 0) return null;
  const src = (k: string) => FILES[`../../../assets/landing/features/${k}.jpg`];
  const size = (k: string) => SIZES[k] ?? [1188, 800];

  if (count === 1) {
    const [width, height] = size(keys[0]);
    return <Shot src={src(keys[0])} alt={alts[0]} width={width} height={height} loading="lazy" decoding="async" />;
  }

  const [w, h] = size(keys[index]);
  return (
    <div aria-roledescription="carousel" aria-label={alts.join(' and ')}>
      <Frame style={{ aspectRatio: `${w} / ${h}` }}>
        {keys.map((k, i) => (
          <img key={k} src={src(k)} alt={alts[i] ?? alts[0]} data-active={i === index} aria-hidden={i !== index}
            loading="lazy" decoding="async" />
        ))}
      </Frame>
      <Dots>
        {keys.map((k, i) => (
          <button key={k} type="button" aria-label={`Show ${alts[i] ?? `screen ${i + 1}`}`} aria-current={i === index} onClick={() => setIndex(i)} />
        ))}
      </Dots>
    </div>
  );
}
