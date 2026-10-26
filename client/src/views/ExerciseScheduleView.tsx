import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { ExerciseToday } from '../components/organisms/TodayLists.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { ExerciseSubTabs } from '../components/molecules/ExerciseSubTabs.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { useRoutineChecklist } from '../hooks/useRoutineChecklist.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { topics as topicsApi } from '../services/api.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr, formatTime12h } from '../utils/dateUtils.js';
import {
  ROUTINE_DEFAULTS, SCHEDULE_TOPIC, activeRoutines, describeDays, scheduleTopicId, sessionMinutes, type Routine,
} from '../utils/routines.js';
import { categoryOf, sessionsFrom, trainingPlans, weekProgress, type WeekProgress } from '../utils/training.js';
import { TopBarAction } from '../components/organisms/TopBarAction.js';

/* Health → Exercise → Schedule: today's schedule on the left, as the dashboards'
   Exercise schedule widget (TodayLists ExerciseToday, in a panel card). On the right, beside an active training plan: "This week" — this
   calendar week against the phase's hours per week, each category with a
   rule and what's left ("Target met" / "+10 min left on today's schedule" /
   "5 min to go · nothing scheduled") — with "Manage schedule (N)" swapping
   in the list. Without a plan, "Your schedule": every scheduled exercise
   (days, times, its category; paused ones greyed). */

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

/* The page's name — hidden on phones and tablets, where the top bar shows it (GlobalStyle) */
const Title = styled.h1.attrs({ className: 'view-title' })`
  margin: 0;
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  @media (max-width: 480px) { font-size: 34px; }
`;

const SubRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  padding: 24px 0 4px;
`;

const Link = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 32px;
  align-items: start;
  margin-top: 32px;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 24px; }
`;

const Card = styled.section`
  min-width: 0;
  padding: 30px 30px 32px;
  background: var(--bg-panel);
  border-radius: 12px;
  @media (max-width: 768px) { padding: 24px 20px 28px; }
`;

const CardHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
`;

const CardTitle = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 300;
  line-height: 1.1;
  color: var(--text-primary);
`;

const Muted = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const ScheduleRow = styled.button<{ $paused: boolean }>`
  display: block;
  width: 100%;
  padding: 18px 0;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  background: none;
  text-align: left;
  font-family: var(--font-sans);
  cursor: pointer;
  &:last-child { border-bottom: none; padding-bottom: 0; }
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .name { font-size: 17px; color: ${({ $paused }) => ($paused ? 'var(--text-muted)' : 'var(--text-secondary)')}; }
  .size { flex: none; font-size: 15px; color: var(--text-muted); }
  .when { margin-top: 6px; font-size: 15px; color: var(--text-muted); }
  .counts { margin-top: 6px; font-size: 15px; color: var(--color-accent-link); }
  &:hover .name { text-decoration: underline; }
`;

const Eyebrow = styled.p`
  margin: 0 0 10px;
  font-family: var(--font-label);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
`;

const WeekMeta = styled.p`
  margin: 10px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const Metric = styled.div`
  margin-top: 28px;
  font-family: var(--font-sans);
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .name { font-size: 16px; color: var(--text-secondary); }
  .fig { flex: none; font-size: 15px; color: var(--text-muted); }
  .note { margin-top: 10px; font-size: 13px; color: var(--text-muted); }
`;

const Track = styled.div`
  height: 5px;
  margin-top: 10px;
  border-radius: 3px;
  background: var(--progress-track, var(--bg-row-hover));
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  border-radius: 3px;
  background: var(--color-accent-fill, var(--color-accent));
  transition: width 0.3s ease-out;
`;

const Footer = styled.div`
  margin-top: 32px;
