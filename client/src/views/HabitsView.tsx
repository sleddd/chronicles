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
import {
  HABIT_DEFAULTS, HABIT_ICON, HABIT_TOPIC, countSeries, dayCells, dayTarget, describeTarget, habitCsvRows, habitTotals,
  isDueOn, nextCount, streakWeeks, weekProgress, type DayCell, type Habit,
} from '../utils/habits.js';

/* Health → Habits: small cards, three across, under their categories — each
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
  @media (max-width: 480px) { padding: 18px 16px 20px; }
`;

const CardHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const GroupHead = styled.h2`
  margin: 0 0 20px;
  padding: 26px 0 10px;
  border-bottom: 1px solid var(--border-default);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  color: var(--text-secondary);
  section:first-child > & { padding-top: 0; }
`;

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
  b { font-family: var(--font-display); font-size: 20px; font-weight: 300; line-height: 1.25; color: var(--text-primary); overflow-wrap: anywhere; }
  small { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
  &:hover b { color: var(--color-accent-link); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
`;

/* The week: a letter over a tick for each day */
const Days = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
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
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

const Off = styled.span`
  min-height: 26px;
  line-height: 26px;
  font-weight: 400;
  color: var(--text-faint, var(--text-disabled));
`;

const Week = styled.div<{ $met: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $met }) => ($met ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
`;

const Track = styled.i`
  display: block;
  height: 4px;
  border-radius: 2px;
  background: var(--progress-track, var(--bg-row-hover));
  overflow: hidden;
  i { display: block; height: 100%; border-radius: 2px; background: var(--color-accent-fill, var(--color-accent)); transition: width 0.3s ease-out; }
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

/* The chosen habit's history */
const Panel = styled.section`
  margin-top: 40px;
  padding: 28px 32px 30px;
  background: var(--bg-panel);
  border-radius: 14px;
  @media (max-width: 560px) { padding: 22px 18px 24px; }
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

const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin: 22px 0 6px;
`;

const Sum = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  margin: 18px 0 18px;
  font-family: var(--font-sans);
`;

const Note = styled.p`
  margin: 10px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const SquaresHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin: 26px 0 8px;
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
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const today = toDateStr(new Date());

  const [anchor, setAnchor] = useState(today);
  const days = useMemo(() => weekOf(anchor), [anchor]);

  const [savedCategories] = useEncryptedSetting<GoalCategoryConfig>('goalCategories', EMPTY_GOAL_CATEGORIES);
  const categories = useMemo(() => goalCategoryList(parseGoalCategories(savedCategories)), [savedCategories]);
  const groups = useMemo(() => groupByCategory(habits, h => h.category, categories), [habits, categories]);
  const grouped = groups.length > 1 || (groups.length === 1 && !!groups[0].category);

  const key = (h: Habit) => String(h.id);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const chosen = habits.find(h => key(h) === chosenKey) ?? habits[0];
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
    const wp = weekProgress(h, days, count);
    const streak = streakWeeks(h, today, count);
    const full = dayTarget(h);
    const on = !!chosen && key(chosen) === key(h);
    return (
      <Card key={key(h)} $on={on} aria-label={h.name}>
        <CardHead>
          <NameBtn type="button" aria-pressed={on} title="Show its history" onClick={() => setChosenKey(key(h))}>
            <b>{h.name}</b>
            <small>{describeTarget(h, describeDays)}</small>
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
        <Week $met={wp.met}>
          <span>{wp.met ? `Target met · ${wp.done} of ${wp.target}` : `${wp.done} of ${wp.target} this week`}</span>
          <Track aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((wp.done / wp.target) * 100))}%` }} /></Track>
        </Week>
      </Card>
    );
  };

  const totals = chosen ? habitTotals(chosen, range, today, count) : null;
  const series = chosen ? countSeries(chosen, range, count) : null;
  const cells = chosen ? dayCells(chosen, range, today, count) : [];
  const chosenStreak = chosen ? streakWeeks(chosen, today, count) : 0;

  return (
    <PlanningShell title="Health" tabs={<HealthTabBar />} actions={<>
      <MonthPill label={weekLabel(days)} onPrev={() => setAnchor(a => addDays(a, -7))} onNext={() => setAnchor(a => addDays(a, 7))} />
      <TodayBtn type="button" onClick={() => setAnchor(today)}>This week</TodayBtn>
      <TopBarAction><PillButton type="button" onClick={() => void addHabit()}>Add habit</PillButton></TopBarAction>
    </>}>
      {habits.length === 0 ? (
        <EmptyState message="No habits yet." submessage="Add one with a target, like 3 times a week, and tick it off here each day." />
      ) : (
        grouped
          ? groups.map(g => (
              <section key={g.category || 'none'} aria-label={g.category || 'No category'}>
                <GroupHead>{g.category || 'No category'}</GroupHead>
                <Cards>{g.items.map(renderCard)}</Cards>
              </section>
            ))
          : <Cards>{habits.map(renderCard)}</Cards>
      )}

      {paused.length > 0 && (
        <Paused>
          Paused:{' '}
          {paused.map(h => <button key={h.id} type="button" onClick={() => openInJournal(h.id)}>{h.name}</button>)}
        </Paused>
      )}

      {chosen && totals && series && (
        <Panel aria-label={`${chosen.name} over time`}>
          <PanelHead>
            <div>
              <h2>{chosen.name}</h2>
              <p>{describeTarget(chosen, describeDays)}{chosen.category ? ` · ${chosen.category}` : ''}</p>
            </div>
            <LinkBtn type="button" onClick={() => openInJournal(chosen.id)}>Edit habit</LinkBtn>
          </PanelHead>
          <Bar>
            <Chips role="group" aria-label="Period">
              {PERIODS.map(p => (
                <Chip key={p.value} type="button" $active={period === p.value} aria-pressed={period === p.value}
                  onClick={() => setPeriod(p.value)}>{p.label}</Chip>
              ))}
            </Chips>
            <CsvLink onClick={downloadCsv} disabled={habits.length === 0} />
          </Bar>
          <Sum>
            <Figures>
              <span><strong>{totals.times}</strong>{totals.times === 1 ? 'time' : 'times'}</span>
              <span><strong>{totals.days}</strong>{totals.days === 1 ? 'day' : 'days'}</span>
              <span><strong>{totals.weeksMet}</strong>of {plural(totals.weeks, 'week', 'weeks')} met</span>
              <span><strong>{chosenStreak}</strong>week streak</span>
            </Figures>
            <Dates>{rangeLabel(range)}</Dates>
          </Sum>
          <CountBars labels={series.labels} values={series.values} target={series.target}
            ariaLabel={`${chosen.name}: times done each ${series.unit}, ${rangeLabel(range)}`}
            unitLabel={v => plural(v, 'time', 'times')} />
          <Note>
            Each bar is a {series.unit}.{series.target !== undefined ? ` The dashed line is the target of ${series.target} a ${series.unit}.` : ''}
          </Note>
          {cells.length <= 190 && (<>
            <SquaresHead>
              <span>Each square is a day</span>
              <SquareLegend>
                <span><SquareSwatch $c={CELL_COLOR.full} />Done</span>
                {dayTarget(chosen) > 1 && <span><SquareSwatch $c={CELL_COLOR.part} />Part done</span>}
                {chosen.period === 'day' && <span><SquareSwatch $c={CELL_COLOR.missed} />Missed</span>}
                <span><SquareSwatch $c={CELL_COLOR.off} />{chosen.period === 'day' ? 'Not due' : 'Not done'}</span>
              </SquareLegend>
            </SquaresHead>
            <DaySquares colors={cells.map(c => CELL_COLOR[c])}
              label={`${chosen.name}: ${plural(totals.days, 'day', 'days')} done, ${rangeLabel(range)}`} />
          </>)}
        </Panel>
      )}
    </PlanningShell>
  );
}
