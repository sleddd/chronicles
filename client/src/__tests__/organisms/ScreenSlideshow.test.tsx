import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { ScreenSlideshow } from '@/components/organisms/landing/ScreenSlideshow';

const current = () => screen.getAllByRole('button', { name: /^Show / }).findIndex(b => b.getAttribute('aria-current') === 'true');

describe('ScreenSlideshow', () => {
  afterEach(() => vi.useRealTimers());

  it('advances on its own until Pause slideshow is pressed, and Play starts it again', () => {
    vi.useFakeTimers();
    renderWithTheme(<ScreenSlideshow />);
    if (screen.queryAllByRole('button', { name: /^Show / }).length < 2) return; // no screenshots in this checkout
    expect(current()).toBe(0);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(current()).toBe(1);
    const pause = screen.getByRole('button', { name: 'Pause slideshow' });
    // Clicking focuses the button, which pauses too; blur so only the button's own state counts
    fireEvent.click(pause);
    fireEvent.blur(pause);
    act(() => { vi.advanceTimersByTime(12000); });
    expect(current()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }));
    fireEvent.blur(screen.getByRole('button', { name: 'Pause slideshow' }));
    act(() => { vi.advanceTimersByTime(6000); });
    expect(current()).toBe(2);
  });
});
