'use client';

import { useState, useCallback } from 'react';

// Field value types for each custom type
export interface TaskFields {
  isCompleted: boolean;
  isAutoMigrating: boolean;
}

export interface GoalFields {
  type: 'short_term' | 'long_term';
  status: 'active' | 'completed' | 'archived';
  targetDate: string;
}

export interface MilestoneFields {
  goalIds: string[];
}

export interface MeetingFields {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  address: string;
  phone: string;
  topic: string;
  attendees: string;
  notes: string;
}

export interface EventFields {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  address: string;
  phone: string;
  notes: string;
}

export interface MedicationFields {
  dosage: string;
  frequency: 'once_daily' | 'twice_daily' | 'three_times_daily' | 'as_needed' | 'custom';
  scheduleTimes: string[];
  isActive: boolean;
  notes: string;
}

export interface ExerciseFields {
  type: 'yoga' | 'cardio' | 'strength' | 'swimming' | 'running' | 'cycling' | 'walking' | 'hiking' | 'other';
  otherType: string;
  duration: string;
  intensity: 'low' | 'medium' | 'high';
  distance: string;
  distanceUnit: 'miles' | 'km';
  calories: string;
  performedAt: string;
  notes: string;
}

export interface FoodFields {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  consumedAt: string;
  ingredients: string;
  notes: string;
}

export interface SymptomFields {
  severity: number;
  occurredAt: string;
  duration: string;
  notes: string;
}

export type CustomFieldValues =
  | TaskFields
  | GoalFields
  | MilestoneFields
  | MeetingFields
  | EventFields
  | MedicationFields
  | ExerciseFields
  | FoodFields
  | SymptomFields
  | Record<string, unknown>;

// Default values for each custom type
const defaultFieldsByType: Record<string, CustomFieldValues> = {
  task: {
    isCompleted: false,
    isAutoMigrating: true,
  } as TaskFields,
  goal: {
    type: 'short_term',
    status: 'active',
    targetDate: '',
  } as GoalFields,
  milestone: {
    goalIds: [],
  } as MilestoneFields,
  meeting: {
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '10:00',
    location: '',
    address: '',
    phone: '',
    topic: '',
    attendees: '',
    notes: '',
  } as MeetingFields,
  event: {
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '10:00',
    location: '',
    address: '',
    phone: '',
    notes: '',
  } as EventFields,
  medication: {
    dosage: '',
    frequency: 'once_daily',
    scheduleTimes: ['08:00'],
    isActive: true,
    notes: '',
  } as MedicationFields,
  exercise: {
    type: 'cardio',
    otherType: '',
    duration: '',
    intensity: 'medium',
    distance: '',
    distanceUnit: 'miles',
    calories: '',
    performedAt: '',
    notes: '',
  } as ExerciseFields,
  food: {
    mealType: 'breakfast',
    consumedAt: '',
    ingredients: '',
    notes: '',
  } as FoodFields,
  symptom: {
    severity: 5,
    occurredAt: '',
    duration: '',
    notes: '',
  } as SymptomFields,
};

export function getDefaultFields(customType: string | null): CustomFieldValues {
  if (!customType) return {};
  return { ...(defaultFieldsByType[customType] || {}) };
}

export function useCustomFields<T extends CustomFieldValues = CustomFieldValues>(
  customType: string | null
) {
  const [fields, setFields] = useState<T>(() => getDefaultFields(customType) as T);

  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateFields = useCallback((updates: Partial<T>) => {
    setFields((prev) => ({ ...prev, ...updates }));
  }, []);

  const reset = useCallback((newType?: string | null) => {
    const type = newType !== undefined ? newType : customType;
    setFields(getDefaultFields(type) as T);
  }, [customType]);

  const loadFields = useCallback((loadedFields: Partial<T>) => {
    setFields((prev) => ({ ...prev, ...loadedFields }));
  }, []);

  return {
    fields,
    setFields,
    updateField,
    updateFields,
    reset,
    loadFields,
  };
}

