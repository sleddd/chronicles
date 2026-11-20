import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Shortcuts } from '../../components/organisms/Shortcuts.js';

const renderIt = (links: string[] | undefined, onChange = vi.fn()) => {
  render(<MemoryRouter><Shortcuts links={links} onChange={onChange} /></MemoryRouter>);
  return onChange;
};

describe('Shortcuts card', () => {
  it('offers the picker straight away when nothing is pinned', () => {
    const onChange = renderIt(undefined);
    expect(screen.getByText(/Pin the pages you use most/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Add a shortcut'), { target: { value: '/journal' } });
    expect(onChange).toHaveBeenCalledWith(['/journal']);
  });

  it('shows pinned pages as chips and removes one in Edit', () => {
    const onChange = renderIt(['/journal', '/calendar']);
    expect(screen.getByRole('button', { name: /Journal/ })).toBeTruthy();
    expect(screen.queryByLabelText('Remove Journal')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByLabelText('Remove Journal'));
    expect(onChange).toHaveBeenCalledWith(['/calendar']);
  });
});
