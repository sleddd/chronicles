import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { PlanningShell, TodayBtn } from '../components/organisms/PlanningShell.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { TopBarAction } from '../components/organisms/TopBarAction.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { TickMark } from '../components/atoms/TickMark.js';
import { MonthPill } from '../components/molecules/FinanceParts.js';
import { Chips, Chip } from '../components/molecules/fields/formKit.js';
import { CsvLink, Figures, Dates, rangeLabel, saveCsv } from '../components/molecules/HistoryKit.js';
import { CountBars } from '../components/molecules/charts/CountBars.js';
import { DaySquares, SquareLegend, SquareSwatch } from '../components/molecules/DaySquares.js';
import { useHabits } from '../hooks/useHabits.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { getOrCreateTopic } from '../utils/getOrCreateJournalTopic.js';
import { toDateStr } from '../utils/dateUtils.js';
import { csvCell } from '../utils/csv.js';
import { describeDays } from '../utils/routines.js';
import { MED_PERIODS, medPeriodRange, type MedPeriod } from '../utils/medHistory.js';
import { EMPTY_GOAL_CATEGORIES, parseGoalCategories, goalCategoryList, groupByCategory, type GoalCategoryConfig } from '../utils/goalCategories.js';
import { addDays, weekLabel, weekOf } from '../utils/planner.js';
import { usePlanData } from '../hooks/usePlanData.js';
import {
  HABIT_DEFAULTS, HABIT_ICON, HABIT_TOPIC, countSeries, dayCells, dayTarget, describeTarget, habitCsvRows, habitTotals,
  isDueOn, nextCount, streakWeeks, type CountOn, type DayCell, type DayRange, type Habit,
} from '../utils/habits.js';

/* Health → Habits: small cards, three across in one grid (no category
   headings) — in the order they were added, or sorted by category — each
   habit with a tick for every day of the week (Sunday to Saturday), how the
   week stands against its target and its streak of weeks met. Choosing a habit shows how often it was done over a period: big
   figures, a bar chart and a square per day. */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERIODS = MED_PERIODS.filter(p => p.value !== 'custom');

/* Habits as small cards, three across (never a full-width table) */
const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  @media (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 640px) { grid-template-columns: minmax(0, 1fr); }
`;

/* A habit: the week's ticks and how it stands; the chosen one gets a light grey outline */
const Card = styled.article<{ $on: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  padding: 22px 24px 24px;
  background: var(--bg-panel);
  border: 1px solid ${({ $on }) => ($on ? 'var(--border-default)' : 'transparent')};
  border-radius: 14px;
  /* Light: the Health widgets' edge (the chosen one keeps its grey outline) */
  html[data-theme='light'] & { background: transparent; border-color: ${({ $on }) => ($on ? 'var(--border-default)' : 'var(--edge-card)')}; box-shadow: var(--shadow-soft); }
  @media (max-width: 480px) { padding: 18px 16px 20px; }
`;

const CardHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

/* Above the cards: how they're ordered */
const SortRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 36px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

type HabitSort = 'added' | 'category';
const SORT_KEY = 'chronicles.habits-sort';
function savedSort(): HabitSort {
  try { return localStorage.getItem(SORT_KEY) === 'category' ? 'category' : 'added'; } catch { return 'added'; }
}

const NameBtn = styled.button`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  b { margin-bottom: 5px; font-family: var(--font-display); font-size: 20px; font-weight: 300; line-height: 1.25; color: var(--text-primary); overflow-wrap: anywhere; }
  small { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
  &:hover b { color: var(--color-accent-link); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
`;

/* The week: a letter over a tick for each day */
const Days = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
  /* A hairline between the habit's name and the week's letters */
  margin-top: 4px;
  padding-top: 26px;
  border-top: 1px solid var(--border-subtle);
`;

const Day = styled.div<{ $today: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: ${({ $today }) => ($today ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
  font-weight: ${({ $today }) => ($today ? 600 : 400)};
`;

