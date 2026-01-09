'use client';

import React from 'react';
import { Input, Select, Textarea, CheckboxField, TimeField, Button } from '@/components/ui';
import type { MedicationFields as MedicationFieldValues } from '@/lib/hooks/useCustomFields';

interface MedicationFieldsProps {
  fields: MedicationFieldValues;
  onChange: <K extends keyof MedicationFieldValues>(key: K, value: MedicationFieldValues[K]) => void;
  glass?: boolean;
  noBorder?: boolean;
}

const frequencyOptions = [
  { value: 'once_daily', label: 'Once daily' },
  { value: 'twice_daily', label: 'Twice daily' },
  { value: 'three_times_daily', label: 'Three times daily' },
  { value: 'as_needed', label: 'As needed' },
  { value: 'custom', label: 'Custom schedule' },
];

export function MedicationFields({ fields, onChange, glass, noBorder }: MedicationFieldsProps) {
  const handleAddTime = () => {
    onChange('scheduleTimes', [...fields.scheduleTimes, '12:00']);
  };

  const handleRemoveTime = (index: number) => {
    const newTimes = fields.scheduleTimes.filter((_, i) => i !== index);
    onChange('scheduleTimes', newTimes.length > 0 ? newTimes : ['08:00']);
  };

  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...fields.scheduleTimes];
    newTimes[index] = value;
    onChange('scheduleTimes', newTimes);
  };

  return (
    <div className={noBorder ? 'custom-fields-body-no-border space-y-3' : 'custom-fields-body space-y-3'}>
      <Input
        label="Dosage"
        value={fields.dosage}
        onChange={(e) => onChange('dosage', e.target.value)}
        placeholder="e.g., 10mg, 2 tablets"
        glass={glass}
      />
      <Select
        label="Frequency"
        value={fields.frequency}
        onChange={(e) => onChange('frequency', e.target.value as MedicationFieldValues['frequency'])}
        options={frequencyOptions}
        glass={glass}
      />

      <div className="schedule-times">
        <label className="field-label">Schedule Times</label>
        {fields.scheduleTimes.map((time, index) => (
          <div key={index} className="schedule-time-row">
            <TimeField
              value={time}
              onChange={(value) => handleTimeChange(index, value)}
              glass={glass}
              className="schedule-time-input"
            />
            {fields.scheduleTimes.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveTime(index)}
                className="schedule-time-remove"
                aria-label="Remove time"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAddTime}
          className="schedule-time-add"
        >
          + Add Time
        </Button>
      </div>

      <CheckboxField
        label="Currently Active"
        checked={fields.isActive}
        onChange={(checked) => onChange('isActive', checked)}
      />

      <Textarea
        label="Notes"
        value={fields.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        placeholder="Additional notes (side effects, instructions, etc.)"
        glass={glass}
        rows={3}
      />
    </div>
  );
}
