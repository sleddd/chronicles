'use client';

import React from 'react';
import { CheckboxField } from '@/components/ui';
import type { TaskFields as TaskFieldValues } from '@/lib/hooks/useCustomFields';

interface TaskFieldsProps {
  fields: TaskFieldValues;
  onChange: <K extends keyof TaskFieldValues>(key: K, value: TaskFieldValues[K]) => void;
  glass?: boolean;
  noBorder?: boolean;
}

export function TaskFields({ fields, onChange, noBorder }: TaskFieldsProps) {
  return (
    <div className={noBorder ? 'custom-fields-body-no-border space-y-3' : 'custom-fields-body space-y-3'}>
      <CheckboxField
        label="In Progress"
        checked={fields.isInProgress}
        onChange={(checked) => onChange('isInProgress', checked)}
      />
      <CheckboxField
        label="Completed"
        checked={fields.isCompleted}
        onChange={(checked) => onChange('isCompleted', checked)}
      />
      <CheckboxField
        label="Auto-migrate incomplete tasks"
        checked={fields.isAutoMigrating}
        onChange={(checked) => onChange('isAutoMigrating', checked)}
      />
    </div>
  );
}
