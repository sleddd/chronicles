import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { EntryTagsField } from '@/components/molecules/fields/EntryTagsField';

describe('EntryTagsField', () => {
  it('adds a tag with Enter (or several with commas) and removes one with its ×', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithTheme(<EntryTagsField value={['PHP']} suggestions={['PHP', 'React']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add tag' }));
    const box = screen.getByLabelText('New tag');
    fireEvent.change(box, { target: { value: 'React' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['PHP', 'React']);
    fireEvent.change(box, { target: { value: 'CSS, HTML,' } });
    expect(onChange).toHaveBeenLastCalledWith(['PHP', 'CSS', 'HTML']);
    rerender(<EntryTagsField value={['PHP', 'CSS']} suggestions={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag CSS' }));
    expect(onChange).toHaveBeenLastCalledWith(['PHP']);
  });
});
