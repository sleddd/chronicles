import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { FeatureShot } from '@/components/organisms/landing/FeatureShot';

const current = () => screen.getAllByRole('button', { name: /^Show / }).findIndex(b => b.getAttribute('aria-current') === 'true');

describe('FeatureShot slideshow', () => {
  it('moves with the arrows (wrapping round), a swipe and the arrow keys', () => {
    renderWithTheme(<FeatureShot shot={['health-dashboard', 'health-meals', 'health-exercise']} alt={['One', 'Two', 'Three']} />);
    expect(current()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next screen' }));
    expect(current()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Previous screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous screen' }));
    expect(current()).toBe(2); // wraps to the last
    const stage = screen.getByRole('button', { name: 'Next screen' }).parentElement!;
    fireEvent.touchStart(stage, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 200, clientY: 105 }] });
    expect(current()).toBe(0); // swiped left = next, wraps to the first
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    expect(current()).toBe(1);
  });
});
