import { useId } from 'react';
import { Icon } from '../../atoms/core/Icon.jsx';
import { PillPick, FootPick } from './TaskCardFields.js';
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

/** The meal (Breakfast, Lunch…), for the text box's foot strip — like a task's Status */
export function MealPick({ values, onChange }: { values: FoodFieldValues; onChange: (v: FoodFieldValues) => void }) {
  return <FootPick name="Meal" value={values.mealType ?? ''} options={MEALS} placeholder="Pick a meal"
    onChange={mealType => onChange({ ...values, mealType })} />;
}

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
  /** The meal is picked in the text box's foot strip (the entry editor), so it isn't repeated in the When row */
  mealInFoot?: boolean;
}

export function FoodFields({ values, onChange, onEstimateCalories, estimatingCalories, calorieError, compact, onEnter, mealInFoot }: FoodFieldsProps) {
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
          aria-label="Meal description"
        />
      </Section>

      {/* The meal (a pill dropdown, the task card's look) and when it was eaten, on one row */}
      <Section aria-label="When">
        <SectionHead><SectionLabel>When</SectionLabel></SectionHead>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px', minWidth: 0 }}>
          {/* Squared off like the date | time box beside it, the same height (its 50px row + border) */}
          {!mealInFoot && <PillPick style={{ height: 52, borderRadius: 10, padding: '0 16px' }}>
            <span className="value">{MEALS.find(m => m.value === values.mealType)?.label ?? 'Pick a meal'}</span>
            <Icon name="chevron-down" size={14} strokeWidth={2} />
            <select aria-label="Meal" value={values.mealType ?? ''} onChange={e => set({ mealType: e.target.value as FoodFieldValues['mealType'] })}>
              {!MEALS.some(m => m.value === values.mealType) && <option value="">Pick a meal</option>}
              {MEALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </PillPick>}
          <DateTimeBox style={{ flex: '1 1 260px', maxWidth: 400 }}>
            <DateTimeField type="date" aria-label="Date eaten" value={values.consumedDate} onChange={e => set({ consumedDate: e.target.value })} />
            <DateTimeField type="time" aria-label="Time eaten" value={values.consumedTime} onChange={e => set({ consumedTime: e.target.value })} />
          </DateTimeBox>
        </div>
      </Section>

      <Section aria-label="Nutrition" data-card-wide>
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
