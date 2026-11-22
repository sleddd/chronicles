import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { PlanningShell, TodayBtn } from '../components/organisms/PlanningShell.js';
import { PlannerMonth, type PlannerMonthDay } from '../components/molecules/PlannerMonth.js';
import { PlannerBoard, type PlannerCard, type PlannerEvent, type PlannerLane } from '../components/organisms/PlannerBoard.js';
import { TopBarAction } from '../components/organisms/TopBarAction.js';
import { HabitsToday } from '../components/organisms/HabitsToday.js';
import { AiPlanReview } from '../components/organisms/AiPlanReview.js';
import { useAiFeatureEnabled } from '../hooks/useAiReady.js';
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
import { eventOccurrences } from '../utils/plannerEvents.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { EMPTY_GOAL_CATEGORIES, parseGoalCategories, goalCategoryList, categoriesInUse, sameCategory, type GoalCategoryConfig } from '../utils/goalCategories.js';
import {
  addDays, dayLabel, hasMigrated, laneLabel, longDayLabel, monthDay, movedOrder, parsePlannerOrder, plannerFacts, priorityIndex,
  tasksByDay, unscheduled, weekLabel, weekOf, type PlannerOrder, type PlannerTask,
  startPatch, lengthPatch, dayPatch, monthGridOf, addMonths, monthLabel, hhmm,
} from '../utils/planner.js';

/* Planning → Planner: the week (or one day) at a glance. Tasks and todos are
   dragged from Unscheduled onto a day, between days, and up and down within
   one; the day is saved on the task (`scheduledDate`), its length in hours
   (`scheduledHours`, made longer or shorter by its grip) and the order within a
   day in the sealed setting `plannerOrder` (a task dropped on a day's free space
   lands by priority). Events and meetings sit at their times on the day. */

