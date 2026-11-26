import { useMemo, useRef, useState, useEffect, type RefObject } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { usePopover } from '../hooks/usePopover.js';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { PlanningShell } from '../components/organisms/PlanningShell.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { TickMark } from '../components/atoms/TickMark.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { WallpaperPicker } from '../components/molecules/WallpaperPicker.js';
import { AutoTextarea } from '../components/molecules/fields/AutoTextarea.js';
import { usePlanData, type PlanGoal } from '../hooks/usePlanData.js';
import { useHabits } from '../hooks/useHabits.js';
import { useSaveFields } from '../hooks/useSaveFields.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { cardLabel } from '../styles/cardLabel.js';
import {
  EMPTY_GOAL_CATEGORIES, addGoalCategory, areaInfo, goalCategoryList, orderAreas, parseGoalCategories, sameCategory, withAreaInfo, withAreaOrder,
  type GoalCategoryConfig,
  CUSTOM_AREA_PHOTO, areaImageKeys,
} from '../utils/goalCategories.js';
import { weekOf, plannerFacts, effectiveDay } from '../utils/planner.js';
import { weekProgress, isDueOn, type Habit } from '../utils/habits.js';
import { wallpaperById, wallpaperSrc } from '../utils/wallpapers.js';
import { CustomPhotoTile } from '../components/organisms/CustomPhotoTile.js';
import { useImagesReady } from '../hooks/useImagesReady.js';
import { useDecryptedImage } from '../hooks/useDecryptedImage.js';
import { pinImageKeys, type EntryImage } from '../services/imageStorage.js';
import { replaceStoredImage } from '../services/backgroundImages.js';
import { toDateStr } from '../utils/dateUtils.js';
import { showFlash } from '../services/flashNotice.js';

/* Planning's dashboard (the first Planning tab): one card per area of life — the goal
   categories — with a header photo (from the app's wallpaper photos), the area's vision,
   its goals with their progress, and what's on this week (its tasks planned or due this
   week, and its habits). An area shows once it has a goal, or once it was made here. */

const VIEW_KEY = 'planning-overview-view-v1';
type View = 'board' | 'list';

/* ── Styles ── */

/* Board | List: in light theme on the photo, light frosted glass like the page's buttons — the
   page's cream see-through over a blur, the theme's own dark words and chosen fill */
const BlurSwitch = styled.div`
  display: contents;
  html[data-wallpaper][data-theme='light'] & > * {
    background: rgba(254, 249, 245, 0.74) !important;
    border-color: transparent !important;
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }
`;

/* Board: a masonry of cards — three columns on desktop (two under 1200px, one under 760px),
   the cards dealt across them in order, each straight under the one above it; List: one column */
const Masonry = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, minmax(0, 1fr));
  gap: 32px;
  align-items: start;
`;

const MasonryCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-width: 0;
`;

/* An area: the dashboards' card — panel colour, light shadow, 16px corners */
const Card = styled.section`
  min-width: 0;
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
  overflow: hidden;
`;

/* The header: the area's photo with its name over it (a shade at the foot so it reads) */
const Header = styled.div<{ $photo?: string }>`
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  min-height: ${({ $photo }) => ($photo ? '200px' : '120px')};
  padding: 24px 28px;
  background: ${({ $photo }) => ($photo
    ? `linear-gradient(to bottom, rgba(10, 12, 16, 0.05) 30%, rgba(10, 12, 16, 0.72)), url('${$photo}') center / cover no-repeat`
    : 'var(--bg-tile)')};
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 200;
    line-height: 1.12;
    color: ${({ $photo }) => ($photo ? '#fff' : 'var(--text-primary)')};
    ${({ $photo }) => ($photo ? 'text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);' : '')}
  }
`;

/* The grip that drags an area to another place (beside the camera) */
const GripBtn = styled.button<{ $onPhoto: boolean }>`
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 42px;
  padding: 0;
  border: none;
  background: none;
  color: ${({ $onPhoto }) => ($onPhoto ? 'rgba(255, 255, 255, 0.75)' : 'var(--text-muted)')};
  cursor: grab;
  touch-action: none;
  &:active { cursor: grabbing; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 6px; }
`;

