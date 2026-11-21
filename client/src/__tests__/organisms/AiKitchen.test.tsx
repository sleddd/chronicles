import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { AiMenuPlan } from '@/components/organisms/AiMenuPlan';
import { AiRecipeFromIngredients } from '@/components/organisms/AiRecipeFromIngredients';
import { useEntriesStore } from '@/stores/entriesStore';

const ai = vi.hoisted(() => ({ aiFeatureJson: vi.fn(), aiProviderName: () => 'OpenAI' }));
vi.mock('@/services/aiAssistant', () => ai);
vi.mock('@/services/flashNotice', () => ({ showFlash: vi.fn() }));
vi.mock('@/hooks/useAiReady', () => ({ useAiFeatureEnabled: () => true }));
const saves = vi.hoisted(() => ({ createEntry: vi.fn(), savePrefs: vi.fn() }));
vi.mock('@/hooks/useCreateEntry', () => ({ useCreateEntry: () => saves.createEntry }));
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => vi.fn() }));
vi.mock('@/hooks/useEncryptedSetting', () => ({
  useEncryptedSetting: () => [{ budgetCents: 8000, people: 2, slots: ['dinner'], useRecipes: true }, saves.savePrefs, true],
}));

const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];

describe('AI kitchen', () => {
  beforeEach(() => {
    ai.aiFeatureJson.mockReset();
    saves.createEntry.mockReset().mockResolvedValueOnce(101).mockResolvedValue(102);
    saves.savePrefs.mockReset().mockResolvedValue(undefined);
    useEntriesStore.setState({
      allTopics: [{ id: 1, name: 'Allergy' }, { id: 2, name: 'Recipe' }],
      decryptedEntries: [
        { id: 40, content: '<p>Peanuts</p>', isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
          metadata: { _taxonomyId: 1, _customFields: { allergen: 'Peanuts', reaction: 'Hives', severity: 8 } } },
        { id: 7, content: '<p>Chili</p>', isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
          metadata: { _taxonomyId: 2, _customFields: { recipeName: 'Chili', ingredients: [{ id: 'a', amount: '', name: 'beans' }] } } },
      ],
    } as never);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('menu: typing the budget keeps the cursor in the box', () => {
    renderWithTheme(<AiMenuPlan days={days} taken={[]} onApply={vi.fn()} onClose={vi.fn()} />);
    const box = screen.getByLabelText('Food budget for the week');
    box.focus();
    for (const value of ['1', '12', '125']) {
      fireEvent.change(box, { target: { value } });
      expect(document.activeElement).toBe(box);
    }
    expect(box).toHaveValue('125');
  });

  it('menu: allergies start unticked and are left out of what is sent', () => {
    renderWithTheme(<AiMenuPlan days={days} taken={[]} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Include my allergies' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Your unencrypted data is about to be shared with OpenAI.');
    expect(screen.queryByText(/allerg/i)).not.toBeInTheDocument();
    expect(screen.getByText('1 recipe (names and ingredients)')).toBeInTheDocument();
    expect(ai.aiFeatureJson).not.toHaveBeenCalled();
  });

  it('menu: sends allergies when ticked, flags them in review, and applies what stays ticked', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    ai.aiFeatureJson.mockResolvedValue(JSON.stringify({
      meals: [
        { date: '2026-11-23', slot: 'dinner', name: 'Chili', recipeId: 7 },
        { date: '2026-11-24', slot: 'dinner', name: 'Satay noodles', newRecipe: 'r1' },
      ],
      recipes: [{ key: 'r1', title: 'Satay noodles', ingredients: [{ amount: '2 tbsp', name: 'peanut butter' }], steps: ['Mix'] }],
      shopping: [{ name: 'noodles', amount: '1 lb', category: 'other', price: 3 }],
    }));
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderWithTheme(<AiMenuPlan days={days} taken={[]} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include my allergies' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('1 allergy, with reaction and severity')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await screen.findByRole('region', { name: 'Meals' });
    expect(ai.aiFeatureJson.mock.calls[0][0]).toBe('aiKitchen');
    expect(ai.aiFeatureJson.mock.calls[0][2]).toContain('Peanuts');
    expect(screen.getAllByText('May contain Peanuts').length).toBeGreaterThan(0);
    expect(screen.getByText(/Estimated \$3\.00 of your \$80\.00 budget/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Prices are estimates. They vary by store and by where you live, and the AI may not estimate them accurately.');

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saves.createEntry).toHaveBeenNthCalledWith(1, { name: 'Recipe', icon: 'bowl-food' }, 'Satay noodles', expect.objectContaining({ recipeName: 'Satay noodles' }));
    expect(onApply).toHaveBeenCalledWith({
      '2026-11-23': { dinner: { mealName: 'Chili', recipeId: 7, recipeName: 'Chili' } },
      '2026-11-24': { dinner: { mealName: 'Satay noodles', recipeId: 101, recipeName: 'Satay noodles' } },
    });
    expect(saves.createEntry).toHaveBeenNthCalledWith(2, { name: 'Shopping List', icon: 'cart-shopping' }, expect.stringMatching(/^Shopping list for/),
      expect.objectContaining({ linkedRecipeIds: [7, 101], notes: expect.stringContaining('Prices are estimates') }));
    // The remembered set-up never holds the allergy tick, and nothing decrypted goes to browser storage
    expect(JSON.stringify(saves.savePrefs.mock.calls)).not.toMatch(/allerg/i);
    expect(local).not.toHaveBeenCalled();
  });

  it('menu: sends last weeks’ and this week’s meals so it doesn’t repeat them', async () => {
    useEntriesStore.setState(st => ({
      allTopics: [...st.allTopics, { id: 3, name: 'Menu Plan' }],
      decryptedEntries: [...st.decryptedEntries, {
        id: 50, content: '<p>Menu</p>', isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
        metadata: { _taxonomyId: 3, _customFields: { weekStart: '2026-11-16', days: { '2026-11-17': { dinner: { mealName: 'Tacos', recipeId: null, recipeName: '' } } } } },
      }],
    }) as never);
    renderWithTheme(<AiMenuPlan days={days} taken={[]} plannedMeals={['Lasagna']} onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2 meals from your recent and current menus (names only), so it doesn’t repeat them')).toBeInTheDocument();
  });

  it('recipe: needs ingredients, then writes one to review and save', async () => {
    ai.aiFeatureJson.mockResolvedValue(JSON.stringify({
      recipe: { title: 'Fried rice', ingredients: [{ amount: '2 cups', name: 'rice' }], steps: ['Fry it'] }, extras: ['oil'],
    }));
    renderWithTheme(<AiRecipeFromIngredients onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('What do you have?'), { target: { value: 'rice, egg' } });
    expect(screen.getByRole('checkbox', { name: 'Include my allergies' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2 ingredients you have')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('Fried rice')).toBeInTheDocument();
    expect(ai.aiFeatureJson.mock.calls[0][2]).not.toContain('Peanuts');
    expect(screen.getByText('You’d also need: oil')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(await screen.findByText('Saved “Fried rice” to Recipes.')).toBeInTheDocument();
    expect(saves.createEntry).toHaveBeenCalledWith({ name: 'Recipe', icon: 'bowl-food' }, 'Fried rice', expect.objectContaining({ recipeName: 'Fried rice' }));
  });
});
