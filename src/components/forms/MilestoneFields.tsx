'use client';

import React from 'react';
import type { MilestoneFields as MilestoneFieldValues } from '@/lib/hooks/useCustomFields';

interface MilestoneFieldsProps {
  fields: MilestoneFieldValues;
  onChange: <K extends keyof MilestoneFieldValues>(key: K, value: MilestoneFieldValues[K]) => void;
  glass?: boolean;
  // Goal selector is usually provided externally with goals data
  goalSelector?: React.ReactNode;
}

export function MilestoneFields({ goalSelector }: MilestoneFieldsProps) {
  // The goal selector component is provided externally since it needs goals data
  // This component just provides the container structure
  return (
    <div className="custom-fields-body space-y-3">
      <div className="goal-selector">
        <label className="field-label">Link to Goals</label>
        {goalSelector || (
          <p className="text-sm text-gray-500">No goals available</p>
        )}
      </div>
    </div>
  );
}
