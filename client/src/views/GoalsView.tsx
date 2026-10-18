import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PillButton } from '../components/atoms/PillButton.js';
import { useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import styled from 'styled-components';
import { arrayMove } from '@dnd-kit/sortable';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { PlanningTabBar } from '../components/molecules/PlanningTabBar.js';
import {
  searchAndSort, PLAN_SORTS, PLAN_TAB_PATHS, isSameView, parseSavedViews,
  type PlanSort, type PlanRow, type SavedPlanView, type PlanViewState, type PlanTabKey,
} from '../utils/planningView.js';
import { usePrivateSettings } from '../services/privateSettings.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { KanbanBoard, type BoardItem } from '../components/organisms/KanbanBoard.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { entries as entriesApi } from '../services/api.js';
import { stripHtml, builtinEntryName } from '../utils/stripHtml.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { journalOriginState } from '../utils/topicBreadcrumb.js';
import type { GoalEntry, MilestoneEntryData, TaskEntryData, RoadmapStatus, TaskStatus } from '../types/goals.js';
import {
  ROADMAP_COLUMNS, GOAL_COLUMNS, TASK_COLUMNS, normalizeRoadmapStatus, normalizeMilestoneRoadmapStatus,
  milestoneFieldsForStatus, taskStatusOf, taskFieldsForStatus,
} from '../types/goals.js';
import { hasMixedTopics } from '../utils/mixedTopics.js';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';

/* ── Layout (mirrors Health) ── */

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
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 53px 0 28px; /* room under the title before the tabs */
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

const Body = styled.div`
  padding-top: 8px;
`;

/* Tasks / Todos rows — same room above the list as entry lists elsewhere */
const RowList = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: 16px;
`;

const HeadActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
`;

/* Search the tab you're in — an outlined pill with a search icon */
const SearchBox = styled.label<{ $wide?: boolean }>`
  display: ${({ $wide }) => ($wide ? 'flex' : 'inline-flex')};
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  color: var(--text-tertiary);
  &:focus-within { border-color: var(--color-accent); }
  input {
    width: ${({ $wide }) => ($wide ? 'auto' : '180px')};
    flex: ${({ $wide }) => ($wide ? 1 : 'none')};
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
    &::placeholder { color: var(--text-disabled); }
  }
`;

/* Phones/tablets: search, sort, filters and saved views fold into one
   "Filters" button (with a count of what's set) that opens a panel */
const FiltersToggle = styled.button<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px 0 12px;
  border: 1px solid ${({ $open }) => ($open ? 'var(--border-strong)' : 'var(--border-default)')};
  border-radius: 999px;
  background: ${({ $open }) => ($open ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const CountBadge = styled.span`
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--on-accent, #ffffff);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
`;

const FilterPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 6px);
  & > div { padding-top: 0; }
`;

/* Sort the tab you're in — a native select dressed as an outlined pill */
const SortBox = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 38px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  color: var(--text-tertiary);
  &:focus-within { border-color: var(--color-accent); }
  & > span { position: absolute; left: 12px; pointer-events: none; }
  select {
    height: 100%;
    padding: 0 16px 0 38px;
    border: none;
    outline: none;
    background: transparent;
    appearance: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
    cursor: pointer;
  }
`;

/* Tasks / Todos filters: Goal, Milestone, Status pills + Clear, above the board/list */
const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-top: 16px;
`;

const FilterSelect = styled.label<{ $set: boolean }>`
  display: inline-flex;
  align-items: center;
  height: 34px;
  max-width: 100%;
  /* Chosen = accent outline + accent text, no fill */
  border: 1px solid ${({ $set }) => ($set ? 'var(--color-accent-line)' : 'var(--border-default)')};
  background: transparent;
  border-radius: 999px;
  &:focus-within { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  select {
    height: 100%;
    max-width: 260px;
    padding: 0 14px;
    border: none;
    outline: none;
    background: transparent;
    appearance: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: ${({ $set }) => ($set ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
    text-overflow: ellipsis;
    cursor: pointer;
  }
  /* The open menu keeps normal colours */
  option { color: var(--text-primary); background: var(--bg-surface); }
`;

/* Name a new saved view in place (no pop-up prompts) */
const SaveForm = styled.form`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  input {
    height: 34px;
    width: 180px;
    padding: 0 14px;
    border: 1px solid var(--color-accent);
    border-radius: 999px;
    background: transparent;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
    &::placeholder { color: var(--text-disabled); }
  }
`;

/* Pushes Save / Delete to the end of the row */
const RowEnd = styled.span`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const ClearBtn = styled.button`
  padding: 0 4px;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-tertiary);
  cursor: pointer;
  &:hover { color: var(--text-primary); text-decoration: underline; }
`;

const NoMatch = styled.p`
  margin: 24px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-disabled);
`;

/* List | Board switch — two icon buttons in one outlined pill */
const ViewSwitch = styled.div`
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
`;

const ViewBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-tertiary)')};
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

type PlanTab = 'goals' | 'milestones' | 'tasks' | 'todos';
type PlanView = 'board' | 'list';
const VIEW_KEY = 'planning-view-v1';

function readViews(): Partial<Record<PlanTab, PlanView>> {
  try { return JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') as Partial<Record<PlanTab, PlanView>>; }
  catch { return {}; }
}

/** "Jul 2" from a YYYY-MM-DD date, '' when unset/invalid */
function shortDate(d: unknown): string {
  if (typeof d !== 'string' || !d) return '';
  const date = new Date(`${d.slice(0, 10)}T12:00:00`);
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'var(--color-danger)' },
  high: { label: 'High', color: 'var(--mood-1)' },
  medium: { label: 'Medium', color: 'var(--chart-amber)' },
  low: { label: 'Low', color: 'var(--chart-blue)' },
};

/** An entry's picture for a board avatar: the featured image (else the first), as its thumbnail */
function avatarImage(meta: Record<string, unknown> | undefined): BoardItem['image'] {
  const imgs = Array.isArray(meta?._images) ? meta._images as { key: string; iv: string; thumbKey?: string; thumbIv?: string; mimeType: string }[] : [];
  const img = imgs.find(i => i.key === meta?._featuredKey) ?? imgs[0];
  if (!img) return undefined;
  return img.thumbKey && img.thumbIv
    ? { key: img.thumbKey, iv: img.thumbIv, mimeType: img.mimeType }
    : { key: img.key, iv: img.iv, mimeType: img.mimeType };
}

/* Planning's sort and Tasks/Todos filters survive leaving the page (this tab only) */
const FILTERS_KEY = 'planning-filters-v1';
function savedFilters(): Partial<{ sortBy: PlanSort; goalFilter: number | null; milestoneFilter: number | null; statusFilter: TaskStatus | '' }> {
  try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY) || '{}'); } catch { return {}; }
}

export function GoalsView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const setShowMobileEditor = useUIStore(s => s.setShowMobileEditor);
  const navigate = useNavigate();
  const location = useLocation();
  const { encryptPost } = useEncryption();

  const tabFromPath = location.pathname.endsWith('/milestones') ? 'milestones' as const
    : location.pathname.endsWith('/tasks') ? 'tasks' as const
    : location.pathname.endsWith('/todos') ? 'todos' as const : 'goals' as const;
  const [tab, setTab] = useState<PlanTab>(tabFromPath);

  useEffect(() => {
    setTab(tabFromPath);
  }, [tabFromPath]);

  // Resolve topic IDs
  const goalTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'goal')?.id, [allTopics]);
  const milestoneTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'milestone')?.id, [allTopics]);
  const taskTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'task')?.id, [allTopics]);

  // Parse entries into typed data
  const goals: GoalEntry[] = useMemo(() => {
    if (!goalTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === goalTopicId)
      .map(e => {
        const meta = e.metadata as Record<string, unknown>;
        const cf = meta?._customFields as Record<string, unknown> || {};
        const imgs = Array.isArray(meta?._images) ? meta._images as { key: string; iv: string; mimeType: string }[] : [];
        const featKey = typeof meta?._featuredKey === 'string' ? meta._featuredKey : null;
        const featuredImage = featKey ? imgs.find(i => i.key === featKey) ?? null : null;
        const objective = typeof cf.goalObjective === 'string' ? cf.goalObjective.trim() : '';
        return { id: e.id, content: e.content,
          title: stripHtml(e.content).trim().slice(0, 120) || objective || 'Untitled goal',
          goalType: (cf.goalType as string) || 'short_term', goalStatus: (cf.goalStatus as string) || 'active',
          targetDate: (cf.targetDate as string) || '', customFields: cf, taxonomyId: goalTopicId,
          createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
          featuredImage };
      });
  }, [entries, goalTopicId]);

  const milestones: MilestoneEntryData[] = useMemo(() => {
    if (!milestoneTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === milestoneTopicId)
      .map(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
        return { id: e.id, content: e.content, title: stripHtml(e.content).slice(0, 120) || 'Untitled milestone',
          milestoneStatus: (cf.milestoneStatus as string) || 'not_started', isCompleted: !!cf.isCompleted,
          targetDate: (cf.targetDate as string) || '', parentGoalId: (cf.parentGoalId as number) || null,
          customFields: cf, taxonomyId: milestoneTopicId,
          createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt) };
      });
  }, [entries, milestoneTopicId]);

  const tasks: TaskEntryData[] = useMemo(() => {
    if (!taskTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === taskTopicId)
      .map(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
        return { id: e.id, content: e.content, title: stripHtml(e.content).slice(0, 80) || 'Untitled task',
          isCompleted: !!cf.isCompleted,
          parentGoalId: (cf.parentGoalId as number) || null,
          parentMilestoneId: (cf.parentMilestoneId as number) || null,
          priority: (cf.priority as string) || 'none', customFields: cf, taxonomyId: taskTopicId,
          createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt) };
      });
  }, [entries, taskTopicId]);

  // Todos have no parent goal or milestone connection
  const todos = useMemo(() => tasks.filter(t => !t.parentMilestoneId && !t.parentGoalId), [tasks]);
  // The Tasks tab only shows tasks attached to a goal or milestone (the rest are Todos)
  const linkedTasks = useMemo(() => tasks.filter(t => t.parentMilestoneId || t.parentGoalId), [tasks]);
  // Topic labels only when a list spans more than one topic
  const tasksMixed = useMemo(() => hasMixedTopics(linkedTasks.map(t => t.taxonomyId)), [linkedTasks]);
  const todosMixed = useMemo(() => hasMixedTopics(todos.map(t => t.taxonomyId)), [todos]);

  const goalTitles = useMemo(() => new Map(goals.map(g => [g.id, g.title])), [goals]);

  /* Board order, set by dragging a card up or down in its column and kept as
     the master-key-encrypted setting `planningOrder` (ids per tab, top first).
     It is the "Newest" order: cards never placed yet (new ones) sit on top,
     newest first, then the ones you've arranged, in your order. */
  const [planOrder, savePlanOrder] = useEncryptedSetting<PlanOrder>('planningOrder', NO_PLAN_ORDER);

  // Sorted lists
  const filteredGoals = useMemo(() =>
    inPlanOrder([...goals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), planOrder.goals),
  [goals, planOrder.goals]);

  const filteredMilestones = useMemo(() =>
    inPlanOrder([...milestones].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), planOrder.milestones),
  [milestones, planOrder.milestones]);

  // Shared persist helper
  const persistEntry = useCallback(async (id: number, content: string, taxonomyId: number, customFields: Record<string, unknown>) => {
    const metadata: Record<string, unknown> = { _taxonomyId: taxonomyId, _customFields: customFields };
    updateDecryptedEntry(id, { metadata });
    const encrypted = await encryptPost(content, metadata);
    await entriesApi.update(id, {
      contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      taxonomyIds: [taxonomyId],
    });
  }, [encryptPost, updateDecryptedEntry]);

  // When a milestone's completion changes, roll its parent goal's status up:
  // all milestones done → goal completed; any reopened → goal in_progress.
  const syncParentGoal = useCallback(async (parentGoalId: number | null) => {
    if (!parentGoalId || !goalTopicId || !milestoneTopicId) return;
    const freshEntries = useEntriesStore.getState().decryptedEntries;
    const parentEntry = freshEntries.find(e => e.id === parentGoalId);
    if (!parentEntry) return;
    const parentCf = (parentEntry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
    const parentStatus = (parentCf.goalStatus as string) || 'active';

    const siblingMilestones = freshEntries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === milestoneTopicId)
      .filter(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
        return cf.parentGoalId === parentGoalId;
      });

    const allCompleted = siblingMilestones.length > 0 && siblingMilestones.every(e => {
      const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
      return !!cf.isCompleted;
    });
    const anyIncomplete = siblingMilestones.some(e => {
      const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
      return !cf.isCompleted;
    });

    if (allCompleted && parentStatus !== 'completed') {
      await persistEntry(parentEntry.id, parentEntry.content, goalTopicId, { ...parentCf, goalStatus: 'completed' });
    } else if (anyIncomplete && parentStatus === 'completed') {
      await persistEntry(parentEntry.id, parentEntry.content, goalTopicId, { ...parentCf, goalStatus: 'in_progress' });
    }
  }, [persistEntry, goalTopicId, milestoneTopicId]);

  // A milestone's tasks all done → milestone completed; any reopened → in progress
  const syncParentMilestone = useCallback(async (milestoneId: number | null) => {
    if (!milestoneId || !milestoneTopicId || !taskTopicId) return;
    const fresh = useEntriesStore.getState().decryptedEntries;
    const parentEntry = fresh.find(e => e.id === milestoneId);
    if (!parentEntry) return;
    const parentCf = (parentEntry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
    const siblings = fresh
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === taskTopicId)
      .map(e => (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {})
      .filter(cf => cf.parentMilestoneId === milestoneId);
    const allDone = siblings.length > 0 && siblings.every(cf => !!cf.isCompleted);
    const anyUndone = siblings.some(cf => !cf.isCompleted);
    if (allDone && !parentCf.isCompleted) {
      await persistEntry(parentEntry.id, parentEntry.content, milestoneTopicId, { ...parentCf, milestoneStatus: 'completed', isCompleted: true });
      await syncParentGoal((parentCf.parentGoalId as number) || null);
    } else if (anyUndone && parentCf.isCompleted) {
      await persistEntry(parentEntry.id, parentEntry.content, milestoneTopicId, { ...parentCf, milestoneStatus: 'in_progress', isCompleted: false });
      await syncParentGoal((parentCf.parentGoalId as number) || null);
    }
  }, [persistEntry, syncParentGoal, milestoneTopicId, taskTopicId]);

  // Local display order — synced from the sorted lists, reordered by drag
  const [orderedGoals, setOrderedGoals] = useState<GoalEntry[]>([]);
  const [orderedMilestones, setOrderedMilestones] = useState<MilestoneEntryData[]>([]);
  useEffect(() => { setOrderedGoals(filteredGoals); }, [filteredGoals]);
  useEffect(() => { setOrderedMilestones(filteredMilestones); }, [filteredMilestones]);

  const sortedTasks = useMemo(() => inPlanOrder([...linkedTasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), planOrder.tasks), [linkedTasks, planOrder.tasks]);
  const sortedTodos = useMemo(() => inPlanOrder([...todos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), planOrder.todos), [todos, planOrder.todos]);

  /* ── Status changes (board drag) ── */

  const persistGoalStatus = useCallback(async (id: number, status: RoadmapStatus) => {
    const g = orderedGoals.find(x => x.id === id);
    if (!g || normalizeRoadmapStatus(g.goalStatus) === status) return;
    setOrderedGoals(prev => prev.map(x => x.id === id ? { ...x, goalStatus: status } : x));
    try { await persistEntry(g.id, g.content, g.taxonomyId, { ...g.customFields, goalStatus: status }); }
    catch (err) { console.error('Failed to update goal status:', err); }
  }, [orderedGoals, persistEntry]);

  const persistMilestoneStatus = useCallback(async (id: number, status: RoadmapStatus) => {
    const m = orderedMilestones.find(x => x.id === id);
    if (!m || normalizeMilestoneRoadmapStatus(m.milestoneStatus, m.isCompleted) === status) return;
    const fields = milestoneFieldsForStatus(status);
    setOrderedMilestones(prev => prev.map(x => x.id === id ? { ...x, ...fields } : x));
    try {
      await persistEntry(m.id, m.content, m.taxonomyId, { ...m.customFields, ...fields });
      await syncParentGoal(m.parentGoalId);
    } catch (err) { console.error('Failed to update milestone status:', err); }
  }, [orderedMilestones, persistEntry, syncParentGoal]);

  const persistTaskStatus = useCallback(async (id: number, status: TaskStatus) => {
    const t = tasks.find(x => x.id === id);
    if (!t || taskStatusOf(t.customFields) === status) return;
    try {
      await persistEntry(t.id, t.content, t.taxonomyId, { ...t.customFields, ...taskFieldsForStatus(status) });
      await syncParentMilestone(t.parentMilestoneId);
    } catch (err) { console.error('Failed to update task status:', err); }
  }, [tasks, persistEntry, syncParentMilestone]);

  // A card dropped on another in its column: move it to that card's place in
  // the tab's whole board order (filters only hide cards) and save it
  const reorder = (kind: PlanTabKey, list: { id: number }[]) => (id: number, overId: number) => {
    const ids = list.map(x => x.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    void savePlanOrder({ ...planOrder, [kind]: arrayMove(ids, from, to) }).catch(err => console.error('Failed to save board order:', err));
  };

  const handleDeleteEntry = useCallback(async (id: number) => {
    try { await deleteEntryWithImages(id); }
    catch (err) { console.error('Failed to delete entry:', err); }
  }, []);

  // Everything opens in the standard journal editor (not inline)
  const openInJournal = useCallback((id: number) => {
    setSelectedEntryId(id);
    setShowMobileEditor(true);
    navigate('/journal', { state: journalOriginState(location.pathname, location.search) });
  }, [setSelectedEntryId, setShowMobileEditor, navigate, location.pathname, location.search]);

  const newEntry = useNewEntryInJournal();
  const activeAddTopic = tab === 'goals' ? allTopics.find(t => t.id === goalTopicId)
    : tab === 'milestones' ? allTopics.find(t => t.id === milestoneTopicId)
    : allTopics.find(t => t.id === taskTopicId);
  const addLabel = tab === 'goals' ? 'New Goal'
    : tab === 'milestones' ? 'New Milestone'
    : tab === 'todos' ? 'New Todo' : 'New Task';

  /* ── List | Board, remembered per tab ── */
  const [views, setViews] = useState(readViews);
  const view: PlanView = views[tab] ?? 'board';
  const setView = (v: PlanView) => {
    const next = { ...views, [tab]: v };
    setViews(next);
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  /* ── Search + sort, for the tab you're in ── */
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<PlanSort>(() => savedFilters().sortBy ?? 'newest');
  // A saved view opened on another tab is applied once that tab is showing
  const pendingView = useRef<SavedPlanView | null>(null);

  /* ── Tasks / Todos filters: by goal, milestone and/or status ── */
  const [goalFilter, setGoalFilter] = useState<number | null>(() => savedFilters().goalFilter ?? null);
  const [milestoneFilter, setMilestoneFilter] = useState<number | null>(() => savedFilters().milestoneFilter ?? null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>(() => savedFilters().statusFilter ?? '');
  // Kept for this browser tab, so opening a card in the journal and coming
  // back finds the board as it was
  useEffect(() => {
    try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ sortBy, goalFilter, milestoneFilter, statusFilter })); } catch { /* storage unavailable */ }
  }, [sortBy, goalFilter, milestoneFilter, statusFilter]);
  const milestoneGoal = useMemo(() => new Map(milestones.map(m => [m.id, m.parentGoalId])), [milestones]);
  // Milestones to pick from: those under the chosen goal, else all
  const milestoneChoices = useMemo(
    () => (goalFilter ? milestones.filter(m => m.parentGoalId === goalFilter) : milestones),
    [milestones, goalFilter],
  );
  const pickGoal = (id: number | null) => {
    setGoalFilter(id);
    // A milestone under another goal no longer fits
    if (id && milestoneFilter && milestoneGoal.get(milestoneFilter) !== id) setMilestoneFilter(null);
  };
  // New tasks started from a filtered board join the chosen milestone / goal
  const filterLink: Record<string, unknown> = milestoneFilter
    ? { parentMilestoneId: milestoneFilter, parentGoalId: milestoneGoal.get(milestoneFilter) ?? goalFilter ?? null }
    : goalFilter ? { parentGoalId: goalFilter } : {};
  const clearFilters = () => { setGoalFilter(null); setMilestoneFilter(null); setStatusFilter(''); };
  const filtersSet = (tab === 'tasks' && (!!goalFilter || !!milestoneFilter)) || !!statusFilter;
  const taskPasses = (t: TaskEntryData) => {
    if (statusFilter && taskStatusOf(t.customFields) !== statusFilter) return false;
    if (tab !== 'tasks') return true; // todos have no goal or milestone
    if (milestoneFilter && t.parentMilestoneId !== milestoneFilter) return false;
    if (goalFilter) {
      const goalOf = t.parentGoalId ?? (t.parentMilestoneId ? milestoneGoal.get(t.parentMilestoneId) ?? null : null);
      if (goalOf !== goalFilter) return false;
    }
    return true;
  };
  const isTaskTab = tab === 'tasks' || tab === 'todos';
  const compact = useMediaQuery('(max-width: 768px)');
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const p = pendingView.current;
    if (p && p.tab === tab) { pendingView.current = null; applyView(p); }
    else setQuery('');
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortOptions = PLAN_SORTS.filter(o => o.value !== 'priority' || isTaskTab);
  const sort: PlanSort = sortOptions.some(o => o.value === sortBy) ? sortBy : 'newest';
  /* ── Saved views (encrypted private setting `planningViews`) ── */
  const { savePrivateSetting, loadPrivateSettings } = usePrivateSettings();
  const [savedViews, setSavedViews] = useState<SavedPlanView[]>([]);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    loadPrivateSettings().then(map => setSavedViews(parseSavedViews(map.planningViews))).catch(() => {});
  }, [loadPrivateSettings]);
  const persistViews = (next: SavedPlanView[]) => {
    setSavedViews(next);
    savePrivateSetting('planningViews', next).catch(() => {});
  };

  const current: PlanViewState = {
    tab, view, query: query.trim(), sort,
    goalId: tab === 'tasks' ? goalFilter : null,
    milestoneId: tab === 'tasks' ? milestoneFilter : null,
    status: isTaskTab ? statusFilter : '',
  };
  // How much is set — shown on the phone "Filters" button
  const activeCount = (current.query ? 1 : 0) + (sort !== 'newest' ? 1 : 0)
    + (current.goalId ? 1 : 0) + (current.milestoneId ? 1 : 0) + (current.status ? 1 : 0);
  const showTaskFilters = isTaskTab && (tab === 'tasks' ? linkedTasks.length > 0 : todos.length > 0);
  const activeSaved = savedViews.find(v => isSameView(v, current)) ?? null;
  const hasSetup = !!current.query || sort !== 'newest' || !!current.goalId || !!current.milestoneId || !!current.status;

  const applyView = (v: SavedPlanView) => {
    setQuery(v.query);
    setSortBy(v.sort);
    setGoalFilter(v.goalId);
    setMilestoneFilter(v.milestoneId);
    setStatusFilter(v.status);
    const nextViews = { ...views, [v.tab]: v.view };
    setViews(nextViews);
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(nextViews)); } catch { /* storage unavailable */ }
  };
  const openSaved = (id: string) => {
    const v = savedViews.find(x => x.id === id);
    if (!v) return;
    setNaming(false); setConfirmDelete(false);
    if (v.tab === tab) applyView(v);
    else { pendingView.current = v; navigate(PLAN_TAB_PATHS[v.tab]); }
  };
  const saveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const others = savedViews.filter(v => v.name.toLowerCase() !== name.toLowerCase()); // same name = replace
    persistViews([...others, { id: crypto.randomUUID(), name, ...current }]);
    setNaming(false); setNewName('');
  };
  const deleteActive = () => {
    if (!activeSaved) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    persistViews(savedViews.filter(v => v.id !== activeSaved.id));
    setConfirmDelete(false);
  };

  // Dragging to reorder only makes sense in the board's own order (filters
  // just hide cards, so they don't stop it)
  const refined = !!query.trim() || sort !== 'newest';

  /* ── Board cards ── */
  const milestoneTitles = useMemo(() => new Map(milestones.map(m => [m.id, m.title])), [milestones]);

  const goalItem = (g: GoalEntry): BoardItem => {
    const ms = milestones.filter(m => m.parentGoalId === g.id);
    return {
      id: g.id, title: g.title,
      image: avatarImage(entries.find(e => e.id === g.id)?.metadata as Record<string, unknown> | undefined),
      date: shortDate(g.targetDate),
      progress: ms.length ? { done: ms.filter(m => m.isCompleted).length, total: ms.length } : undefined,
      completed: normalizeRoadmapStatus(g.goalStatus) === 'completed',
    };
  };

  const milestoneItem = (m: MilestoneEntryData): BoardItem => {
    const ts = tasks.filter(t => t.parentMilestoneId === m.id);
    const goal = m.parentGoalId ? goalTitles.get(m.parentGoalId) : undefined;
    return {
      id: m.id, title: m.title,
      kicker: goal,
      date: shortDate(m.targetDate),
      progress: ts.length ? { done: ts.filter(t => t.isCompleted).length, total: ts.length } : undefined,
      completed: m.isCompleted,
    };
  };

  const taskItem = (t: TaskEntryData): BoardItem => {
    const parent = t.parentMilestoneId ? milestoneTitles.get(t.parentMilestoneId)
      : t.parentGoalId ? goalTitles.get(t.parentGoalId) : undefined;
    const entry = entries.find(e => e.id === t.id);
    const title = (entry && stripHtml(entry.content).trim()) || builtinEntryName(t.customFields) || t.title;
    return {
      id: t.id, title: title.slice(0, 140),
      badge: PRIORITY_BADGE[t.priority],
      detail: parent,
      date: shortDate(t.customFields.deadline),
      completed: t.isCompleted,
    };
  };

  const goalRow = (g: GoalEntry): PlanRow => ({
    title: g.title, text: g.title, due: g.targetDate, priority: '', created: g.createdAt.getTime(),
  });
  const milestoneRow = (m: MilestoneEntryData): PlanRow => ({
    title: m.title, text: `${m.title} ${m.parentGoalId ? goalTitles.get(m.parentGoalId) ?? '' : ''}`,
    due: m.targetDate, priority: '', created: m.createdAt.getTime(),
  });
  const taskRow = (t: TaskEntryData): PlanRow => {
    const item = taskItem(t);
    return {
      title: item.title, text: `${item.title} ${item.detail ?? ''} ${item.badge?.label ?? ''}`,
      due: typeof t.customFields.deadline === 'string' ? t.customFields.deadline : '',
      priority: t.priority, created: t.createdAt.getTime(),
    };
  };

  const shownGoals = searchAndSort(orderedGoals, goalRow, query, sort);
  const shownMilestones = searchAndSort(orderedMilestones, milestoneRow, query, sort);
  const shownTasks = searchAndSort(sortedTasks.filter(taskPasses), taskRow, query, sort);
  const shownTodos = searchAndSort(sortedTodos.filter(taskPasses), taskRow, query, sort);
  const shownCount = tab === 'goals' ? shownGoals.length : tab === 'milestones' ? shownMilestones.length
    : tab === 'tasks' ? shownTasks.length : shownTodos.length;

  const goalColumns = GOAL_COLUMNS.map(c => ({
    ...c, items: shownGoals.filter(g => normalizeRoadmapStatus(g.goalStatus) === c.key).map(goalItem),
  }));
  const milestoneColumns = ROADMAP_COLUMNS.map(c => ({
    ...c, items: shownMilestones.filter(m => normalizeMilestoneRoadmapStatus(m.milestoneStatus, m.isCompleted) === c.key).map(milestoneItem),
  }));
  // A status filter shows just that column
  const taskColumns = (list: TaskEntryData[]) => TASK_COLUMNS
    .filter(c => !statusFilter || c.key === statusFilter)
    .map(c => ({ ...c, items: list.filter(t => taskStatusOf(t.customFields) === c.key).map(taskItem) }));

  /* ── List rows (same rows as every other list) ── */
  const renderRows = (items: { id: number; taxonomyId: number; isCompleted?: boolean }[], mixed: boolean) => (
    <RowList>{items.map((t, i) => {
      const entry = entries.find(e => e.id === t.id);
      if (!entry) return null;
      const topic = allTopics.find(tp => tp.id === t.taxonomyId);
      return (
        <SwipeActions key={t.id} accentColor={accentColor} onDelete={() => handleDeleteEntry(t.id)}>
          <EntryListCard
            // First-row top rule only when filters sit between it and the tabs
            // (straight under the tab bar its hairline would double up)
            hint={i === 0 && (compact ? filtersOpen : showRow)}
            content={entry.content}
            createdAt={entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt)}
            topicName={mixed ? topic?.name : undefined}
            topicColor={topic?.color || accentColor}
            completed={!!t.isCompleted}
            fallbackTitle={builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)}
            onClick={() => openInJournal(t.id)}
          />
        </SwipeActions>
      );
    })}</RowList>
  );

  if (needsUnlock) {
    return (<><ContentTemplate><EmptyState message="Unlock your journal to view goals" /></ContentTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  }
  if (isLoading || !isReady) {
    return (<ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>);
  }

  const addIn = (fields: Record<string, unknown>) => () => { if (activeAddTopic) newEntry(activeAddTopic.id, fields); };

  const searchEl = (
    <SearchBox $wide={compact}>
      <MaterialIcon $size={18} aria-hidden="true">search</MaterialIcon>
      <input type="search" value={query} onChange={e => setQuery(e.target.value)}
        placeholder={`Search ${tab}`} aria-label={`Search ${tab}`} />
    </SearchBox>
  );
  const sortEl = (
    <SortBox>
      <MaterialIcon $size={18} aria-hidden="true">sort</MaterialIcon>
      <select value={sort} onChange={e => setSortBy(e.target.value as PlanSort)} aria-label="Sort">
        {sortOptions.map(o => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
      </select>
    </SortBox>
  );
  const showRow = savedViews.length > 0 || hasSetup || naming || showTaskFilters;
  const rowContent = (<>
              {savedViews.length > 0 && (
                <FilterSelect $set={!!activeSaved}>
                  <select aria-label="Saved views" value={activeSaved?.id ?? ''} onChange={e => e.target.value && openSaved(e.target.value)}>
                    <option value="">Saved views</option>
                    {savedViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </FilterSelect>
              )}
              {showTaskFilters && (<>
              {tab === 'tasks' && (
                <>
                  <FilterSelect $set={!!goalFilter}>
                    <select aria-label="Goal" value={goalFilter ?? ''} onChange={e => pickGoal(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Goal: All</option>
                      {goals.map(g => <option key={g.id} value={g.id}>Goal: {g.title}</option>)}
                    </select>
                  </FilterSelect>
                  <FilterSelect $set={!!milestoneFilter}>
                    <select aria-label="Milestone" value={milestoneFilter ?? ''} onChange={e => setMilestoneFilter(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Milestone: All</option>
                      {milestoneChoices.map(m => <option key={m.id} value={m.id}>Milestone: {m.title}</option>)}
                    </select>
                  </FilterSelect>
                </>
              )}
              <FilterSelect $set={!!statusFilter}>
                <select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as TaskStatus | '')}>
                  <option value="">Status: All</option>
                  {TASK_COLUMNS.map(c => <option key={c.key} value={c.key}>Status: {c.label}</option>)}
                </select>
              </FilterSelect>
              {filtersSet && <ClearBtn type="button" onClick={clearFilters}>Clear</ClearBtn>}
              </>)}
              <RowEnd>
                {naming ? (
                  <SaveForm onSubmit={saveCurrent}>
                    <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="Name this view" aria-label="Saved view name" maxLength={60} />
                    <ClearBtn type="submit" disabled={!newName.trim()}>Save</ClearBtn>
                    <ClearBtn type="button" onClick={() => { setNaming(false); setNewName(''); }}>Cancel</ClearBtn>
                  </SaveForm>
                ) : activeSaved ? (
                  <ClearBtn type="button" onClick={deleteActive} onBlur={() => setConfirmDelete(false)}>
                    {confirmDelete ? `Delete “${activeSaved.name}”?` : 'Delete view'}
                  </ClearBtn>
                ) : hasSetup ? (
                  <ClearBtn type="button" onClick={() => { setNaming(true); setConfirmDelete(false); }}>Save view</ClearBtn>
                ) : null}
              </RowEnd>
</>);

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Planning</Title>
            <HeadActions>
              {compact ? (
                <FiltersToggle type="button" $open={filtersOpen} aria-expanded={filtersOpen} aria-controls="planning-filters"
                  onClick={() => setFiltersOpen(o => !o)}>
                  <MaterialIcon $size={18} aria-hidden="true">tune</MaterialIcon>
                  Filters
                  {activeCount > 0 && <CountBadge aria-label={`${activeCount} set`}>{activeCount}</CountBadge>}
                </FiltersToggle>
              ) : (<>{searchEl}{sortEl}</>)}
              <ViewSwitch role="group" aria-label="View">
                <ViewBtn type="button" $active={view === 'list'} aria-pressed={view === 'list'} aria-label="List view" title="List" onClick={() => setView('list')}>
                  <MaterialIcon $size={20}>list</MaterialIcon>
                </ViewBtn>
                <ViewBtn type="button" $active={view === 'board'} aria-pressed={view === 'board'} aria-label="Board view" title="Board" onClick={() => setView('board')}>
                  <MaterialIcon $size={20}>view_kanban</MaterialIcon>
                </ViewBtn>
              </ViewSwitch>
              {activeAddTopic && (
                <PillButton type="button" onClick={() => newEntry(activeAddTopic.id)}>
                  {addLabel}
                </PillButton>
              )}
            </HeadActions>
          </Head>

          <TabsRow><PlanningTabBar /></TabsRow>

          {!compact && showRow && <FilterRow role="group" aria-label={`Filter ${tab}`}>{rowContent}</FilterRow>}
          {compact && filtersOpen && (
            <FilterPanel id="planning-filters">
              {searchEl}
              {sortEl}
              {showRow && <FilterRow role="group" aria-label={`Filter ${tab}`}>{rowContent}</FilterRow>}
            </FilterPanel>
          )}

          <Body>
            {(refined || filtersSet) && shownCount === 0 && (view === 'list' || !!query.trim() || filtersSet) && (
              <NoMatch role="status">
                {query.trim() ? <>Nothing in {tab} matches “{query.trim()}”.</> : <>No {tab} match these filters.</>}
              </NoMatch>
            )}
            {tab === 'goals' && (orderedGoals.length === 0
              ? <EmptyState message="No goals found." submessage="Create a journal entry with the Goal topic to get started." />
              : view === 'board'
                ? <KanbanBoard columns={goalColumns} noun="goal" onOpen={openInJournal}
                    onMove={persistGoalStatus} onReorder={refined ? undefined : reorder('goals', orderedGoals)}
                    onAdd={key => addIn({ goalStatus: key })()} />
                : renderRows(shownGoals.map(g => ({ ...g, isCompleted: normalizeRoadmapStatus(g.goalStatus) === 'completed' })), false))}

            {tab === 'milestones' && (orderedMilestones.length === 0
              ? <EmptyState message="No milestones found." submessage="Create a journal entry with the Milestone topic to get started." />
              : view === 'board'
                ? <KanbanBoard columns={milestoneColumns} noun="milestone" onOpen={openInJournal}
                    onMove={persistMilestoneStatus} onReorder={refined ? undefined : reorder('milestones', orderedMilestones)}
                    onAdd={key => addIn(milestoneFieldsForStatus(key))()} />
                : renderRows(shownMilestones, false))}

            {tab === 'tasks' && (linkedTasks.length === 0
              ? <EmptyState message="No tasks found." submessage="Tasks linked to a goal or milestone show here; unlinked ones are Todos." />
              : view === 'board'
                ? <KanbanBoard columns={taskColumns(shownTasks)} noun="task" onOpen={openInJournal}
                    onMove={persistTaskStatus} onReorder={refined ? undefined : reorder('tasks', sortedTasks)}
                    onAdd={key => addIn({ ...taskFieldsForStatus(key), ...filterLink })()} />
                : renderRows(shownTasks, tasksMixed))}

            {tab === 'todos' && (todos.length === 0
              ? <EmptyState message="No todos found." submessage="Create a task without linking it to a milestone or goal." />
              : view === 'board'
                ? <KanbanBoard columns={taskColumns(shownTodos)} noun="todo" onOpen={openInJournal}
                    onMove={persistTaskStatus} onReorder={refined ? undefined : reorder('todos', sortedTodos)}
                    onAdd={key => addIn({ ...taskFieldsForStatus(key) })()} />
                : renderRows(shownTodos, todosMixed))}
          </Body>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}

/* ── Board order ── */

type PlanOrder = Partial<Record<PlanTabKey, number[]>>;
const NO_PLAN_ORDER: PlanOrder = {};

/** Cards not yet placed keep their given order on top; placed ones follow in the saved order */
function inPlanOrder<T extends { id: number }>(list: T[], ids: number[] | undefined): T[] {
  if (!ids?.length) return list;
  const rank = new Map(ids.map((id, i) => [id, i]));
  const unplaced = list.filter(x => !rank.has(x.id));
  const placed = list.filter(x => rank.has(x.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...unplaced, ...placed];
}
