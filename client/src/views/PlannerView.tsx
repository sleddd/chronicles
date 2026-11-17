import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { PlanningShell, TodayBtn } from '../components/organisms/PlanningShell.js';
import { PlannerBoard, type PlannerCard, type PlannerEvent, type PlannerLane } from '../components/organisms/PlannerBoard.js';
import { TopBarAction } from '../components/organisms/TopBarAction.js';
import { HabitsToday } from '../components/organisms/HabitsToday.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { FilterPick } from '../components/molecules/FilterPick.js';
import { MonthPill } from '../components/molecules/FinanceParts.js';
import { RoundSearch } from '../components/molecules/RoundSearch.js';
import { usePlanData, type PlanTask } from '../hooks/usePlanData.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { useSaveFields } from '../hooks/useSaveFields.js';
import { useCreateEntry } from '../hooks/useCreateEntry.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { showFlash } from '../services/flashNotice.js';
import { toDateStr, formatTime12h } from '../utils/dateUtils.js';
import { calendarDayFor, isEventTopic } from '../utils/calendarItems.js';
import { repeatRuleOf, occurrencesBetween } from '../utils/recurrence.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { EMPTY_GOAL_CATEGORIES, parseGoalCategories, goalCategoryList, categoriesInUse, sameCategory, type GoalCategoryConfig } from '../utils/goalCategories.js';
import {
  addDays, dayLabel, hasMigrated, laneLabel, longDayLabel, monthDay, movedOrder, parsePlannerOrder, plannerFacts, priorityIndex,
  tasksByDay, unscheduled, weekLabel, weekOf, type PlannerOrder, type PlannerTask,
} from '../utils/planner.js';

/* Planning → Planner: the week (or one day) at a glance. Tasks and todos are
   dragged from Unscheduled onto a day, between days, and up and down within
   one; the day is saved on the task (`scheduledDate`), its length in hours
   (`scheduledHours`, made longer or shorter by its grip) and the order within a
   day in the sealed setting `plannerOrder` (a task dropped on a day's free space
   lands by priority). Events and meetings sit at their times on the day. */

type Mode = 'week' | 'day';
const MODES: { value: Mode; label: string }[] = [{ value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }];
const MODE_KEY = 'planning-planner-v1';
const FOLD_KEY = 'planning-planner-folded-v1';
const NO_ORDER: PlannerOrder = {};
const GOAL_KEY = 'planning-planner-goal-v1';
/* The Type pill's "Todos" choice: tasks with no goal or milestone */
const TODOS = -1;

/* The Unscheduled list's search and filters: room between the rows, then a divider
   that rules them off from the tasks below */
const Tools = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 6px 0 22px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border-default);
`;

/* The day view's own heading (the week view's lanes name themselves) */
const DayTitle = styled.h2`
  margin: 0 0 20px;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 300;
  color: var(--text-primary);
