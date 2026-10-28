export interface GoalEntry {
  id: number;
  content: string;
  title: string;
  goalType: string;
  goalStatus: string;
  targetDate: string;
  customFields: Record<string, unknown>;
  taxonomyId: number;
  createdAt: Date;
  /** Entry's featured image (from metadata._images/_featuredKey), when set */
  featuredImage?: { key: string; iv: string; mimeType: string } | null;
}

/* Roadmap (Kanban) status columns for goals. */
export type RoadmapStatus = 'new' | 'planned' | 'in_progress' | 'paused' | 'completed';

export const ROADMAP_COLUMNS: { key: RoadmapStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'planned', label: 'Planned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

/* Goals' board also has Paused (milestones keep the four above) */
export const GOAL_COLUMNS: { key: RoadmapStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'planned', label: 'Planned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Achieved' },
];

/* Map any stored/legacy goalStatus onto one of the four roadmap columns.
   Legacy: active→new, archived→new; in_progress/completed unchanged. */
export function normalizeRoadmapStatus(raw: unknown): RoadmapStatus {
  switch (raw) {
    case 'planned':     return 'planned';
    case 'in_progress': return 'in_progress';
    case 'paused':      return 'paused';
    case 'completed':   return 'completed';
    case 'new':
    case 'active':
    case 'archived':
    default:            return 'new';
  }
}

/* Milestones store both milestoneStatus and an isCompleted flag. Map them onto
   the same four roadmap columns. isCompleted wins. Legacy: not_started/active→new. */
export function normalizeMilestoneRoadmapStatus(milestoneStatus: unknown, isCompleted: boolean): RoadmapStatus {
  if (isCompleted) return 'completed';
  switch (milestoneStatus) {
    case 'completed':   return 'completed';
    case 'in_progress': return 'in_progress';
    case 'planned':     return 'planned';
    case 'new':
    case 'not_started':
    case 'active':
    default:            return 'new';
  }
}

/* Convert a chosen roadmap column back into the milestone's stored fields. */
export function milestoneFieldsForStatus(status: RoadmapStatus): { milestoneStatus: string; isCompleted: boolean } {
  switch (status) {
    case 'completed':   return { milestoneStatus: 'completed', isCompleted: true };
    case 'in_progress': return { milestoneStatus: 'in_progress', isCompleted: false };
    case 'planned':     return { milestoneStatus: 'planned', isCompleted: false };
    case 'new':
    default:            return { milestoneStatus: 'not_started', isCompleted: false };
  }
}

export interface MilestoneEntryData {
  id: number;
  content: string;
  title: string;
  milestoneStatus: string;
  isCompleted: boolean;
  targetDate: string;
  parentGoalId: number | null;
  customFields: Record<string, unknown>;
  taxonomyId: number;
  createdAt: Date;
}

export interface TaskEntryData {
  id: number;
  content: string;
  title: string;
  isCompleted: boolean;
  parentGoalId: number | null;
  parentMilestoneId: number | null;
  priority: string;
  customFields: Record<string, unknown>;
  taxonomyId: number;
  createdAt: Date;
}

/* Task (and todo) board columns. A task stores isInProgress, isInReview and
   isCompleted; isCompleted wins, then isInReview. */
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';

export const TASK_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'done', label: 'Done' },
];

export function taskStatusOf(cf: Record<string, unknown>): TaskStatus {
  if (cf.isCompleted) return 'done';
  if (cf.isInReview) return 'in_review';
  if (cf.isInProgress) return 'in_progress';
  return 'todo';
}

/* Convert a chosen task column back into the task's stored fields. */
export function taskFieldsForStatus(status: TaskStatus): { isInProgress: boolean; isInReview: boolean; isCompleted: boolean } {
  return { isInProgress: status === 'in_progress', isInReview: status === 'in_review', isCompleted: status === 'done' };
}
