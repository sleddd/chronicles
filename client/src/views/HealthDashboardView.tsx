import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { MedicationSchedule } from '../components/organisms/MedicationSchedule.js';
import { ExerciseQuickLog, TodayFoodList } from '../components/organisms/HealthQuickLog.js';
import { DayAtAGlance, FoodAddForm, useFoodLogActions, type LibraryItem } from '../components/organisms/FoodLog.js';
import { useAiReady } from '../hooks/useAiReady.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { foodRowsFrom } from '../utils/foodLog.js';
import { toDateStr } from '../utils/dateUtils.js';
import { DEFAULT_NUTRIENT_GOALS, type NutrientGoals } from '../types/nutrition.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { stripHtml } from '../utils/stripHtml.js';

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

/* Dashboard section: flat, borderless — a top rule + tracked label row. */
const Section = styled.section`
  margin-top: 32px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 12px;
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
`;

const SectionLabel = styled.h2`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
`;

const SectionLink = styled.button`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  &:hover { opacity: 0.7; }
`;

const AllergyList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const AllergyRow = styled.li`
  border-top: 1px solid var(--border-subtle);
  &:first-child { border-top: none; }
`;

const AllergyBtn = styled.button`
  display: flex;
  align-items: baseline;
  gap: 16px;
  width: 100%;
  padding: 10px 4px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-sans);
  color: var(--text-primary);
  &:hover { background: var(--bg-hover); }
  @media (max-width: 480px) { flex-wrap: wrap; gap: 4px 12px; }
`;

const AllergyName = styled.span<{ $wide: boolean }>`
  flex: ${({ $wide }) => ($wide ? '1 1 auto' : '0 1 220px')};
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
`;

const AllergyReaction = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
`;

const AllergySeverity = styled.span`
  flex-shrink: 0;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const Muted = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
  padding: 0 4px;
`;

/* ── Helpers ── */

function DashSection({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Section aria-label={label}>
      <SectionHead>
        <SectionLabel>{label}</SectionLabel>
        {action}
      </SectionHead>
      {children}
    </Section>
  );
}

function severityText(v: unknown): string {
  if (v == null || v === '') return '';
  return typeof v === 'number' || /^\d+$/.test(String(v)) ? `Severity ${v}/10` : String(v);
}

function severityRank(v: unknown): number {
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  return ({ severe: 9, moderate: 5, mild: 2 } as Record<string, number>)[String(v).toLowerCase()] ?? 0;
}

/* ── Food ── */

const GlanceWrap = styled.div`
  padding: 4px 0 26px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 4px;
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

/** Today's nutrient totals, the shared Log food form, and what's been eaten today. */
function FoodPanel() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const aiReady = useAiReady();
  const actions = useFoodLogActions('Meals');
  const [goals] = useEncryptedSetting<NutrientGoals>('nutritionGoals', DEFAULT_NUTRIENT_GOALS);
  const [library, saveLibrary] = useEncryptedSetting<LibraryItem[]>('foodLibrary', []);
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const say = (msg: string) => {
    setStatus(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 2600);
  };

  const today = toDateStr(new Date());
  const mealsTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'meals')?.id, [allTopics]);
  const todayRows = useMemo(() => foodRowsFrom(entries, mealsTopicId).filter(r => r.day === today), [entries, mealsTopicId, today]);

  return (
    <>
      <GlanceWrap><DayAtAGlance rows={todayRows} goals={goals} /></GlanceWrap>
      <FoodAddForm day={today} actions={actions} aiReady={aiReady} library={library} onLibraryChange={saveLibrary} onStatus={say} submitLabel="Log food" />
      <TodayFoodList />
      <Toast $show={!!status} role="status" aria-live="polite">{status}</Toast>
    </>
  );
}

/* ── Allergies ── */

function AllergiesList() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const openInJournal = useOpenInJournal();

  const allergies = useMemo(() => {
    const topicId = allTopics.find(t => t.name.toLowerCase() === 'allergy')?.id;
    if (!topicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === topicId)
      .map(e => {
        const cf = ((e.metadata as Record<string, unknown>)._customFields as Record<string, unknown>) || {};
        return {
          id: e.id,
          name: String(cf.allergen || '').trim() || stripHtml(e.content).trim() || 'Allergy',
          reaction: String(cf.reaction || '').trim(),
          severity: cf.severity,
        };
      })
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.name.localeCompare(b.name));
  }, [entries, allTopics]);

  if (allergies.length === 0) return <Muted>No allergies recorded.</Muted>;

  return (
    <AllergyList>
      {allergies.map(a => (
        <AllergyRow key={a.id}>
          <AllergyBtn type="button" onClick={() => openInJournal(a.id)}>
            <AllergyName $wide={!a.reaction}>{a.name}</AllergyName>
            {a.reaction && <AllergyReaction>{a.reaction}</AllergyReaction>}
            <AllergySeverity>{severityText(a.severity)}</AllergySeverity>
          </AllergyBtn>
        </AllergyRow>
      ))}
    </AllergyList>
  );
}

/* ── View ── */

/**
 * Health dashboard — the landing tab for Health: quick food and exercise
 * logging for today, today's medication schedule, then the allergy list.
 */
export function HealthDashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const ff = useEntriesStore(s => s.featureFlags);
  const navigate = useNavigate();

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

  const seeAll = (path: string) => <SectionLink type="button" onClick={() => navigate(path)}>See all</SectionLink>;

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Health</Title>
          </Head>
          <HealthTabBar />

          {ff.foodEnabled !== false && (
            <DashSection label="Food" action={seeAll('/health/food')}>
              <FoodPanel />
            </DashSection>
          )}

          {ff.exerciseEnabled !== false && (
            <DashSection label="Exercise" action={seeAll('/health/exercise')}>
              <ExerciseQuickLog />
            </DashSection>
          )}

          {ff.medicationEnabled !== false && (
            <DashSection label="Medication schedule" action={seeAll('/health/meds')}>
              <MedicationSchedule isReady={isReady} />
            </DashSection>
          )}

          {ff.allergiesEnabled !== false && (
            <DashSection label="Allergies" action={seeAll('/health/allergies')}>
              <AllergiesList />
            </DashSection>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
