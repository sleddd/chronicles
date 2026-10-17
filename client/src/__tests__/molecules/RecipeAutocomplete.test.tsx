import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { RecipeAutocomplete } from '@/components/molecules/RecipeAutocomplete';
import { renderWithTheme } from '../testUtils';

const recipes = [{ id: 1, title: 'Chicken Stir-Fry' }, { id: 2, title: 'Beef Tacos' }];

describe('RecipeAutocomplete', () => {
  it('lists recipes under a Recipes heading and links the one picked', () => {
    const onSelect = vi.fn();
    renderWithTheme(<RecipeAutocomplete recipes={recipes} onSelect={onSelect} />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(screen.getByText('Recipes')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('Beef Tacos'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('free-text mode: typing is the value, Enter keeps it, matches still suggest recipes', () => {
    const onQueryChange = vi.fn();
    const onCommit = vi.fn();
    const onSelect = vi.fn();
    renderWithTheme(
      <RecipeAutocomplete recipes={recipes} value="tac" onQueryChange={onQueryChange}
        onCommit={onCommit} onSelect={onSelect} autoFocus placeholder="What's for dinner?" />
    );
    const box = screen.getByRole('textbox');
    expect(screen.getByText('Beef Tacos')).toBeInTheDocument();
    expect(screen.queryByText('Chicken Stir-Fry')).not.toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'tacos' } });
    expect(onQueryChange).toHaveBeenCalledWith('tacos');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('RecipeAutocomplete type-ahead', () => {
  it('completes the best match inline and Tab takes it', () => {
    const onSelect = vi.fn();
    renderWithTheme(<RecipeAutocomplete recipes={recipes} value="Bee" onQueryChange={() => {}} onSelect={onSelect} autoFocus />);
    expect(screen.getByText('f Tacos')).toBeInTheDocument(); // the faint rest of "Beef Tacos"
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