// Helper to convert fields to API format for saving
export function fieldsToCustomFieldEntries(
  customType: string,
  fields: CustomFieldValues
): Array<{ fieldKey: string; value: unknown }> {
  const entries: Array<{ fieldKey: string; value: unknown }> = [];

  switch (customType) {
    case 'task': {
      const taskFields = fields as TaskFields;
      entries.push({ fieldKey: 'isCompleted', value: taskFields.isCompleted });
      entries.push({ fieldKey: 'isAutoMigrating', value: taskFields.isAutoMigrating });
      break;
    }
    case 'goal': {
      const goalFields = fields as GoalFields;
      entries.push({ fieldKey: 'type', value: goalFields.type });
      entries.push({ fieldKey: 'status', value: goalFields.status });
      entries.push({ fieldKey: 'targetDate', value: goalFields.targetDate });
      break;
    }
    case 'milestone': {
      // Milestone goalIds are handled separately via entry_relationships
      break;
    }
    case 'meeting': {
      const meetingFields = fields as MeetingFields;
      entries.push({ fieldKey: 'startDate', value: meetingFields.startDate });
      entries.push({ fieldKey: 'startTime', value: meetingFields.startTime });
      entries.push({ fieldKey: 'endDate', value: meetingFields.endDate });
      entries.push({ fieldKey: 'endTime', value: meetingFields.endTime });
      entries.push({ fieldKey: 'location', value: meetingFields.location });
      entries.push({ fieldKey: 'address', value: meetingFields.address });
      entries.push({ fieldKey: 'phone', value: meetingFields.phone });
      entries.push({ fieldKey: 'topic', value: meetingFields.topic });
      entries.push({ fieldKey: 'attendees', value: meetingFields.attendees });
      entries.push({ fieldKey: 'notes', value: meetingFields.notes });
      break;
    }
    case 'event': {
      const eventFields = fields as EventFields;
      entries.push({ fieldKey: 'startDate', value: eventFields.startDate });
      entries.push({ fieldKey: 'startTime', value: eventFields.startTime });
      entries.push({ fieldKey: 'endDate', value: eventFields.endDate });
      entries.push({ fieldKey: 'endTime', value: eventFields.endTime });
      entries.push({ fieldKey: 'location', value: eventFields.location });
      entries.push({ fieldKey: 'address', value: eventFields.address });
      entries.push({ fieldKey: 'phone', value: eventFields.phone });
      entries.push({ fieldKey: 'notes', value: eventFields.notes });
      break;
    }
    case 'medication': {
      const medFields = fields as MedicationFields;
      entries.push({ fieldKey: 'dosage', value: medFields.dosage });
      entries.push({ fieldKey: 'frequency', value: medFields.frequency });
      entries.push({ fieldKey: 'scheduleTimes', value: medFields.scheduleTimes });
      entries.push({ fieldKey: 'isActive', value: medFields.isActive });
      entries.push({ fieldKey: 'notes', value: medFields.notes });
      break;
    }
    case 'exercise': {
      const exerciseFields = fields as ExerciseFields;
      const exerciseType = exerciseFields.type === 'other' ? exerciseFields.otherType : exerciseFields.type;
      entries.push({ fieldKey: 'exerciseType', value: exerciseType });
      entries.push({ fieldKey: 'duration', value: exerciseFields.duration ? parseInt(exerciseFields.duration) : null });
      entries.push({ fieldKey: 'intensity', value: exerciseFields.intensity });
      entries.push({ fieldKey: 'distance', value: exerciseFields.distance ? parseFloat(exerciseFields.distance) : null });
      entries.push({ fieldKey: 'distanceUnit', value: exerciseFields.distanceUnit });
      entries.push({ fieldKey: 'calories', value: exerciseFields.calories ? parseInt(exerciseFields.calories) : null });
      entries.push({ fieldKey: 'performedAt', value: exerciseFields.performedAt });
      entries.push({ fieldKey: 'notes', value: exerciseFields.notes });
      break;
    }
    case 'food': {
      const foodFields = fields as FoodFields;
      const ingredientsArray = foodFields.ingredients
        .split(',')
        .map((i) => i.trim())
        .filter((i) => i.length > 0);
      entries.push({ fieldKey: 'mealType', value: foodFields.mealType });
      entries.push({ fieldKey: 'consumedAt', value: foodFields.consumedAt });
      entries.push({ fieldKey: 'ingredients', value: ingredientsArray });
      entries.push({ fieldKey: 'notes', value: foodFields.notes });
      break;
    }
    case 'symptom': {
      const symptomFields = fields as SymptomFields;
      entries.push({ fieldKey: 'severity', value: symptomFields.severity });
      entries.push({ fieldKey: 'occurredAt', value: symptomFields.occurredAt });
      entries.push({ fieldKey: 'duration', value: symptomFields.duration ? parseInt(symptomFields.duration) : null });
      entries.push({ fieldKey: 'notes', value: symptomFields.notes });
      break;
    }
  }

  return entries;
}
