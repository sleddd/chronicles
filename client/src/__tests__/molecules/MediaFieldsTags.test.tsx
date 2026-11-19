import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MediaFields } from '@/components/molecules/fields/MediaFields';
import { renderWithTheme } from '../testUtils';

describe('MediaFields tags', () => {
  it('shows the form when an entry’s tags are not a list (an imported text column)', () => {
    renderWithTheme(<MediaFields values={{ mediaType: 'book', tags: 'romantasy, book club' } as never} onChange={vi.fn()} allTags={['comfort read']} />);
    expect(screen.getByRole('button', { name: 'comfort read' })).toBeInTheDocument();
    expect(screen.queryByText('romantasy, book club')).not.toBeInTheDocument();
  });
});
