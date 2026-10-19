import styled from 'styled-components';

/* A real screenshot of one view for the landing page's feature rows, lifted
   off the white by a soft shadow (no tray). The crops live in src/assets/landing/features/<key>.jpg
   (light theme, test account; JPEG so the PWA doesn't precache them) and a
   missing file renders nothing. Props only. */

const FILES = import.meta.glob<string>('../../../assets/landing/features/*.jpg', { eager: true, query: '?url', import: 'default' });

/* Crop sizes (CSS px), so the page doesn't jump as the lazy images load.
   Update with the files. */
const SIZES: Record<string, [number, number]> = {
  dashboard: [1188, 800], journal: [1188, 800], topics: [1188, 800], health: [539, 483], planning: [1188, 800],
  calendar: [1188, 800], kitchen: [1188, 720], finance: [1188, 800], ai: [1188, 800],
};

/* No tray: the screenshot alone, lifted off the white by a soft shadow */
const Tray = styled.div`
  img {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid #e6e8eb;
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(20, 24, 32, 0.05), 0 18px 44px rgba(20, 24, 32, 0.12);
  }
  @media (max-width: 768px) { img { border-radius: 8px; } }
`;

interface FeatureShotProps {
  shot: string;
  alt: string;
}

export function FeatureShot({ shot, alt }: FeatureShotProps) {
  const src = FILES[`../../../assets/landing/features/${shot}.jpg`];
  if (!src) return null;
  const [width, height] = SIZES[shot] ?? [1188, 800];
  return (
    <Tray>
      <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
    </Tray>
  );
}