const PhotoBtn = styled.button<{ $onPhoto: boolean }>`
  flex: none;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid ${({ $onPhoto }) => ($onPhoto ? 'rgba(255, 255, 255, 0.35)' : 'var(--border-card)')};
  border-radius: 50%;
  background: ${({ $onPhoto }) => ($onPhoto ? 'rgba(18, 20, 26, 0.45)' : 'transparent')};
  color: ${({ $onPhoto }) => ($onPhoto ? '#fff' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { border-color: ${({ $onPhoto }) => ($onPhoto ? 'rgba(255, 255, 255, 0.7)' : 'var(--border-strong)')}; }
  /* Light: on a photo, light frosted glass with a dark icon (never the dark smoked fill) */
  ${({ $onPhoto }) => ($onPhoto ? `html[data-theme='light'] & {
    background: rgba(254, 249, 245, 0.74);
    border-color: transparent;
    color: var(--text-primary);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
  }` : '')}
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

const Body = styled.div`
  padding: 26px 28px 30px;
  display: flex;
  flex-direction: column;
  gap: 30px;
`;

/* A section's head: the card label (with a › that opens where it lives) and an aside */
const SecHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    ${cardLabel}
  }
  button:hover { color: var(--text-primary); }
  span { font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

const Vision = styled.button`
  display: block;
  width: 100%;
  /* Room above and below the words */
  margin: 28px 0 10px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--font-display);
  font-size: 16px;
  font-style: italic;
  font-weight: 300;
  line-height: 1.8;
  /* The body text colour, full strength (it was faded to 72% and read too dim) */
  color: var(--text-primary);
  cursor: text;
  &[data-empty] { color: var(--text-muted); font-size: 16px; }
`;

const VisionBox = styled(AutoTextarea)`
  width: 100%;
  margin: 24px 0 6px;
  padding: 10px 12px;
  border: 1px solid var(--border-card) !important;
  border-radius: 10px;
  background: transparent !important;
  font-family: var(--font-display);
  font-size: 16px;
  font-style: italic;
  font-weight: 300;
  line-height: 1.8;
  color: var(--text-primary);
  resize: none;
  &:focus { outline: none; border-color: var(--color-accent-line) !important; }
`;

const GoalRow = styled.button`
  display: block;
  width: 100%;
  padding: 16px 0;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  background: none;
  text-align: left;
  cursor: pointer;
  &:last-child { border-bottom: none; }
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .name { font-family: var(--font-sans); font-size: 17px; color: var(--text-primary); }
  .pct { font-family: var(--font-display); font-size: 20px; font-weight: 300; color: var(--color-accent-soft); }
  .meta { margin-top: 10px; font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
  &:hover .name { color: var(--color-accent-link); }
`;

const Track = styled.div`
  height: 5px;
  margin-top: 10px;
  border-radius: 3px;
  background: var(--progress-track, var(--bg-active));
  overflow: hidden;
  & > div { height: 100%; border-radius: 3px; background: var(--color-accent-fill, var(--color-accent)); }
`;

const WeekRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  &:last-child { border-bottom: none; }
  .tick { flex: none; display: grid; place-items: center; padding: 0; border: none; background: none; cursor: pointer; }
  .text { flex: 1; min-width: 0; padding: 0; border: none; background: none; text-align: left; cursor: pointer; }
  .title { display: block; font-family: var(--font-sans); font-size: 16px; color: var(--text-primary); }
  .title[data-done] { text-decoration: line-through; color: var(--text-muted); }
  small { display: block; margin-top: 2px; font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
`;

const Muted = styled.p`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const NewArea = styled.form`
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
  input {
    flex: 1;
    max-width: 420px;
    height: 44px;
    padding: 0 14px;
    border: 1px solid var(--border-card) !important;
    border-radius: 10px;
    background: transparent !important;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
  }
  input:focus { outline: none; border-color: var(--color-accent-line) !important; }
`;

/* The photo picker: a floating panel of the app's wallpaper photos */
const PickerPanel = styled.div`
  position: fixed;
  z-index: 60;
  width: min(560px, calc(100vw - 32px));
  max-height: min(70vh, 640px);
  overflow-y: auto;
  padding: 18px;
  border: 1px solid var(--border-pop);
  border-radius: 14px;
  background: var(--bg-tile);
  box-shadow: var(--shadow-xl);
  h3 { margin: 0 0 12px; ${cardLabel} }
`;

/* ── Helpers ── */

const weeksLeft = (target: unknown, today: string): string => {
  if (typeof target !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return '';
  const days = Math.round((new Date(`${target}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
  if (days < 0) return 'Past its target';
  if (days < 14) return days === 0 ? 'Due today' : `${days} ${days === 1 ? 'day' : 'days'} left`;
  return `${Math.round(days / 7)} weeks left`;
};

