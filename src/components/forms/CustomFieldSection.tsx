'use client';

import React from 'react';

export type CustomFieldType =
  | 'task'
  | 'goal'
  | 'milestone'
  | 'medication'
  | 'food'
  | 'symptom'
  | 'event'
  | 'meeting'
  | 'exercise';

interface CustomFieldSectionProps {
  /** The field type this section handles */
  fieldType: CustomFieldType;
  /** The customType prop passed to the editor (explicit type override) */
  customType?: CustomFieldType | null;
  /** The selected topic name (decrypted, used for type inference) */
  selectedTopicName?: string | null;
  /** The title to display in the header */
  title: string;
  /** The field component(s) to render inside */
  children: React.ReactNode;
}

/**
 * Wrapper component that handles visibility logic for custom field sections.
 * Shows the section only when the entry type matches the fieldType.
 * Type is determined by customType prop OR topic name (case-insensitive).
 */
export function CustomFieldSection({
  fieldType,
  customType,
  selectedTopicName,
  title,
  children,
}: CustomFieldSectionProps) {
  // Check if this section should be visible
  const isVisible =
    customType === fieldType ||
    selectedTopicName?.toLowerCase() === fieldType;

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <div className="border-t border-border my-4" />
      <div className="custom-fields">
        <div className="custom-fields-header">
          <h3 className="custom-fields-title">{title}</h3>
        </div>
        {children}
      </div>
    </>
  );
}