const TickBtn = styled.button`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 26px;
  padding: 2px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  cursor: pointer;
  &:disabled { cursor: default; opacity: 0.35; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
`;

const Off = styled.span`
  min-height: 26px;
  line-height: 26px;
  font-weight: 400;
  color: var(--text-faint, var(--text-disabled));
`;

const Streak = styled.span`
  flex: none;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 25px;
  color: var(--text-muted);
  white-space: nowrap;
`;

const Paused = styled.div`
  margin-top: 28px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  button { padding: 0; margin-right: 16px; border: none; background: transparent; font: inherit; color: var(--text-secondary); cursor: pointer; }
  button:hover { color: var(--text-primary); text-decoration: underline; }
`;

/* One history panel per habit */
const Panel = styled.section`
  margin-top: 24px;
  scroll-margin-top: 24px;
  padding: 28px 32px 44px;
  background: var(--bg-panel);
  border-radius: 14px;
  /* Light: the Health widgets' edge, as a ring so nothing moves */
  html[data-theme='light'] & { background: transparent; box-shadow: 0 0 0 1px var(--edge-card), var(--shadow-soft); }
  @media (max-width: 560px) { padding: 22px 18px 34px; }
`;

const PanelHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 20px;
  h2 { margin: 0; font-family: var(--font-display); font-size: 26px; font-weight: 300; color: var(--text-primary); }
  p { margin: 4px 0 0; font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

const LinkBtn = styled.button`
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const Bar = styled.div<{ $top?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin: ${p => p.$top ? '56px 0 44px' : '22px 0 6px'};
`;

/* A habit's figures: the numbers the same size as their words (the history pages keep
   their big figures). One line of plain text, the number a step heavier */
const HabitFigures = styled(Figures)`
  font-size: inherit;
  color: inherit;
  strong { margin-right: 5px; font-family: inherit; font-size: inherit; font-weight: 600; color: inherit; }
`;

const Sum = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  margin: 18px 0 32px;
  /* One size and colour throughout (figures and dates), under a hairline */
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 14px;
  font-style: italic;
  color: var(--text-muted);
  & > span { font-size: inherit; color: inherit; }
`;

const SquaresHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin: 40px 0 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const CELL_COLOR: Record<DayCell, string> = {
  full: 'var(--color-accent-fill, var(--color-accent))',
  part: 'color-mix(in srgb, var(--color-accent) 45%, transparent)',
  missed: 'var(--border-default)',
  off: 'var(--border-subtle)',
  ahead: 'transparent',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function HabitsView() {
  const { habits, paused, count, setCount, loaded, habitTopicId } = useHabits();
  // The goal a habit is part of, named on its card and its history
  const { goals } = usePlanData();
  const goalTitles = useMemo(() => new Map(goals.map(g => [g.id, g.title])), [goals]);
  const goalOf = (h: Habit) => (h.goalId ? goalTitles.get(h.goalId) : undefined);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const today = toDateStr(new Date());

  const [anchor, setAnchor] = useState(today);
  const days = useMemo(() => weekOf(anchor), [anchor]);

  const [savedCategories] = useEncryptedSetting<GoalCategoryConfig>('goalCategories', EMPTY_GOAL_CATEGORIES);
  const categories = useMemo(() => goalCategoryList(parseGoalCategories(savedCategories)), [savedCategories]);
  const groups = useMemo(() => groupByCategory(habits, h => h.category, categories), [habits, categories]);
  const hasCategories = groups.some(g => !!g.category);
  // Sorting is this browser's own choice, remembered between visits
  const [sort, setSortState] = useState<HabitSort>(savedSort);
  const setSort = (v: HabitSort) => {
    setSortState(v);
    try { localStorage.setItem(SORT_KEY, v); } catch { /* not remembered */ }
  };
  const byCategory = sort === 'category' && hasCategories;

  const key = (h: Habit) => String(h.id);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const chosen = habits.find(h => key(h) === chosenKey);
  // Picking a card takes you to its chart
  const pick = (h: Habit) => {
    setChosenKey(key(h));
    document.getElementById(`habit-history-${key(h)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [period, setPeriod] = useState<MedPeriod>('3-months');
  const range = useMemo(() => medPeriodRange(period), [period]);

  const addHabit = async () => {
    const id = habitTopicId ?? await getOrCreateTopic(HABIT_TOPIC, HABIT_ICON);
    newEntry(id, { ...HABIT_DEFAULTS, parentGoalId: null });
  };

  // A tap on a day: one more until the day is full, then back to none
  const tap = (h: Habit, dayIndex: number) => {
    const day = days[dayIndex];
    setCount(h, day, nextCount(h, count(h, day)));
  };

  const downloadCsv = () => {
    const lines = [['Date', 'Habit', 'Times'], ...habitCsvRows(habits, { from: range.from, to: range.to < today ? range.to : today }, count)]
      .map(r => r.map(csvCell).join(','));
    saveCsv(lines, `habits-${range.from}-to-${range.to}.csv`);
  };

  const renderCard = (h: Habit) => {
    const streak = streakWeeks(h, today, count);
    const full = dayTarget(h);
    const on = !!chosen && key(chosen) === key(h);
    return (
      <Card key={key(h)} $on={on} aria-label={h.name}>
        <CardHead>
          <NameBtn type="button" aria-pressed={on} title="Go to its chart" onClick={() => pick(h)}>
            <b>{h.name}</b>
            <small>{describeTarget(h, describeDays)}{h.category?.trim() ? ` · ${h.category.trim()}` : ''}</small>
            {goalOf(h) && <small>Part of {goalOf(h)}</small>}
          </NameBtn>
          {streak > 0 && <Streak title="Weeks in a row that met the target">{plural(streak, 'week', 'weeks')}</Streak>}
        </CardHead>
        <Days role="group" aria-label={`${h.name}, ${weekLabel(days)}`}>
          {days.map((day, i) => {
            const n = count(h, day);
            // Nothing can be ticked ahead of time
            const canTick = day <= today;
            return (
              <Day key={day} $today={day === today}>
                <span aria-hidden="true">{WEEKDAYS[i][0]}</span>
                {!isDueOn(h, day) && n === 0 && !canTick ? <Off aria-label={`${WEEKDAYS[i]}: not due`}>·</Off> : (
                  <TickBtn type="button" disabled={!canTick || !loaded}
                    aria-label={`${h.name}, ${WEEKDAYS[i]}: ${n} of ${full} done`} aria-pressed={n >= full}
                    onClick={() => tap(h, i)}>
                    <TickMark checked={n >= full} size={22} />
                    {(full > 1 || n > full) && <span>{n}/{full}</span>}
                  </TickBtn>
                )}
              </Day>
            );
          })}
        </Days>
      </Card>
    );
  };

  // The cards in the chosen order; every habit gets its chart in that order too
  const ordered = byCategory ? groups.flatMap(g => g.items) : habits;

  return (
    <PlanningShell title="Health" tabs={<HealthTabBar />} actions={<>
      <MonthPill label={weekLabel(days)} onPrev={() => setAnchor(a => addDays(a, -7))} onNext={() => setAnchor(a => addDays(a, 7))} />
      <TodayBtn type="button" onClick={() => setAnchor(today)}>This week</TodayBtn>
      <TopBarAction><PillButton type="button" onClick={() => void addHabit()}>Add habit</PillButton></TopBarAction>
    </>}>
      {habits.length === 0 ? (
        <EmptyState message="No habits yet." submessage="Add one with a target, like 3 times a week, and tick it off here each day." />
      ) : (
        <>
          {hasCategories && (
            <SortRow>
              <span>Sort</span>
              <Chips role="group" aria-label="Sort habits">
                {([['added', 'Date added'], ['category', 'Category']] as const).map(([v, label]) => (
                  <Chip key={v} type="button" $active={sort === v} aria-pressed={sort === v}
                    onClick={() => setSort(v)}>{label}</Chip>
                ))}
              </Chips>
            </SortRow>
          )}
          <Cards>{ordered.map(renderCard)}</Cards>
        </>
      )}

      {paused.length > 0 && (
        <Paused>
          Paused:{' '}
          {paused.map(h => <button key={h.id} type="button" onClick={() => openInJournal(h.id)}>{h.name}</button>)}
        </Paused>
      )}

      {ordered.length > 0 && (<>
        <Bar $top>
          <Chips role="group" aria-label="Period">
            {PERIODS.map(p => (
              <Chip key={p.value} type="button" $active={period === p.value} aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}>{p.label}</Chip>
            ))}
          </Chips>
          <CsvLink onClick={downloadCsv} disabled={habits.length === 0} />
        </Bar>
        {ordered.map(h => (
          <HabitHistory key={key(h)} habit={h} goal={goalOf(h)} range={range} today={today} count={count}
            onEdit={() => openInJournal(h.id)} />
        ))}
      </>)}
    </PlanningShell>
  );
}

