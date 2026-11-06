import { useEffect, useState } from 'react';
import { useTimeStore } from '../stores/timeStore.js';
import {
  addManualTime, removeSession, runningSession, sessionsFor, startTimer, stopTimer, totalMs, type TimeSession,
} from '../utils/timeTracking.js';

/** The clock, ticking each second while `on` (a timer is running) */
export function useNow(on: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    if (!on) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/** The timer as a whole: what's running and how to stop it */
export function useRunningTimer() {
  const sessions = useTimeStore(s => s.sessions);
  const apply = useTimeStore(s => s.apply);
  const running = runningSession(sessions);
  const now = useNow(!!running);
  return {
    running,
    elapsedMs: running ? Math.max(0, now.getTime() - new Date(running.start).getTime()) : 0,
    stop: () => apply(s => stopTimer(s, new Date())),
  };
}

/** One entry's time: its total, sessions, and start / stop / add / remove */
export function useTimeTracking(entryId: number | null) {
  const loaded = useTimeStore(s => s.loaded);
  const sessions = useTimeStore(s => s.sessions);
  const apply = useTimeStore(s => s.apply);
  const running = runningSession(sessions);
  const mine = entryId !== null && running?.entryId === entryId;
  const now = useNow(mine);
  const list: TimeSession[] = entryId === null ? [] : sessionsFor(sessions, entryId);
  return {
    loaded,
    sessions: list,
    totalMs: entryId === null ? 0 : totalMs(sessions, entryId, now),
    running: mine,
    /** Another entry's timer is running (starting this one stops it) */
    otherRunning: !!running && !mine,
    now,
    start: () => { if (entryId !== null) apply(s => startTimer(s, entryId, new Date(), crypto.randomUUID())); },
    stop: () => apply(s => stopTimer(s, new Date())),
    addManual: (day: string, minutes: number) => { if (entryId !== null) apply(s => addManualTime(s, entryId, day, minutes, crypto.randomUUID())); },
    remove: (id: string) => apply(s => removeSession(s, id)),
  };
}
