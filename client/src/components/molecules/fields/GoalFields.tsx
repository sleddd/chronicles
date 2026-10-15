import styled from 'styled-components';
import { Select } from '../../atoms/Select.js';
import { TextInput } from '../../atoms/TextInput.js';
import { DateInput } from '../../atoms/DateInput.js';
import { FormField } from '../FormField.js';
import type { GoalFieldValues } from '../../../types/fields.js';
export type { GoalFieldValues } from '../../../types/fields.js';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

/* Single column: paired fields join the form's column so every label lines up */
const Row = styled.div`
  display: contents;
`;

interface GoalFieldsProps {
  values: GoalFieldValues;
  onChange: (values: GoalFieldValues) => void;
}

export function GoalFields({ values, onChange }: GoalFieldsProps) {
  return (
    <Wrapper>
      <FormField label="Goal/Objective">
        <TextInput
          value={values.goalObjective ?? ''}
          onChange={e => onChange({ ...values, goalObjective: e.target.value })}
          placeholder="What do you want to achieve?"
        />
      </FormField>
      <Row>
        <FormField label="Type">
          <Select
            value={values.goalType}
            onChange={e => onChange({ ...values, goalType: e.target.value as GoalFieldValues['goalType'] })}
          >
            <option value="short_term">Short-term</option>
            <option value="long_term">Long-term</option>
          </Select>
        </FormField>
        <FormField label="Status">
          <Select
            value={values.goalStatus}
            onChange={e => onChange({ ...values, goalStatus: e.target.value as GoalFieldValues['goalStatus'] })}
          >
            <option value="new">New</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </Select>
        </FormField>
      </Row>
      <FormField label="Target Date">
        <DateInput
          value={values.targetDate}
          onChange={e => onChange({ ...values, targetDate: e.target.value })}
        />
      </FormField>
    </Wrapper>
  );
}
