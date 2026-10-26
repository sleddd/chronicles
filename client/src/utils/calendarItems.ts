import type { DecryptedPost } from '@shared/crypto/types';
import { toDateStr } from './dateUtils.js';

/**
 * The calendar shows events and meetings only (bills due come from Finance) —
 * no tasks, goals, milestones or journal entries. Returns the day an entry
 * belongs on, or null when it doesn't belong on the calendar.
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
    case 'events':
    case 'meeting':
    case 'meetings':
      return day(cf.startDate) ?? created();
    default:
      return null;
  }
}
