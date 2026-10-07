import styled from 'styled-components';
import { Select } from '../../atoms/Select.js';
import { TextInput } from '../../atoms/TextInput.js';
import { Textarea } from '../../atoms/Textarea.js';
import { DateTimeInput } from '../../atoms/DateTimeInput.js';
import { FormField } from '../FormField.js';
import { CalorieInput } from './CalorieInput.js';
import { UnitLabel } from '../../atoms/UnitLabel.js';
import { NUTRIENTS, nutrientSourceOf, withManualNutrient } from '../../../types/nutrition.js';
import type { FoodFieldValues } from '../../../types/fields.js';
export type { FoodFieldValues } from '../../../types/fields.js';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const Row = styled.div`
  display: flex;
  gap: 16px;
  align-items: flex-start;
  & > * { flex: 1; min-width: 0; }
`;

interface FoodFieldsProps {
  values: FoodFieldValues;
  onChange: (values: FoodFieldValues) => void;
  /** AI calorie estimate — the button shows only when this is provided */
  onEstimateCalories?: () => void;
  estimatingCalories?: boolean;
  calorieError?: string;
}

export function FoodFields({ values, onChange, onEstimateCalories, estimatingCalories, calorieError }: FoodFieldsProps) {
  return (
    <Wrapper>
      <FormField label="Meal Description">
        <TextInput
          value={values.mealDescription ?? ''}
          onChange={e => onChange({ ...values, mealDescription: e.target.value })}
          placeholder="What did you eat?"
        />
      </FormField>
      <Row>
        <FormField label="Meal Type">
          <Select
            value={values.mealType}
            onChange={e => onChange({ ...values, mealType: e.target.value as FoodFieldValues['mealType'] })}
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="supplement">Supplement</option>
          </Select>
        </FormField>
        <FormField label="Calories">
          <CalorieInput
            value={values.calories}
            onChange={v => onChange(withManualNutrient(values as unknown as Record<string, unknown>, 'calories', v) as unknown as FoodFieldValues)}
            onEstimate={onEstimateCalories}
            estimating={estimatingCalories}
            isAiEstimate={values.caloriesSource === 'ai'}
            error={calorieError}
          />
        </FormField>
      </Row>
      {NUTRIENTS.filter(n => n.key !== 'calories').map(n => {
        const cf = values as unknown as Record<string, unknown>;
        const isAi = nutrientSourceOf(cf, n.key) === 'ai' && !!String(cf[n.key] ?? '');
        return (
          <FormField key={n.key} label={<UnitLabel label={n.label} unit={n.unit} />}>
            <TextInput
              type="number"
              step={n.step}
              min="0"
              inputMode="decimal"
              value={String(cf[n.key] ?? '')}
              onChange={e => onChange(withManualNutrient(cf, n.key, e.target.value) as unknown as FoodFieldValues)}
              placeholder={onEstimateCalories ? 'Auto' : n.unit}
              aria-label={`${n.label} (${n.unit})${isAi ? ', AI estimate' : ''}`}
              hint={isAi ? 'AI estimate — edit to override' : undefined}
            />
          </FormField>
        );
      })}
      <FormField label="Time Consumed">
        <DateTimeInput
          dateValue={values.consumedDate}
          timeValue={values.consumedTime}
          onDateChange={v => onChange({ ...values, consumedDate: v })}
          onTimeChange={v => onChange({ ...values, consumedTime: v })}
        />
      </FormField>
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
