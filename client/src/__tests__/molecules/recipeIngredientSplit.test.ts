import { describe, it, expect } from 'vitest';
import { splitIngredient } from '@/components/molecules/fields/RecipeFields';

describe('splitIngredient', () => {
  it('splits a leading amount (with unit) from the name', () => {
    expect(splitIngredient('2 cups rice')).toEqual({ amount: '2 cups', name: 'rice' });
    expect(splitIngredient('1/2 tsp salt')).toEqual({ amount: '1/2 tsp', name: 'salt' });
    expect(splitIngredient('½ lemon')).toEqual({ amount: '½', name: 'lemon' });
    expect(splitIngredient('3 eggs')).toEqual({ amount: '3', name: 'eggs' });
    expect(splitIngredient('2-3 cloves garlic')).toEqual({ amount: '2-3 cloves', name: 'garlic' });
  });

  it('keeps text with no leading amount as the name', () => {
    expect(splitIngredient('Salt to taste')).toEqual({ amount: '', name: 'Salt to taste' });
  });
});
