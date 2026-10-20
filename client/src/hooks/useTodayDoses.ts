import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEntriesStore } from '../stores/entriesStore.js';
import { doses as dosesApi, type DoseLogRecord } from '../services/api.js';
import { useDoseToMeals } from './useDoseToMeals.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import type { ScheduledDose } from '../types/health.js';

/** Doses scheduled at one time of day */
export interface DoseGroup {
  time: string;
  doses: ScheduledDose[];
  /** The ones not taken yet */
  pending: ScheduledDose[];
}

const keyOf = (d: ScheduledDose) => `${d.medicationPostId}-${d.time.substring(0, 5)}`;

/**
 * Today's medication schedule for the dashboard: every active medication's
 * scheduled times, today's dose logs (refetched when the tab comes back), and
 * take / un-take — which logs the dose and syncs its nutrients into Meals, like the
 * Health dashboard's MedicationSchedule.
 */
export function useTodayDoses(enabled: boolean) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const doseToMeals = useDoseToMeals();
  const [logs, setLogs] = useState<Record<string, DoseLogRecord>>({});
  const [error, setError] = useState<string | null>(null);
  const today = toDateStr(new Date());

  const medTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'medication')?.id, [allTopics]);

  const scheduled = useMemo(() => {
    if (medTopicId === undefined) return [];
    const out: ScheduledDose[] = [];
    for (const e of entries) {
      const meta = e.metadata as Record<string, unknown> | undefined;
      if (!meta || meta._taxonomyId !== medTopicId) continue;
      const cf = (meta._customFields as Record<string, unknown>) ?? {};
      if (cf.isActive === false) continue;
      const name = String(cf.medicationName ?? '').trim() || stripHtml(e.content).slice(0, 120) || 'Unnamed medication';
      for (const time of (cf.scheduleTimes as string[] | undefined) ?? []) {
        out.push({ medicationPostId: e.id, medicationName: name, dosage: String(cf.dosage ?? ''), time });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }, [entries, medTopicId]);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await dosesApi.getByDate(today);
      const map: Record<string, DoseLogRecord> = {};
      // As-needed doses are their own records, never one of the scheduled doses
      for (const log of data.logs) if (!log.asNeeded) map[`${log.medicationPostId}-${log.scheduledTime.substring(0, 5)}`] = log;
      setLogs(map);
    } catch (err) {
      console.error('Failed to fetch dose logs:', err);
    }
  }, [today]);

  useEffect(() => {
    if (!enabled) return;
    void fetchLogs();
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchLogs(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, fetchLogs]);

  const isTaken = useCallback((d: ScheduledDose) => logs[keyOf(d)]?.status === 'taken', [logs]);

  const groups = useMemo(() => {
    const map = new Map<string, DoseGroup>();
    for (const d of scheduled) {
      const g = map.get(d.time) ?? { time: d.time, doses: [], pending: [] };
      g.doses.push(d);
      if (!isTaken(d)) g.pending.push(d);
      map.set(d.time, g);
    }
    return [...map.values()];
  }, [scheduled, isTaken]);

  /** Log one dose taken (or back to pending) and sync it into Meals */
  const setTaken = async (d: ScheduledDose, on: boolean) => {
    const time = d.time.substring(0, 5).padStart(5, '0');
    try {
      const takenAt = on ? new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null;
      const { log } = await dosesApi.log({ medicationPostId: d.medicationPostId, scheduledTime: time, date: today, status: on ? 'taken' : 'pending', takenAt });
      setLogs(prev => ({ ...prev, [`${d.medicationPostId}-${time}`]: { ...log, scheduledTime: log.scheduledTime.substring(0, 5) } }));
      const sync = on ? doseToMeals.onTaken : doseToMeals.onUntaken;
      void sync(d.medicationPostId, today, time).catch(err => console.warn('Dose → Meals sync failed:', err));
    } catch (err) {
      console.error('Failed to update dose:', err);
      setError(`Couldn’t update ${d.medicationName}`);
    }
  };

  const takeAll = async (list: ScheduledDose[]) => {
    setError(null);
    for (const d of list) await setTaken(d, true);
  };

  const logOf = useCallback((d: ScheduledDose) => logs[keyOf(d)], [logs]);

  const taken = scheduled.filter(isTaken).length;
  return { scheduled, groups, taken, total: scheduled.length, isTaken, logOf, setTaken, takeAll, error };
}
