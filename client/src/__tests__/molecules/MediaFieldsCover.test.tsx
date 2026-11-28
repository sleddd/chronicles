import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MediaFields } from '@/components/molecules/fields/MediaFields';
import { renderWithTheme } from '../testUtils';

const base = { mediaType: 'book', mediaTitle: 'Just Mercy' } as never;

describe('MediaFields cover', () => {
  it('shows the entry’s own photo in the cover box, as the shelf does, over a found cover', () => {
    renderWithTheme(<MediaFields values={{ ...(base as object), cover: { dataUrl: 'data:image/jpeg;base64,AAAA', source: 'x' } } as never}
      onChange={vi.fn()} photoUrl="blob:own-photo" />);
    const box = screen.getByLabelText('Your photo, shown as the cover');
    expect(box.querySelector('img')).toHaveAttribute('src', 'blob:own-photo');
  });

  it('with no cover, offers Add an image beside Find cover & details', () => {
    const onAddImage = vi.fn();
    renderWithTheme(<MediaFields values={base} onChange={vi.fn()} onAddImage={onAddImage} />);
    expect(screen.getByLabelText('No cover yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add an image' }));
    expect(onAddImage).toHaveBeenCalledTimes(1);
  });

  it('has no Add an image while photos can’t be added, or once the entry has one', () => {
    const { rerender } = renderWithTheme(<MediaFields values={base} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add an image' })).not.toBeInTheDocument();
    rerender(<MediaFields values={base} onChange={vi.fn()} onAddImage={vi.fn()} photoUrl="blob:x" />);
    expect(screen.queryByRole('button', { name: 'Add an image' })).not.toBeInTheDocument();
  });
});
