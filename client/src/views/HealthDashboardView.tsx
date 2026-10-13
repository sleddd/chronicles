import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { ExerciseQuickLog } from '../components/organisms/HealthQuickLog.js';
import { WellnessCheckIn } from '../components/organisms/WellnessCheckIn.js';
import { MedicationSchedule } from '../components/organisms/MedicationSchedule.js';
import { CollapsibleCard } from '../components/organisms/CollapsibleCard.js';
import { DayAtAGlance, FoodAddForm, useFoodLogActions } from '../components/organisms/FoodLog.js';
import { useAiReady } from '../hooks/useAiReady.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { foodRowsFrom } from '../utils/foodLog.js';
import { toDateStr } from '../utils/dateUtils.js';
import { DEFAULT_NUTRIENT_GOALS, type NutrientGoals } from '../types/nutrition.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { NAV_COMPACT } from '../styles/breakpoints.js';
import { useInitializeData } from '../hooks/useInitializeData.js';

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
  padding: 53px 0 16px;
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

/* Meal and exercise cards side by side on desktop; stacked on tablet and phone. */
const LogGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  align-items: start;
  margin-top: 24px;
  ${NAV_COMPACT} { grid-template-columns: minmax(0, 1fr); }
`;

const WellnessWrap = styled.div`
  margin-top: 24px;
`;

const MedsWrap = styled.div`
  margin-top: 24px;
`;

/* ── Helpers ── */


const CARDS_KEY = 'health-dashboard-collapsed-v2';

function LogPanel(props: { id: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  return <CollapsibleCard storageKey={CARDS_KEY} {...props} />;
}

/* ── Food ── */

const GlanceWrap = styled.div`
  margin-top: 32px;
`;

const Toast = styled.div<{ $show: boolean }>`
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 50;
  max-width: 90vw;
  padding: 10px 18px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-inverse, #fff);
  background: var(--bg-inverse, #1b1d26);
  border-radius: var(--r-md, 2px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.25));
  opacity: ${({ $show }) => ($show ? 1 : 0)};
  pointer-events: none;
  transition: opacity 200ms ease-out;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

/** Today's nutrient totals against the daily goals. */
function FoodGlance() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const [goals] = useEncryptedSetting<NutrientGoals>('nutritionGoals', DEFAULT_NUTRIENT_GOALS);

  const today = toDateStr(new Date());
  const mealsTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'meals')?.id, [allTopics]);
  const todayRows = useMemo(() => foodRowsFrom(entries, mealsTopicId).filter(r => r.day === today), [entries, mealsTopicId, today]);

  return <GlanceWrap><DayAtAGlance rows={todayRows} goals={goals} /></GlanceWrap>;
}

/** The shared Log food form for today, with a status toast. */
function MealLog() {
  const aiReady = useAiReady();
  const actions = useFoodLogActions('Meals');
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const say = (msg: string) => {
    setStatus(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 2600);
  };

  return (
    <>
      <FoodAddForm day={toDateStr(new Date())} actions={actions} aiReady={aiReady} onStatus={say} />
      <Toast $show={!!status} role="status" aria-live="polite">{status}</Toast>
    </>
  );
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

/* ── View ── */

/**
 * Health dashboard — the landing tab for Health: quick food and exercise
 * logging for today, today's medication schedule, then the allergy list.
 */
export function HealthDashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const ff = useEntriesStore(s => s.featureFlags);
  const hasMeds = useHasScheduledMeds();

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

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Health</Title>
          </Head>
          <HealthTabBar />

          {food && <FoodGlance />}

          <WellnessWrap>
            <LogPanel id="wellness" title="Wellness Check-in"><WellnessCheckIn /></LogPanel>
          </WellnessWrap>

          <LogGrid>
            {food && <LogPanel id="meal" title="Log a Meal" defaultOpen={false}><MealLog /></LogPanel>}
            {exercise && <LogPanel id="exercise" title="Log Exercise" defaultOpen={false}><ExerciseQuickLog /></LogPanel>}
          </LogGrid>

          {hasMeds && ff.medicationEnabled !== false && (
            <MedsWrap>
              <LogPanel id="meds" title="Medication Schedule"><MedicationSchedule isReady={isReady} /></LogPanel>
            </MedsWrap>
          )}

        </Inner>
      </Page>
    </ContentTemplate>
  );
}
