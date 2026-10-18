import { useMemo } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { FormWrap, Section, SectionHead, SectionLabel, BoxInput, RowBox, LabelledRow, RowLabel, BareSelect } from './formKit.js';
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

/* Menu plan fields (journal editor): Week starting as an outlined date box,
   then each day as a sentence-case label over one outlined box of meal rows —
   the slot name muted on the left, the meal typed in place, and a recipe pill
   picker on the right. Props only. */

const DayRow = styled(LabelledRow)`
  grid-template-columns: 110px minmax(0, 1fr) auto;
  min-height: 56px;
  @media (max-width: 560px) { grid-template-columns: minmax(0, 1fr); }
`;

const MealInput = styled.input`
  && {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

const WeekDate = styled(BoxInput)`
  &&&&& { max-width: 260px; color-scheme: light dark; }
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
    <FormWrap>
      <Section aria-label="Week starting">
        <SectionHead><SectionLabel>Week starting</SectionLabel></SectionHead>
        <WeekDate type="date" value={values.weekStart || ''} aria-label="Week starting"
          onChange={e => onChange({ ...values, weekStart: e.target.value })} />
      </Section>

      {weekDays.map(day => {
        const dateStr = toDateStr(day);
        return (
          <Section key={dateStr} aria-label={fmtDay(day)}>
            <SectionHead><SectionLabel>{fmtDay(day)}</SectionLabel></SectionHead>
            <RowBox>
              {MEAL_SLOTS.map(({ key, label }) => {
                const slot = days[dateStr]?.[key] || emptySlot();
                return (
                  <DayRow key={key}>
                    <RowLabel>{label}</RowLabel>
                    <MealInput
                      value={slot.mealName}
                      onChange={e => updateSlot(dateStr, key, { mealName: e.target.value })}
                      placeholder="Add a meal"
                      aria-label={`${fmtDay(day)} ${label}`}
                    />
                    {recipeOptions.length > 0 && (
                      <BareSelect>
                        <select
                          value={slot.recipeId?.toString() || ''}
                          onChange={e => handleRecipeChange(dateStr, key, e.target.value ? parseInt(e.target.value) : null)}
                          aria-label={`${fmtDay(day)} ${label} recipe`}
                        >
                          <option value="">Link recipe</option>
                          {recipeOptions.map(r => (
                            <option key={r.id} value={r.id}>{r.title}</option>
                          ))}
                        </select>
                        <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
                      </BareSelect>
                    )}
                  </DayRow>
                );
              })}
            </RowBox>
          </Section>
        );
      })}
    </FormWrap>
  );
}
