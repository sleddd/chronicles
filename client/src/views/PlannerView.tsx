import { useMemo, useState } from 'react';
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
  addDays, dayLabel, hasMigrated, laneLabel, longDayLabel, monthDay, movedOrder, parsePlannerOrder, DEFAULT_PART, partOfTime, plannerFacts,
  tasksByDay, unscheduled, weekLabel, weekOf, type DayPart, type PlannerOrder, type PlannerTask,
} from '../utils/planner.js';

/* Planning → Planner: the week (or one day) at a glance. Tasks and todos are
   dragged from Unscheduled onto a day, between days, and up and down within
   one; the day is saved on the task (`scheduledDate`) and the order within a
   day in the sealed setting `plannerOrder`. Events and meetings show on their
   days above the tasks. */

type Mode = 'week' | 'day';
const MODES: { value: Mode; label: string }[] = [{ value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }];
const MODE_KEY = 'planning-planner-v1';
const FOLD_KEY = 'planning-planner-folded-v1';
const NO_ORDER: PlannerOrder = {};
const GOAL_KEY = 'planning-planner-goal-v1';
/* The Type pill's "Todos" choice: tasks with no goal or milestone */
const TODOS = -1;

const Tools = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  const [anchor, setAnchor] = useState(today);
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
    id: t.id, title: t.title, done: t.done, day: t.scheduled, part: t.part ?? '',
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
      for (const day of on) {
        const list = map.get(day) ?? [];
        list.push({
          key: `${e.id}:${day}`, id: e.id, title: entryTitleText(e.content) || builtinEntryName(cf) || name || 'Event',
          when: `${time ? formatTime12h(time) : 'All day'} · ${name}`,
          part: partOfTime(time) || DEFAULT_PART, // all-day ones sit at the top of the day
        });
        map.set(day, list.sort((a, b) => a.when.localeCompare(b.when)));
      }
    }
    return map;
  }, [entries, allTopics, days]);

  const byDay = useMemo(() => tasksByDay(planned, days, today, order), [planned, days, today, order]);
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
  // `part`: the part of the day it was dropped on; undefined (the calendar button) keeps the one it has
  const schedule = (id: number, day: string, overId: number | null, part?: DayPart | '') => {
    const t = planned.find(x => x.id === id);
    if (!t) return;
    const nextPart = !day ? '' : part || t.part || DEFAULT_PART;
    if (t.scheduled !== day || (t.part ?? '') !== nextPart) {
      void saveFields(t.entry, { ...t.fields, scheduledDate: day, scheduledPart: nextPart }).then(ok => {
        if (!ok) showFlash('Couldn’t save that task’s day, so it’s back where it was. Try again.');
      });
    }
    if (!orderLoaded) return;
    // The day's cards as they show now (whether or not that day is on screen)
    const dayIds = day ? (tasksByDay(planned, [day], today, order).get(day) ?? []).map(x => x.id) : [];
    void saveOrder(movedOrder(order, id, day, dayIds, overId, today)).catch(err => console.error('Failed to save the day’s order:', err));
  };

  const add = (day: string, text: string) => {
    void createEntry({ name: 'Task', icon: 'circle-check' }, text, {
      taskDescription: text, isInProgress: false, isCompleted: false, isAutoMigrating: false,
      // Typed into Unscheduled while it shows one goal: the task joins that goal (else it would vanish from the list)
      parentGoalId: day || goalPicked === TODOS ? null : goalPicked, parentMilestoneId: null, deadline: '', priority: 'none', scheduledDate: day, scheduledPart: day ? DEFAULT_PART : '',
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
        lanes={lanes} overdue={left.overdue.map(card)} open={left.open.map(card)}
        onOpen={openInJournal} onOpenEvent={openInJournal} onSchedule={schedule} onAdd={add}
        folded={folded} onFold={setFolded}
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
