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
import { StatTile, StatTileRow } from '../components/molecules/StatTile.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { topics as topicsApi } from '../services/api.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { tableColumnRules } from '../styles/columnRules.js';
import {
  addDays, categoryOf, daysBetween, formatMinutes, minutesByCategory, mountaineeringTemplate,
  phaseIndexOn, phaseWeeks, sessionsFrom, targetHours, trainingPlans, type PlanPhase, type Session, type TrainingPlan,
} from '../utils/training.js';
import type { TrainingCategory } from '../types/fields.js';

/* Health → Exercise → Training: the active training plan. The plan's name
   with Edit plan; where you are ("Phase 2 of 4 · Week 3 of 6 · 41 days to
   go"); the phases as sub tabs; a stat tile per category — hours done toward
   the phase's hours; then the phase week by week like the spreadsheet it
   replaces — days down, categories across, each logged session in its cell
   (opens it), an empty cell's + logs one there. Reads Exercise entries
   (utils/training). */

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
  margin-top: 40px;
`;

const PlanName = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 200;
  line-height: 1.1;
  color: var(--text-primary);
`;

const Where = styled.p`
  margin: 8px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const PhaseTabs = styled.div`
  margin-top: 28px;
`;

const PhaseCaption = styled.p`
  margin: 14px 0 20px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const SectionTitle = styled.h3`
  margin: 48px 0 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 200;
  color: var(--text-primary);
`;

const WeekHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
  margin: 28px 0 10px;
  font-family: var(--font-sans);
  .name { font-size: 15px; font-weight: 600; color: var(--text-secondary); }
  .dates { font-size: 14px; color: var(--text-muted); }
`;

const SheetWrap = styled.div`
  overflow-x: auto;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  background: var(--bg-panel);
`;

const Sheet = styled.table`
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  table-layout: fixed;
  font-family: var(--font-sans);
  font-size: 14px;
  th, td { padding: 10px 12px; text-align: left; vertical-align: top; }
  th {
    font-weight: 400;
    font-size: 13px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-card);
  }
  tbody td { border-top: 1px solid var(--border-subtle); }
  tbody tr:first-child td { border-top: none; }
  ${tableColumnRules}
  th:first-child, td:first-child { width: 96px; }
  .day { color: var(--text-muted); white-space: nowrap; }
  tr[data-today='true'] .day { color: var(--color-accent-soft); font-weight: 600; }
  tfoot td { border-top: 1px solid var(--border-card); color: var(--text-secondary); font-weight: 500; }
  tfoot .of { display: block; font-size: 12px; font-weight: 400; color: var(--text-muted); }
`;

const SessionBtn = styled.button`
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  & + & { margin-top: 4px; }
  .dist { color: var(--text-muted); }
  &:hover { text-decoration: underline; }
`;

const AddCell = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-faint, var(--text-muted));
  cursor: pointer;
  opacity: 0;
  td:hover &, &:focus-visible { opacity: 1; }
  @media (hover: none) { opacity: 1; }
  &:hover { color: var(--color-accent-link); }
`;

