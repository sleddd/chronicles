import { useMemo } from 'react';
import { usePlanData, type PlanTask } from './usePlanData.js';
import { useEncryptedSetting } from './useEncryptedSetting.js';
import { useSaveFields } from './useSaveFields.js';
import { useCreateEntry } from './useCreateEntry.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { showFlash } from '../services/flashNotice.js';
import { toDateStr, formatTime12h } from '../utils/dateUtils.js';
import { eventOccurrences } from '../utils/plannerEvents.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { blockedByText } from '../utils/taskBlockers.js';
import { blockedBy } from '../components/atoms/BlockedTag.js';
import type { PlannerCard, PlannerEvent, PlannerLane } from '../components/organisms/PlannerBoard.js';
import {
  dayLabel, hasMigrated, laneLabel, monthDay, movedOrder, parsePlannerOrder, plannerFacts, priorityIndex,
  tasksByDay, type PlannerOrder, type PlannerTask, startPatch, lengthPatch, dayPatch, hhmm,
} from '../utils/planner.js';

/* The Planner's board for a run of days: the lanes (each day's events and tasks) and what a drag,
   a tick, a stretch or a typed task saves. Shared by Planning → Planner and Your Agenda's
   4-day and week views, so the two never drift. */

const NO_ORDER: PlannerOrder = {};

export type Planned = PlanTask & PlannerTask;

