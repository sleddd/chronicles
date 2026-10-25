import { useId } from 'react';
import { RatingRow, HEALTHY_WORDS } from '../DayInventory.js';
import { NutritionPanel, PillBtn } from '../NutritionPanel.js';
import { nutrientSourceOf, withManualNutrient, type NutrientKey } from '../../../types/nutrition.js';
import type { FoodFieldValues } from '../../../types/fields.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip,
  DateTimeBox, DateTimeField, BoxInput, BoxText,
} from './formKit.js';
export type { FoodFieldValues } from '../../../types/fields.js';

/* Meals fields — the same form in the journal editor, Quick Entry and the
   Health dashboard's Log a Meal: what you ate as a big borderless title, the
   meal as outline chips, When as a date | time box, the Nutrition panel
   (calories over a ruled micronutrient strip, Estimate pill, italic = AI),
   then Ingredients and Notes in outlined boxes. Props only. */

const MEALS: { value: FoodFieldValues['mealType']; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'medication', label: 'Medication' },
];

interface FoodFieldsProps {
  values: FoodFieldValues;
  onChange: (values: FoodFieldValues) => void;
  /** AI calorie estimate — the Estimate pill shows only when this is provided */
  onEstimateCalories?: () => void;
  estimatingCalories?: boolean;
  calorieError?: string;
  /** Narrow containers (Log a Meal card): smaller nutrition labels */
  compact?: boolean;
  /** Enter in a one-line box (Log a Meal: logs the meal) */
  onEnter?: () => void;
}

export function FoodFields({ values, onChange, onEstimateCalories, estimatingCalories, calorieError, compact, onEnter }: FoodFieldsProps) {
  const raw = values as unknown as Record<string, unknown>;
  const set = (patch: Partial<FoodFieldValues>) => onChange({ ...values, ...patch });
  const setNutrient = (key: NutrientKey, v: string) =>
    onChange(withManualNutrient(raw, key, v) as unknown as FoodFieldValues);
  const isAi = (key: NutrientKey) => nutrientSourceOf(raw, key) === 'ai';
  const notesId = useId();
  const enter = onEnter ? (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } } : undefined;

  return (
    <FormWrap>
      <Section>
        <TitleInput
          value={values.mealDescription ?? ''}
          onChange={e => set({ mealDescription: e.target.value })}
          onKeyDown={enter}
          placeholder="What did you eat?"
          aria-label="What did you eat?"
        />
      </Section>

      <Section aria-label="Meal">
        <SectionHead><SectionLabel>Meal</SectionLabel></SectionHead>
        <Chips>
          {MEALS.map(m => (
            <Chip key={m.value} type="button" $active={values.mealType === m.value} aria-pressed={values.mealType === m.value}
              onClick={() => set({ mealType: m.value })}>
              {m.label}
            </Chip>
          ))}
        </Chips>
      </Section>

      {values.mealType !== 'supplement' && values.mealType !== 'medication' && (
        <Section aria-label="How healthy">
          <SectionHead><SectionLabel>How healthy?</SectionLabel></SectionHead>
          <RatingRow label="How healthy it was" value={Number(values.healthiness) || 0} words={HEALTHY_WORDS}
            onChange={v => set({ healthiness: v ? String(v) : '' })} />
        </Section>
      )}

      <Section aria-label="When">
        <SectionHead><SectionLabel>When</SectionLabel></SectionHead>
        <DateTimeBox>
          <DateTimeField type="date" aria-label="Date eaten" value={values.consumedDate} onChange={e => set({ consumedDate: e.target.value })} />
          <DateTimeField type="time" aria-label="Time eaten" value={values.consumedTime} onChange={e => set({ consumedTime: e.target.value })} />
        </DateTimeBox>
      </Section>

      <Section aria-label="Nutrition">
        <NutritionPanel
          values={raw as Partial<Record<NutrientKey, unknown>>}
          onChange={setNutrient}
          isAi={isAi}
          error={calorieError}
          compact={compact}
          onKeyDown={enter}
          action={onEstimateCalories && (
            <PillBtn type="button" onClick={onEstimateCalories} disabled={estimatingCalories}>
              {estimatingCalories ? 'Estimating…' : values.calories ? 'Re-estimate' : 'Estimate'}
            </PillBtn>
          )}
        />
      </Section>

      <Section aria-label="Ingredients">
        <SectionHead><SectionLabel>Ingredients</SectionLabel></SectionHead>
        <BoxInput value={values.ingredients} onChange={e => set({ ingredients: e.target.value })} onKeyDown={enter}
          placeholder="Comma-separated (eggs, toast, bacon)" aria-label="Ingredients" />
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes} onChange={e => set({ notes: e.target.value })} placeholder="Additional notes" />
      </Section>
    </FormWrap>
  );
}