const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function readView(): View {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'; } catch { return 'board'; }
}

/* ── The view ── */

export function PlanningOverviewView() {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const newInJournal = useNewEntryInJournal();
  const saveFields = useSaveFields();
  const { goals, milestones, tasks, goalTopicId } = usePlanData();
  const { habits, count, setCount } = useHabits();
  const [saved, saveCategories] = useEncryptedSetting<GoalCategoryConfig>('goalCategories', EMPTY_GOAL_CATEGORIES);
  const config = useMemo(() => parseGoalCategories(saved), [saved]);
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* per browser */ } };
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');

  const today = toDateStr(new Date());
  const week = weekOf(today);

  // The areas: the categories in the list that have a goal, or were made here (in their order)
  const areas = useMemo(() => {
    const list = goalCategoryList(config);
    return orderAreas(list.filter(name => goals.some(g => sameCategory(g.category, name)) || areaInfo(config, name).shown), config.areaOrder);
  }, [config, goals]);
  const wide = useMediaQuery('(min-width: 1200px)');
  const mid = useMediaQuery('(min-width: 760px)');
  const cols = view === 'list' ? 1 : wide ? 3 : mid ? 2 : 1;
  // Dragging an area (by its grip) to another place; the order is saved with the categories
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || active.id === over.id) return;
    const from = areas.indexOf(String(active.id));
    const to = areas.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    void save(withAreaOrder(config, arrayMove(areas, from, to)));
  };

  const save = (next: GoalCategoryConfig) => saveCategories(next).catch(() => showFlash('Couldn’t save that. Try again.'));

  // A goal's progress: its milestones done, else its tasks done
  const progressOf = (g: PlanGoal) => {
    if (g.status === 'completed') return 100;
    const ms = milestones.filter(m => m.goalId === g.id);
    if (ms.length) return Math.round((ms.filter(m => m.completed).length / ms.length) * 100);
    const ts = tasks.filter(t => t.goalId === g.id);
    return ts.length ? Math.round((ts.filter(t => t.completed).length / ts.length) * 100) : 0;
  };

  // This week: the area's tasks planned or due this week, then its habits
  const weekTasks = (area: string) => tasks.filter(t => {
    if (!sameCategory(t.category, area)) return false;
    const day = effectiveDay(plannerFacts(t.id, t.fields, t.created), today);
    const due = typeof t.fields.deadline === 'string' ? t.fields.deadline : '';
    return (day >= week[0] && day <= week[6]) || (due >= week[0] && due <= week[6]);
  });
  const weekHabits = (area: string) => habits.filter(h => sameCategory(h.category, area));


  const addArea = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    void save(withAreaInfo(addGoalCategory(config, name), name, { shown: true }));
    setNewName('');
    setNaming(false);
  };

  const actions = (<>
    <BlurSwitch><FilterTabs options={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }]} active={view} onChange={setView} label="View" /></BlurSwitch>
    {/* The page's actions: smoked glass on the photo, like every page's main action (.page-action) */}
    <span className="page-action" style={{ display: 'contents' }}>
      <PillButton type="button" $variant="neutral" onClick={() => setNaming(v => !v)} aria-expanded={naming}>New area</PillButton>
      {goalTopicId !== undefined && <PillButton type="button" $variant="solid" onClick={() => newInJournal(goalTopicId)}>New goal</PillButton>}
    </span>
  </>);

  return (
    <PlanningShell actions={actions} wide>
      {naming && (
        <NewArea onSubmit={addArea}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} maxLength={40}
            placeholder="Name the area, e.g. Creative life" aria-label="New area name"
            onKeyDown={e => { if (e.key === 'Escape') { setNaming(false); setNewName(''); } }} />
          <PillButton type="submit">Add</PillButton>
          <PillButton type="button" $variant="neutral" onClick={() => { setNaming(false); setNewName(''); }}>Cancel</PillButton>
        </NewArea>
      )}
      {/* Your overall vision, above the areas: tap to write or edit it in place */}
      <OverallVision value={config.vision ?? ''} onSave={v => void save({ ...config, vision: v })} />
      {areas.length === 0 ? (
        <Muted>No areas yet. Give a goal a category, or press New area.</Muted>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={e => setDragging(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <SortableContext items={areas} strategy={() => null}>
            <Masonry $cols={cols}>
              {Array.from({ length: cols }, (_, c) => (
                <MasonryCol key={c}>
                  {areas.filter((_, i) => i % cols === c).map(area => (
                    <AreaCard key={area} area={area} config={config} onSave={save} onSaveStrict={saveCategories} today={today} week={week}
                      goals={goals.filter(g => sameCategory(g.category, area)).sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))}
                      progressOf={progressOf}
                      taskCount={(g: PlanGoal) => tasks.filter(t => t.goalId === g.id).length}
                      weekTasks={weekTasks(area)} weekHabits={weekHabits(area)}
                      habitWeek={(h: Habit) => weekProgress(h, week, count)}
                      onTickTask={t => void saveFields(t.entry, { ...t.fields, isCompleted: !t.completed, isInProgress: false, isInReview: false })
                        .then(ok => { if (!ok) showFlash('Couldn’t save that task, so it’s back as it was. Try again.'); })}
                      onTickHabit={h => setCount(h, today, count(h, today) > 0 ? 0 : 1)}
                      habitDoneToday={(h: Habit) => count(h, today) > 0}
                      onOpen={openInJournal}
                      onGoals={() => navigate('/goals')} onWeek={() => navigate('/goals/planner')} />
                  ))}
                </MasonryCol>
              ))}
            </Masonry>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {dragging && <DragGhost>{dragging}</DragGhost>}
          </DragOverlay>
        </DndContext>
      )}
    </PlanningShell>
  );
}