/* A habit's history over the chosen period: figures, bars and a square per day */
function HabitHistory({ habit, goal, range, today, count, onEdit }: {
  habit: Habit;
  /** The goal it's part of */
  goal?: string;
  range: DayRange;
  today: string;
  count: CountOn;
  onEdit: () => void;
}) {
  const totals = useMemo(() => habitTotals(habit, range, today, count), [habit, range, today, count]);
  const series = useMemo(() => countSeries(habit, range, count), [habit, range, count]);
  // Up to today: days still ahead aren't drawn, so the squares fill the row edge to edge
  const cells = useMemo(() => dayCells(habit, range, today, count).filter(c => c !== 'ahead'), [habit, range, today, count]);
  const streak = streakWeeks(habit, today, count);
  return (
    <Panel id={`habit-history-${habit.id}`} aria-label={`${habit.name} over time`}>
      <PanelHead>
        <div>
          <h2>{habit.name}</h2>
          <p>{describeTarget(habit, describeDays)}{habit.category ? ` · ${habit.category}` : ''}{goal ? ` · Part of ${goal}` : ''}</p>
        </div>
        <LinkBtn type="button" onClick={onEdit}>Edit habit</LinkBtn>
      </PanelHead>
      <Sum>
        <HabitFigures>
          <span><strong>{totals.times}</strong>{totals.times === 1 ? 'time' : 'times'}</span>
          <span><strong>{totals.days}</strong>{totals.days === 1 ? 'day' : 'days'}</span>
          <span><strong>{totals.weeksMet}</strong>of {plural(totals.weeks, 'week', 'weeks')} met</span>
          <span><strong>{streak}</strong>week streak</span>
        </HabitFigures>
        <Dates>{rangeLabel(range)}</Dates>
      </Sum>
      <CountBars labels={series.labels} values={series.values} target={series.target}
        ariaLabel={`${habit.name}: times done each ${series.unit}, ${rangeLabel(range)}`}
        unitLabel={v => plural(v, 'time', 'times')} />
      {cells.length <= 190 && (<>
        <SquaresHead>
          <span>Each square is a day</span>
          <SquareLegend>
            <span><SquareSwatch $c={CELL_COLOR.full} />Done</span>
            {dayTarget(habit) > 1 && <span><SquareSwatch $c={CELL_COLOR.part} />Part done</span>}
            {habit.period === 'day' && <span><SquareSwatch $c={CELL_COLOR.missed} />Missed</span>}
            <span><SquareSwatch $c={CELL_COLOR.off} />{habit.period === 'day' ? 'Not due' : 'Not done'}</span>
          </SquareLegend>
        </SquaresHead>
        <DaySquares colors={cells.map(c => CELL_COLOR[c])}
          label={`${habit.name}: ${plural(totals.days, 'day', 'days')} done, ${rangeLabel(range)}`} />
      </>)}
    </Panel>
  );
}
