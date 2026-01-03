// Form components barrel export

export { TaskFields } from './TaskFields';
export { GoalFields } from './GoalFields';
export { MilestoneFields } from './MilestoneFields';
export { MeetingFields } from './MeetingFields';
export { EventFields } from './EventFields';
export { MedicationFields } from './MedicationFields';
export { ExerciseFields } from './ExerciseFields';
export { FoodFields } from './FoodFields';
export { SymptomFields } from './SymptomFields';

import { TaskFields } from './TaskFields';
import { GoalFields } from './GoalFields';
import { MilestoneFields } from './MilestoneFields';
import { MeetingFields } from './MeetingFields';
import { EventFields } from './EventFields';
import { MedicationFields } from './MedicationFields';
import { ExerciseFields } from './ExerciseFields';
import { FoodFields } from './FoodFields';
import { SymptomFields } from './SymptomFields';

// Registry for dynamic rendering based on custom type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CustomFieldForms: Record<string, React.ComponentType<any>> = {
  task: TaskFields,
  goal: GoalFields,
  milestone: MilestoneFields,
  meeting: MeetingFields,
  event: EventFields,
  medication: MedicationFields,
  exercise: ExerciseFields,
  food: FoodFields,
  symptom: SymptomFields,
};

// Helper to check if a type has custom fields
export function hasCustomFields(customType: string | null | undefined): boolean {
  return !!customType && customType in CustomFieldForms;
}
