import { describe, it, expect } from 'vitest';
import { addAmounts, buyingAmount, shoppingLines, shoppingName } from '@/utils/kitchen';

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
    expect(shoppingName('2 cloves garlic')).toBe('garlic');
    expect(shoppingName('pinch of salt')).toBe('salt');
    expect(shoppingName('knob of ginger')).toBe('ginger');
    expect(shoppingName('salt to taste')).toBe('salt');
  });

  it('leaves a food named like a measure alone', () => {
    expect(shoppingName('ground cloves')).toBe('ground cloves');
    expect(shoppingName('cloves')).toBe('cloves');
    expect(buyingAmount('8', 'flour tortillas')).toBe('8');
    expect(buyingAmount('2 cans', 'oil-packed tuna')).toBe('2 cans');
    expect(buyingAmount('1 pint', 'cream')).toBe('1 pint');
    expect(buyingAmount('1 jar', 'ground cloves')).toBe('');
  });

  it('adds up amounts that count the same thing, and blanks the ones that don’t', () => {
    expect(addAmounts('2', '3')).toBe('5');
    expect(addAmounts('1 lb', '1 lb')).toBe('2 lb');
    expect(addAmounts('0.5', '0.5')).toBe('1');
    expect(addAmounts('1/2 lb', '1 1/2 lb')).toBe('2 lb');
    expect(addAmounts('1 lb', '2 cans')).toBe('');
    expect(addAmounts('2', '')).toBe('');
  });

  it('never adds up a range as a number and a unit', () => {
    expect(addAmounts('2-3', '2-3')).toBe('');
    expect(addAmounts('2 – 3 lb', '1 lb')).toBe('');
    expect(addAmounts('1 to 2', '1 to 2')).toBe('');
    expect(addAmounts('1 tomato', '1 tomato')).toBe('2 tomato');
    expect(shoppingLines([
      { amount: '2-3', name: 'onions' },
      { amount: '1', name: 'onions' },
    ])).toEqual([{ amount: '', name: 'onions' }]);
  });

  it('lists an item once across recipes, adding up its amounts', () => {
    expect(shoppingLines([
      { amount: '2', name: 'chicken breasts' },
      { amount: '3', name: 'Chicken breasts' },
      { amount: '1 cup', name: 'flour' },
      { amount: '2 tbsp', name: 'flour' },
      { amount: '1 tsp', name: 'cumin' },
      { amount: '1 lb', name: 'ground beef' },
      { amount: '1 lb', name: 'ground beef' },
    ])).toEqual([
      { amount: '5', name: 'chicken breasts' },
      { amount: '', name: 'flour' },
      { amount: '', name: 'cumin' },
      { amount: '2 lb', name: 'ground beef' },
    ]);
  });
});
