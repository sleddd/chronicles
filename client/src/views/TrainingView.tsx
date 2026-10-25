import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { ExerciseSubTabs } from '../components/molecules/ExerciseSubTabs.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { topics as topicsApi } from '../services/api.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { tableColumnRules } from '../styles/columnRules.js';
import { activeRoutines, routineLinkKey, runsOn, scheduleTopicId, type Routine } from '../utils/routines.js';
import {
  addDays, categoryOf, daysBetween, formatShort, minutesByCategory, mountaineeringTemplate,
  phaseIndexOn, phaseWeeks, sessionsFrom, targetHours, trainingPlans, weeklyTarget,
  type PlanPhase, type Session, type TrainingPlan,
} from '../utils/training.js';
import type { TrainingCategory } from '../types/fields.js';

/* Health → Exercise → Training: the active training plan. Its name with Edit
   plan and where you are ("Phase 1 of 4 · Week 3 of 6"); the
   phases as tabs ("Phase 1 · now"); the phase card — per category a bar
   toward the phase's hours, "3 h 5 / 5 h" for the phase and "90 / 50 min" this
   week (accent once met), and a note for sessions in no category; the week
   (current, or one picked under All weeks) as the spreadsheet it replaces —
   days down, categories across, sessions as chips: from the schedule (accent
   tint), logged (grey), planned (dashed, the schedule's days still to come);
   then All weeks — every week's minutes per category against ~the phase's
   hours ÷ its weeks. Reads Exercise entries (utils/training). */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px 64px;
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

const Head = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 53px 0 28px;
`;

const Title = styled.h1`
  margin: 0;
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  @media (max-width: 480px) { font-size: 34px; }
`;

const SubTabs = styled.div`
  padding: 24px 0 4px;
`;

const PlanHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 24px;
  margin-top: 44px;
`;

const PlanName = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 42px;
  font-weight: 200;
  line-height: 1.1;
  color: var(--text-primary);
  @media (max-width: 480px) { font-size: 32px; }
`;

const Where = styled.p`
  margin: 10px 0 0;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-muted);
`;

/* Phase tabs: plain text on a hairline, the chosen one in the body colour over a 2px rule */
const PhaseBar = styled.div`
  display: flex;
  gap: 28px;
  margin-top: 26px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-subtle);
`;

const PhaseTab = styled.button<{ $active: boolean }>`
  flex: none;
  margin-bottom: -1px;
  padding: 0 0 12px;
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? 'var(--text-primary)' : 'transparent')};
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-muted)')};
  cursor: pointer;
  .now { color: var(--text-muted); }
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Card = styled.section`
  margin-top: 28px;
  padding: 30px 32px 28px;
  border-radius: 12px;
  background: var(--bg-panel);
  @media (max-width: 768px) { padding: 24px 20px; }
`;

const CardHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  margin-bottom: 26px;
`;

const CardTitle = styled.h3`
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 300;
  color: var(--text-primary);
`;

const Muted = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

/* Category | Phase progress | Phase | This week — rules under each cell, gaps between */
const ProgressRow = styled.div<{ $head?: boolean; $week: boolean }>`
  display: grid;
  grid-template-columns: ${({ $week }) => ($week ? 'minmax(150px, 1.1fr) minmax(0, 2.6fr) 150px 150px' : 'minmax(150px, 1.1fr) minmax(0, 2.6fr) 150px')};
  column-gap: 28px;
  font-family: var(--font-sans);
  font-size: ${({ $head }) => ($head ? '14px' : '15px')};
  color: ${({ $head }) => ($head ? 'var(--text-muted)' : 'var(--text-secondary)')};
  > * {
    display: flex;
    align-items: center;
    min-height: ${({ $head }) => ($head ? '36px' : '50px')};
    border-bottom: 1px solid var(--border-subtle);
  }
  .fig { justify-content: flex-end; white-space: nowrap; }
  .met { color: var(--color-accent-link); }
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr) auto ${({ $week }) => ($week ? 'auto' : '')};
    column-gap: 16px;
    .bar { display: none; }
  }
`;

const Track = styled.div<{ $thick?: boolean }>`
  flex: 1;
  height: ${({ $thick }) => ($thick ? '5px' : '4px')};
  border-radius: 3px;
  background: var(--progress-track, var(--bg-row-hover));
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => Math.min(100, Math.max(0, $pct))}%;
  border-radius: 3px;
  background: var(--color-accent-fill, var(--color-accent));
