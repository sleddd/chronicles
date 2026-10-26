import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { MacroDonut } from '@/components/molecules/charts/MacroDonut';

describe('MacroDonut', () => {
  it('labels each macro with its share of the calories and lists grams in the legend', () => {
    renderWithTheme(<MacroDonut slices={[
      { key: 'protein', label: 'Protein', grams: 50, kcal: 200, color: 'green' },
      { key: 'carbs', label: 'Carbs', grams: 90, kcal: 360, color: 'blue' },
      { key: 'fat', label: 'Fat', grams: 26.7, kcal: 240, color: 'orange' },
    ]} />);
    expect(screen.getByRole('img', { name: 'Protein 25%, Carbs 45%, Fat 30%' })).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('27 g')).toBeInTheDocument();
  });
});
