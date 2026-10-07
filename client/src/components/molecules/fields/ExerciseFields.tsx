import styled from 'styled-components';
import { Select } from '../../atoms/Select.js';
import { TextInput } from '../../atoms/TextInput.js';
import { Textarea } from '../../atoms/Textarea.js';
import { DateTimeInput } from '../../atoms/DateTimeInput.js';
import { FormField } from '../FormField.js';
import { CalorieInput } from './CalorieInput.js';
import type { ExerciseFieldValues } from '../../../types/fields.js';
export type { ExerciseFieldValues } from '../../../types/fields.js';

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

interface ExerciseFieldsProps {
  values: ExerciseFieldValues;
  onChange: (values: ExerciseFieldValues) => void;
  /** AI calorie estimate — the button shows only when this is provided */
  onEstimateCalories?: () => void;
  estimatingCalories?: boolean;
  calorieError?: string;
}

export function ExerciseFields({ values, onChange, onEstimateCalories, estimatingCalories, calorieError }: ExerciseFieldsProps) {
  return (
    <Wrapper>
      <Row>
        <FormField label="Type">
          <Select
            value={values.exerciseType}
            onChange={e => onChange({ ...values, exerciseType: e.target.value })}
          >
            <option value="running">Running</option>
            <option value="walking">Walking</option>
            <option value="cycling">Cycling</option>
            <option value="swimming">Swimming</option>
            <option value="strength">Strength Training</option>
            <option value="yoga">Yoga</option>
            <option value="cardio">Cardio</option>
            <option value="other">Other</option>
          </Select>
        </FormField>
        <FormField label="Intensity">
          <Select
            value={values.intensity}
            onChange={e => onChange({ ...values, intensity: e.target.value as ExerciseFieldValues['intensity'] })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </FormField>
      </Row>
      <Row>
        <FormField label="Duration (min)">
          <TextInput
            type="number"
            value={values.duration}
            onChange={e => onChange({ ...values, duration: e.target.value })}
            placeholder="Minutes"
          />
        </FormField>
        <FormField label="Calories">
          <CalorieInput
            value={values.calories}
            onChange={v => onChange({ ...values, calories: v, caloriesSource: 'manual' })}
            onEstimate={onEstimateCalories}
            estimating={estimatingCalories}
            isAiEstimate={values.caloriesSource === 'ai'}
            error={calorieError}
          />
        </FormField>
      </Row>
      <Row>
        <FormField label="Distance">
          <TextInput
            type="number"
            value={values.distance}
            onChange={e => onChange({ ...values, distance: e.target.value })}
            placeholder="0"
            step="0.1"
          />
        </FormField>
        <FormField label="Unit">
          <Select
            value={values.distanceUnit}
            onChange={e => onChange({ ...values, distanceUnit: e.target.value as ExerciseFieldValues['distanceUnit'] })}
          >
            <option value="miles">Miles</option>
            <option value="km">Kilometers</option>
          </Select>
        </FormField>
      </Row>
      <FormField label="Performed At">
        <DateTimeInput
          dateValue={values.performedDate}
          timeValue={values.performedTime}
          onDateChange={v => onChange({ ...values, performedDate: v })}
          onTimeChange={v => onChange({ ...values, performedTime: v })}
        />
      </FormField>
      <FormField label="Notes">
        <Textarea
          value={values.notes}
          onChange={e => onChange({ ...values, notes: e.target.value })}
          placeholder="Additional details"
          style={{ minHeight: 60 }}
        />
      </FormField>
    </Wrapper>
  );
}
