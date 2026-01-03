'use client';

import React from 'react';
import { Select, DateField, FieldGroup } from '@/components/ui';
import type { GoalFields as GoalFieldValues } from '@/lib/hooks/useCustomFields';

interface GoalFieldsProps {
  fields: GoalFieldValues;
  onChange: <K extends keyof GoalFieldValues>(key: K, value: GoalFieldValues[K]) => void;
  glass?: boolean;
}

const goalTypeOptions = [
  { value: 'short_term', label: 'Short Term' },
  { value: 'long_term', label: 'Long Term' },
];

const goalStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export function GoalFields({ fields, onChange, glass }: GoalFieldsProps) {
  return (
    <div className="custom-fields-body space-y-3">
      <Select
        label="Goal Type"
        value={fields.type}
        onChange={(e) => onChange('type', e.target.value as 'short_term' | 'long_term')}
        options={goalTypeOptions}
        glass={glass}
      />
      <Select
        label="Status"
        value={fields.status}
        onChange={(e) => onChange('status', e.target.value as 'active' | 'completed' | 'archived')}
        options={goalStatusOptions}
        glass={glass}
      />
      <FieldGroup label="Target Date">
        <DateField
          value={fields.targetDate}
          onChange={(value) => onChange('targetDate', value)}
          glass={glass}
        />
      </FieldGroup>
    </div>
  );
}
