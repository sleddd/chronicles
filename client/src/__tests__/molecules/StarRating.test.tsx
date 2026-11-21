import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { StarRating } from '@/components/molecules/StarRating';

describe('StarRating names', () => {
  it('read-only: an image named with the rating', () => {
    renderWithTheme(<StarRating value={4.5} readOnly />);
    expect(screen.getByRole('img', { name: /^Rating: 4\.5 of 5 stars$/ })).toBeInTheDocument();
  });

  it('interactive: a slider with its value text', () => {
    renderWithTheme(<StarRating value={3} onChange={vi.fn()} />);
    const slider = screen.getByRole('slider', { name: 'Rating' });
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringMatching(/^3 of 5 stars$/));
  });
});
