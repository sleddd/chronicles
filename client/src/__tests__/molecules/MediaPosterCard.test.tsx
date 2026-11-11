import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MediaPosterCard } from '@/components/molecules/MediaPosterCard';
import { renderWithTheme } from '../testUtils';

const item = { title: 'Dune', type: 'book' as const, creator: 'Frank Herbert', year: '1965', rating: 4.5, shelf: 'current' as const, progress: 40 };

describe('MediaPosterCard', () => {
  it('interactive: opens, re-rates, re-shelves and shows the progress rule', () => {
    const onOpen = vi.fn(); const onRate = vi.fn(); const onShelve = vi.fn(); const onProgress = vi.fn();
    renderWithTheme(<MediaPosterCard item={item} coverSrc="data:image/jpeg;base64,AAAA" onOpen={onOpen} onRate={onRate} onShelve={onShelve} onProgress={onProgress} corner={<span data-testid="corner" />} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Dune' }));
    expect(onOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '3 stars' }));
    expect(onRate).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByLabelText('Shelf for Dune'), { target: { value: 'done' } });
    expect(onShelve).toHaveBeenCalledWith('done');
    expect(screen.getByRole('slider', { name: 'Progress for Dune' })).toBeInTheDocument();
    expect(screen.getByTestId('corner')).toBeInTheDocument();
  });

  it('writes the title on the tile when there is no cover', () => {
    renderWithTheme(<MediaPosterCard item={item} onOpen={() => {}} />);
    expect(screen.getByText('Dune')).toBeInTheDocument();
    expect(screen.getByText('Frank Herbert · 1965')).toBeInTheDocument();
  });

  it('readOnly: nothing to press — the Shelf status as a word, no progress', () => {
    const { container } = renderWithTheme(<MediaPosterCard item={item} readOnly coverSrc="data:image/jpeg;base64,AAAA" />);
    expect(container.querySelectorAll('button, select, input')).toHaveLength(0);
    expect(screen.getByRole('img', { name: 'Dune · Frank Herbert · 1965' })).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