`;

const Note = styled.p`
  margin: 22px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const InlineLink = styled.button`
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const SectionHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  margin: 52px 0 16px;
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 300;
  color: var(--text-primary);
  small { margin-left: 4px; font-family: var(--font-sans); font-size: 17px; color: var(--text-muted); }
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
  span { display: inline-flex; align-items: center; gap: 8px; }
`;

const Swatch = styled.i<{ $kind: ChipKind }>`
  width: 13px;
  height: 13px;
  border-radius: 3px;
  ${({ $kind }) => chipColours($kind)}
`;

const TableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  background: var(--bg-panel);
`;

const WeekTable = styled.table`
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  table-layout: fixed;
  font-family: var(--font-sans);
  font-size: 15px;
  th, td { padding: 11px 12px; text-align: left; vertical-align: top; }
  th { font-weight: 400; color: var(--text-muted); border-bottom: 1px solid var(--border-card); }
  th:first-child, td:first-child { width: 116px; padding-left: 16px; }
  tbody td { border-top: 1px solid var(--border-subtle); height: 34px; }
  tbody tr:first-child td { border-top: none; }
  ${tableColumnRules}
  .day { color: var(--text-secondary); white-space: nowrap; vertical-align: middle; }
  tr[data-today='true'] td { background: color-mix(in srgb, var(--color-accent) 5%, transparent); }
  tr[data-today='true'] .day { color: var(--color-accent-link); font-weight: 600; }
