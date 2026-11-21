import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { EntryTagsField } from '@/components/molecules/fields/EntryTagsField';

describe('EntryTagsField', () => {
  it('adds a tag with Enter (or several with commas) and removes one with its ×', () => {
    const onChange = vi.fn();
    const getSuggestions = vi.fn(() => ['PHP', 'React']);
    const { rerender } = renderWithTheme(<EntryTagsField value={['PHP']} getSuggestions={getSuggestions} onChange={onChange} />);
    // The journal-wide suggestions are read only once the box opens
    expect(getSuggestions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '+ Add tag' }));
    expect(getSuggestions).toHaveBeenCalledTimes(1);
    expect(document.querySelector('datalist option[value="React"]')).not.toBeNull();
    const box = screen.getByLabelText('New tag');
    fireEvent.change(box, { target: { value: 'React' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['PHP', 'React']);
    fireEvent.change(box, { target: { value: 'CSS, HTML,' } });
    expect(onChange).toHaveBeenLastCalledWith(['PHP', 'CSS', 'HTML']);
    rerender(<EntryTagsField value={['PHP', 'CSS']} getSuggestions={() => []} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag CSS' }));
    expect(onChange).toHaveBeenLastCalledWith(['PHP']);
  });
});
