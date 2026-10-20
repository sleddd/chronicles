import { useState, useMemo, useCallback, useEffect } from 'react';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import styled from 'styled-components';
import { DateInput } from '../components/atoms/DateInput.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { HealthReport } from '../components/organisms/HealthReport.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { doses as dosesApi } from '../services/api.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { setTriggerReview, type TriggerReviews, type TriggerVerdict, type SymptomTrigger } from '../utils/foodSymptoms.js';
import { splitSymptoms } from '../utils/symptomChips.js';
import { stripHtml } from '../utils/stripHtml.js';
import type { PeriodType } from '../types/health.js';
import type {
  DecryptedSymptom,
  DecryptedFood,
  DecryptedMedicationLog,
  DecryptedExercise,
  DecryptedWellness,
} from '../utils/correlationAnalysis.js';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';

/* ── Period filter ── */

/* `short` is what phones show so the switch stays beside the title */
const PERIOD_OPTIONS = [
  { value: 'today' as const, label: 'Today', short: 'Day' },
  { value: 'week' as const, label: 'Week', short: 'Wk' },
  { value: 'month' as const, label: 'Month', short: 'Mo' },
  { value: 'year' as const, label: 'Year', short: 'Yr' },
  { value: 'custom' as const, label: 'Custom', short: null },
];

const DateRangeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 0 0;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  @media (max-width: 480px) { padding: 10px 0; gap: 8px; }
`;

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

/* Title on the left, the period switch across from it */
const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  padding: 53px 0 28px; /* room under the title before the tabs */
  @media (max-width: 600px) { flex-wrap: nowrap; gap: 12px; }
`;

/* Today / Week / Month / Year / Custom — one outlined group; the chosen one is
   lifted onto --bg-tab-active in the standard text colour */
const Periods = styled.div`
  display: flex;
  gap: 2px;
  max-width: 100%;
  overflow-x: auto;
  padding: 4px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  @media (max-width: 600px) { flex: none; padding: 3px; border-radius: 10px; }
`;

const PeriodBtn = styled.button<{ $active: boolean }>`
  flex: none;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--bg-tab-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-secondary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
  /* Phones: short labels (Day, Wk, Mo, Yr) and a calendar icon for Custom */
  .short { display: none; }
  @media (max-width: 600px) {
    height: 32px;
    padding: 0 8px;
    font-size: 14px;
    .full { display: none; }
    .short { display: inline-flex; vertical-align: middle; }
  }
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

const TabsRow = styled.div`
  margin: 0;
