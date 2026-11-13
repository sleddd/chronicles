import type { DecryptedPost } from '@shared/crypto/types';
import { toDateStr } from './dateUtils.js';
import { effectiveDay } from './planner.js';

/**
 * What the calendar shows: events and meetings (on `startDate`, else the day
 * written) and tasks planned for a day in Planning → Planner (`scheduledDate`;
 * an unfinished auto-migrating one whose day has passed shows under `today`).
 * Bills due come from Finance. No goals, milestones, journal entries or tasks
 * without a day. Returns the day an entry belongs on, or null when it doesn't
 * belong on the calendar.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}/;

function day(v: unknown): string | null {
  return typeof v === 'string' && DAY_RE.test(v) ? v.slice(0, 10) : null;
}

const EVENT_TOPICS = ['event', 'events', 'meeting', 'meetings'];
const TASK_TOPICS = ['task', 'tasks'];

export const isEventTopic = (topicName: string | undefined): boolean => EVENT_TOPICS.includes((topicName ?? '').toLowerCase());
export const isTaskTopic = (topicName: string | undefined): boolean => TASK_TOPICS.includes((topicName ?? '').toLowerCase());

export function calendarDayFor(entry: DecryptedPost, topicName: string | undefined, today: string = toDateStr(new Date())): string | null {
  const cf = ((entry.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
  const created = () => toDateStr(entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt));
  if (isEventTopic(topicName)) return day(cf.startDate) ?? created();
  if (isTaskTopic(topicName)) {
    const scheduled = day(cf.scheduledDate);
    return scheduled ? effectiveDay({ scheduled, done: !!cf.isCompleted, autoMigrate: !!cf.isAutoMigrating }, today) : null;
  }
  return null;
}
