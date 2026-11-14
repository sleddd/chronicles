import { useState } from 'react';
import styled from 'styled-components';
import { MaterialIcon } from '../../atoms/MaterialIcon.js';
import { useSwipe } from '../../../hooks/useSwipe.js';
import { PAGE_INK } from '../../templates/LandingTemplate.js';

/* A landing feature row's screenshots in the light device bezel. Given several
   views it becomes a small slideshow that starts on the first and never moves
   on its own: the ‹ › arrows on the bezel's edges, a sideways swipe, the arrow
   keys or the dots under it switch screens (a crossfade, instant for reduced
   motion). Light screens lead; each one's dark version follows right after it.
   Not an atom: it keeps its own slide state. */

export interface Slide {
  src: string;
  alt: string;
  size: [number, number];
}

/* The bezel: the page colour around the screen, a hairline and a soft shadow */
const Device = styled.div`
  padding: 8px;
  border: 1px solid var(--border-card);
  border-radius: 16px;
  background: var(--bg-app);
  box-shadow: 0 2px 6px rgba(20, 24, 32, 0.04), 0 28px 60px rgba(20, 24, 32, 0.12);
  > img { display: block; width: 100%; height: auto; border-radius: 10px; }
`;

/* The screen takes the shape of the slide showing; the slides crossfade */
const Screen = styled.div`
  position: relative;
  overflow: hidden;
  border-radius: 10px;
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
`;

/* Holds the bezel and the arrows hanging off its edges */
const Stage = styled.div`
  position: relative;
`;

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
  border: 1px solid var(--border-card);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.96);
  color: ${PAGE_INK};
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(20, 24, 32, 0.12);
  &:hover { background: #ffffff; }
  &:focus-visible { outline: 2px solid ${PAGE_INK}; outline-offset: 3px; }
  @media (max-width: 768px) { width: 32px; height: 32px; ${({ $side }) => $side}: -12px; }
`;

const Dots = styled.div`
  display: flex;
  justify-content: center;
  gap: 2px;
  margin-top: 16px;
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
    &[aria-current='true']::before { background: ${PAGE_INK}; }
    &:focus-visible { outline: 2px solid ${PAGE_INK}; outline-offset: -2px; border-radius: 50%; }
  }
`;

export function ShotSlides({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);
  const swipe = useSwipe(() => go(index + 1), () => go(index - 1));

  if (count === 0) return null;
  if (count === 1) {
    const [s] = slides;
    return (
      <Device>
        <img src={s.src} width={s.size[0]} height={s.size[1]} alt={s.alt} loading="lazy" decoding="async" />
      </Device>
    );
  }

  const [w, h] = slides[index].size;
  return (
    <div aria-roledescription="carousel" aria-label={slides.map(s => s.alt).join(' and ')}
      onKeyDown={e => { if (e.key === 'ArrowRight') go(index + 1); if (e.key === 'ArrowLeft') go(index - 1); }}>
      <Stage {...swipe}>
        <Device>
          <Screen style={{ aspectRatio: `${w} / ${h}` }}>
            {slides.map((s, i) => (
              <img key={s.src} src={s.src} alt={s.alt} data-active={i === index} aria-hidden={i !== index}
                loading="lazy" decoding="async" />
            ))}
          </Screen>
        </Device>
        <Arrow type="button" $side="left" aria-label="Previous screen" onClick={() => go(index - 1)}>
          <MaterialIcon aria-hidden $size={24}>chevron_left</MaterialIcon>
        </Arrow>
        <Arrow type="button" $side="right" aria-label="Next screen" onClick={() => go(index + 1)}>
          <MaterialIcon aria-hidden $size={24}>chevron_right</MaterialIcon>
        </Arrow>
      </Stage>
      <Dots>
        {slides.map((s, i) => (
          <button key={s.src} type="button" aria-label={`Show ${s.alt}`} aria-current={i === index} onClick={() => go(i)} />
        ))}
      </Dots>
    </div>
  );
}
