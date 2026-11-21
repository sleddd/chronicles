import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntryListCard } from '@/components/molecules/EntryListCard';

describe('EntryListCard keyboard', () => {
  it('opens with Enter or Space', () => {
    const onClick = vi.fn();
    render(<EntryListCard content="<p>Buy milk</p>" onClick={onClick} />);
    const row = screen.getByRole('button', { name: /Buy milk/ });
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('read-only rows are not buttons', () => {
    render(<EntryListCard content="<p>Dune</p>" readOnly />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Dune').closest('[tabindex]')).toBeNull();
  });
});
