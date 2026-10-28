import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEntriesStore } from '../stores/entriesStore.js';
import { doses as dosesApi, type DoseLogRecord } from '../services/api.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { DOSES_CHANGED } from './useTodayDoses.js';

export interface AsNeededMed { id: number; name: string; dosage: string }

/**
 * As-needed medications (active, How often = As needed) and one day's doses of
 * them (today unless `day` is given). Each take is its own encrypted dose
 * record at the time taken, so the count, Med history and Reports see every one. Refetched when the tab comes
 * back, like the scheduled doses.
 */
export function useAsNeededDoses(day?: string) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const [logs, setLogs] = useState<DoseLogRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const today = toDateStr(new Date());
  const date = day ?? today;
  const isToday = date === today;

  const meds = useMemo<AsNeededMed[]>(() => {
    const medTopicId = allTopics.find(t => t.name.toLowerCase() === 'medication')?.id;
    if (!medTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === medTopicId)
      .map(e => ({ e, cf: ((e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) || {} }))
      .filter(({ cf }) => cf.frequency === 'as_needed' && cf.isActive !== false)
      .map(({ e, cf }) => ({
        id: e.id,
        name: ((cf.medicationName as string) || stripHtml(e.content)).trim() || 'Medication',
        dosage: String(cf.dosage ?? '').trim(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, allTopics]);

  const fetchLogs = useCallback(async () => {
    try {
      const { logs: all } = await dosesApi.getByDate(date);
      setLogs(all.filter(l => l.asNeeded && l.status === 'taken'));
    } catch (err) {
      console.error('Failed to fetch as-needed doses:', err);
    }
  }, [date]);

  useEffect(() => {
    if (!meds.length) return;
    setLogs([]);
    void fetchLogs();
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchLogs(); };
    const onChanged = () => { void fetchLogs(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(DOSES_CHANGED, onChanged);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(DOSES_CHANGED, onChanged);
    };
  }, [meds.length, fetchLogs]);

  const take = useCallback(async (medId: number) => {
    setBusy(medId); setError('');
    try {
      const { log } = await dosesApi.logAsNeeded({ medicationPostId: medId, date: today });
      setLogs(prev => [...prev, log]);
    } catch (err) {
      console.error('Failed to log dose:', err);
      setError('That dose didn’t save. Try again.');
    } finally { setBusy(null); }
  }, [today]);

  const remove = useCallback(async (logId: string) => {
    const before = logs;
    setLogs(prev => prev.filter(l => l.id !== logId));
    try { await dosesApi.remove(logId); }
    catch (err) {
      console.error('Failed to remove dose:', err);
      setLogs(before);
      setError('Couldn’t remove that dose. Try again.');
    }
  }, [logs]);

  const takenOf = useCallback((medId: number) =>
    logs.filter(l => l.medicationPostId === medId).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)), [logs]);

  return { meds, isToday, takenOf, take, remove, busy, error };
}
