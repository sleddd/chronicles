import { useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { TextInput } from '../../atoms/TextInput.js';
import { Select } from '../../atoms/Select.js';
import { Textarea } from '../../atoms/Textarea.js';
import { Checkbox } from '../../atoms/Checkbox.js';
import { FormField } from '../FormField.js';
import { NutrientGrid } from '../NutrientGrid.js';
import { DOSE_NUTRIENTS, parseMedNutrients } from '../../../utils/medNutrients.js';
import type { MedicationFieldValues } from '../../../types/fields.js';
export type { MedicationFieldValues } from '../../../types/fields.js';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

/* Single column: paired fields join the form's column so every label lines up */
const Row = styled.div`
  display: contents;
`;

/* Times sit inline (filled boxes from FormField) with "+ Add time" after them */
const Times = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
`;

const TimeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const TimeInput = styled.input`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
`;

const RemoveBtn = styled.button`
  display: flex;
  padding: 4px;
  color: var(--text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  &:hover { color: var(--color-danger); }
`;

const AddLink = styled.button`
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-accent);
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;


interface MedicationFieldsProps {
  values: MedicationFieldValues;
  onChange: (values: MedicationFieldValues) => void;
  /** The medication's name (entry text) — lets "Vitamin D3 1000 IU" prefill its nutrients. */
  entryName?: string;
}

export function MedicationFields({ values, onChange, entryName = '' }: MedicationFieldsProps) {
  const cf = values as unknown as Record<string, unknown>;
  const detected = parseMedNutrients(entryName, values.dosage ?? '');
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notesOpen || !!values.notes;
  const aiKeys = new Set(cf.doseNutrientSource === 'ai'
    ? DOSE_NUTRIENTS.filter(n => String(cf[n.key] ?? '') !== '').map(n => n.key as string)
    : []);
  const placeholders = Object.fromEntries(DOSE_NUTRIENTS.map(n => [n.key, detected[n.key] !== undefined ? String(detected[n.key]) : '']));
  const setNutrient = (key: string, v: string) =>
    onChange({ ...cf, [key]: v, doseNutrientSource: 'manual' } as unknown as MedicationFieldValues);

  const addTime = () => {
    onChange({ ...values, scheduleTimes: [...values.scheduleTimes, '08:00'] });
  };

  const removeTime = (index: number) => {
    onChange({ ...values, scheduleTimes: values.scheduleTimes.filter((_, i) => i !== index) });
  };

  const updateTime = (index: number, time: string) => {
    const times = [...values.scheduleTimes];
    times[index] = time;
    onChange({ ...values, scheduleTimes: times });
  };

  return (
    <Wrapper>
      <FormField label="Medication Name">
        <TextInput
          value={values.medicationName ?? ''}
          onChange={e => onChange({ ...values, medicationName: e.target.value })}
          placeholder="e.g. Montelukast"
        />
      </FormField>
      <Row>
        <FormField label="Dosage">
          <TextInput
            value={values.dosage}
            onChange={e => onChange({ ...values, dosage: e.target.value })}
            placeholder="e.g. 500mg"
          />
        </FormField>
        <FormField label="Frequency">
          <Select
            value={values.frequency}
            onChange={e => onChange({ ...values, frequency: e.target.value as MedicationFieldValues['frequency'] })}
          >
            <option value="once_daily">Once daily</option>
            <option value="twice_daily">Twice daily</option>
            <option value="three_times_daily">Three times daily</option>
            <option value="as_needed">As needed</option>
            <option value="custom">Custom</option>
          </Select>
        </FormField>
      </Row>
      <FormField label="Nutrients per dose">
        <NutrientGrid
          nutrients={DOSE_NUTRIENTS}
          values={cf}
          onChange={setNutrient}
          placeholders={placeholders}
          aiKeys={aiKeys}
          note="Counted in your Meals log when you mark a dose taken. Leave blank to fill from the name and dosage, or by In-App AI."
        />
      </FormField>
      <FormField label="Schedule">
        <Times>
          {values.scheduleTimes.map((time, i) => (
            <TimeRow key={i}>
              <TimeInput
                type="time"
                value={time}
                onChange={e => updateTime(i, e.target.value)}
                aria-label={`Dose time ${i + 1}`}
              />
              <RemoveBtn type="button" onClick={() => removeTime(i)} aria-label={`Remove ${time}`}>
                <Icon name="x" size={14} strokeWidth={2} />
              </RemoveBtn>
            </TimeRow>
          ))}
          <AddLink type="button" onClick={addTime}>
            <Icon name="plus" size={13} strokeWidth={2} /> Add time
          </AddLink>
        </Times>
      </FormField>
      <FormField label="Status">
        <Checkbox
          checked={values.isActive}
          onChange={v => onChange({ ...values, isActive: v })}
          label="Currently active"
        />
      </FormField>
      {showNotes ? (
        <FormField label="Notes">
          <Textarea
            value={values.notes}
            onChange={e => onChange({ ...values, notes: e.target.value })}
            placeholder="e.g. Take with food"
            style={{ minHeight: 60 }}
            autoFocus={notesOpen && !values.notes}
          />
        </FormField>
      ) : (
        <FormField label="Notes">
          <div>
            <AddLink type="button" onClick={() => setNotesOpen(true)}>
              <Icon name="plus" size={13} strokeWidth={2} /> Add notes
            </AddLink>
          </div>
        </FormField>
      )}
    </Wrapper>
  );
}
