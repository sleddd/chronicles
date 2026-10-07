import type { DecryptedPost } from '@shared/crypto/types';
import { toDateStr } from './dateUtils.js';

/**
 * The calendar shows scheduled things only — events, meetings, tasks/todos,
 * goals and milestones — not ordinary journal entries. Returns the day an
 * entry belongs on, or null when it doesn't belong on the calendar.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}/;

function day(v: unknown): string | null {
  return typeof v === 'string' && DAY_RE.test(v) ? v.slice(0, 10) : null;
}

export function calendarDayFor(entry: DecryptedPost, topicName: string | undefined): string | null {
  const name = (topicName ?? '').toLowerCase();
  const cf = ((entry.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
  const created = () => toDateStr(entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt));
  switch (name) {
    case 'event':
    case 'meeting':
      return day(cf.startDate) ?? created();
    case 'task':
      return day(cf.deadline) ?? created();
    case 'goal':
    case 'milestone':
      return day(cf.targetDate);
    default:
      return null;
  }
}