/* ── One area ── */

type WeekTask = ReturnType<typeof usePlanData>['tasks'][number];

function AreaCard({ area, config, onSave, onSaveStrict, today, week, goals, progressOf, taskCount, weekTasks, weekHabits, habitWeek,
  onTickTask, onTickHabit, habitDoneToday, onOpen, onGoals, onWeek }: {
  area: string; config: GoalCategoryConfig; onSave: (next: GoalCategoryConfig) => unknown;
  /** The same save, but it rejects when it fails (a photo is only let go once its replacement is saved) */
  onSaveStrict: (next: GoalCategoryConfig) => Promise<unknown>;
  today: string; week: string[];
  goals: PlanGoal[]; progressOf: (g: PlanGoal) => number; taskCount: (g: PlanGoal) => number;
  weekTasks: WeekTask[]; weekHabits: Habit[]; habitWeek: (h: Habit) => { done: number; target: number };
  onTickTask: (t: WeekTask) => void; onTickHabit: (h: Habit) => void; habitDoneToday: (h: Habit) => boolean;
  onOpen: (id: number) => void; onGoals: () => void; onWeek: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({ id: area });
  const info = areaInfo(config, area);
  // The person's own photo (only while Entry Images is on and set up), else one of the app's
  const imagesReady = useImagesReady();
  const ownChosen = info.photo === CUSTOM_AREA_PHOTO && !!info.photoImage;
  const own = useDecryptedImage(ownChosen && imagesReady ? info.photoImage!.key : null, info.photoImage?.iv ?? null, info.photoImage?.mimeType ?? null);
  const photo = ownChosen ? own.url ?? undefined : info.photo && wallpaperById(info.photo) ? wallpaperSrc(info.photo) : undefined;
  // The settings as they are now: an upload takes a while, and what is saved after it
  // must be built on the latest, not on what they were when it began
  const configRef = useRef(config);
  configRef.current = config;
  const savePhotoChoice = (photo: string) => { void onSave(withAreaInfo(configRef.current, area, { photo })); };
  // A new photo of the person's own, or none: the one it replaces leaves the bucket once
  // this is saved, unless something still uses it
  const setOwnPhoto = async (image: EntryImage | null) => {
    const now = areaInfo(configRef.current, area);
    const old = now.photoImage;
    const next = withAreaInfo(configRef.current, area, { photo: image ? CUSTOM_AREA_PHOTO : now.photo === CUSTOM_AREA_PHOTO ? '' : now.photo ?? '', photoImage: image ?? undefined });
    pinImageKeys('areas', areaImageKeys(next));
    const saved = await replaceStoredImage({
      old, next: image,
      save: () => onSaveStrict(next),
      repin: () => pinImageKeys('areas', areaImageKeys(configRef.current)),
    });
    if (!saved) showFlash('Couldn’t save that photo. Try again.');
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(info.vision ?? '');
  const [picking, setPicking] = useState<DOMRect | null>(null);
  const photoBtnRef = useRef<HTMLButtonElement>(null);
  const done = weekTasks.filter(t => t.completed).length + weekHabits.filter(habitDoneToday).length;
  const total = weekTasks.length + weekHabits.length;

  const commitVision = () => {
    setEditing(false);
    const v = draft.trim();
    if (v !== (info.vision ?? '')) void onSave(withAreaInfo(config, area, { vision: v }));
  };

  return (
    <Card aria-label={area} ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <Header $photo={photo}>
        <h2>{area}</h2>
        <GripBtn ref={setActivatorNodeRef} type="button" $onPhoto={!!photo} aria-label={`Move ${area}`} title="Drag to move" {...attributes} {...listeners}>
          <Icon name="grip" size={18} strokeWidth={2.6} />
        </GripBtn>
        <PhotoBtn ref={photoBtnRef} type="button" $onPhoto={!!photo} aria-expanded={!!picking} aria-haspopup="dialog" aria-label={`Choose a photo for ${area}`} title="Choose a photo"
          onClick={e => setPicking(picking ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}>
          <MaterialIcon $size={20} aria-hidden="true">photo_camera</MaterialIcon>
        </PhotoBtn>
      </Header>
      {picking && (
        <PhotoPicker anchor={picking} triggerRef={photoBtnRef} value={info.photo ?? null} onClose={() => setPicking(null)}
          onChange={id => { savePhotoChoice(id ?? ''); setPicking(null); }}
          own={imagesReady ? {
            image: info.photoImage ?? null, chosen: ownChosen,
            onPick: () => { savePhotoChoice(CUSTOM_AREA_PHOTO); setPicking(null); },
            onSet: image => { void setOwnPhoto(image); setPicking(null); },
            onRemove: () => { void setOwnPhoto(null); },
          } : undefined} />
      )}
      <Body>
        <div>
          <SecHead><button type="button" onClick={() => { setDraft(info.vision ?? ''); setEditing(true); }}>Vision <Icon name="chevron-right" size={13} strokeWidth={2} /></button></SecHead>
          {editing ? (
            <VisionBox autoFocus value={draft} onChange={e => setDraft(e.target.value)} maxLength={600} aria-label={`Vision for ${area}`}
              placeholder="What this area of your life looks like when it’s going well"
              onBlur={commitVision}
              onKeyDown={e => { if (e.key === 'Escape') { setDraft(info.vision ?? ''); setEditing(false); } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitVision(); } }} />
          ) : (
            <Vision type="button" data-empty={!info.vision ? '' : undefined} onClick={() => { setDraft(info.vision ?? ''); setEditing(true); }}>
              {info.vision || 'Add a vision for this area'}
            </Vision>
          )}
        </div>

        <div>
          <SecHead><button type="button" onClick={onGoals}>Goals <Icon name="chevron-right" size={13} strokeWidth={2} /></button></SecHead>
          {goals.length === 0 ? <Muted>No goals in {area} yet.</Muted> : goals.map(g => {
            const pct = progressOf(g);
            const n = taskCount(g);
            const meta = [weeksLeft(g.fields.targetDate, today), n ? `${n} ${n === 1 ? 'task' : 'tasks'}` : ''].filter(Boolean).join(' · ');
            return (
              <GoalRow key={g.id} type="button" onClick={() => onOpen(g.id)}>
                <div className="top"><span className="name">{g.title}</span><span className="pct">{pct}%</span></div>
                <Track aria-hidden="true"><div style={{ width: `${pct}%` }} /></Track>
                {meta && <div className="meta">{meta}</div>}
              </GoalRow>
            );
          })}
        </div>

        <div>
          <SecHead>
            <button type="button" onClick={onWeek}>This week <Icon name="chevron-right" size={13} strokeWidth={2} /></button>
            {total > 0 && <span>{done} of {total} done</span>}
          </SecHead>
          {total === 0 && <Muted>Nothing planned this week.</Muted>}
          {weekTasks.map(t => {
            const due = typeof t.fields.deadline === 'string' && t.fields.deadline >= week[0] && t.fields.deadline <= week[6] ? t.fields.deadline : '';
            const parent = goals.find(g => g.id === t.goalId)?.title ?? '';
            return (
              <WeekRow key={`t${t.id}`}>
                <button type="button" className="tick" aria-label={t.completed ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`} onClick={() => onTickTask(t)}>
                  <TickMark checked={t.completed} size={22} />
                </button>
                <button type="button" className="text" onClick={() => onOpen(t.id)}>
                  <span className="title" data-done={t.completed ? '' : undefined}>{t.title}</span>
                  <small>{parent || (due ? `Due ${shortDay(due)}` : 'Task')}</small>
                </button>
              </WeekRow>
            );
          })}
          {weekHabits.map(h => {
            const wk = habitWeek(h);
            const ticked = habitDoneToday(h);
            const dueToday = isDueOn(h, today);
            return (
              <WeekRow key={`h${h.id}`}>
                <button type="button" className="tick" disabled={!dueToday}
                  aria-label={ticked ? `Clear today’s “${h.name}”` : `Tick “${h.name}” for today`} onClick={() => onTickHabit(h)}>
                  <TickMark checked={ticked} size={22} />
                </button>
                <button type="button" className="text" onClick={() => onOpen(h.id)}>
                  <span className="title" data-done={ticked ? '' : undefined}>{h.name}</span>
                  <small>Repeats · {wk.done} of {wk.target} this week</small>
                </button>
              </WeekRow>
            );
          })}
        </div>
      </Body>
    </Card>
  );
}

/* The overall vision: a full-width card over the areas — "Your vision", then the words
   in thin italic Work Sans, edited in place (Enter or leaving saves, Escape cancels) */
const VisionCard = styled.section`
  margin-bottom: 32px;
  padding: 26px 28px 30px;
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
`;

const BigVision = styled(Vision)`
  font-size: 17px;
  line-height: 1.8;
  &[data-empty] { font-size: 16px; }
`;

const BigVisionBox = styled(VisionBox)`
  font-size: 17px;
`;

function OverallVision({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v !== value) onSave(v);
  };
  const start = () => { setDraft(value); setEditing(true); };
  return (
    <VisionCard aria-label="Your vision">
      <SecHead><button type="button" onClick={start}>Your vision <Icon name="chevron-right" size={13} strokeWidth={2} /></button></SecHead>
      {editing ? (
        <BigVisionBox autoFocus value={draft} onChange={e => setDraft(e.target.value)} maxLength={1200} aria-label="Your vision"
          placeholder="The life you’re building, in a sentence or two"
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); } }} />
      ) : (
        <BigVision type="button" data-empty={!value ? '' : undefined} onClick={start}>
          {value || 'Add your overall vision — the life you’re building, in a sentence or two'}
        </BigVision>
      )}
    </VisionCard>
  );
}

/* What follows the pointer while an area is dragged: its name on a lifted card */
const DragGhost = styled.div`
  padding: 22px 28px;
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: var(--shadow-xl);
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 200;
  color: var(--text-primary);
  cursor: grabbing;
`;

/* The header photo picker: portalled, under the camera button; Escape or a click outside closes it */
function PhotoPicker({ anchor, value, onChange, onClose, own, triggerRef }: {
  anchor: DOMRect; value: string | null; onChange: (id: string | null) => void; onClose: () => void;
  /** The camera button (focus goes back to it) */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** The "Your photo" tile (Entry Images on and set up) */
  own?: { image: EntryImage | null; chosen: boolean; onPick: () => void; onSet: (image: EntryImage) => void; onRemove: () => void };
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The library dialog opens over this panel: a click or Escape in it must not close the panel under it
  const modalOpen = useRef(false);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!modalOpen.current && ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', down);
    return () => { document.removeEventListener('mousedown', down); };
  }, [onClose]);
  // Keyboard: into the panel, Escape back to the camera, focus leaving closes it (not while the library dialog is open)
  usePopover({ open: true, onClose, triggerRef, panelRef: ref, ignore: () => modalOpen.current });
  const width = Math.min(560, window.innerWidth - 32);
  const left = Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16));
  const top = Math.min(anchor.bottom + 8, window.innerHeight - 200);
  return createPortal(
    <PickerPanel ref={ref} style={{ left, top }} role="dialog" aria-label="Choose a photo">
      <h3>Area photo</h3>
      <WallpaperPicker value={value} onChange={onChange}
        extra={own ? <CustomPhotoTile {...own} onModal={open => { modalOpen.current = open; }} /> : undefined} />
    </PickerPanel>,
    document.body,
  );
}
