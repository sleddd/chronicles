import styled from 'styled-components';
import { Select } from '../../atoms/Select.js';
import { TextInput } from '../../atoms/TextInput.js';
import { Textarea } from '../../atoms/Textarea.js';
import { DateTimeInput } from '../../atoms/DateTimeInput.js';
import { FormField } from '../FormField.js';
import { CalorieInput } from './CalorieInput.js';
import { NutrientGrid } from '../NutrientGrid.js';
import { NUTRIENTS, nutrientSourceOf, withManualNutrient, type NutrientKey } from '../../../types/nutrition.js';

/** Everything but calories, which has its own field with the AI Estimate button */
const MICRONUTRIENTS = NUTRIENTS.filter(n => n.key !== 'calories');
import type { FoodFieldValues } from '../../../types/fields.js';
export type { FoodFieldValues } from '../../../types/fields.js';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

/* Single column: paired fields join the form's column so every label lines up */
const Row = styled.div`
  display: contents;
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
            <option value="medication">Medication</option>
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
      <FormField label="Nutrients">
        <NutrientGrid
          nutrients={MICRONUTRIENTS}
          values={values as unknown as Record<string, unknown>}
          onChange={(key, v) => onChange(withManualNutrient(values as unknown as Record<string, unknown>, key as NutrientKey, v) as unknown as FoodFieldValues)}
          placeholders={onEstimateCalories ? Object.fromEntries(MICRONUTRIENTS.map(n => [n.key, 'Auto'])) : undefined}
          aiKeys={new Set(MICRONUTRIENTS
            .filter(n => nutrientSourceOf(values as unknown as Record<string, unknown>, n.key) === 'ai' && !!String((values as unknown as Record<string, unknown>)[n.key] ?? ''))
            .map(n => n.key as string))}
        />
      </FormField>
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
