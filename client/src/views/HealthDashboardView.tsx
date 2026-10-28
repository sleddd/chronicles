import { useMemo } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { QuickLog, QuickSymptom, QuickChange } from '../components/organisms/HealthQuickLog.js';
import { WellnessCheckIn } from '../components/organisms/WellnessCheckIn.js';
import { ExerciseToday, MedicationsToday } from '../components/organisms/TodayLists.js';
import { useTodayDoses } from '../hooks/useTodayDoses.js';
import { activeRoutines, scheduleTopicIds } from '../utils/routines.js';
import { stripHtml } from '../utils/stripHtml.js';
import { DayAtAGlance } from '../components/organisms/FoodLog.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { foodRowsFrom } from '../utils/foodLog.js';
import { MacroDistribution } from '../components/organisms/MacroDistribution.js';
import { toDateStr } from '../utils/dateUtils.js';
import { DEFAULT_NUTRIENT_GOALS, type NutrientGoals } from '../types/nutrition.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { NAV_COMPACT } from '../styles/breakpoints.js';

/* ── Layout (mirrors HealthView) ── */

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
  padding: 53px 0 28px; /* room under the title before the tabs */
`;

/* The page's name — hidden on phones and tablets, where the top bar shows it (GlobalStyle) */
const Title = styled.h1.attrs({ className: 'view-title' })`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

/* One column of panels under the "Today" strip */
const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 24px;
  @media (max-width: 768px) { gap: 16px; margin-top: 24px; }
`;

/* Desktop: Quick log | Medications side by side; one column on tablets and phones */
const Pair = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  align-items: start;
  ${NAV_COMPACT} { grid-template-columns: minmax(0, 1fr); gap: 16px; }
`;

/* Macro distribution on the left, Wellness check-in on the right — side by side
   on tablets too, stacked only on phones */
const TopPair = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  align-items: start;
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr); gap: 16px; }
`;

/* A column of the pair: Quick log over Log a symptom, Medications over As needed */
const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  ${NAV_COMPACT} { gap: 16px; }
`;

/* "Today" + the date, then the nutrient strip */
const TodayHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin: 36px 0 24px;
`;

const TodayTitle = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 300;
  line-height: 1.1;
  color: var(--text-secondary);
  @media (max-width: 480px) { font-size: 22px; }
`;

const TodayDate = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/** Today's nutrient totals against the daily goals. */
function FoodGlance() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const [goals] = useEncryptedSetting<NutrientGoals>('nutritionGoals', DEFAULT_NUTRIENT_GOALS);

  const today = toDateStr(new Date());
  const mealsTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'meals')?.id, [allTopics]);
  const todayRows = useMemo(() => foodRowsFrom(entries, mealsTopicId).filter(r => r.day === today), [entries, mealsTopicId, today]);

  return <DayAtAGlance rows={todayRows} goals={goals} />;
}

/** Today's protein / carbs / fat split */
function TodayMacros() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const today = toDateStr(new Date());
  const mealsTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'meals')?.id, [allTopics]);
  const rows = useMemo(() => foodRowsFrom(entries, mealsTopicId).filter(r => r.day === today), [entries, mealsTopicId, today]);
  return <MacroDistribution rows={rows} />;
}

/** True when an active medication has at least one scheduled dose time. */
function useHasScheduledMeds(): boolean {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  return useMemo(() => {
    const medId = allTopics.find(t => t.name.toLowerCase() === 'medication')?.id;
    if (!medId) return false;
    return entries.some(e => {
      const meta = e.metadata as Record<string, unknown> | undefined;
      if (!meta || meta._taxonomyId !== medId) return false;
      const cf = (meta._customFields as Record<string, unknown>) || {};
      return cf.isActive !== false && Array.isArray(cf.scheduleTimes) && cf.scheduleTimes.length > 0;
    });
  }, [entries, allTopics]);
}

/** True when an active exercise routine has at least one time. */
function useHasRoutines(): boolean {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  return useMemo(() => {
    return activeRoutines(entries, scheduleTopicIds(allTopics), stripHtml).some(r => r.times.length > 0);
  }, [entries, allTopics]);
}

/* ── View ── */

/**
 * Health dashboard — the landing tab for Health: today's nutrient strip, then
 * one column of panels: the wellness check-in, a quick meal / exercise log,
 * the day's medications and a quick symptom log.
 */
export function HealthDashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const ff = useEntriesStore(s => s.featureFlags);
  const hasMeds = useHasScheduledMeds();
  const hasRoutines = useHasRoutines();
  const medsOn = ff.medicationEnabled !== false;
  const doses = useTodayDoses(isReady && medsOn);

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

  const food = ff.foodEnabled !== false;
  const exercise = ff.exerciseEnabled !== false;
  const routines = exercise && hasRoutines;

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Health</Title>
          </Head>
          <HealthTabBar />

          <TodayHead>
            <TodayTitle>Today</TodayTitle>
            <TodayDate>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</TodayDate>
          </TodayHead>
          {food && <FoodGlance />}

          <Stack>
            {food ? (
              <TopPair>
                <Column><TodayMacros /></Column>
                <Column><WellnessCheckIn title="Wellness check-in" quad bare /></Column>
              </TopPair>
            ) : <WellnessCheckIn title="Wellness check-in" quad bare />}
            {hasMeds && medsOn && (food || exercise) ? (
              <Pair>
                <Column>
                  <QuickLog meal={food} exercise={exercise} />
                  <QuickChange />
                  <QuickSymptom />
                </Column>
                <Column>
                  <MedicationsToday doses={doses} panel />
                  {routines && <ExerciseToday panel />}
                </Column>
              </Pair>
            ) : (
              <>
                <QuickLog meal={food} exercise={exercise} />
                <QuickChange />
                <QuickSymptom />
                {medsOn && <MedicationsToday doses={doses} hideWhenEmpty panel />}
                {routines && <ExerciseToday panel />}
              </>
            )}
          </Stack>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
