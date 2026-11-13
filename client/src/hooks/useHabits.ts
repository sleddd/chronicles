import { useCallback, useMemo } from 'react';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useHabitStore } from '../stores/habitStore.js';
import { stripHtml } from '../utils/stripHtml.js';
import { goalCategoryOf } from '../utils/goalCategories.js';
import {
  countFrom, habitFrom, isHabitTopic, withCount, type CountOn, type Habit,
} from '../utils/habits.js';
import type { DecryptedPost } from '@shared/crypto/types';

const metaOf = (e: DecryptedPost) => (e.metadata as Record<string, unknown>) ?? {};

/**
 * Every habit and how often each was done: the entries of the Habit topic,
 * checked in through the sealed `habitLog`. Exercise routines are not habits —
 * they stay on the exercise schedule. Paused habits are in `paused`.
 */
export function useHabits() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const log = useHabitStore(s => s.log);
  const loaded = useHabitStore(s => s.loaded);

  const data = useMemo(() => {
    const habitTopics = new Set(allTopics.filter(t => isHabitTopic(t.name)).map(t => t.id));
    const goalTopic = allTopics.find(t => t.name.toLowerCase() === 'goal')?.id;
    const goalCategory = new Map<number, string>();
    const own: { habit: Habit; entry: DecryptedPost }[] = [];
    for (const e of entries) {
      const meta = metaOf(e);
      const cf = meta._customFields as Record<string, unknown> | undefined;
      if (goalTopic !== undefined && meta._taxonomyId === goalTopic) goalCategory.set(e.id, goalCategoryOf(cf));
      if (habitTopics.has(meta._taxonomyId as number)) own.push({ habit: habitFrom(e.id, cf, stripHtml(e.content).trim().slice(0, 120)), entry: e });
    }
    // A habit with no category of its own takes its goal's
    for (const o of own) if (!o.habit.category && o.habit.goalId) o.habit.category = goalCategory.get(o.habit.goalId) ?? '';
    own.sort((a, b) => a.habit.name.localeCompare(b.habit.name));
    return {
      habits: own.filter(o => o.habit.active).map(o => o.habit),
      paused: own.filter(o => !o.habit.active).map(o => o.habit),
      entryOf: new Map(own.map(o => [o.habit.id, o.entry])),
      habitTopicId: [...habitTopics][0] as number | undefined,
    };
  }, [entries, allTopics]);

  const count: CountOn = useMemo(() => countFrom(log), [log]);

  /** Set a habit's check-ins on a day */
  const setCount = useCallback((habit: Habit, day: string, n: number) => {
    useHabitStore.getState().apply(l => withCount(l, habit.id, day, n));
  }, []);

  return { ...data, count, setCount, loaded };
}
