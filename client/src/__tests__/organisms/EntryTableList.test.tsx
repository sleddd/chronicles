import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { EntryTableList } from '@/components/organisms/EntryTableList';
import { RECIPE_COLUMNS, recipeNote, SHOPPING_COLUMNS } from '@/components/organisms/kitchenTables';

const open = vi.fn();
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => open }));

const recipe = (id: number, name: string, cf: Record<string, unknown>) => ({
  id, content: `<p>${name}</p>`, metadata: { _customFields: cf }, isEncrypted: true,
  createdAt: new Date(2026, 10, 20), updatedAt: new Date(2026, 10, 20),
});

describe('EntryTableList', () => {
  it('shows a recipe’s stats in their columns and opens it from its title', () => {
    renderWithTheme(<EntryTableList label="Recipes" prefsKey="t-recipes" emptyMessage="None" columns={RECIPE_COLUMNS} noteOf={recipeNote}
      entries={[recipe(1, 'Creamy Soup', { prepTime: '15', cookTime: '35', servings: '3', difficulty: 'easy', description: 'Dairy-free' })] as any} />);
    for (const h of ['Recipe', 'Prep', 'Cook', 'Serves', 'Difficulty', 'Date']) expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    expect(screen.getByText('15 min')).toBeInTheDocument();
    expect(screen.getByText('35 min')).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Creamy Soup'));
    expect(open).toHaveBeenCalledWith(1);
  });

  it('a shopping list shows its item count; search narrows the rows', () => {
    renderWithTheme(<EntryTableList label="Shopping lists" prefsKey="t-shop" emptyMessage="None" columns={SHOPPING_COLUMNS}
      entries={[recipe(2, 'Groceries', { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }), recipe(3, 'Clothes', { items: [] })] as any} />);
    expect(screen.getByRole('columnheader', { name: 'Items' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search Shopping lists'), { target: { value: 'cloth' } });
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
    expect(screen.getByText('Clothes')).toBeInTheDocument();
  });
});
