import { useState, useMemo, useCallback } from 'react';
import { calendarDayFor } from '../utils/calendarItems.js';
import styled from 'styled-components';
import { CalendarGrid } from '../components/organisms/CalendarGrid.js';
import { CalendarDayView } from '../components/organisms/CalendarDayView.js';
import { CalendarWeekView } from '../components/organisms/CalendarWeekView.js';
import { CalendarDayDetail } from '../components/organisms/CalendarDayDetail.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { AppTemplate } from '../components/templates/AppTemplate.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';

export type CalendarViewMode = 'day' | 'week' | 'month';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const result = new Date(d);
  result.setDate(d.getDate() - d.getDay()); // Sun = start
  result.setHours(0, 0, 0, 0);
  return result;
}

const Layout = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-app);
`;

const GridPane = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border-subtle);
`;

const DetailPane = styled.div`
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  @media (max-width: 900px) { display: none; }
`;

export function CalendarView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date()); // anchor: for month=1st of month, week=Sunday, day=that day
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateStr(new Date()));

  const eventTopicIds = useMemo(
    () => new Set(allTopics.filter(t => ['event', 'meeting'].includes(t.name.toLowerCase())).map(t => t.id)),
    [allTopics]
  );

  const taskTopicIds = useMemo(
    () => new Set(allTopics.filter(t => t.name.toLowerCase() === 'task').map(t => t.id)),
    [allTopics]
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, typeof entries>();
    const addEntry = (key: string, entry: typeof entries[number]) => {
      const arr = map.get(key) || [];
      arr.push(entry);
      map.set(key, arr);
    };

    const topicNames = new Map(allTopics.map(t => [t.id, t.name]));
    for (const entry of entries) {
      const taxId = (entry.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
      const day = calendarDayFor(entry, taxId === undefined ? undefined : topicNames.get(taxId));
      if (day) addEntry(day, entry);
    }

    for (const [key, arr] of map) {
      map.set(key, arr.sort((a, b) => {
        const aIsEvent = eventTopicIds.has((a.metadata as Record<string, unknown>)?._taxonomyId as number);
        const bIsEvent = eventTopicIds.has((b.metadata as Record<string, unknown>)?._taxonomyId as number);
        if (aIsEvent && !bIsEvent) return -1;
        if (!aIsEvent && bIsEvent) return 1;
        return 0;
      }));
    }

    return map;
  }, [entries, allTopics, eventTopicIds]);

  const getTopicForEntry = useCallback((entry: typeof entries[number]) => {
    const taxId = (entry.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
    return taxId ? allTopics.find(t => t.id === taxId) : undefined;
  }, [allTopics]);


  const handleDayClick = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
  }, []);

  const handleDayDoubleClick = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
    setCurrentDate(new Date(dateStr + 'T00:00:00'));
    setViewMode('day');
  }, []);

  // Navigation: prev/next semantics depend on view mode
  const goToPrev = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') return new Date(d.getFullYear(), d.getMonth() - 1, 1);
      if (viewMode === 'week') { d.setDate(d.getDate() - 7); return d; }
      d.setDate(d.getDate() - 1); return d;
    });
  }, [viewMode]);

  const goToNext = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1);
      if (viewMode === 'week') { d.setDate(d.getDate() + 7); return d; }
      d.setDate(d.getDate() + 1); return d;
    });
  }, [viewMode]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(toDateStr(today));
  }, []);

  const handleViewMode = useCallback((mode: CalendarViewMode) => {
    setViewMode(mode);
    // When switching to day/week, anchor currentDate to selectedDate
    if (mode === 'day') setCurrentDate(new Date(selectedDate + 'T00:00:00'));
    if (mode === 'week') setCurrentDate(startOfWeek(new Date(selectedDate + 'T00:00:00')));
  }, [selectedDate]);

  const selectedEntries = useMemo(() => {
    return entriesByDate.get(selectedDate) || [];
  }, [selectedDate, entriesByDate]);

  // Title for day/week header
  const currentMonth = viewMode === 'month'
    ? currentDate
    : viewMode === 'week'
      ? startOfWeek(currentDate)
      : currentDate;

  const sharedHeaderProps = {
    viewMode,
    accentColor,
    currentDate,
    onPrev: goToPrev,
    onNext: goToNext,
    onToday: goToToday,
    onViewMode: handleViewMode,
  };

  if (needsUnlock) return (
    <AppTemplate transparentContent hideAccentStripe>
      <Layout>
        <GridPane><EmptyState message="Unlock your journal to view calendar" /></GridPane>
        <UnlockDialog onUnlock={handleUnlock} />
      </Layout>
    </AppTemplate>
  );

  if (isLoading || !isReady) return (
    <AppTemplate transparentContent hideAccentStripe>
      <Layout>
        <GridPane><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></GridPane>
      </Layout>
    </AppTemplate>
  );

  if (viewMode === 'day') {
    return (
      <AppTemplate transparentContent hideAccentStripe>
        <Layout>
          <GridPane>
            <CalendarDayView
              {...sharedHeaderProps}
              dateStr={toDateStr(currentDate)}
              entries={entriesByDate.get(toDateStr(currentDate)) || []}
              allTopics={allTopics}
              eventTopicIds={eventTopicIds}
              taskTopicIds={taskTopicIds}
              getTopicForEntry={getTopicForEntry}
            />
          </GridPane>
        </Layout>
      </AppTemplate>
    );
  }

  if (viewMode === 'week') {
    const weekStart = startOfWeek(currentDate);
    return (
      <AppTemplate transparentContent hideAccentStripe>
        <Layout>
          <GridPane>
            <CalendarWeekView
              {...sharedHeaderProps}
              weekStart={weekStart}
              entriesByDate={entriesByDate}
              allTopics={allTopics}
              eventTopicIds={eventTopicIds}
              taskTopicIds={taskTopicIds}
              selectedDate={selectedDate}
              getTopicForEntry={getTopicForEntry}
              onDayClick={handleDayClick}
              onDayDoubleClick={handleDayDoubleClick}
            />
          </GridPane>
        </Layout>
      </AppTemplate>
    );
  }

  // Month view — keep two-panel layout
  return (
    <AppTemplate transparentContent hideAccentStripe>
      <Layout>
        <GridPane>
          <CalendarGrid
            {...sharedHeaderProps}
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            entriesByDate={entriesByDate}
            eventTopicIds={eventTopicIds}
            onDayClick={handleDayClick}
            onDayDoubleClick={handleDayDoubleClick}
            getTopicName={entry => getTopicForEntry(entry)?.name}
          />
        </GridPane>
        <DetailPane>
          <CalendarDayDetail
            dateStr={selectedDate}
            entries={selectedEntries}
            allTopics={allTopics}
            accentColor={accentColor}
            eventTopicIds={eventTopicIds}
            taskTopicIds={taskTopicIds}
            onClose={() => {}}
          />
        </DetailPane>
      </Layout>
    </AppTemplate>
  );
}