`;

const shortDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Oct 25 – 31", or "Oct 29 – Nov 4" across months */
function weekRange(start: string, end: string): string {
  const a = new Date(start + 'T12:00:00');
  const b = new Date(end + 'T12:00:00');
  return a.getMonth() === b.getMonth() ? `${shortDay(start)} – ${b.getDate()}` : `${shortDay(start)} – ${shortDay(end)}`;
}

function YourSchedule({ routines, onOpen }: { routines: Routine[]; onOpen: (id: number) => void }) {
  const active = routines.filter(r => r.active).length;
  return (
    <Card aria-label="Your schedule">
      <CardHead>
        <CardTitle>Your schedule</CardTitle>
        <Muted>{active} active</Muted>
      </CardHead>
      {routines.length === 0 ? (
        <EmptyState message="Nothing scheduled yet" submessage="Add exercise to build your schedule." />
      ) : routines.map(r => (
        <ScheduleRow key={r.id} type="button" $paused={!r.active} onClick={() => onOpen(r.id)}>
          <div className="top">
            <span className="name">{r.name}</span>
            <span className="size">
              {[r.items.length ? `${r.items.length} exercise${r.items.length === 1 ? '' : 's'}` : '', r.minutes ? `${r.minutes} min` : ''].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="when">
            {r.active
              ? [describeDays(r.days), r.times.map(formatTime12h).join(', ')].filter(Boolean).join(' · ')
              : 'Paused'}
          </div>
          {r.active && r.trainingCategory && <div className="counts">Counts toward {r.trainingCategory}</div>}
        </ScheduleRow>
      ))}
    </Card>
  );
}

function ThisWeek({ planName, week, leftToday, onOpenPlan }: {
  planName: string;
  week: WeekProgress;
  /** Minutes still to do on today's schedule, by category id */
  leftToday: Record<string, number>;
  onOpenPlan: () => void;
}) {
  return (
    <Card aria-label="This week">
      <Eyebrow>{planName} · {week.phase.name} · Week {week.weekNo}</Eyebrow>
      <CardTitle>This week</CardTitle>
      <WeekMeta>{weekRange(week.start, week.end)} · {week.done} of {week.target} min</WeekMeta>
      {week.rows.map(({ category, done, target }) => {
        const left = leftToday[category.id] ?? 0;
        const note = target === 0
          ? 'No target this phase'
          : done >= target ? 'Target met'
          : left > 0 ? `+${left} min left on today’s schedule`
          : `${target - done} min to go · nothing scheduled`;
        return (
          <Metric key={category.id}>
            <div className="top">
              <span className="name">{category.name}</span>
              <span className="fig">{done} / {target} min</span>
            </div>
            <Track><Fill $pct={target ? Math.min(100, (done / target) * 100) : 0} /></Track>
            <div className="note">{note}</div>
          </Metric>
        );
      })}
      <Footer><Link type="button" onClick={onOpenPlan}>Open training plan</Link></Footer>
    </Card>
  );
}

export function ExerciseScheduleView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const navigate = useNavigate();
  const today = toDateStr(new Date());
  const todayList = useRoutineChecklist(today);
  const [managing, setManaging] = useState(false);

  const routines = useMemo(() => {
    const list = activeRoutines(entries, scheduleTopicId(allTopics), stripHtml, { withPaused: true });
    const first = (r: Routine) => [...r.times].sort()[0] ?? '99';
    return list.sort((a, b) => Number(b.active) - Number(a.active) || first(a).localeCompare(first(b)) || a.name.localeCompare(b.name));
  }, [entries, allTopics]);

  const planWeek = useMemo(() => {
    const planTopic = allTopics.find(t => ['training plan', 'training plans'].includes(t.name.toLowerCase()))?.id;
    const plan = trainingPlans(entries, planTopic, stripHtml).find(p => p.active);
    if (!plan) return null;
    const sessions = sessionsFrom(entries, allTopics.find(t => t.name.toLowerCase() === 'exercise')?.id, stripHtml);
    const week = weekProgress(plan, sessions, today);
    return week ? { plan, week } : null;
  }, [entries, allTopics, today]);

  // What today's schedule still holds, per plan category
  const leftToday = useMemo(() => {
    const out: Record<string, number> = {};
    if (!planWeek) return out;
    for (const s of todayList.slots) {
      if (todayList.isDone(s)) continue;
      const r = s.routine;
      const c = categoryOf({ id: r.id, date: today, minutes: r.minutes, distance: 0, unit: 'mi', exerciseType: r.exerciseType, category: r.trainingCategory, title: r.name, name: r.name }, planWeek.plan.categories);
      if (!c) continue;
      const done = todayList.doneItems(s);
      out[c] = (out[c] ?? 0) + Math.max(0, r.minutes - (done.length ? sessionMinutes(r, done) : 0));
    }
    return out;
  }, [planWeek, todayList, today]);

  const addExercise = async () => {
    const { allTopics: topics, setTopics } = useEntriesStore.getState();
    let id = scheduleTopicId(topics);
    if (id === undefined) {
      const topic = await topicsApi.create({ name: SCHEDULE_TOPIC, icon: 'person-running' });
      setTopics([...topics, topic]);
      id = topic.id;
    }
    newEntry(id, { ...ROUTINE_DEFAULTS, isActive: true });
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

  const showWeek = !!planWeek && !managing;

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Health</Title>
            <TopBarAction><PillButton type="button" onClick={() => void addExercise()}>Add exercise</PillButton></TopBarAction>
          </Head>
          <HealthTabBar />
          <SubRow>
            <ExerciseSubTabs />
            {planWeek && (
              <Link type="button" aria-pressed={managing} onClick={() => setManaging(m => !m)}>
                {managing ? 'Show this week' : `Manage schedule (${routines.length})`}
              </Link>
            )}
          </SubRow>
          <Grid>
            <ExerciseToday panel />
            {showWeek
              ? <ThisWeek planName={planWeek.plan.name} week={planWeek.week} leftToday={leftToday}
                  onOpenPlan={() => navigate('/health/exercise/training')} />
              : <YourSchedule routines={routines} onOpen={openInJournal} />}
          </Grid>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}

