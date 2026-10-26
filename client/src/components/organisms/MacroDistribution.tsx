import { useMemo } from 'react';
import styled from 'styled-components';
import { DashPanel, DashPanelHead } from '../molecules/DashPanel.js';
import { MacroDonut, type MacroSlice } from '../molecules/charts/MacroDonut.js';
import { summarizeDay, type FoodRow } from '../../utils/foodLog.js';
import { KCAL_PER_GRAM } from '../../types/nutrition.js';

/* "Macro distribution": a day's protein / carbs / fat split by calories as a
   donut, in a panel card. Shared by the Health dashboard and the Meals log. */

const MACRO_SLICES = [
  { key: 'protein', label: 'Protein', color: 'var(--chart-green)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--chart-blue)' },
  { key: 'fat', label: 'Fat', color: 'var(--chart-amber)' },
] as const;

const Empty = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/** `rows`: the day's Meals rows */
export function MacroDistribution({ rows, className }: { rows: FoodRow[]; className?: string }) {
  const slices = useMemo<MacroSlice[]>(() => {
    const summary = summarizeDay(rows);
    return MACRO_SLICES.map(m => ({ ...m, grams: summary.totals[m.key], kcal: summary.totals[m.key] * KCAL_PER_GRAM[m.key] }));
  }, [rows]);
  return (
    <DashPanel aria-label="Macro distribution" className={className}>
      <DashPanelHead title="Macro distribution" />
      {slices.some(s => s.kcal > 0)
        ? <MacroDonut slices={slices} />
        : <Empty>Log meals with protein, carbs and fat to see the day’s split.</Empty>}
    </DashPanel>
  );
}