`;

type Planned = PlanTask & PlannerTask;

/** "14:30" → minutes from midnight; anything else → undefined */
function minutesOf(hhmm: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return undefined;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < 24 * 60 ? mins : undefined;
}

export function PlannerView() {
  const { goals, milestones, tasks, taskTopicId } = usePlanData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const saveFields = useSaveFields();
  const createEntry = useCreateEntry();
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const phone = useMediaQuery('(max-width: 768px)');
  const today = toDateStr(new Date());

  // Week on wide screens, Day on phones, unless you chose otherwise in this browser
  const [chosen, setChosen] = useState<Mode | null>(() => {
    try { const m = localStorage.getItem(MODE_KEY); return m === 'week' || m === 'day' ? m : null; } catch { return null; }
  });
  const mode: Mode = chosen ?? (phone ? 'day' : 'week');
  const setMode = (m: Mode) => {
    setChosen(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable */ }
  };
  // Opened on a day from elsewhere (the dashboard's Day at a glance): that day, in Day view
  const handedDay = (useLocation().state as { plannerDay?: string } | null)?.plannerDay;
  const [anchor, setAnchor] = useState(() => (handedDay && /^\d{4}-\d{2}-\d{2}$/.test(handedDay) ? handedDay : today));
  useEffect(() => { if (handedDay) setChosen('day'); }, [handedDay]);
  // Unscheduled folds down to a narrow strip, to give the days the whole width (remembered per browser)
  const [folded, setFoldedState] = useState(() => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } });
  const setFolded = (f: boolean) => {
    setFoldedState(f);
    try { if (f) localStorage.setItem(FOLD_KEY, '1'); else localStorage.removeItem(FOLD_KEY); } catch { /* storage unavailable */ }
  };
  const days = useMemo(() => (mode === 'week' ? weekOf(anchor) : [anchor]), [mode, anchor]);

  const [savedOrder, saveOrder, orderLoaded] = useEncryptedSetting<PlannerOrder>('plannerOrder', NO_ORDER);
  const order = useMemo(() => parsePlannerOrder(savedOrder), [savedOrder]);

  const planned: Planned[] = useMemo(() => tasks.map(t => ({ ...t, ...plannerFacts(t.id, t.fields, t.created) })), [tasks]);
  const goalTitle = useMemo(() => new Map(goals.map(g => [g.id, g.title])), [goals]);
  const milestoneTitle = useMemo(() => new Map(milestones.map(m => [m.id, m.title])), [milestones]);

  const card = (t: Planned): PlannerCard => ({
    id: t.id, title: t.title, done: t.done, day: t.scheduled, hours: t.hours, at: t.at,
    kicker: (t.milestoneId && milestoneTitle.get(t.milestoneId)) || (t.goalId && goalTitle.get(t.goalId)) || undefined,
    due: t.deadline ? `Due ${monthDay(t.deadline)}` : undefined,
    note: hasMigrated(t, today) ? `From ${monthDay(t.scheduled)}` : !t.done && t.scheduled && t.scheduled < today ? dayLabel(t.scheduled) : undefined,
  });

  // Events and meetings on the days shown (repeats included)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>();
    const names = new Map(allTopics.map(t => [t.id, t.name]));
    const from = days[0];
    const to = days[days.length - 1];
    for (const e of entries) {
      const meta = e.metadata as Record<string, unknown> | undefined;
      const name = names.get(meta?._taxonomyId as number);
      if (!isEventTopic(name)) continue;
      const first = calendarDayFor(e, name);
      if (!first) continue;
      const cf = (meta?._customFields as Record<string, unknown>) ?? {};
      const rule = repeatRuleOf(cf);
      const on = rule ? occurrencesBetween(first, rule, from, to) : first >= from && first <= to ? [first] : [];
      const time = typeof cf.startTime === 'string' && cf.startTime && !cf.allDay ? cf.startTime : '';
      // Its place on the day's scale (an hour long when it has no end, or an end before its start)
      const start = minutesOf(time);
      const endAt = minutesOf(typeof cf.endTime === 'string' ? cf.endTime : '');
      const end = start === undefined ? undefined : endAt !== undefined && endAt > start ? endAt : start + 60;
      for (const day of on) {
        const list = map.get(day) ?? [];
        list.push({
          key: `${e.id}:${day}`, id: e.id, title: entryTitleText(e.content) || builtinEntryName(cf) || name || 'Event',
          when: `${time ? formatTime12h(time) : 'All day'} · ${name}`,
          start, end, // no start: all day, under the day's name
        });
        map.set(day, list.sort((a, b) => a.when.localeCompare(b.when)));
      }
    }
    return map;
  }, [entries, allTopics, days]);

  // Finished tasks clear off the planner (they keep their place in the day's order,
  // and still show struck through in the dashboard's Today's plan)
  const byDay = useMemo(() => tasksByDay(planned.filter(t => !t.done), days, today, order), [planned, days, today, order]);
  const lanes: PlannerLane[] = days.map(day => ({
    day, label: laneLabel(day), today: day === today,
    events: eventsByDay.get(day) ?? [], cards: (byDay.get(day) ?? []).map(card),
    // The day view also lists the habits due that day, to tick off with the tasks
    extra: mode === 'day' ? <HabitsToday day={day} plain /> : undefined,
  }));

  /* ── What's left to plan: search and Category ── */
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  // The Type pill: one goal's tasks only (a task under a milestone counts toward that milestone's goal), or just the todos; kept for this browser tab
  const [goalFilter, setGoalState] = useState<number | null>(() => {
    try { const n = Number(sessionStorage.getItem(GOAL_KEY)); return n > 0 || n === TODOS ? n : null; } catch { return null; }
  });
  const setGoalFilter = (id: number | null) => {
    setGoalState(id);
    try { if (id) sessionStorage.setItem(GOAL_KEY, String(id)); else sessionStorage.removeItem(GOAL_KEY); } catch { /* storage unavailable */ }
  };
  // Goals to pick from: unfinished ones, plus the chosen one, A–Z
  const goalChoices = useMemo(
    () => goals.filter(g => g.status !== 'completed' || g.id === goalFilter).sort((a, b) => a.title.localeCompare(b.title)),
    [goals, goalFilter],
  );
  const goalPicked = goalFilter !== null && (goalFilter === TODOS || goals.some(g => g.id === goalFilter)) ? goalFilter : null;
  const inPick = (t: Planned) => !goalPicked || (goalPicked === TODOS ? !t.goalId && !t.milestoneId : t.goalId === goalPicked);
  const [savedCategories] = useEncryptedSetting<GoalCategoryConfig>('goalCategories', EMPTY_GOAL_CATEGORIES);
  const categories = useMemo(
    () => categoriesInUse(goalCategoryList(parseGoalCategories(savedCategories)), goals.map(g => g.category)),
    [savedCategories, goals],
  );
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const passes = (t: Planned) => inPick(t) && (!category || sameCategory(t.category, category))
    && words.every(w => t.title.toLowerCase().includes(w));
  const left = unscheduled(planned.filter(passes), today);
  /* ── Changes ── */
  // `overId`: the card it was dropped on (it takes that place); null = it lands among the day's tasks by priority
  const schedule = (id: number, day: string, overId: number | null) => {
    const t = planned.find(x => x.id === id);
    if (!t) return;
    if (t.scheduled !== day) {
      // Dropped somewhere, a task that was on its deadline's day gets a planned day of its own;
      // taken off its day, it loses its time of day too (or its deadline would put it straight back)
      // …and a time it was dragged to on the dashboard goes: it takes its place in the new day's order
      const fields = day ? { ...t.fields, scheduledDate: day, scheduledTime: '' } : { ...t.fields, scheduledDate: '', scheduledPart: '', scheduledPartEnd: '', scheduledTime: '' };
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

  // The grip at a card's foot: its length in hours
  const resize = (id: number, hours: number) => {
    const t = planned.find(x => x.id === id);
    if (!t) return;
    void saveFields(t.entry, { ...t.fields, scheduledHours: hours }).then(ok => {
      if (!ok) showFlash('Couldn’t save that, so the task is back as it was. Try again.');
    });
  };

  const add = (day: string, text: string) => {
    void createEntry({ name: 'Task', icon: 'circle-check' }, text, {
      taskDescription: text, isInProgress: false, isCompleted: false, isAutoMigrating: false,
      // Typed into Unscheduled while it shows one goal: the task joins that goal (else it would vanish from the list)
      parentGoalId: day || goalPicked === TODOS ? null : goalPicked, parentMilestoneId: null, deadline: '', priority: 'none', scheduledDate: day,
    }).then(id => { if (id === null) showFlash('That task didn’t save. Try again.'); });
  };

  const step = mode === 'week' ? 7 : 1;
  const pillLabel = mode === 'week' ? weekLabel(days) : dayLabel(anchor);

  return (
    <PlanningShell wide actions={<>
      <FilterTabs options={MODES} active={mode} onChange={setMode} />
      <MonthPill label={pillLabel} onPrev={() => setAnchor(a => addDays(a, -step))} onNext={() => setAnchor(a => addDays(a, step))} />
      <TodayBtn type="button" onClick={() => setAnchor(today)}>Today</TodayBtn>
      {taskTopicId && (
        <TopBarAction>
          <PillButton type="button" onClick={() => newEntry(taskTopicId, mode === 'day' ? { scheduledDate: anchor } : undefined)}>New Task</PillButton>
        </TopBarAction>
      )}
    </>}>
      {mode === 'day' && <DayTitle>{longDayLabel(anchor)}</DayTitle>}
      <PlannerBoard
        lanes={lanes} overdue={left.overdue.map(card)} open={left.open.map(card)} ideas={left.ideas.map(card)}
        onOpen={openInJournal} onOpenEvent={openInJournal} onSchedule={schedule} onResize={resize} onAdd={add}
        folded={folded} onFold={setFolded}
        onPrev={() => setAnchor(a => addDays(a, -step))} onNext={() => setAnchor(a => addDays(a, step))}
        onPickDay={mode === 'week' ? day => { setAnchor(day); setMode('day'); } : undefined}
        tools={(
          <Tools>
            <RoundSearch value={query} onChange={setQuery} placeholder="Search tasks" ariaLabel="Search unscheduled tasks" />
            {(
              // "Type": everything, just the todos, or one goal's tasks
              <FilterPick name="Type" value={goalPicked === TODOS ? 'Todos' : goals.find(g => g.id === goalPicked)?.title ?? 'All'} set={!!goalPicked} grow>
                <select aria-label="Type of unscheduled tasks" value={goalPicked ?? ''} onChange={e => setGoalFilter(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">All</option>
                  <option value={TODOS}>Todos</option>
                  {goalChoices.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </FilterPick>
            )}
            {categories.length > 0 && (
              <FilterPick name="Category" value={category || 'All'} set={!!category} grow>
                <select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">All</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </FilterPick>
            )}
          </Tools>
        )}
      />
    </PlanningShell>
  );
}
