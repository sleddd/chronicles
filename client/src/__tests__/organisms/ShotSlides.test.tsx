import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { ShotSlides } from '@/components/organisms/landing/ShotSlides';

const slides = ['One', 'Two', 'Three'].map(alt => ({ src: `/${alt}.jpg`, alt, size: [4, 3] as [number, number] }));
const current = () => screen.getAllByRole('button', { name: /^Show / }).findIndex(b => b.getAttribute('aria-current') === 'true');

describe('ShotSlides', () => {
  it('starts on the first and moves with the arrows (wrapping round), a swipe and the arrow keys', () => {
    renderWithTheme(<ShotSlides slides={slides} />);
    expect(current()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next screen' }));
    expect(current()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Previous screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous screen' }));
    expect(current()).toBe(2);
    const stage = screen.getByRole('button', { name: 'Next screen' }).parentElement!;
    fireEvent.touchStart(stage, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 200, clientY: 105 }] });
    expect(current()).toBe(0);
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    expect(current()).toBe(1);
  });

  it('shows a single screen without arrows or dots', () => {
    renderWithTheme(<ShotSlides slides={slides.slice(0, 1)} />);
    expect(screen.getByAltText('One')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
