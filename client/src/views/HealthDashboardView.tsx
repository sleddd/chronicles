import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from '@dnd-kit/core';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { moveBeside, moveToRow, normalizeLayout, rowColumns, type HealthWidget } from '../utils/healthLayout.js';
import styled from 'styled-components';
import { HabitsToday } from '../components/organisms/HabitsToday.js';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { Spinner } from '../components/atoms/Spinner.js';
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

/* A row of the dashboard: one widget full width, or two side by side by weight
   (rowColumns: a wide widget beside a one-column one takes two thirds); one column on phones */
const Row = styled.div`
  display: grid;
  gap: 24px;
  align-items: start;
  & > * { min-width: 0; }
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr) !important; gap: 16px; }
`;

/* Between rows: a place to drop a widget on a row of its own (shown while dragging) */
const Gap = styled.div<{ $dragging: boolean; $over: boolean }>`
  height: ${({ $dragging }) => ($dragging ? '34px' : '0')};
  margin: ${({ $dragging }) => ($dragging ? '-5px 0' : '-12px 0')};
  border-radius: 12px;
  border: 1.5px dashed ${({ $dragging, $over }) => ($over ? 'var(--color-accent-line)' : $dragging ? 'var(--border-dashed)' : 'transparent')};
  background: ${({ $over }) => ($over ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'transparent')};
  transition: height 120ms ease, border-color 120ms ease;
`;

/* A widget's place: its drag grip just left of its fold chevron (the wellness check-in, which
   has neither panel nor chevron, in its top-right corner); outlined while one is dropped on it */
const Slot = styled.div<{ $bare: boolean; $over: boolean }>`
  position: relative;
  min-width: 0;
  border-radius: 16px;
  outline: 2px solid ${({ $over }) => ($over ? 'var(--color-accent-line)' : 'transparent')};
  outline-offset: 4px;
  /* The title row keeps clear of the grip and the chevron */
  & > * > :first-child:has(> h2) { padding-right: 82px !important; }
`;

const Grip = styled.button<{ $bare: boolean }>`
  position: absolute;
  z-index: 2;
  top: ${({ $bare }) => ($bare ? '10px' : '25px')};
  right: ${({ $bare }) => ($bare ? '10px' : '54px')};
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  cursor: grab;
  touch-action: none;
  &:hover { color: var(--text-primary); }
  &:active { cursor: grabbing; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { top: ${({ $bare }) => ($bare ? '8px' : '19px')}; right: ${({ $bare }) => ($bare ? '8px' : '46px')}; }
`;

/* What's under the pointer; with the keyboard (no pointer), what the moved widget overlaps */
const collisions: CollisionDetection = args => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

const NAMES: Record<HealthWidget, string> = {
  wellness: 'Wellness check-in', quickLog: 'Quick log', symptom: 'Log a symptom', meds: 'Medications',
  habits: 'Habits', change: 'Log a change', exercise: 'Exercise schedule',
};

function WidgetSlot({ id, children }: { id: HealthWidget; children: ReactNode }) {
  const drag = useDraggable({ id });
  // Not a place to drop itself (it moves with the pointer)
  const drop = useDroppable({ id: `w:${id}`, disabled: drag.isDragging });
  const bare = false; // every widget is a panel now, with its grip beside the fold chevron
  const t = drag.transform;
  return (
    <Slot ref={el => { drag.setNodeRef(el); drop.setNodeRef(el); }} $bare={bare} $over={drop.isOver && !drag.isDragging}
      style={{ transform: t ? `translate(${t.x}px, ${t.y}px)` : undefined, zIndex: drag.isDragging ? 5 : undefined, opacity: drag.isDragging ? 0.7 : 1 }}>
      {children}
      <Grip type="button" $bare={bare} aria-label={`Move ${NAMES[id]}`} title="Drag to move" {...drag.attributes} {...drag.listeners}>
        <Icon name="grip" size={18} strokeWidth={2.6} />
      </Grip>
    </Slot>
  );
}

function RowGap({ index, dragging }: { index: number; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${index}` });
  return <Gap ref={setNodeRef} $dragging={dragging} $over={isOver} aria-hidden="true" />;
}


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
  /* Light, on the photo: a soft page-colour glow behind the letters so they hold */
  html[data-wallpaper][data-theme='light'] & { color: var(--text-primary); font-weight: 400; text-shadow: none; }
`;

const TodayDate = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  html[data-wallpaper][data-theme='light'] & { color: var(--text-primary); text-shadow: none; }
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
  const { isReady, isLoading } = useInitializeData();
  const ff = useEntriesStore(s => s.featureFlags);
  const hasMeds = useHasScheduledMeds();
  const hasRoutines = useHasRoutines();
  const medsOn = ff.medicationEnabled !== false;
  const doses = useTodayDoses(isReady && medsOn);
  // The widgets' arrangement, saved encrypted like the home dashboard's
  const [savedLayout, saveLayout, layoutLoaded] = useEncryptedSetting<{ rows?: string[][] }>('healthLayout', {});
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
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

  /* The widgets, and which of them show */
  const widgets: Record<HealthWidget, ReactNode> = {
    wellness: <WellnessCheckIn title="Wellness check-in" strip foldable />,
    quickLog: <QuickLog meal={food} exercise={exercise} />,
    symptom: <QuickSymptom />,
    // Only once a medication has scheduled times
    meds: <MedicationsToday doses={doses} hideWhenEmpty panel />,
    habits: <HabitsToday panel />,
    change: <QuickChange />,
    exercise: <ExerciseToday panel />,
  };
  const shown = (Object.keys(widgets) as HealthWidget[]).filter(k =>
    k === 'meds' ? medsOn && hasMeds : k === 'exercise' ? routines : true);
  const rows = normalizeLayout(savedLayout.rows, shown);
  const save = (next: HealthWidget[][]) => {
    if (!layoutLoaded) return;
    // A widget that isn't showing goes back in at its default place when it shows again
    void saveLayout({ rows: next }).catch(err => console.error('Failed to save the Health layout:', err));
  };
  const onDragEnd = ({ active, over, delta, activatorEvent }: DragEndEvent) => {
    setDragging(false);
    if (!over) return;
    const key = active.id as HealthWidget;
    const target = String(over.id);
    if (target.startsWith('gap:')) { save(moveToRow(rows, key, Number(target.slice(4)))); return; }
    if (!target.startsWith('w:')) return;
    const onto = target.slice(2) as HealthWidget;
    if (onto === key) return;
    // Which half of the widget it was let go over: before it or after it in the row
    const start = activatorEvent && 'clientX' in activatorEvent ? (activatorEvent as PointerEvent).clientX : over.rect.left + over.rect.width / 2;
    const x = start + delta.x;
    save(moveBeside(rows, key, onto, x < over.rect.left + over.rect.width / 2 ? 'before' : 'after'));
  };

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

          <DndContext sensors={sensors} collisionDetection={collisions}
            onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)} onDragEnd={onDragEnd}>
            <Stack>
              <RowGap index={0} dragging={dragging} />
              {rows.map((row, r) => (
                <div key={row.join('|')} style={{ display: 'contents' }}>
                  <Row style={{ gridTemplateColumns: rowColumns(row) }}>
                    {row.map(k => <WidgetSlot key={k} id={k}>{widgets[k]}</WidgetSlot>)}
                  </Row>
                  <RowGap index={r + 1} dragging={dragging} />
                </div>
              ))}
            </Stack>
          </DndContext>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
