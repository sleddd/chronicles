'use client';

import React from 'react';
import { Input, Textarea, RangeField } from '@/components/ui';
import type { SymptomFields as SymptomFieldValues } from '@/lib/hooks/useCustomFields';

interface SymptomFieldsProps {
  fields: SymptomFieldValues;
  onChange: <K extends keyof SymptomFieldValues>(key: K, value: SymptomFieldValues[K]) => void;
  glass?: boolean;
}

export function SymptomFields({ fields, onChange, glass }: SymptomFieldsProps) {
  const getSeverityLabel = (value: number): string => {
    if (value <= 2) return `${value} - Mild`;
    if (value <= 4) return `${value} - Moderate`;
    if (value <= 6) return `${value} - Significant`;
    if (value <= 8) return `${value} - Severe`;
    return `${value} - Very Severe`;
  };

  return (
    <div className="custom-fields-body space-y-3">
      <RangeField
        label="Severity"
        value={fields.severity}
        onChange={(value) => onChange('severity', value)}
        min={1}
        max={10}
        step={1}
        valueLabel={getSeverityLabel}
      />

      <Input
        label="Occurred At"
        type="datetime-local"
        value={fields.occurredAt}
        onChange={(e) => onChange('occurredAt', e.target.value)}
        glass={glass}
      />

      <Input
        label="Duration (minutes)"
        type="number"
        value={fields.duration}
        onChange={(e) => onChange('duration', e.target.value)}
        placeholder="How long did it last?"
        glass={glass}
      />

      <Textarea
        label="Notes"
        value={fields.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        placeholder="Describe the symptom, possible triggers, relief measures..."
        glass={glass}
        rows={3}
      />
    </div>
  );
}