`;

/* ── Helpers ── */

function getDateRange(period: PeriodType): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (period === 'today') { /* same day */ }
  else if (period === 'week') start.setDate(end.getDate() - 7);
  else if (period === 'month') start.setMonth(end.getMonth() - 1);
  else if (period === 'year') start.setFullYear(end.getFullYear() - 1);
  return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
}

/* ── View ── */

/** Today as YYYY-MM-DD (local) */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-10-01", -2 → "2026-09-29" */
function shiftDay(day: string, by: number): string {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + by);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function HealthReportingView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;

  const [period, setPeriod] = useState<PeriodType>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [medLogs, setMedLogs] = useState<DecryptedMedicationLog[]>([]);
  // Possible triggers the owner has confirmed or marked not a trigger
  const [triggerReviews, saveTriggerReviews, reviewsLoaded] = useEncryptedSetting<TriggerReviews>('symptomTriggerReviews', {});
  const reviewTrigger = useCallback((t: Pick<SymptomTrigger, 'kind' | 'trigger' | 'symptom'>, verdict: TriggerVerdict | null) => {
    void saveTriggerReviews(setTriggerReview(triggerReviews, t, verdict, localToday()));
  }, [saveTriggerReviews, triggerReviews]);

  // Resolve topic IDs
  const topicIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of allTopics) map[t.name.toLowerCase()] = t.id;
    return map;
  }, [allTopics]);

  const { startDate, endDate } = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) return { startDate: customFrom, endDate: customTo };
    if (period === 'custom') return getDateRange('month'); // fallback until both dates set
    return getDateRange(period);
  }, [period, customFrom, customTo]);

  // Filter entries by topic and date range
  // padDays reaches back before the range — meals eaten just before it can still
  // come before a symptom inside it
  const filterByTopic = useCallback((topicName: string, padDays = 0) => {
    const tid = topicIdMap[topicName.toLowerCase()];
    if (!tid) return [];
    const from = padDays ? shiftDay(startDate, -padDays) : startDate;
    return entries.filter(e => {
      const meta = e.metadata as Record<string, unknown> | undefined;
      if (!meta || meta._taxonomyId !== tid) return false;
      const d = (e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)).toISOString().split('T')[0];
      return d >= from && d <= endDate;
    });
  }, [entries, topicIdMap, startDate, endDate]);

  // Build typed arrays from decrypted entries
  const symptoms: DecryptedSymptom[] = useMemo(() =>
    filterByTopic('symptom').flatMap(e => {
      const cf = ((e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) || {};
      const dateStr = (cf.occurredDate as string) || '';
      const timeStr = (cf.occurredTime as string) || '12:00';
      const occurredAt = dateStr ? `${dateStr}T${timeStr}:00` : (e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)).toISOString();
      const severity = (cf.severity as number) || 5;
      // One entry can list several symptoms from the chips ("Flare day, Runny nose")
      const label = ((cf.symptomName as string) || stripHtml(e.content)).slice(0, 120);
      const names = splitSymptoms(label);
      return (names.length ? names : [label]).map(name => ({ id: e.id, name, severity, occurredAt }));
    }), [filterByTopic]);

  // Meals from two days before the range too, for the food ↔ symptom patterns
  const patternFoods: DecryptedFood[] = useMemo(() =>
    filterByTopic('meals', 2).flatMap(e => {
      const meta = e.metadata as Record<string, unknown>;
      const cf = (meta?._customFields as Record<string, unknown>) || {};
      // A row synced from a ticked dose is already counted as that dose
      if (meta?._doseLink) return [];
      const dateStr = (cf.consumedDate as string) || '';
      const timeStr = (cf.consumedTime as string) || '12:00';
      const consumedAt = dateStr ? `${dateStr}T${timeStr}:00` : (e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)).toISOString();
      const rawIngredients = (cf.ingredients as string) || '';
      const ingredients = rawIngredients ? rawIngredients.split(',').map(s => s.trim()).filter(Boolean) : [];
      const rawCal = cf.calories;
      const calories = typeof rawCal === 'number' ? rawCal : (typeof rawCal === 'string' ? parseInt(rawCal, 10) || undefined : undefined);
      const name = ((cf.mealDescription as string) || stripHtml(e.content)).slice(0, 120);
      return [{ id: e.id, name, consumedAt, ingredients, calories, mealType: (cf.mealType as string) || undefined }];
    }), [filterByTopic]);
  const foods = useMemo(() => patternFoods.filter(f => f.consumedAt.slice(0, 10) >= startDate), [patternFoods, startDate]);

  const exercises: DecryptedExercise[] = useMemo(() =>
    filterByTopic('exercise').map(e => {
      const cf = ((e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) || {};
      const dateStr = (cf.performedDate as string) || '';
      const timeStr = (cf.performedTime as string) || '12:00';
      const performedAt = dateStr ? `${dateStr}T${timeStr}:00` : (e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)).toISOString();
      const dur = cf.duration;
      return {
        id: e.id, name: stripHtml(e.content).slice(0, 120),
        exerciseType: (cf.exerciseType as string) || 'other',
        duration: typeof dur === 'number' ? dur : (typeof dur === 'string' ? parseInt(dur, 10) || 0 : 0),
        intensity: (cf.intensity as string) || 'medium', performedAt,
      };
    }), [filterByTopic]);

  const wellness: DecryptedWellness[] = useMemo(() =>
    entries
      .filter(e => {
        const meta = e.metadata as Record<string, unknown>;
        if (meta._widgetType !== 'wellness-checkin') return false;
        const cf = meta._customFields as Record<string, unknown> | undefined;
        const date = cf?.date as string | undefined;
        if (!date) return false;
        return date >= startDate && date <= endDate;
      })
      .map(e => {
        const cf = ((e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) ?? {};
        return {
          id: e.id,
          date: (cf.date as string) || (e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)).toISOString().split('T')[0],
          waterGlasses: (cf.waterGlasses as number) || 0,
          waterGoal: (cf.waterGoal as number) || 8,
          moodScore: (cf.moodScore as number) || 0,
          sleepHours: (cf.sleepHours as number) || 0,
          sleepQuality: (cf.sleepQuality as number) || 0,
          periodToday: !!(cf.periodToday),
          flowIntensity: (cf.flowIntensity as string) || '',
        };
      }),
    [entries, startDate, endDate]);

  // Fetch medication dose logs for the date range
  useEffect(() => {
    if (!isReady) return;
    const medTopicId = topicIdMap['medication'];
    if (!medTopicId) { setMedLogs([]); return; }

    // Build medication name map from entries
    const medEntries = entries.filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === medTopicId);
    const nameMap = new Map<number, string>();
    for (const e of medEntries) {
      const cf = ((e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) || {};
      nameMap.set(e.id, ((cf.medicationName as string) || stripHtml(e.content)).trim().slice(0, 120) || 'Unknown');
    }

    // One request for every dose record, filtered to the range here (each is decrypted in the browser)
    const fetchLogs = async () => {
      try {
        const { logs: all } = await dosesApi.getAll();
        setMedLogs(all
          .filter(log => log.date >= startDate && log.date <= endDate && log.status === 'taken' && log.takenAt)
          .map(log => ({
            id: log.id,
            medicationPostId: log.medicationPostId,
            medicationName: nameMap.get(log.medicationPostId) || 'Unknown',
            takenAt: `${log.date}T${log.scheduledTime.substring(0, 5)}:00`,
          })));
      } catch { setMedLogs([]); }
    };

    fetchLogs();
  }, [isReady, startDate, endDate, entries, topicIdMap]);


  if (needsUnlock) return (<><ContentTemplate><EmptyState message="Unlock your journal to view reports" /></ContentTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  if (isLoading || !isReady) return (<ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>);

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Health</Title>
            <Periods role="tablist" aria-label="Report period">
              {PERIOD_OPTIONS.map(o => (
                <PeriodBtn key={o.value} type="button" role="tab" aria-selected={period === o.value}
                  aria-label={o.label} title={o.label}
                  $active={period === o.value} onClick={() => setPeriod(o.value)}>
                  <span className="full">{o.label}</span>
                  <span className="short" aria-hidden="true">
                    {o.short ?? <MaterialIcon $size={18}>calendar_month</MaterialIcon>}
                  </span>
                </PeriodBtn>
              ))}
            </Periods>
          </Head>
          <TabsRow><HealthTabBar /></TabsRow>
          {period === 'custom' && (
            <DateRangeRow>
              <span>From</span>
              <DateInput value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span>To</span>
              <DateInput value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </DateRangeRow>
          )}

          <HealthReport
            symptoms={symptoms}
            foods={foods}
            patternFoods={patternFoods}
            triggerReviews={triggerReviews}
            onReviewTrigger={reviewsLoaded ? reviewTrigger : undefined}
            medLogs={medLogs}
            exercises={exercises}
            wellness={wellness}
            period={period}
            accentColor={accentColor}
          />
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
