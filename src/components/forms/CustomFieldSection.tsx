'use client';

import React, { useState, useEffect } from 'react';

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
 * Collapsible on both mobile and desktop. Default: collapsed on mobile, expanded on desktop.
 */
export function CustomFieldSection({
  fieldType,
  customType,
  selectedTopicName,
  title,
  children,
}: CustomFieldSectionProps) {
  // Default to expanded on desktop, collapsed on mobile
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Set initial state based on screen size - collapse on mobile
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setIsExpanded(false);
    }
  }, []);

  // Check if this section should be visible
  const isVisible =
    customType === fieldType ||
    selectedTopicName?.toLowerCase() === fieldType;

  if (!isVisible) {
    return null;
  }

  return (
    <div className="custom-fields mt-4">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="custom-fields-header w-full flex items-center justify-between cursor-pointer"
      >
        <h3 className="custom-fields-title">{title}</h3>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="mt-2">
          {children}
        </div>
      )}
    </div>
  );
}
