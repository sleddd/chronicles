import styled from 'styled-components';
import { Select } from '../../atoms/Select.js';
import { TextInput } from '../../atoms/TextInput.js';
import { Textarea } from '../../atoms/Textarea.js';
import { FormField } from '../FormField.js';
import { NutritionPanel, PillBtn } from '../NutritionPanel.js';
import { nutrientSourceOf, withManualNutrient, type NutrientKey } from '../../../types/nutrition.js';
import type { FoodFieldValues } from '../../../types/fields.js';
export type { FoodFieldValues } from '../../../types/fields.js';

/* Meals fields in the journal editor (no title above them):
   description, then type beside a combined "Eaten at" date | time box — and a
   NUTRITION section — one panel with calories as a large figure over a ruled
   strip of micronutrients, a Re-estimate pill and the AI note. Ingredients and
   notes follow. Props only. */

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

/* Type | Eaten at side by side; stacked on phones */
const PairRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
  column-gap: 16px;
  @media (max-width: 640px) { grid-template-columns: minmax(0, 1fr); }
`;

/* One rounded box holding date | time with a hairline between them */
const DateTimeBox = styled.div`
  display: flex;
  align-items: stretch;
  min-height: 48px;
  background: var(--bg-sunken);
  border: 1px solid var(--border-field, var(--border-default));
  border-radius: var(--r-lg, 6px);
  overflow: hidden;
  &:focus-within { border-color: var(--color-accent); }

  &&& input {
    flex: 1;
    min-width: 0;
    min-height: 46px;
    background: transparent !important;
    border: none !important;
    border-radius: 0;
    outline: none !important;
    padding: 0 16px;
    font-size: 16px;
    color: var(--text-primary);
  }
  &&& input + input { border-left: 1px solid var(--border-field, var(--border-default)) !important; }
`;

interface FoodFieldsProps {
  values: FoodFieldValues;
  onChange: (values: FoodFieldValues) => void;
  /** AI calorie estimate — the Re-estimate pill shows only when this is provided */
  onEstimateCalories?: () => void;
  estimatingCalories?: boolean;
  calorieError?: string;
}

export function FoodFields({ values, onChange, onEstimateCalories, estimatingCalories, calorieError }: FoodFieldsProps) {
  const raw = values as unknown as Record<string, unknown>;
  const setNutrient = (key: NutrientKey, v: string) =>
    onChange(withManualNutrient(raw, key, v) as unknown as FoodFieldValues);
  const isAi = (key: NutrientKey) => nutrientSourceOf(raw, key) === 'ai';

  return (
    <Wrapper>
      <FormField label="Description">
        <TextInput
          value={values.mealDescription ?? ''}
          onChange={e => onChange({ ...values, mealDescription: e.target.value })}
          placeholder="What did you eat?"
        />
      </FormField>
      <PairRow>
        <FormField label="Type">
          <Select
            value={values.mealType}
            onChange={e => onChange({ ...values, mealType: e.target.value as FoodFieldValues['mealType'] })}
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="supplement">Supplement</option>
            <option value="medication">Medication</option>
          </Select>
        </FormField>
        <FormField label="Eaten at">
          <DateTimeBox>
            <input type="date" aria-label="Date eaten" value={values.consumedDate} onChange={e => onChange({ ...values, consumedDate: e.target.value })} />
            <input type="time" aria-label="Time eaten" value={values.consumedTime} onChange={e => onChange({ ...values, consumedTime: e.target.value })} />
          </DateTimeBox>
        </FormField>
      </PairRow>

      <NutritionPanel
        values={raw as Partial<Record<NutrientKey, unknown>>}
        onChange={setNutrient}
        isAi={isAi}
        error={calorieError}
        action={onEstimateCalories && (
          <PillBtn type="button" onClick={onEstimateCalories} disabled={estimatingCalories}>
            {estimatingCalories ? 'Estimating…' : values.calories ? 'Re-estimate' : 'Estimate'}
          </PillBtn>
        )}
      />

      <FormField label="Ingredients">
        <TextInput
          value={values.ingredients}
          onChange={e => onChange({ ...values, ingredients: e.target.value })}
          placeholder="Comma-separated (eggs, toast, bacon)"
        />
      </FormField>
      <FormField label="Notes">
        <Textarea
          value={values.notes}
          onChange={e => onChange({ ...values, notes: e.target.value })}
          placeholder="Additional notes"
          style={{ minHeight: 60 }}
        />
      </FormField>
    </Wrapper>
  );
}
