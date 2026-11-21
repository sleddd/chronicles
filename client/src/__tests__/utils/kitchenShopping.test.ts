import { describe, it, expect } from 'vitest';
import { buyingAmount, shoppingLines, shoppingName } from '@/utils/kitchen';

describe('shopping list amounts', () => {
  it('keeps counts and package sizes, drops recipe measures and pantry amounts', () => {
    expect(buyingAmount('5', 'chicken breasts')).toBe('5');
    expect(buyingAmount('1 lb', 'ground beef')).toBe('1 lb');
    expect(buyingAmount('2', 'bell peppers')).toBe('2');
    expect(buyingAmount('1 can', 'black beans')).toBe('1 can');
    expect(buyingAmount('1 cup', 'rice')).toBe('');
    expect(buyingAmount('1.5 tbsp', 'olive oil')).toBe('');
    expect(buyingAmount('1', 'bay leaf')).toBe('');
    expect(buyingAmount('2 lb', 'flour')).toBe('');
  });

  it('names an ingredient as you’d shop for it', () => {
    expect(shoppingName('garlic cloves, minced')).toBe('garlic');
    expect(shoppingName('onion (diced)')).toBe('onion');
  });

  it('lists an item once across recipes, adding up plain counts', () => {
    expect(shoppingLines([
      { amount: '2', name: 'chicken breasts' },
      { amount: '3', name: 'Chicken breasts' },
      { amount: '1 cup', name: 'flour' },
      { amount: '2 tbsp', name: 'flour' },
      { amount: '1 tsp', name: 'cumin' },
    ])).toEqual([
      { amount: '5', name: 'chicken breasts' },
      { amount: '', name: 'flour' },
      { amount: '', name: 'cumin' },
    ]);
  });
});