const Note = styled.p`
  margin: 16px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
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
const hours = (min: number) => {
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
};

async function planTopicId(): Promise<number> {
  const { allTopics, setTopics } = useEntriesStore.getState();
  let topic = allTopics.find(t => ['training plan', 'training plans'].includes(t.name.toLowerCase()));
  if (!topic) {
    topic = await topicsApi.create({ name: 'Training Plan', icon: 'mountain' });
    setTopics([...allTopics, topic]);
  }
  return topic.id;
}

async function exerciseTopicId(): Promise<number> {
  const { allTopics, setTopics } = useEntriesStore.getState();
  let topic = allTopics.find(t => t.name.toLowerCase() === 'exercise');
  if (!topic) {
    topic = await topicsApi.create({ name: 'Exercise', icon: 'dumbbell' });
    setTopics([...allTopics, topic]);
  }
  return topic.id;
}

/** "Phase 2 of 4 · Week 3 of 6 · 41 days to go" */
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
  if (plan.eventDate) {
    const left = daysBetween(today, plan.eventDate);
    parts.push(left > 0 ? `${left} day${left === 1 ? '' : 's'} to go` : left === 0 ? 'Event day' : `Event was ${shortDate(plan.eventDate, true)}`);
  }
  return parts.join(' · ');
}

function PhaseSheet({ phase, sessions, categories, today, onOpen, onAdd }: {
  phase: PlanPhase;
  sessions: Session[];
  categories: TrainingCategory[];
  today: string;
  onOpen: (id: number) => void;
  onAdd: (date: string, c: TrainingCategory) => void;
}) {
  const weeks = useMemo(() => phaseWeeks(phase, sessions, categories), [phase, sessions, categories]);
  return (
    <>
      {weeks.map(w => {
        const total = Object.values(w.totals).reduce((a, b) => a + b, 0);
        return (
          <section key={w.index} aria-label={`Week ${w.index + 1}`}>
            <WeekHead>
              <span className="name">Week {w.index + 1}</span>
              <span className="dates">{shortDate(w.start)} – {shortDate(addDays(w.start, 6))} · {formatMinutes(total)}</span>
            </WeekHead>
            <SheetWrap>
              <Sheet>
                <thead>
                  <tr>
                    <th>Day</th>
                    {categories.map(c => <th key={c.id}>{c.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {w.days.map(d => (
                    <tr key={d.date} data-today={d.date === today}>
                      <td className="day">{dayLabel(d.date)}</td>
                      {categories.map(c => {
                        const list = d.cells[c.id] ?? [];
                        return (
                          <td key={c.id}>
                            {list.map(s => (
                              <SessionBtn key={s.id} type="button" title={s.title} onClick={() => onOpen(s.id)}>
                                {s.minutes ? formatMinutes(s.minutes) : s.title || 'Logged'}
                                {s.distance > 0 && <span className="dist"> · {s.distance} {s.unit}</span>}
                              </SessionBtn>
                            ))}
                            {list.length === 0 && (
                              <AddCell type="button" aria-label={`Log ${c.name} on ${dayLabel(d.date)}`} onClick={() => onAdd(d.date, c)}>
                                <Icon name="plus" size={14} strokeWidth={2} />
                              </AddCell>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Week</td>
                    {categories.map(c => {
                      const target = targetHours(phase, c.id) * 60 / phase.weekCount;
                      return (
                        <td key={c.id}>
                          {formatMinutes(w.totals[c.id] ?? 0)}
                          {target > 0 && <span className="of">of ~{formatMinutes(target)}</span>}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </Sheet>
            </SheetWrap>
          </section>
        );
      })}
    </>
  );
}

export function TrainingView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const today = toDateStr(new Date());

  const plans = useMemo(() => {
    const id = allTopics.find(t => ['training plan', 'training plans'].includes(t.name.toLowerCase()))?.id;
    return trainingPlans(entries, id, stripHtml);
  }, [entries, allTopics]);
  const sessions = useMemo(() => {
    const id = allTopics.find(t => t.name.toLowerCase() === 'exercise')?.id;
    return sessionsFrom(entries, id, stripHtml);
  }, [entries, allTopics]);

  const [planId, setPlanId] = useState<number | null>(null);
  const plan = plans.find(p => p.id === planId) ?? plans[0];
  const current = plan ? phaseIndexOn(plan, today) : -1;
  const [phasePick, setPhasePick] = useState<{ plan: number; id: string } | null>(null);
  const phase = plan
    ? plan.phases.find(p => phasePick?.plan === plan.id && p.id === phasePick.id)
      ?? plan.phases[Math.min(Math.max(current, 0), plan.phases.length - 1)]
    : undefined;

  const done = useMemo(
    () => (plan && phase ? minutesByCategory(sessions, plan.categories, phase.start, phase.end) : {}),
    [plan, phase, sessions],
  );
  const uncounted = useMemo(() => (plan && phase
    ? sessions.filter(s => s.date >= phase.start && s.date < phase.end && !categoryOf(s, plan.categories)).length
    : 0), [plan, phase, sessions]);

  const startPlan = async () => {
    newEntry(await planTopicId(), { ...mountaineeringTemplate(), startDate: today, eventDate: '', isActive: true, notes: '' });
  };
  const logIn = async (date: string, c: TrainingCategory) => {
    newEntry(await exerciseTopicId(), {
      performedDate: date, trainingCategory: c.name, exerciseType: c.exerciseTypes?.[0] ?? 'other',
    });
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

  const plannedMin = plan && phase ? plan.categories.reduce((t, c) => t + targetHours(phase, c.id) * 60, 0) : 0;
  const doneMin = Object.values(done).reduce((a, b) => a + b, 0);

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
                <PhaseTabs>
                  <FilterTabs options={plans.map(p => ({ value: String(p.id), label: p.name }))}
                    active={String(plan.id)} onChange={v => setPlanId(Number(v))} flush bordered={false} />
                </PhaseTabs>
              )}

              <PlanHead>
                <div>
                  <PlanName>{plan.name}</PlanName>
                  <Where>{whereYouAre(plan, today)}</Where>
                </div>
                <PillButton type="button" $variant="neutral" onClick={() => openInJournal(plan.id)}>Edit plan</PillButton>
              </PlanHead>

              {plan.phases.length === 0 || plan.categories.length === 0 ? (
                <Note>Add categories and phases to this plan with Edit plan.</Note>
              ) : phase && (
                <>
                  <PhaseTabs>
                    <FilterTabs options={plan.phases.map(p => ({ value: p.id, label: p.name }))}
                      active={phase.id} onChange={id => setPhasePick({ plan: plan.id, id })} flush bordered={false} />
                  </PhaseTabs>
                  <PhaseCaption>
                    {shortDate(phase.start)} – {shortDate(addDays(phase.end, -1), true)} · {phase.weekCount} weeks
                    {plannedMin > 0 && ` · ${formatMinutes(doneMin)} of ${formatMinutes(plannedMin)}`}
                  </PhaseCaption>

                  <StatTileRow $cols={3}>
                    <StatTile name="All training" value={hours(doneMin)} unit={plannedMin ? `/ ${hours(plannedMin)} h` : 'h'}
                      caption={plannedMin ? `${Math.round(doneMin / plannedMin * 100)}%` : undefined}
                      progress={plannedMin ? doneMin / plannedMin : undefined} />
                    {plan.categories.map(c => {
                      const target = targetHours(phase, c.id) * 60;
                      const mins = done[c.id] ?? 0;
                      return (
                        <StatTile key={c.id} name={c.name} value={hours(mins)} unit={target ? `/ ${hours(target)} h` : 'h'}
                          caption={target ? `${Math.round(mins / target * 100)}%` : 'no target'}
                          progress={target ? mins / target : undefined} />
                      );
                    })}
                  </StatTileRow>
                  {uncounted > 0 && (
                    <Note>
                      {uncounted} session{uncounted === 1 ? '' : 's'} in this phase {uncounted === 1 ? 'isn’t' : 'aren’t'} in a category.
                      Pick a training category on {uncounted === 1 ? 'it' : 'them'}, or tick {uncounted === 1 ? 'its' : 'their'} activity under a category in Edit plan.
                    </Note>
                  )}

                  <SectionTitle>Week by week</SectionTitle>
                  <PhaseSheet phase={phase} sessions={sessions} categories={plan.categories} today={today}
                    onOpen={openInJournal} onAdd={(d, c) => void logIn(d, c)} />
                </>
              )}
            </>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