`;

type ChipKind = 'schedule' | 'logged' | 'planned';

function chipColours(kind: ChipKind): string {
  if (kind === 'schedule') return 'background: var(--color-accent-subtle); color: var(--color-accent-link); border: 1px solid transparent;';
  if (kind === 'logged') return 'background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text-secondary); border: 1px solid transparent;';
  return 'background: transparent; color: var(--text-muted); border: 1px dashed var(--control-border);';
}

const Chip = styled.button<{ $kind: ChipKind }>`
  display: block;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 4px;
  ${({ $kind }) => chipColours($kind)}
  font-family: var(--font-sans);
  font-size: 15px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  & + & { margin-top: 6px; }
  &:hover { filter: brightness(0.97); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

const AddCell = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 4px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  td:hover &, &:focus-visible { opacity: 1; }
  @media (hover: none) { display: none; }
  &:hover { color: var(--color-accent-link); }
`;

/* All weeks: Week | a figure over a rule per category; the current week tinted */
const WeeksRow = styled.button<{ $cols: number; $now: boolean; $picked: boolean; $head?: boolean }>`
  display: grid;
  grid-template-columns: 150px repeat(${({ $cols }) => $cols}, minmax(110px, 1fr));
  column-gap: 32px;
  align-items: center;
  width: 100%;
  min-width: ${({ $cols }) => 150 + $cols * 142}px;
  padding: ${({ $head }) => ($head ? '14px 16px' : '14px 16px 16px')};
  border: none;
  border-top: ${({ $head }) => ($head ? 'none' : '1px solid var(--border-subtle)')};
  background: ${({ $now }) => ($now ? 'color-mix(in srgb, var(--color-accent) 5%, transparent)' : 'transparent')};
  text-align: left;
  font-family: var(--font-sans);
  cursor: ${({ $head }) => ($head ? 'default' : 'pointer')};
  box-shadow: ${({ $picked }) => ($picked ? 'inset 3px 0 0 var(--color-accent)' : 'none')};
  .label { font-size: 15px; color: var(--text-secondary); }
  .label[data-now='true'] { font-weight: 600; }
  .dates { display: block; margin-top: 4px; font-size: 13px; color: var(--text-muted); }
  .head { font-size: 15px; color: var(--text-muted); }
  .fig { display: block; margin-bottom: 8px; font-size: 15px; color: var(--text-secondary); }
  .fig.met { color: var(--color-accent-link); }
  .fig.ahead { color: var(--text-muted); }
`;

const EmptyCard = styled.div`
  margin-top: 40px;
  padding: 32px 28px;
  border-radius: 12px;
  background: var(--bg-panel);
  font-family: var(--font-sans);
  color: var(--text-muted);
  h2 { margin: 0 0 10px; font-family: var(--font-display); font-size: 26px; font-weight: 200; color: var(--text-primary); }
  p { margin: 0 0 20px; font-size: 15px; line-height: 1.5; max-width: 620px; }
`;

const shortDate = (d: string, year = false) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const dayLabel = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
/** "Oct 25 – 31", or "Oct 29 – Nov 4" across months */
function range(start: string, last: string): string {
  const a = new Date(start + 'T12:00:00');
  const b = new Date(last + 'T12:00:00');
  return a.getMonth() === b.getMonth() ? `${shortDate(start)} – ${b.getDate()}` : `${shortDate(start)} – ${shortDate(last)}`;
}
const tenths = (min: number) => {
  const h = Math.round(min / 6) / 10;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
};

async function topicIdFor(match: (name: string) => boolean, name: string, icon: string): Promise<number> {
  const { allTopics, setTopics } = useEntriesStore.getState();
  let topic = allTopics.find(t => match(t.name));
  if (!topic) {
    topic = await topicsApi.create({ name, icon });
    setTopics([...allTopics, topic]);
  }
  return topic.id;
}
const isPlanTopic = (n: string) => ['training plan', 'training plans'].includes(n.toLowerCase());

/** "Phase 1 of 4 · Week 3 of 6" */
function whereYouAre(plan: TrainingPlan, today: string): string {
  const at = phaseIndexOn(plan, today);
  const parts: string[] = [];
  if (plan.phases.length === 0) parts.push('No phases yet');
  else if (at === -1) parts.push(`Starts ${shortDate(plan.start, true)}`);
  else if (at >= plan.phases.length) parts.push('All phases done');
  else {
    const p = plan.phases[at];
    parts.push(`${p.name} of ${plan.phases.length}`, `Week ${Math.floor(daysBetween(p.start, today) / 7) + 1} of ${p.weekCount}`);
  }
  return parts.join(' · ');
}

interface Planned { key: string; routine: Routine; date: string; category: string }

/** The schedule's sessions still to come in a week (today on), by day and category */
function plannedIn(routines: Routine[], start: string, today: string, logged: Set<string>, categories: TrainingCategory[]): Planned[] {
  const out: Planned[] = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(start, d);
    if (date < today) continue;
    for (const r of routines) {
      if (!runsOn(r, date)) continue;
      const category = categoryOf({ id: r.id, date, minutes: r.minutes, distance: 0, unit: 'mi', exerciseType: r.exerciseType, category: r.trainingCategory, title: r.name, name: r.name }, categories);
      if (!category) continue;
      for (const time of r.times) {
        const key = routineLinkKey(r.id, date, time);
        if (!logged.has(key)) out.push({ key, routine: r, date, category });
      }
    }
  }
  return out;
}

const chipText = (name: string, minutes: number) => (minutes ? `${name} · ${formatShort(minutes)}` : name);

export function TrainingView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const today = toDateStr(new Date());

  const plans = useMemo(() => trainingPlans(entries, allTopics.find(t => isPlanTopic(t.name))?.id, stripHtml), [entries, allTopics]);
  const sessions = useMemo(
    () => sessionsFrom(entries, allTopics.find(t => t.name.toLowerCase() === 'exercise')?.id, stripHtml),
    [entries, allTopics],
  );
  const routines = useMemo(() => activeRoutines(entries, scheduleTopicId(allTopics), stripHtml), [entries, allTopics]);

  const [planId, setPlanId] = useState<number | null>(null);
  const plan = plans.find(p => p.id === planId) ?? plans[0];
  const current = plan ? phaseIndexOn(plan, today) : -1;
  const [pick, setPick] = useState<{ plan: number; phase: string; week: number | null } | null>(null);
  const picked = pick && plan && pick.plan === plan.id ? pick : null;
  const phase: PlanPhase | undefined = plan
    ? plan.phases.find(p => p.id === picked?.phase) ?? plan.phases[Math.min(Math.max(current, 0), plan.phases.length - 1)]
    : undefined;
  const isCurrent = !!plan && !!phase && plan.phases[current]?.id === phase.id;
  const nowWeek = phase && isCurrent ? Math.floor(daysBetween(phase.start, today) / 7) : -1;
  const weekIndex = picked?.week ?? (nowWeek >= 0 ? nowWeek : 0);

  const weeks = useMemo(() => (plan && phase ? phaseWeeks(phase, sessions, plan.categories) : []), [plan, phase, sessions]);
  const phaseDone = useMemo(
    () => (plan && phase ? minutesByCategory(sessions, plan.categories, phase.start, phase.end) : {}),
    [plan, phase, sessions],
  );
  const uncounted = useMemo(() => (plan && phase
    ? sessions.filter(s => s.date >= phase.start && s.date < phase.end && !categoryOf(s, plan.categories))
    : []), [plan, phase, sessions]);
  const week = weeks[weekIndex];
  const planned = useMemo(() => {
    if (!plan || !week) return [];
    const logged = new Set(sessions.map(s => s.link).filter((k): k is string => !!k));
    return plannedIn(routines, week.start, today, logged, plan.categories);
  }, [plan, week, routines, sessions, today]);

  const startPlan = async () => {
    newEntry(await topicIdFor(isPlanTopic, 'Training Plan', 'mountain'),
      { ...mountaineeringTemplate(), startDate: today, eventDate: '', isActive: true, notes: '' });
  };
  const logIn = async (date: string, c: TrainingCategory) => {
    newEntry(await topicIdFor(n => n.toLowerCase() === 'exercise', 'Exercise', 'dumbbell'),
      { performedDate: date, trainingCategory: c.name, exerciseType: c.exerciseTypes?.[0] ?? 'other' });
  };

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  if (isLoading || !isReady) return (
    <ContentTemplate>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Spinner size={40} />
      </div>
    </ContentTemplate>
  );

  const categories = plan?.categories ?? [];
  const plannedMin = phase ? categories.reduce((t, c) => t + targetHours(phase, c.id) * 60, 0) : 0;
  const doneMin = Object.values(phaseDone).reduce((a, b) => a + b, 0);
  const thisWeek = isCurrent ? weeks[nowWeek] : undefined;

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Health</Title>
            <PillButton type="button" onClick={() => void startPlan()}>New plan</PillButton>
          </Head>
          <HealthTabBar />
          <SubTabs><ExerciseSubTabs /></SubTabs>

          {!plan ? (
            <EmptyCard>
              <h2>No training plan yet</h2>
              <p>
                A plan splits your training into phases, each with the hours to put into every kind of
                training. Your logged exercise fills it in. Start from the mountaineering template, or import
                a tracker spreadsheet in Settings → Data.
              </p>
              <PillButton type="button" onClick={() => void startPlan()}>New plan</PillButton>
            </EmptyCard>
          ) : (
            <>
              {plans.length > 1 && (
                <div style={{ marginTop: 28 }}>
                  <FilterTabs options={plans.map(p => ({ value: String(p.id), label: p.name }))}
                    active={String(plan.id)} onChange={v => setPlanId(Number(v))} flush bordered={false} />
                </div>
              )}

              <PlanHead>
                <div>
                  <PlanName>{plan.name}</PlanName>
                  <Where>{whereYouAre(plan, today)}</Where>
                </div>
                <PillButton type="button" $variant="neutral" onClick={() => openInJournal(plan.id)}>Edit plan</PillButton>
              </PlanHead>

              {plan.phases.length === 0 || categories.length === 0 ? (
                <Note>Add categories and phases to this plan with Edit plan.</Note>
              ) : phase && (
                <>
                  <PhaseBar role="tablist" aria-label="Phases">
                    {plan.phases.map((p, i) => (
                      <PhaseTab key={p.id} type="button" role="tab" aria-selected={p.id === phase.id} $active={p.id === phase.id}
                        onClick={() => setPick({ plan: plan.id, phase: p.id, week: null })}>
                        {p.name}{i === current && <span className="now"> · now</span>}
                      </PhaseTab>
                    ))}
                  </PhaseBar>

                  <Card aria-label={phase.name}>
                    <CardHead>
                      <CardTitle>{phase.name}</CardTitle>
                      <Muted>
                        {range(phase.start, addDays(phase.end, -1))}
                        {plannedMin > 0 && ` · ${tenths(doneMin)} of ${tenths(plannedMin)} h · ${Math.round(doneMin / plannedMin * 100)}%`}
                      </Muted>
                    </CardHead>
                    <ProgressRow $head $week={!!thisWeek} aria-hidden="true">
                      <span>Category</span>
                      <span className="bar">Phase progress</span>
                      <span className="fig">Phase</span>
                      {thisWeek && <span className="fig">This week</span>}
                    </ProgressRow>
                    {categories.map(c => {
                      const target = targetHours(phase, c.id) * 60;
                      const done = phaseDone[c.id] ?? 0;
                      const wTarget = weeklyTarget(phase, c.id);
                      const wDone = thisWeek?.totals[c.id] ?? 0;
                      return (
                        <ProgressRow key={c.id} $week={!!thisWeek}>
                          <span>{c.name}</span>
                          <span className="bar"><Track><Fill $pct={target ? done / target * 100 : 0} /></Track></span>
                          <span className="fig">{formatShort(done)} / {target ? formatShort(target) : '—'}</span>
                          {thisWeek && (
                            <span className={`fig${wTarget && wDone >= wTarget ? ' met' : ''}`}>
                              {Math.round(wDone)} / {wTarget ? `${wTarget} min` : '—'}
                            </span>
                          )}
                        </ProgressRow>
                      );
                    })}
                    {uncounted.length > 0 && (
                      <Note>
                        {uncounted.length === 1 ? '1 session isn’t' : `${uncounted.length} sessions aren’t`} in a category:{' '}
                        {[...new Set(uncounted.map(s => s.name))].slice(0, 3).join(', ')}
                        {new Set(uncounted.map(s => s.name)).size > 3 ? ' …' : ''}.{' '}
                        <InlineLink type="button" onClick={() => openInJournal(uncounted[0].id)}>Pick one</InlineLink>
                      </Note>
                    )}
                  </Card>

                  {week && (
                    <>
                      <SectionHead>
                        <SectionTitle>Week {week.index + 1} <small>· {range(week.start, addDays(week.start, 6))}</small></SectionTitle>
                        <Legend aria-hidden="true">
                          <span><Swatch $kind="schedule" /> From schedule</span>
                          <span><Swatch $kind="logged" /> Logged</span>
                          <span><Swatch $kind="planned" /> Planned</span>
                        </Legend>
                      </SectionHead>
                      <TableWrap>
                        <WeekTable>
                          <thead>
                            <tr>
                              <th>Day</th>
                              {categories.map(c => <th key={c.id}>{c.name}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {week.days.map(d => (
                              <tr key={d.date} data-today={d.date === today}>
                                <td className="day">{dayLabel(d.date)}</td>
                                {categories.map(c => {
                                  const logged: Session[] = d.cells[c.id] ?? [];
                                  const ahead = planned.filter(p => p.date === d.date && p.category === c.id);
                                  return (
                                    <td key={c.id}>
                                      {logged.map(s => (
                                        <Chip key={s.id} type="button" $kind={s.link ? 'schedule' : 'logged'} title={s.title}
                                          onClick={() => openInJournal(s.id)}>
                                          {chipText(s.name, s.minutes)}
                                        </Chip>
                                      ))}
                                      {ahead.map(p => (
                                        <Chip key={p.key} type="button" $kind="planned" title={`Planned: ${p.routine.name}`}
                                          onClick={() => openInJournal(p.routine.id)}>
                                          {chipText(p.routine.name, p.routine.minutes)}
                                        </Chip>
                                      ))}
                                      {logged.length === 0 && ahead.length === 0 && (
                                        <AddCell type="button" aria-label={`Log ${c.name} on ${dayLabel(d.date)}`} onClick={() => void logIn(d.date, c)}>
                                          <Icon name="plus" size={14} strokeWidth={2} />
                                        </AddCell>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </WeekTable>
                      </TableWrap>
                    </>
                  )}

                  <SectionHead><SectionTitle>All weeks</SectionTitle></SectionHead>
                  <TableWrap>
                    <WeeksRow as="div" $cols={categories.length} $now={false} $picked={false} $head aria-hidden="true">
                      <span className="head">Week</span>
                      {categories.map(c => <span key={c.id} className="head">{c.name}</span>)}
                    </WeeksRow>
                    {weeks.map(w => {
                      const now = w.index === nowWeek;
                      const ahead = w.start > today;
                      return (
                        <WeeksRow key={w.index} type="button" $cols={categories.length} $now={now} $picked={w.index === weekIndex && !now}
                          aria-pressed={w.index === weekIndex} aria-label={`Show week ${w.index + 1}`}
                          onClick={() => setPick({ plan: plan.id, phase: phase.id, week: w.index })}>
                          <span>
                            <span className="label" data-now={now}>Week {w.index + 1}{now ? ' · now' : ''}</span>
                            <span className="dates">{range(w.start, addDays(w.start, 6))}</span>
                          </span>
                          {categories.map(c => {
                            const target = weeklyTarget(phase, c.id);
                            const done = Math.round(w.totals[c.id] ?? 0);
                            return (
                              <span key={c.id}>
                                {ahead ? (
                                  <span className="fig ahead">{target ? `~${target} min` : '—'}</span>
                                ) : (
                                  <span className={`fig${target && done >= target ? ' met' : ''}`}>{done} / {target || '—'}</span>
                                )}
                                <Track><Fill $pct={!ahead && target ? done / target * 100 : 0} /></Track>
                              </span>
                            );
                          })}
                        </WeeksRow>
                      );
                    })}
                  </TableWrap>
                </>
              )}
            </>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
