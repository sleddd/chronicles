import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { MaterialIcon } from '../../atoms/MaterialIcon.js';
import { useSwipe } from '../../../hooks/useSwipe.js';
import { PAGE_INK } from '../../templates/LandingTemplate.js';

/* The landing hero's slideshow of the real app (test account), led by the dark theme:
   every view in dark, with one light shot, the dashboard, right after the dark one.
   Screenshots live in src/assets/landing/<key>.jpg (JPEG on purpose: the PWA
   precaches png/svg, and these shouldn't ride along to every signed-in user).
   A slide whose file is missing is skipped. No frame or border: the screenshot itself with rounded corners, on the hero's night-sky photo. Advances every 6s; pauses while
   pointed at or focused, and doesn't advance at all for reduced motion. Swipe sideways, the ‹ › arrows or the arrow keys move it by hand. */

export const SLIDES = [
  { key: 'dashboard-dark-v3', name: 'Dashboard', caption: 'Your day at a glance' },
  // The earlier dashboard shots, kept to switch back to: { key: 'dashboard-dark-v2', … }, { key: 'dashboard-dark', … }
  { key: 'journal-dark', name: 'Journal', caption: 'Every entry, with fields for each topic' },
  { key: 'health-dark', name: 'Health', caption: 'Nutrition, the wellness check-in and today’s doses' },
  { key: 'reports-dark', name: 'Health reports', caption: 'How water, mood and sleep change over time' },
  // Planning, in the order of its tabs
  { key: 'vision-dark', name: 'Vision', caption: 'Your vision and goals for each area of life' },
  { key: 'goals-list-dark', name: 'Goals', caption: 'Goals by area of life, with progress and deadlines' },
  { key: 'milestones-list-dark', name: 'Milestones', caption: 'The steps toward each goal, with progress and deadlines' },
  { key: 'roadmap-dark', name: 'Roadmap', caption: 'Goals and their milestones across the year' },
  { key: 'tasks-list-dark', name: 'Tasks', caption: 'Every task under its goal, with priority and how late' },
  { key: 'tasks-dark', name: 'Tasks board', caption: 'Drag tasks from to do to done' },
  { key: 'planner-dark', name: 'Planner', caption: 'Your week, hour by hour, around your meetings' },
  { key: 'calendar-dark', name: 'Calendar', caption: 'Events, deadlines and bills due' },
  { key: 'kitchen-dark', name: 'Kitchen', caption: 'The week’s menu, linked to your recipes' },
  { key: 'shopping-dark', name: 'Shopping list', caption: 'Today’s meals and a list to take to the store' },
  { key: 'finance-dark', name: 'Finance', caption: 'Budget, bills and subscriptions' },
  { key: 'settings-dark', name: 'Settings', caption: 'Light or dark, and an accent of your own' },
] as const;

const FILES = import.meta.glob<string>('../../../assets/landing/*.jpg', { eager: true, query: '?url', import: 'default' });
const urlFor = (key: string) => FILES[`../../../assets/landing/${key}.jpg`];

const AVAILABLE = SLIDES.flatMap(s => {
  const src = urlFor(s.key);
  return src ? [{ ...s, src }] : [];
});

const INTERVAL_MS = 6000;

/* The screenshot in a dark device frame, the ‹ › arrows over its left and
   right edges, dots under it (on the light page the hero band stops on) */
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
  aspect-ratio: 1600 / 1150; /* the shots are 1600 × 1150 (16:10 before — a little taller now, so more of each page shows) */
  overflow: hidden;
  border: 8px solid #2b2e36;
  border-radius: 16px;
  background: #1f2229;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 22px 44px -12px rgba(10, 14, 28, 0.34), 0 40px 90px -24px rgba(10, 14, 28, 0.2);
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
  @media (max-width: 768px) { border-width: 5px; border-radius: 11px; }
`;

/* Round buttons centred on the image's left and right edges, in the frame's
   dark grey with white chevrons */
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
  background: #2b2e36;
  color: #ffffff;
  cursor: pointer;
  box-shadow: var(--shadow-lg, 0 8px 28px rgba(20, 20, 30, 0.14));
  transition: background 150ms, transform 150ms;
  &:hover { background: #383c46; }
  &:focus-visible { outline: 2px solid ${PAGE_INK}; outline-offset: 3px; }
  /* Phones: 32px so the half that hangs off fits the 16px gutter */
  @media (max-width: 768px) { width: 32px; height: 32px; ${({ $side }) => $side}: -16px; span { font-size: 20px !important; } }
`;

/* Under the image: the pause / play button, then the dots */
const Controls = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 40px;
`;

/* Pause / play: a round outline only, beside the dots */
const PauseButton = styled.button`
  flex: none;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #80868f;
  border-radius: 50%;
  background: transparent;
  color: #4a505b;
  cursor: pointer;
  transition: border-color 150ms, color 150ms;
  &:hover { border-color: #4a505b; color: #1f2128; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

const Dots = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 2px;
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
    &::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #9aa0a9; transition: background 150ms, transform 150ms; }
    &:hover::before { background: #5f6570; }
    &[aria-current='true']::before { background: ${PAGE_INK}; transform: scale(1.25); }
    &:focus-visible { outline: 2px solid ${PAGE_INK}; outline-offset: -2px; border-radius: 50%; }
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
  const reduced = useRef(typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  // Stopped by the pause button (or from the start for reduced motion, until Play is pressed)
  const [stopped, setStopped] = useState(reduced.current);
  const count = AVAILABLE.length;

  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || stopped || count < 2) return;
    const id = setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => clearTimeout(id);
  }, [index, paused, stopped, count, go]);

  const swipe = useSwipe(() => go(index + 1), () => go(index - 1));
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
      <Stage {...swipe}>
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
            width={1600}
            height={1150}
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
      <VisuallyHidden aria-live={paused || stopped ? 'polite' : 'off'}>{slide.name}: {slide.caption}</VisuallyHidden>
      {count > 1 && (
        <Controls>
          <PauseButton
            type="button"
            aria-label={stopped ? 'Play slideshow' : 'Pause slideshow'}
            // Pressing Play starts it now, though the pointer or the focus is still on the slideshow
            onClick={() => { setStopped(v => !v); setPaused(false); }}
          >
            <MaterialIcon aria-hidden $size={20}>{stopped ? 'play_arrow' : 'pause'}</MaterialIcon>
          </PauseButton>
          <Dots>
            {AVAILABLE.map((s, i) => (
              <button key={s.key} type="button" aria-label={`Show ${s.name} (${i + 1} of ${count})`} aria-current={i === index} onClick={() => go(i)} />
            ))}
          </Dots>
        </Controls>
      )}
    </Carousel>
  );
}