export function usePlannerBoard(days: string[]) {
  const { goals, milestones, tasks, taskTopicId } = usePlanData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const saveFields = useSaveFields();
  const createEntry = useCreateEntry();
  const today = toDateStr(new Date());

  const [savedOrder, saveOrder, orderLoaded] = useEncryptedSetting<PlannerOrder>('plannerOrder', NO_ORDER);
  const order = useMemo(() => parsePlannerOrder(savedOrder), [savedOrder]);

  const planned: Planned[] = useMemo(() => tasks.map(t => ({ ...t, ...plannerFacts(t.id, t.fields, t.created) })), [tasks]);
  const goalTitle = useMemo(() => new Map(goals.map(g => [g.id, g.title])), [goals]);
  const milestoneTitle = useMemo(() => new Map(milestones.map(m => [m.id, m.title])), [milestones]);
  // What each task is waiting on (Blocked by): the other tasks, to tell which are done
  const blockerTasks = useMemo(() => new Map(tasks.map(t => [t.id, { title: t.title, isCompleted: !!t.fields.isCompleted }])), [tasks]);

  const card = (t: Planned): PlannerCard => ({
    id: t.id, title: t.title, done: t.done, day: t.scheduled, hours: t.hours, at: t.at,
    kicker: (t.milestoneId && milestoneTitle.get(t.milestoneId)) || (t.goalId && goalTitle.get(t.goalId)) || undefined,
    due: t.deadline ? `Due ${monthDay(t.deadline)}` : undefined,
    // Waiting on something not done yet: struck through with a Blocked tag (never once it's done)
    blocked: t.done ? undefined : blockedBy(blockedByText(t.fields as Record<string, unknown>, blockerTasks)),
    note: hasMigrated(t, today) ? `From ${monthDay(t.scheduled)}` : !t.done && t.scheduled && t.scheduled < today ? dayLabel(t.scheduled) : undefined,
  });

  // Events and meetings on the days shown (repeats included)
  const first = days[0];
  const last = days[days.length - 1];
  const eventsByDay = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>();
    if (!first || !last) return map;
    for (const o of eventOccurrences(entries, allTopics, first, last)) {
      const list = map.get(o.day) ?? [];
      list.push({
        key: `${o.entry.id}:${o.day}`, id: o.entry.id,
        title: entryTitleText(o.entry.content) || builtinEntryName(o.fields) || o.topicName || 'Event',
        when: `${o.time ? formatTime12h(o.time) : 'All day'} · ${o.topicName}`,
        start: o.start, end: o.end, // no start: all day, under the day's name
      });
      map.set(o.day, list.sort((x, y) => x.when.localeCompare(y.when)));
    }
    return map;
  }, [entries, allTopics, first, last]);

  // Finished tasks stay on their day, ticked and struck through, so a tap undoes it
  const byDay = useMemo(() => tasksByDay(planned, days, today, order), [planned, days, today, order]);
  const lanes: PlannerLane[] = days.map(day => ({
    day, label: laneLabel(day), today: day === today,
    events: eventsByDay.get(day) ?? [], cards: (byDay.get(day) ?? []).map(card),
  }));

  /* ── Changes ── */
  // `overId`: the card it was dropped on (it takes that place); null = it lands among the day's tasks by priority
  const schedule = (id: number, day: string, overId: number | null, at?: number, keep: { id: number; at: number }[] = []) => {
    const t = planned.find(x => x.id === id);
    if (!t) return;
    if (day && at !== undefined) {
      // Dropped at a time on a day: it keeps that time, and the other cards it passed keep theirs
      void saveFields(t.entry, dayPatch(startPatch(t.fields, at), day)).then(ok => {
        if (!ok) showFlash('Couldn’t save that task’s time, so it’s back where it was. Try again.');
      });
      for (const k of keep) {
        const o = planned.find(x => x.id === k.id);
        if (o && !o.fields.scheduledTime) void saveFields(o.entry, { ...o.fields, scheduledTime: hhmm(k.at) });
      }
    } else if (t.scheduled !== day) {
      // Dropped somewhere, a task that was on its deadline's day gets a planned day of its own;
      // taken off its day, it loses its time of day too (or its deadline would put it straight back)
      // …and a time it was dragged to goes: it takes its place in the new day's order.
      // Its length (`scheduledHours`, else its estimate) goes with it
      const fields = day ? { ...dayPatch(t.fields, day), scheduledTime: '' } : { ...t.fields, scheduledDate: '', scheduledPart: '', scheduledPartEnd: '', scheduledTime: '' };
      void saveFields(t.entry, fields).then(ok => {
        if (!ok) showFlash('Couldn’t save that task’s day, so it’s back where it was. Try again.');
      });
    } else if (t.fields.scheduledTime) {
      // Moved within its day here: it follows the day's order again, not the time it was dragged to
      void saveFields(t.entry, { ...t.fields, scheduledTime: '' }).then(ok => {
        if (!ok) showFlash('Couldn’t save that task’s place, so it’s back where it was. Try again.');
      });
    }
    if (!orderLoaded) return;
    // The day's cards as they show now (whether or not that day is on screen), without this one
    const list = day ? (tasksByDay(planned.filter(x => !x.done), [day], today, order).get(day) ?? []).filter(x => x.id !== id) : [];
    // No card to take the place of: it goes before the first task of a lower priority
    const target = overId ?? list[priorityIndex(list, t.priority)]?.id ?? null;
    void saveOrder(movedOrder(order, id, day, list.map(x => x.id), target, today)).catch(err => console.error('Failed to save the day’s order:', err));
  };

  // The tick on a card: done, or not done again
  const toggleDone = (id: number) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const done = !t.fields.isCompleted;
    void saveFields(t.entry, { ...t.fields, isCompleted: done, isInProgress: false, isInReview: false, ...(done ? { isBacklog: false } : {}) }).then(ok => {
      if (!ok) showFlash('Couldn’t save that task. Try again.');
    });
  };

  // The grip at a card's foot: its length in hours. The board hears whether it saved, and puts the card back when it didn't
  const resize = (id: number, hours: number) => {
    const t = planned.find(x => x.id === id);
    if (!t) return;
    return saveFields(t.entry, lengthPatch(t.fields, hours)).then(ok => {
      if (!ok) showFlash('Couldn’t save that, so the task is back as it was. Try again.');
      return ok;
    });
  };

  // A task typed into a day ('' = Unscheduled); `goalId`: the goal it joins, if any
  const addTask = (day: string, text: string, goalId: number | null = null) => {
    void createEntry({ name: 'Task', icon: 'circle-check' }, text, {
      taskDescription: text, isInProgress: false, isCompleted: false, isAutoMigrating: false,
      parentGoalId: goalId, parentMilestoneId: null, deadline: '', priority: 'none', scheduledDate: day,
    }).then(id => { if (id === null) showFlash('That task didn’t save. Try again.'); });
  };

  return { goals, milestones, tasks, taskTopicId, planned, card, blockerTasks, eventsByDay, byDay, lanes, order, schedule, toggleDone, resize, addTask };
}
