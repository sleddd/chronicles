import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { RecipeEntry } from '@/components/organisms/RecipeEntry';
import { renderWithTheme } from '../testUtils';

const values = {
  recipeName: 'Beef Tacos', servings: '2', prepTime: '', cookTime: '', cuisine: '',
  ingredients: [{ id: 'a', amount: '1 lb', name: 'beef' }], instructions: '', linkedShoppingListIds: [],
};

describe('RecipeEntry footer', () => {
  it('offers Edit and a Print icon, not Add to shopping list / Add to menu', () => {
    renderWithTheme(<RecipeEntry values={values} onToggleIngredient={() => {}} onEdit={() => {}} />);
    expect(screen.getByRole('button', { name: /print recipe/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit recipe' })).toBeInTheDocument();
    expect(screen.queryByText(/add to shopping list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add to menu/i)).not.toBeInTheDocument();
  });

  it('Print draws the recipe into the print sheet and prints', () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithTheme(<RecipeEntry values={values} onToggleIngredient={() => {}} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /print recipe/i }));
    expect(document.getElementById('print-sheet')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('print-sheet-open')).toBe(true);
    vi.runAllTimers();
    expect(print).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
