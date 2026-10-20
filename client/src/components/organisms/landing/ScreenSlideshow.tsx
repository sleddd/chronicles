import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { MaterialIcon } from '../../atoms/MaterialIcon.js';

/* The landing hero's slideshow of the real app (test account), in the light theme; a
   dark shot only ever follows the same view's light one (dashboard, then dashboard in dark).
   Screenshots live in src/assets/landing/<key>.jpg (JPEG on purpose: the PWA
   precaches png/svg, and these shouldn't ride along to every signed-in user).
   A slide whose file is missing is skipped. Sits straight on the teal hero. Advances every 6s; pauses while
   pointed at or focused, and doesn't advance at all for reduced motion. */

export const SLIDES = [
  { key: 'dashboard', name: 'Dashboard', caption: 'Your day at a glance' },
  { key: 'dashboard-dark', name: 'Dashboard', caption: 'Your day at a glance, in dark mode' },
  { key: 'journal', name: 'Journal', caption: 'Every entry, with fields for each topic' },
  { key: 'health', name: 'Health', caption: 'Nutrition, the wellness check-in and today’s doses' },
  { key: 'reports', name: 'Health reports', caption: 'How water, mood and sleep change over time' },
  { key: 'meals', name: 'Meals', caption: 'Daily nutrition against your goals' },
  { key: 'med-history', name: 'Med history', caption: 'What you took this month and how often' },
  { key: 'tasks', name: 'Tasks', caption: 'Drag tasks from to do to done' },
  { key: 'calendar', name: 'Calendar', caption: 'Events, deadlines and bills due' },
  { key: 'kitchen', name: 'Kitchen', caption: 'The week’s menu, linked to your recipes' },
  { key: 'shopping', name: 'Shopping list', caption: 'Today’s meals and a list to take to the store' },
  { key: 'finance', name: 'Finance', caption: 'Budget, bills and subscriptions' },
  { key: 'settings', name: 'Settings', caption: 'Light or dark, and an accent of your own' },
] as const;

const FILES = import.meta.glob<string>('../../../assets/landing/*.jpg', { eager: true, query: '?url', import: 'default' });
const urlFor = (key: string) => FILES[`../../../assets/landing/${key}.jpg`];

const AVAILABLE = SLIDES.flatMap(s => {
  const src = urlFor(s.key);
  return src ? [{ ...s, src }] : [];
});

const INTERVAL_MS = 6000;

/* No frame: the screenshot itself with rounded corners, the ‹ › arrows over
   its left and right edges, white dots under it on the teal band */
const Carousel = styled.section`
  position: relative;
`;

/* The image plus its arrows: the arrows sit outside the clipped viewport so
   the image's edge runs through their centres */
const Stage = styled.div`
  position: relative;
`;

const Viewport = styled.div`
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  img[data-active='true'] { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { img { transition: none; } }
  @media (max-width: 768px) { border-radius: 10px; }
`;

/* White round buttons centred on the image's left and right edges */
const Arrow = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => $side}: -24px;
  transform: translateY(-50%);
  z-index: 1;
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
  color: #174a49;
  cursor: pointer;
  box-shadow: var(--shadow-lg, 0 8px 28px rgba(20, 20, 30, 0.14));
  transition: background 150ms, transform 150ms;
  &:hover { background: #ffffff; }
  &:focus-visible { outline: 2px solid #ffffff; outline-offset: 3px; }
  /* Phones: 32px so the half that hangs off fits the 16px gutter */
  @media (max-width: 768px) { width: 32px; height: 32px; ${({ $side }) => $side}: -16px; span { font-size: 20px !important; } }
`;

const Dots = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 18px;
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
    &::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, 0.4); transition: background 150ms, transform 150ms; }
    &:hover::before { background: rgba(255, 255, 255, 0.7); }
    &[aria-current='true']::before { background: #ffffff; transform: scale(1.25); }
    &:focus-visible { outline: 2px solid #ffffff; outline-offset: -2px; border-radius: 50%; }
  }
`;

/* Screen readers still hear which screen is showing */
const VisuallyHidden = styled.p`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

export function ScreenSlideshow() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = AVAILABLE.length;
  const reduced = useRef(typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || reduced.current || count < 2) return;
    const id = setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => clearTimeout(id);
  }, [index, paused, count, go]);

  if (count === 0) return null;
  const slide = AVAILABLE[index];

  return (
    <Carousel
      aria-roledescription="carousel"
      aria-label="Screens from the app"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      <Stage>
      <Viewport>
        {AVAILABLE.map((s, i) => (
          <img
            key={s.key}
            src={s.src}
            alt={`${s.name}: ${s.caption}`}
            data-active={i === index}
            aria-hidden={i !== index}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            width={1440}
            height={900}
          />
        ))}
      </Viewport>
        {count > 1 && (
          <>
            <Arrow type="button" $side="left" aria-label="Previous screen" onClick={() => go(index - 1)}>
              <MaterialIcon aria-hidden $size={28}>chevron_left</MaterialIcon>
            </Arrow>
            <Arrow type="button" $side="right" aria-label="Next screen" onClick={() => go(index + 1)}>
              <MaterialIcon aria-hidden $size={28}>chevron_right</MaterialIcon>
            </Arrow>
          </>
        )}
      </Stage>
      <VisuallyHidden aria-live={paused ? 'polite' : 'off'}>{slide.name}: {slide.caption}</VisuallyHidden>
      {count > 1 && (
        <Dots>
          {AVAILABLE.map((s, i) => (
            <button key={s.key} type="button" aria-label={`Show ${s.name} (${i + 1} of ${count})`} aria-current={i === index} onClick={() => go(i)} />
          ))}
        </Dots>
      )}
    </Carousel>
  );
}
