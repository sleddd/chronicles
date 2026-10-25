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
import { useInitializeData } from '../hooks/useInitializeData.js';
import { doses as dosesApi } from '../services/api.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { setTriggerReview, triggerEvents, type TriggerReviews, type TriggerVerdict, type SymptomTrigger } from '../utils/foodSymptoms.js';
import { addDays, shortDay, symptomDays, type ReportScope } from '../utils/healthReport.js';
import { splitSymptoms } from '../utils/symptomChips.js';
import { stripHtml } from '../utils/stripHtml.js';
import { foodRowsFrom } from '../utils/foodLog.js';
import { sessionsFrom } from '../utils/training.js';
import { inventoryDays } from '../utils/dailyInventory.js';
import type { DecryptedFood, DecryptedMedicationLog, DecryptedExercise } from '../utils/correlationAnalysis.js';

/* ── Period filter ── */

type ReportPeriod = 'today' | 'week' | '30' | 'year' | 'custom';

/* `short` is what phones show so the switch stays beside the title */
const PERIOD_OPTIONS = [
  { value: 'today' as const, label: 'Today', short: 'Day' },
  { value: 'week' as const, label: 'Week', short: 'Wk' },
  { value: '30' as const, label: '30 days', short: '30d' },
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

/** Today as YYYY-MM-DD (local) */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const createdDay = (e: { createdAt: Date | string }) => toDay(e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt));
const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fields = (e: { metadata?: unknown }) => (((e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {});

/* ── View ── */

export function HealthReportingView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);

  const [period, setPeriod] = useState<ReportPeriod>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [medLogs, setMedLogs] = useState<DecryptedMedicationLog[]>([]);
  // Possible triggers the owner has confirmed or marked not a trigger
  const [triggerReviews, saveTriggerReviews, reviewsLoaded] = useEncryptedSetting<TriggerReviews>('symptomTriggerReviews', {});
  const reviewTrigger = useCallback((t: Pick<SymptomTrigger, 'kind' | 'trigger' | 'symptom'>, verdict: TriggerVerdict | null) => {
    void saveTriggerReviews(setTriggerReview(triggerReviews, t, verdict, localToday()));
  }, [saveTriggerReviews, triggerReviews]);

  const topicIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of allTopics) map[t.name.toLowerCase()] = t.id;
    return map;
  }, [allTopics]);

  const today = localToday();
  const range = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) {
      return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom };
    }
    if (period === 'today') return { from: today, to: today };
    if (period === 'week') return { from: addDays(today, -6), to: today };
    if (period === 'year') return { from: addDays(today, -364), to: today };
    return { from: addDays(today, -29), to: today }; // 30 days, and Custom until both dates are set
  }, [period, customFrom, customTo, today]);

  /* What's read: the range, the last 30 days (the Today / 7 days columns and
     Symptoms at a glance, which always shows 30 days) and two
     days past the range's end (a symptom can follow a trigger by up to two days) */
  const data = useMemo(() => ({
    from: range.from < addDays(today, -29) ? range.from : addDays(today, -29),
    to: addDays(range.to, 2) > today ? addDays(range.to, 2) : today,
  }), [range, today]);
  const inData = useCallback((day: string) => day >= data.from && day <= data.to, [data]);
  const inTopic = useCallback((e: { metadata?: unknown }, name: string) =>
    (e.metadata as Record<string, unknown> | undefined)?._taxonomyId === topicIdMap[name], [topicIdMap]);

  // Symptoms (one entry can list several from the chips: "Flare day, Runny nose")
  const symptomList = useMemo(() => entries.filter(e => inTopic(e, 'symptom')).flatMap(e => {
    const cf = fields(e);
    const day = (cf.occurredDate as string) || createdDay(e);
    const label = ((cf.symptomName as string) || stripHtml(e.content)).slice(0, 120);
    const names = splitSymptoms(label);
    const occurredAt = `${day}T${(cf.occurredTime as string) || '12:00'}:00`;
    return (names.length ? names : [label]).map(name => ({ id: e.id, name, severity: Number(cf.severity) || 5, occurredAt }));
  }), [entries, inTopic]);

  // Meals (a row synced from a ticked dose is already counted as that dose)
  const foods: DecryptedFood[] = useMemo(() => entries.filter(e => inTopic(e, 'meals')).flatMap(e => {
    const meta = e.metadata as Record<string, unknown>;
    if (meta?._doseLink) return [];
    const cf = fields(e);
    const day = (cf.consumedDate as string) || createdDay(e);
    if (!inData(day)) return [];
    const raw = (cf.ingredients as string) || '';
    return [{
      id: e.id,
      name: ((cf.mealDescription as string) || stripHtml(e.content)).slice(0, 120),
      consumedAt: `${day}T${(cf.consumedTime as string) || '12:00'}:00`,
      ingredients: raw ? raw.split(',').map(x => x.trim()).filter(Boolean) : [],
      mealType: (cf.mealType as string) || undefined,
    }];
  }), [entries, inTopic, inData]);

  const exercises: DecryptedExercise[] = useMemo(() => entries.filter(e => inTopic(e, 'exercise')).flatMap(e => {
    const cf = fields(e);
    const day = (cf.performedDate as string) || createdDay(e);
    if (!inData(day)) return [];
    return [{
      id: e.id, name: stripHtml(e.content).slice(0, 120),
      exerciseType: (cf.exerciseType as string) || 'other',
      duration: Number(cf.duration) || 0,
      intensity: (cf.intensity as string) || 'medium',
      performedAt: `${day}T${(cf.performedTime as string) || '12:00'}:00`,
    }];
  }), [entries, inTopic, inData]);

  // The daily inventory: the check-in, Meals and Exercise, scored per day
  const { inventory, startedOn } = useMemo(() => {
    const wellnessDays = entries.flatMap(e => {
      const meta = e.metadata as Record<string, unknown>;
      if (meta._widgetType !== 'wellness-checkin') return [];
      const cf = fields(e);
      if (typeof cf.date !== 'string') return [];
      return [{
        date: cf.date, moodScore: Number(cf.moodScore) || 0, sleepQuality: Number(cf.sleepQuality) || 0,
        sleepHours: Number(cf.sleepHours) || 0, waterGlasses: Number(cf.waterGlasses) || 0,
        wokeAtNight: typeof cf.wokeAtNight === 'boolean' ? cf.wokeAtNight : null,
        dreamed: typeof cf.dreamed === 'boolean' ? cf.dreamed : null, eating: typeof cf.eating === 'string' ? cf.eating : '',
        workDay: Number(cf.workDay) || 0, social: Number(cf.social) || 0, procrastination: Number(cf.procrastination) || 0, stress: Number(cf.stress) || 0,
      }];
    });
    const meals = foodRowsFrom(entries, topicIdMap['meals'])
      .map(r => ({ day: r.day, mealType: r.mealType, healthiness: Number(r.cf.healthiness) || 0 }));
    const workouts = sessionsFrom(entries, topicIdMap['exercise'], stripHtml).map(x => ({ day: x.date, minutes: x.minutes }));
    // The first day anything was logged ("Since you started")
    const firsts = [...wellnessDays.map(w => w.date), ...meals.map(m => m.day), ...workouts.map(w => w.day), ...symptomList.map(x => x.occurredAt.slice(0, 10))];
    return {
      inventory: inventoryDays(wellnessDays, meals, workouts, data),
      startedOn: firsts.length ? firsts.reduce((a, b) => (b < a ? b : a)) : '',
    };
  }, [entries, topicIdMap, data, symptomList]);

  const scope: ReportScope = useMemo(() => ({
    today, range, inventory,
    symptoms: symptomDays(symptomList.filter(x => inData(x.occurredAt.slice(0, 10)))),
  }), [today, range, inventory, symptomList, inData]);

  const events = useMemo(() => triggerEvents(foods, medLogs, exercises), [foods, medLogs, exercises]);
  const sessions = useMemo(() => exercises.map(x => ({ day: x.performedAt.slice(0, 10), minutes: x.duration })), [exercises]);
  const doses = useMemo(() => [
    ...medLogs.map(m => ({ name: m.medicationName, day: m.takenAt.slice(0, 10) })),
    ...foods.filter(f => f.mealType === 'medication' || f.mealType === 'supplement').map(f => ({ name: f.name, day: f.consumedAt.slice(0, 10) })),
  ], [medLogs, foods]);

  const rangeLabel = period === 'today' ? 'Today' : period === 'week' ? 'This week' : period === 'year' ? 'Last 12 months'
    : period === 'custom' && customFrom && customTo ? `${shortDay(range.from)} – ${shortDay(range.to)}`
    : startedOn > range.from ? 'Since you started' : 'Last 30 days';

  // Medication doses for the data window (each record is decrypted in the browser)
  useEffect(() => {
    if (!isReady) return;
    const medTopicId = topicIdMap['medication'];
    if (!medTopicId) { setMedLogs([]); return; }
    const nameMap = new Map<number, string>();
    for (const e of entries) {
      if ((e.metadata as Record<string, unknown>)?._taxonomyId !== medTopicId) continue;
      nameMap.set(e.id, ((fields(e).medicationName as string) || stripHtml(e.content)).trim().slice(0, 120) || 'Unknown');
    }
    let cancelled = false;
    void (async () => {
      try {
        const { logs: all } = await dosesApi.getAll();
        if (cancelled) return;
        setMedLogs(all
          .filter(log => log.date >= data.from && log.date <= data.to && log.status === 'taken' && log.takenAt)
          .map(log => ({
            id: log.id,
            medicationPostId: log.medicationPostId,
            medicationName: nameMap.get(log.medicationPostId) || 'Unknown',
            takenAt: `${log.date}T${log.scheduledTime.substring(0, 5)}:00`,
          })));
      } catch { if (!cancelled) setMedLogs([]); }
    })();
    return () => { cancelled = true; };
  }, [isReady, data, entries, topicIdMap]);

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
            scope={scope}
            rangeLabel={rangeLabel}
            events={events}
            sessions={sessions}
            doses={doses}
            triggerReviews={triggerReviews}
            onReviewTrigger={reviewsLoaded ? reviewTrigger : undefined}
          />
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
