'use client';

import React from 'react';
import { Input, Select, Textarea } from '@/components/ui';
import type { FoodFields as FoodFieldValues } from '@/lib/hooks/useCustomFields';

interface FoodFieldsProps {
  fields: FoodFieldValues;
  onChange: <K extends keyof FoodFieldValues>(key: K, value: FoodFieldValues[K]) => void;
  glass?: boolean;
  noBorder?: boolean;
}

const mealTypeOptions = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function FoodFields({ fields, onChange, glass, noBorder }: FoodFieldsProps) {
  return (
    <div className={noBorder ? 'custom-fields-body-no-border space-y-3' : 'custom-fields-body space-y-3'}>
      <Select
        label="Meal Type"
        value={fields.mealType}
        onChange={(e) => onChange('mealType', e.target.value as FoodFieldValues['mealType'])}
        options={mealTypeOptions}
        glass={glass}
      />

      <Input
        label="Consumed At"
        type="datetime-local"
        value={fields.consumedAt}
        onChange={(e) => onChange('consumedAt', e.target.value)}
        glass={glass}
      />

      <Input
        label="Ingredients"
        value={fields.ingredients}
        onChange={(e) => onChange('ingredients', e.target.value)}
        placeholder="Comma-separated list of ingredients"
        glass={glass}
      />

      <Textarea
        label="Notes"
        value={fields.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        placeholder="How did this meal make you feel? Any reactions?"
        glass={glass}
        rows={3}
      />
    </div>
  );
}
