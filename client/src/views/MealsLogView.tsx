import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import {
  DayNavigator, FoodAddForm, FoodDaySheet, FoodTotalsTable, NutritionGoalsPanel, Section, SectionHead,
  SectionLabel, TotalsWindowTabs, longDay, useFoodLogActions, type LibraryItem, type TotalWindow,
} from '../components/organisms/FoodLog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useAiReady } from '../hooks/useAiReady.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { entryDay, foodRowsFrom, rowsByDay, shiftDay } from '../utils/foodLog.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { DEFAULT_NUTRIENT_GOALS, type NutrientGoals } from '../types/nutrition.js';

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

const Lede = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0 0 12px;
  max-width: 62ch;
`;

const DayName = styled.p`
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 18px;
  color: var(--text-secondary);
  margin: 0 0 8px;
`;

const Status = styled.p`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 8px 0 0;
  min-height: 18px;
`;

interface MealsLogViewProps {
  /** Page title — defaults to "Health". */
  title?: string;
  /** Tab bar under the title — defaults to the Health tabs. */
  tabBar?: React.ReactNode;
}

/**
 * Meals tab: a daily food log with nutrients — add form + quick add, an
 * editable sheet per day with its total, a running table of daily totals
 * against goals, and the goals themselves. With the AI assistant on, blank
 * nutrients are estimated automatically.
 */
export function MealsLogView({ title = 'Health', tabBar }: MealsLogViewProps) {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const aiReady = useAiReady();
  const actions = useFoodLogActions('Meals');

  const [day, setDay] = useState(() => toDateStr(new Date()));
  const [windowDays, setWindowDays] = useState<TotalWindow>('30');
  const [status, setStatus] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const [goals, saveGoals] = useEncryptedSetting<NutrientGoals>('nutritionGoals', DEFAULT_NUTRIENT_GOALS);
  const [library, saveLibrary] = useEncryptedSetting<LibraryItem[]>('foodLibrary', []);

  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current); }, []);
  const say = (msg: string) => {
    setStatus(msg);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), 2600);
  };

  const mealsTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'meals')?.id, [allTopics]);
  const symptomTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'symptom')?.id, [allTopics]);
  const rows = useMemo(() => foodRowsFrom(entries, mealsTopicId), [entries, mealsTopicId]);
  const dayRows = useMemo(() => rows.filter(r => r.day === day), [rows, day]);

  const totalsDays = useMemo(() => {
    const from = shiftDay(toDateStr(new Date()), -(Number(windowDays) - 1));
    const noticed = new Map<string, string[]>();
    if (symptomTopicId !== undefined) {
      for (const e of entries) {
        if ((e.metadata as Record<string, unknown> | undefined)?._taxonomyId !== symptomTopicId) continue;
        const d = entryDay(e, 'occurredDate');
        if (d < from) continue;
        const text = stripHtml(e.content).trim();
        if (text) noticed.set(d, [...(noticed.get(d) ?? []), text]);
      }
    }
    return rowsByDay(rows, from).map(([d, r]) => ({ day: d, rows: r, noticed: noticed.get(d) ?? [] }));
  }, [rows, entries, symptomTopicId, windowDays]);

  const openDay = (d: string) => {
    setDay(d);
    sheetRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head><Title>{title}</Title></Head>
          {tabBar ?? <HealthTabBar />}

          <Section aria-label="Add food">
            <SectionHead><SectionLabel>Add food</SectionLabel></SectionHead>
            <FoodAddForm day={day} actions={actions} aiReady={aiReady} library={library} onLibraryChange={saveLibrary} onStatus={say} />
            <Status role="status" aria-live="polite">{status}</Status>
          </Section>

          <Section aria-label="Day sheet" ref={sheetRef}>
            <SectionHead>
              <SectionLabel>Day sheet</SectionLabel>
              <DayNavigator day={day} onChange={setDay} />
            </SectionHead>
            <DayName>{longDay(day)}</DayName>
            <FoodDaySheet
              day={day} rows={dayRows} goals={goals} actions={actions} aiReady={aiReady}
              library={library} onLibraryChange={saveLibrary} onStatus={say}
            />
          </Section>

          <Section aria-label="Daily totals">
            <SectionHead>
              <SectionLabel>Daily totals</SectionLabel>
              <TotalsWindowTabs value={windowDays} onChange={setWindowDays} />
            </SectionHead>
            <Lede>One row per day. Green means the day reached its goal. Select a day to open its sheet.</Lede>
            {totalsDays.length === 0
              ? <Lede>No days logged in this range yet.</Lede>
              : <FoodTotalsTable days={totalsDays} goals={goals} selected={day} onOpen={openDay} />}
          </Section>

          <Section aria-label="Daily goals">
            <SectionHead><SectionLabel>Daily goals</SectionLabel></SectionHead>
            <NutritionGoalsPanel goals={goals} onChange={saveGoals} />
          </Section>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
