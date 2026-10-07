import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import {
  AiErrorNote, DayAtAGlance, DayNavigator, DayTitle, FillMissingAction, FoodDayList, FoodTotalsTable,
  NutritionGoalsPanel, Section, SectionHead, SectionLabel, SectionNote, TotalsWindowTabs, longDay,
  useFoodLogActions, type TotalWindow,
} from '../components/organisms/FoodLog.js';
import { useAiReady } from '../hooks/useAiReady.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { entryDay, foodRowsFrom, rowsByDay, shiftDay } from '../utils/foodLog.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { DEFAULT_NUTRIENT_GOALS, type NutrientGoals } from '../types/nutrition.js';

/* ── Layout (mirrors HealthView) ── */

/* Brief confirmation ("Deleted") — a floating toast, the one place a shadow is allowed. */
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

  const today = toDateStr(new Date());
  const [day, setDay] = useState(today);
  const [windowDays, setWindowDays] = useState<TotalWindow>('30');
  const sheetRef = useRef<HTMLDivElement>(null);

  const [goals, saveGoals] = useEncryptedSetting<NutrientGoals>('nutritionGoals', DEFAULT_NUTRIENT_GOALS);
  const aiReady = useAiReady();
  const actions = useFoodLogActions('Meals');
  const [status, setStatus] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

          <Section aria-label="Day" ref={sheetRef} style={{ borderTop: 'none', marginTop: 28 }}>
            <SectionHead>
              <SectionLabel>{day === today ? 'Today' : 'Day'}</SectionLabel>
              <DayNavigator day={day} onChange={setDay} />
            </SectionHead>
            <DayTitle>{longDay(day).replace(/^Today — /, '')}</DayTitle>
            <DayAtAGlance rows={dayRows} goals={goals} />
          </Section>

          {/* No rule under the day's tallies */}
          <Section aria-label="Logged items" style={{ borderTop: 'none', marginTop: 28 }}>
            <SectionHead>
              <SectionLabel>Logged{dayRows.length ? ` · ${dayRows.length}` : ''}</SectionLabel>
              <FillMissingAction rows={dayRows} actions={actions} aiReady={aiReady} />
            </SectionHead>
            <AiErrorNote actions={actions} />
            <FoodDayList rows={dayRows} goals={goals} actions={actions} aiReady={aiReady} onStatus={say} />
            {dayRows.length > 0 && <SectionNote style={{ marginTop: 10 }}>Select an item to edit it. Grey italic numbers are AI estimates.</SectionNote>}
          </Section>

          {/* No rule between the Logged list and this section */}
          <Section aria-label="Meals At-a-Glance" style={{ borderTop: 'none' }}>
            <SectionHead>
              <SectionLabel>Meals At-a-Glance</SectionLabel>
              <TotalsWindowTabs value={windowDays} onChange={setWindowDays} />
            </SectionHead>
            {totalsDays.length === 0
              ? <SectionNote>No days logged in this range yet.</SectionNote>
              : <>
                  <FoodTotalsTable days={totalsDays} goals={goals} selected={day} onOpen={openDay} />
                  <SectionNote style={{ marginTop: 10 }}>Green means the day reached its goal. Select a day to open it.</SectionNote>
                </>}
          </Section>

          <Section aria-label="Daily goals">
            <SectionHead><SectionLabel>Daily goals</SectionLabel></SectionHead>
            <NutritionGoalsPanel goals={goals} onChange={saveGoals} />
          </Section>
        </Inner>
      </Page>
      <Toast $show={!!status} role="status" aria-live="polite">{status}</Toast>
    </ContentTemplate>
  );
}
