import styled from 'styled-components';
import { RangeInput } from '../../atoms/RangeInput.js';
import { TextInput } from '../../atoms/TextInput.js';
import { Textarea } from '../../atoms/Textarea.js';
import { DateTimeInput } from '../../atoms/DateTimeInput.js';
import { FormField } from '../FormField.js';
import type { SymptomFieldValues } from '../../../types/fields.js';
export type { SymptomFieldValues } from '../../../types/fields.js';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

/* Single column: paired fields join the form's column so every label lines up */
const Row = styled.div`
  display: contents;
`;

interface SymptomFieldsProps {
  values: SymptomFieldValues;
  onChange: (values: SymptomFieldValues) => void;
}

export function SymptomFields({ values, onChange }: SymptomFieldsProps) {
  return (
    <Wrapper>
      <FormField label="Severity">
        <RangeInput
          min={1}
          max={10}
          value={values.severity}
          displayValue={`${values.severity}/10`}
          onChange={e => onChange({ ...values, severity: parseInt((e.target as HTMLInputElement).value) })}
        />
      </FormField>
      <FormField label="Time Occurred">
        <DateTimeInput
          dateValue={values.occurredDate}
          timeValue={values.occurredTime}
          onDateChange={v => onChange({ ...values, occurredDate: v })}
          onTimeChange={v => onChange({ ...values, occurredTime: v })}
        />
      </FormField>
      <Row>
        <FormField label="Duration (minutes)">
          <TextInput
            type="number"
            value={values.duration}
            onChange={e => onChange({ ...values, duration: e.target.value })}
            placeholder="Minutes"
          />
        </FormField>
      </Row>
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