type Mode = 'month' | 'week' | 'days' | 'day';
const MODES: { value: Mode; label: string }[] = [
  { value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'days', label: '4 days' }, { value: 'day', label: 'Day' },
];
/** How many days the 4-day view shows, from the day it's on */
const FEW_DAYS = 4;
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
    try { const m = localStorage.getItem(MODE_KEY); return MODES.some(x => x.value === m) ? m as Mode : null; } catch { return null; }
  });
  const mode: Mode = chosen ?? (phone ? 'day' : 'week');
  const setMode = (m: Mode) => {
    setChosen(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable */ }
  };
  // Opened on a day from elsewhere (the dashboard's Day at a glance): that day, in Day view
  const handedDay = (useLocation().state as { plannerDay?: string } | null)?.plannerDay;
  // The day shown lives in the address (?day=), so opening a task in the
  // journal and coming back — Save, Close, the breadcrumb, Back — lands on the
  // same week, not this one. Without it the Planner opens on today
  const [params, setParams] = useSearchParams();
  const isDay = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  const [anchor, setAnchor] = useState(() => {
    const inUrl = params.get('day');
    return isDay(inUrl) ? inUrl : isDay(handedDay) ? handedDay : today;
  });
  useEffect(() => { if (handedDay) setChosen('day'); }, [handedDay]);
  useEffect(() => {
    if ((params.get('day') ?? today) === anchor) return;
    setParams(p => {
      const next = new URLSearchParams(p);
      if (anchor === today) next.delete('day'); else next.set('day', anchor);
      return next;
    }, { replace: true, state: null });
  }, [anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  // Unscheduled folds down to a narrow strip, to give the days the whole width (remembered per browser)
  const [folded, setFoldedState] = useState(() => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } });
  const setFolded = (f: boolean) => {
    setFoldedState(f);
    try { if (f) localStorage.setItem(FOLD_KEY, '1'); else localStorage.removeItem(FOLD_KEY); } catch { /* storage unavailable */ }
  };
  const days = useMemo(() => (
    mode === 'month' ? monthGridOf(anchor)
      : mode === 'week' ? weekOf(anchor)
        : mode === 'days' ? Array.from({ length: FEW_DAYS }, (_, i) => addDays(anchor, i))
          : [anchor]
  ), [mode, anchor]);

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
    for (const o of eventOccurrences(entries, allTopics, days[0], days[days.length - 1])) {
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
  }, [entries, allTopics, days]);

  // Finished tasks stay on their day, ticked and struck through (as on Your Agenda), so a tap undoes it
  const byDay = useMemo(() => tasksByDay(planned, days, today, order), [planned, days, today, order]);
  const lanes: PlannerLane[] = days.map(day => ({
    day, label: laneLabel(day), today: day === today,
    events: eventsByDay.get(day) ?? [], cards: (byDay.get(day) ?? []).map(card),
    // The day view also lists the habits due that day, to tick off with the tasks
    extra: mode === 'day' ? <HabitsToday day={day} plain /> : undefined,
  }));

  // Month: each day's tasks in the day's order, then its events (all-day first, then by time)
  const monthDays: PlannerMonthDay[] = mode !== 'month' ? [] : days.map(day => ({
    day, number: Number(day.slice(8, 10)), inMonth: day.slice(0, 7) === anchor.slice(0, 7), today: day === today, label: longDayLabel(day),
    items: [
      ...(byDay.get(day) ?? []).map(t => ({
        key: `t${t.id}`, id: t.id, title: t.title, kind: 'task' as const, done: t.done,
        time: t.at !== undefined ? formatTime12h(hhmm(t.at)) : undefined,
      })),
      ...[...(eventsByDay.get(day) ?? [])].sort((a, b) => (a.start ?? -1) - (b.start ?? -1))
        .map(e => ({ key: `e${e.key}`, id: e.id, title: e.title, kind: 'event' as const, time: e.start !== undefined ? formatTime12h(hhmm(e.start)) : undefined })),
    ],
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
      // …and a time it was dragged to on the dashboard goes: it takes its place in the new day's order.
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
  // The grip at a card's foot: its length in hours
  const resize = (id: number, hours: number) => {
    const t = planned.find(x => x.id === id);
    if (!t) return;
    // The board hears whether it saved, and puts the card back when it didn't
    return saveFields(t.entry, lengthPatch(t.fields, hours)).then(ok => {
      if (!ok) showFlash('Couldn’t save that, so the task is back as it was. Try again.');
      return ok;
    });
  };

  const add = (day: string, text: string) => {
    void createEntry({ name: 'Task', icon: 'circle-check' }, text, {
      taskDescription: text, isInProgress: false, isCompleted: false, isAutoMigrating: false,
      // Typed into Unscheduled while it shows one goal: the task joins that goal (else it would vanish from the list)
      parentGoalId: day || goalPicked === TODOS ? null : goalPicked, parentMilestoneId: null, deadline: '', priority: 'none', scheduledDate: day,
    }).then(id => { if (id === null) showFlash('That task didn’t save. Try again.'); });
  };

  const aiPlanOn = useAiFeatureEnabled('aiPlan');
  const [aiPlanOpen, setAiPlanOpen] = useState(false);

  const step = mode === 'week' ? 7 : mode === 'days' ? FEW_DAYS : 1;
  const pillLabel = mode === 'month' ? monthLabel(anchor) : mode === 'day' ? dayLabel(anchor) : weekLabel(days);
  // ‹ ›: a month, a week, four days or a day at a time
  const move = (dir: 1 | -1) => setAnchor(a => (mode === 'month' ? addMonths(a, dir) : addDays(a, dir * step)));

  return (
    <PlanningShell wide actions={<>
      <FilterTabs options={MODES} active={mode} onChange={setMode} />
      <MonthPill label={pillLabel} onPrev={() => move(-1)} onNext={() => move(1)} />
      <TodayBtn type="button" onClick={() => setAnchor(today)}>Today</TodayBtn>
      {/* Only while AI task planning is on and agreed to in this browser (Settings → In-App AI) */}
      {aiPlanOn && (
        // On a background photo: the smoked glass of the page's other buttons, so it reads as one
        <span className="page-action" style={{ display: 'contents' }}>
          <PillButton type="button" $variant="neutral" title="Plan my unscheduled tasks with AI" onClick={() => setAiPlanOpen(true)}>AI plan</PillButton>
        </span>
      )}
      {taskTopicId && (
        <TopBarAction>
          <PillButton type="button" $variant="solid" onClick={() => newEntry(taskTopicId, mode === 'day' ? { scheduledDate: anchor } : undefined)}>New Task</PillButton>
        </TopBarAction>
      )}
    </>}>
      {aiPlanOpen && <AiPlanReview onClose={() => setAiPlanOpen(false)} />}
      {mode === 'day' && <DayTitle>{longDayLabel(anchor)}</DayTitle>}
      {mode === 'month' ? (
        <PlannerMonth days={monthDays} onOpen={openInJournal} onPickDay={day => { setAnchor(day); setMode('day'); }} />
      ) : (
      <PlannerBoard
        lanes={lanes} overdue={left.overdue.map(card)} open={left.open.map(card)} ideas={left.ideas.map(card)}
        onOpen={openInJournal} onOpenEvent={openInJournal} onSchedule={schedule} onToggleDone={toggleDone} onResize={resize} onAdd={add}
        folded={folded} onFold={setFolded}
        onPrev={() => move(-1)} onNext={() => move(1)}
        onPickDay={mode === 'week' || mode === 'days' ? day => { setAnchor(day); setMode('day'); } : undefined}
        toolsSet={(query.trim() ? 1 : 0) + (goalPicked ? 1 : 0) + (category ? 1 : 0)}
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
      )}
    </PlanningShell>
  );
}
