import { describe, it, expect } from 'vitest';
import {
  startTimer, stopTimer, runningSession, totalMs, formatSpent, formatClock, addManualTime,
  removeSession, sessionsFor, totalMinutes, pruneSessions, parseSessions, isTimeTrackingTopic, timePeriodStart, timeByEntry, type TimeSession,
} from '../../utils/timeTracking';

const t = (iso: string) => new Date(iso);

describe('timeTracking', () => {
  it('starts and stops a timer, adding up its time', () => {
    let s: TimeSession[] = [];
    s = startTimer(s, 7, t('2026-11-05T09:00:00Z'), 'a');
    expect(runningSession(s)?.entryId).toBe(7);
    expect(totalMs(s, 7, t('2026-11-05T09:30:00Z'))).toBe(30 * 60_000);
    s = stopTimer(s, t('2026-11-05T10:15:00Z'));
    expect(runningSession(s)).toBeNull();
    expect(formatSpent(totalMs(s, 7, t('2026-11-06T00:00:00Z')))).toBe('1 h 15 min');
  });

  it('runs one timer at a time: starting another stops the first', () => {
    let s = startTimer([], 1, t('2026-11-05T09:00:00Z'), 'a');
    s = startTimer(s, 2, t('2026-11-05T09:20:00Z'), 'b');
    expect(s.filter(x => x.end === null)).toHaveLength(1);
    expect(runningSession(s)?.entryId).toBe(2);
    expect(totalMs(s, 1, t('2026-11-05T12:00:00Z'))).toBe(20 * 60_000);
  });

  it('drops a run under a second', () => {
    const s = startTimer([], 1, t('2026-11-05T09:00:00.000Z'), 'a');
    expect(stopTimer(s, t('2026-11-05T09:00:00.400Z'))).toEqual([]);
  });

  it('adds and removes time by hand', () => {
    let s = addManualTime([], 3, '2026-11-04', 45, 'm');
    expect(s[0].manual).toBe(true);
    expect(totalMinutes(s, 3, new Date())).toBe(45);
    expect(addManualTime(s, 3, '2026-11-04', 0, 'x')).toBe(s);
    s = removeSession(s, 'm');
    expect(s).toEqual([]);
  });

  it('lists an entry’s sessions newest first and prunes deleted entries', () => {
    const s = [
      { id: 'a', entryId: 1, start: '2026-11-01T09:00:00Z', end: '2026-11-01T10:00:00Z' },
      { id: 'b', entryId: 1, start: '2026-11-03T09:00:00Z', end: '2026-11-03T09:30:00Z' },
      { id: 'c', entryId: 2, start: '2026-11-02T09:00:00Z', end: '2026-11-02T09:30:00Z' },
    ];
    expect(sessionsFor(s, 1).map(x => x.id)).toEqual(['b', 'a']);
    expect(pruneSessions(s, new Set([2])).map(x => x.id)).toEqual(['c']);
  });

  it('formats clocks and spent time', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_729_000)).toBe('1:02:09');
    expect(formatSpent(0)).toBe('0 min');
    expect(formatSpent(30_000)).toBe('0 min');
    expect(formatSpent(45 * 60_000)).toBe('45 min');
  });

  it('keeps only well-formed sessions from storage', () => {
    expect(parseSessions([{ id: 'a', entryId: 1, start: '2026-11-01T09:00:00Z', end: null }, { id: 1 }, null, 'x'])).toHaveLength(1);
    expect(parseSessions('nope')).toEqual([]);
  });

  it('knows a time-tracking topic by its usual names', () => {
    for (const n of ['Time Tracking', ' time tracker ', 'Timesheet', 'Time log', 'Timers']) expect(isTimeTrackingTopic(n), n).toBe(true);
    for (const n of ['Time', 'Tasks', 'Changes', undefined]) expect(isTimeTrackingTopic(n)).toBe(false);
  });

  it('adds up time per entry inside a period, clipping sessions that cross its start', () => {
    const now = new Date(2026, 10, 5, 12, 0);
    const from = timePeriodStart('today', now);
    expect(from.getHours()).toBe(0);
    expect(timePeriodStart('week', now).getDate()).toBe(30);
    expect(timePeriodStart('month', now).getDate()).toBe(1);
    const s = [
      { id: 'a', entryId: 1, start: new Date(2026, 10, 4, 23, 0).toISOString(), end: new Date(2026, 10, 5, 1, 0).toISOString() },
      { id: 'b', entryId: 1, start: new Date(2026, 10, 5, 9, 0).toISOString(), end: null },
      { id: 'c', entryId: 2, start: new Date(2026, 10, 3, 9, 0).toISOString(), end: new Date(2026, 10, 3, 10, 0).toISOString() },
    ];
    const m = timeByEntry(s, from, now);
    expect(m.get(1)).toBe((60 + 180) * 60_000);
    expect(m.has(2)).toBe(false);
  });
});
