import { useMemo } from 'react';
import styled from 'styled-components';
import { TextInput } from '../../atoms/TextInput.js';
import { Select } from '../../atoms/Select.js';
import { FormField } from '../FormField.js';
import type { MenuPlanDay, MenuMealSlot, MealSlotType } from '../../../types/fields.js';

export interface MenuPlanFieldValues {
  weekStart: string;
  days: Record<string, MenuPlanDay>;
}

const MEAL_SLOTS: { key: MealSlotType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch' },
  { key: 'dinner',    label: 'Dinner' },
  { key: 'snack',     label: 'Snack' },
];

const emptySlot = (): MenuMealSlot => ({ mealName: '', recipeId: null, recipeName: '' });
const emptyDay  = (): MenuPlanDay  => ({ breakfast: emptySlot(), lunch: emptySlot(), dinner: emptySlot(), snack: emptySlot() });

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

/* One day: a tracked label, then a field row per meal (no boxes or rules) */
const DaySection = styled.section`
  display: flex;
  flex-direction: column;
  margin-top: 16px;
`;

const DayHeader = styled.h4`
  margin: 0 0 4px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
`;

const SlotInputs = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 8px;
  @media (max-width: 480px) { grid-template-columns: minmax(0, 1fr); }
`;

interface MenuPlanFieldsProps {
  values: MenuPlanFieldValues;
  onChange: (values: MenuPlanFieldValues) => void;
  recipeOptions?: { id: number; title: string }[];
}

export function MenuPlanFields({ values, onChange, recipeOptions = [] }: MenuPlanFieldsProps) {
  const weekStart = values.weekStart ? new Date(values.weekStart + 'T00:00:00') : new Date();
  const days = values.days || {};

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const updateSlot = (dateStr: string, slot: MealSlotType, patch: Partial<MenuMealSlot>) => {
    const newDays = {
      ...days,
      [dateStr]: {
        ...(days[dateStr] || emptyDay()),
        [slot]: { ...(days[dateStr]?.[slot] || emptySlot()), ...patch },
      },
    };
    onChange({ ...values, days: newDays });
  };

  const handleRecipeChange = (dateStr: string, slot: MealSlotType, recipeId: number | null) => {
    const recipe = recipeId ? recipeOptions.find(r => r.id === recipeId) : null;
    const existing = days[dateStr]?.[slot] || emptySlot();
    const newDays = {
      ...days,
      [dateStr]: {
        ...(days[dateStr] || emptyDay()),
        [slot]: {
          ...existing,
          recipeId,
          recipeName: recipe?.title || '',
          mealName: existing.mealName || recipe?.title || '',
        },
      },
    };
    onChange({ ...values, days: newDays });
  };

  return (
    <Wrapper>
      <FormField label="Week Starting">
        <TextInput
          type="date"
          value={values.weekStart || ''}
          onChange={e => onChange({ ...values, weekStart: e.target.value })}
        />
      </FormField>

      {weekDays.map(day => {
        const dateStr = toDateStr(day);
        return (
          <DaySection key={dateStr} aria-label={fmtDay(day)}>
            <DayHeader>{fmtDay(day)}</DayHeader>
            {MEAL_SLOTS.map(({ key, label }) => {
              const slot = days[dateStr]?.[key] || emptySlot();
              return (
                <FormField key={key} label={label}>
                  <SlotInputs>
                    <TextInput
                      value={slot.mealName}
                      onChange={e => updateSlot(dateStr, key, { mealName: e.target.value })}
                      placeholder="Meal"
                      aria-label={`${fmtDay(day)} ${label}`}
                    />
                    {recipeOptions.length > 0 && (
                      <Select
                        value={slot.recipeId?.toString() || ''}
                        onChange={e => handleRecipeChange(dateStr, key, e.target.value ? parseInt(e.target.value) : null)}
                        aria-label={`${fmtDay(day)} ${label} recipe`}
                      >
                        <option value="">Link recipe…</option>
                        {recipeOptions.map(r => (
                          <option key={r.id} value={r.id}>{r.title}</option>
                        ))}
                      </Select>
                    )}
                  </SlotInputs>
                </FormField>
              );
            })}
          </DaySection>
        );
      })}
    </Wrapper>
  );
}
