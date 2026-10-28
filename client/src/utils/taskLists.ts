/* Task formats and the filters shared by Planning and the dashboard's Tasks
   widget. A task is a single task, or a todo list (`taskFormat: 'list'`)
   whose items live in `checklist` — any number of them, ticked off in place.
   Pure helpers. */

import { taskStatusOf, type TaskStatus } from '../types/goals.js';
import { taskTypeOf, sameTaskType } from './taskTypes.js';
import type { SavedPlanView } from './planningView.js';

export type TaskFormat = 'single' | 'list';

export interface ChecklistItem { id: string; text: string; done: boolean }

type Fields = Record<string, unknown> | undefined;

export const isTodoList = (cf: Fields) => cf?.taskFormat === 'list';

/** A todo list's items (well-formed ones only — the fields are user data) */
export function checklistOf(cf: Fields): ChecklistItem[] {
  const raw = cf?.checklist;
  if (!Array.isArray(raw)) return [];
  return raw.filter((i): i is ChecklistItem =>
    !!i && typeof i === 'object' && typeof (i as ChecklistItem).id === 'string' && typeof (i as ChecklistItem).text === 'string')
    .map(i => ({ id: i.id, text: i.text, done: !!i.done }));
}

/** Done / total for a todo list; undefined for a single task or an empty list */
export function checklistProgress(cf: Fields): { done: number; total: number } | undefined {
  if (!isTodoList(cf)) return undefined;
  const items = checklistOf(cf);
  return items.length ? { done: items.filter(i => i.done).length, total: items.length } : undefined;
}

/** A new item at the end of the list (blank text adds nothing) */
export function addChecklistItem(items: ChecklistItem[], text: string, id: string): ChecklistItem[] {
  const t = text.trim();
  return t ? [...items, { id, text: t, done: false }] : items;
}

/** The fields of a new, empty todo list called `name` */
export function newTodoListFields(name: string): Record<string, unknown> {
  return {
    taskDescription: name.trim(), taskFormat: 'list', checklist: [],
    isInProgress: false, isCompleted: false, isAutoMigrating: false,
    parentGoalId: null, parentMilestoneId: null, deadline: '', priority: 'none',
  };
}

/** The filters a saved Planning view (or the board) puts on tasks */
export interface TaskFilter {
  /** 'tasks' = linked to a goal or milestone, 'todos' = not linked, 'all' = both */
  scope: 'tasks' | 'todos' | 'all';
  goalId?: number | null;
  milestoneId?: number | null;
  status?: TaskStatus | '' | string;
  taskType?: string;
}

export function filterOfView(v: SavedPlanView): TaskFilter {
  return {
    scope: v.tab === 'todos' ? 'todos' : 'tasks',
    goalId: v.goalId, milestoneId: v.milestoneId, status: v.status, taskType: v.taskType,
  };
}

/**
 * Whether a task's fields pass the filter. A task counts under a goal directly
 * or through its milestone (`milestoneGoal`: milestone id → its goal id).
 */
export function taskPassesFilter(cf: Fields, f: TaskFilter, milestoneGoal: Map<number, number | null>): boolean {
  const goal = (cf?.parentGoalId as number) || null;
  const milestone = (cf?.parentMilestoneId as number) || null;
  const linked = !!(goal || milestone);
  if (f.scope === 'tasks' && !linked) return false;
  if (f.scope === 'todos' && linked) return false;
  if (f.status && taskStatusOf(cf ?? {}) !== f.status) return false;
  if (f.taskType && !sameTaskType(taskTypeOf(cf), f.taskType)) return false;
  if (f.scope === 'todos') return true;
  if (f.milestoneId && milestone !== f.milestoneId) return false;
  if (f.goalId) {
    const goalOf = goal ?? (milestone ? milestoneGoal.get(milestone) ?? null : null);
    if (goalOf !== f.goalId) return false;
  }
  return true;
}
