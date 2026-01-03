'use client';

import React from 'react';
import { Input, Select, Textarea } from '@/components/ui';
import type { ExerciseFields as ExerciseFieldValues } from '@/lib/hooks/useCustomFields';

interface ExerciseFieldsProps {
  fields: ExerciseFieldValues;
  onChange: <K extends keyof ExerciseFieldValues>(key: K, value: ExerciseFieldValues[K]) => void;
  glass?: boolean;
}

const exerciseTypeOptions = [
  { value: 'cardio', label: 'Cardio' },
  { value: 'strength', label: 'Strength Training' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'running', label: 'Running' },
  { value: 'walking', label: 'Walking' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'swimming', label: 'Swimming' },
  { value: 'hiking', label: 'Hiking' },
  { value: 'other', label: 'Other' },
];

const intensityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const distanceUnitOptions = [
  { value: 'miles', label: 'Miles' },
  { value: 'km', label: 'Kilometers' },
];

export function ExerciseFields({ fields, onChange, glass }: ExerciseFieldsProps) {
  return (
    <div className="custom-fields-body space-y-3">
      <Select
        label="Exercise Type"
        value={fields.type}
        onChange={(e) => onChange('type', e.target.value as ExerciseFieldValues['type'])}
        options={exerciseTypeOptions}
        glass={glass}
      />

      {fields.type === 'other' && (
        <Input
          label="Specify Type"
          value={fields.otherType}
          onChange={(e) => onChange('otherType', e.target.value)}
          placeholder="Enter exercise type"
          glass={glass}
        />
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            label="Duration (minutes)"
            type="number"
            value={fields.duration}
            onChange={(e) => onChange('duration', e.target.value)}
            placeholder="30"
            glass={glass}
          />
        </div>
        <div className="flex-1">
          <Select
            label="Intensity"
            value={fields.intensity}
            onChange={(e) => onChange('intensity', e.target.value as ExerciseFieldValues['intensity'])}
            options={intensityOptions}
            glass={glass}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            label="Distance"
            type="number"
            step="0.1"
            value={fields.distance}
            onChange={(e) => onChange('distance', e.target.value)}
            placeholder="0.0"
            glass={glass}
          />
        </div>
        <div className="w-32">
          <Select
            label="Unit"
            value={fields.distanceUnit}
            onChange={(e) => onChange('distanceUnit', e.target.value as 'miles' | 'km')}
            options={distanceUnitOptions}
            glass={glass}
          />
        </div>
      </div>

      <Input
        label="Calories Burned"
        type="number"
        value={fields.calories}
        onChange={(e) => onChange('calories', e.target.value)}
        placeholder="0"
        glass={glass}
      />

      <Input
        label="Performed At"
        type="datetime-local"
        value={fields.performedAt}
        onChange={(e) => onChange('performedAt', e.target.value)}
        glass={glass}
      />

      <Textarea
        label="Notes"
        value={fields.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        placeholder="How did you feel? Any observations?"
        glass={glass}
        rows={3}
      />
    </div>
  );
}
