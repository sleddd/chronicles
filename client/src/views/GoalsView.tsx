import { useState, useEffect, useMemo, useCallback } from 'react';
import { PillButton } from '../components/atoms/PillButton.js';
import { useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import styled from 'styled-components';
import { arrayMove } from '@dnd-kit/sortable';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { PlanningTabBar } from '../components/molecules/PlanningTabBar.js';
import { searchAndSort, PLAN_SORTS, type PlanSort, type PlanRow } from '../utils/planningView.js';
import { KanbanBoard, type BoardItem } from '../components/organisms/KanbanBoard.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { entries as entriesApi } from '../services/api.js';
import { stripHtml, builtinEntryName } from '../utils/stripHtml.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { journalOriginState } from '../utils/topicBreadcrumb.js';
import type { GoalEntry, MilestoneEntryData, TaskEntryData, RoadmapStatus, TaskStatus } from '../types/goals.js';
import {
  ROADMAP_COLUMNS, TASK_COLUMNS, normalizeRoadmapStatus, normalizeMilestoneRoadmapStatus,
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
const SearchBox = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  color: var(--text-tertiary);
  &:focus-within { border-color: var(--color-accent); }
  input {
    width: 180px;
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
    &::placeholder { color: var(--text-disabled); }
    @media (max-width: 480px) { width: 120px; }
  }
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
  low: { label: 'Low', color: 'var(--chart-violet)' },
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

  // Sorted lists
  const filteredGoals = useMemo(() =>
    [...goals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  [goals]);

  const filteredMilestones = useMemo(() =>
    [...milestones].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  [milestones]);

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

  const sortedTasks = useMemo(() => [...linkedTasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), [linkedTasks]);
  const sortedTodos = useMemo(() => [...todos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), [todos]);

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

  const reorder = <T extends { id: number }>(set: React.Dispatch<React.SetStateAction<T[]>>) => (id: number, overId: number) =>
    set(prev => {
      const from = prev.findIndex(x => x.id === id);
      const to = prev.findIndex(x => x.id === overId);
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
    });

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
  const [sortBy, setSortBy] = useState<PlanSort>('newest');
  useEffect(() => { setQuery(''); }, [tab]);
  const isTaskTab = tab === 'tasks' || tab === 'todos';
  const sortOptions = PLAN_SORTS.filter(o => o.value !== 'priority' || isTaskTab);
  const sort: PlanSort = sortOptions.some(o => o.value === sortBy) ? sortBy : 'newest';
  // Dragging to reorder only makes sense in the board's own order
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
      badge: goal ? { label: goal, color: 'var(--chart-blue)' } : undefined,
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
  const shownTasks = searchAndSort(sortedTasks, taskRow, query, sort);
  const shownTodos = searchAndSort(sortedTodos, taskRow, query, sort);
  const shownCount = tab === 'goals' ? shownGoals.length : tab === 'milestones' ? shownMilestones.length
    : tab === 'tasks' ? shownTasks.length : shownTodos.length;

  const goalColumns = ROADMAP_COLUMNS.map(c => ({
    ...c, items: shownGoals.filter(g => normalizeRoadmapStatus(g.goalStatus) === c.key).map(goalItem),
  }));
  const milestoneColumns = ROADMAP_COLUMNS.map(c => ({
    ...c, items: shownMilestones.filter(m => normalizeMilestoneRoadmapStatus(m.milestoneStatus, m.isCompleted) === c.key).map(milestoneItem),
  }));
  const taskColumns = (list: TaskEntryData[]) => TASK_COLUMNS.map(c => ({
    ...c, items: list.filter(t => taskStatusOf(t.customFields) === c.key).map(taskItem),
  }));

  /* ── List rows (same rows as every other list) ── */
  const renderRows = (items: { id: number; taxonomyId: number; isCompleted?: boolean }[], mixed: boolean) => (
    <RowList>{items.map((t, i) => {
      const entry = entries.find(e => e.id === t.id);
      if (!entry) return null;
      const topic = allTopics.find(tp => tp.id === t.taxonomyId);
      return (
        <SwipeActions key={t.id} accentColor={accentColor} onEdit={() => openInJournal(t.id)} onDelete={() => handleDeleteEntry(t.id)}>
          <EntryListCard
            hint={i === 0}
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

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Planning</Title>
            <HeadActions>
              <SearchBox>
                <MaterialIcon $size={18} aria-hidden="true">search</MaterialIcon>
                <input type="search" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder={`Search ${tab}`} aria-label={`Search ${tab}`} />
              </SearchBox>
              <SortBox>
                <MaterialIcon $size={18} aria-hidden="true">sort</MaterialIcon>
                <select value={sort} onChange={e => setSortBy(e.target.value as PlanSort)} aria-label="Sort">
                  {sortOptions.map(o => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
                </select>
              </SortBox>
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

          <Body>
            {refined && shownCount === 0 && (view === 'list' || !!query.trim()) && (
              <NoMatch role="status">Nothing in {tab} matches “{query.trim()}”.</NoMatch>
            )}
            {tab === 'goals' && (orderedGoals.length === 0
              ? <EmptyState message="No goals found." submessage="Create a journal entry with the Goal topic to get started." />
              : view === 'board'
                ? <KanbanBoard columns={goalColumns} noun="goal" onOpen={openInJournal}
                    onMove={persistGoalStatus} onReorder={refined ? undefined : reorder(setOrderedGoals)}
                    onAdd={key => addIn({ goalStatus: key })()} />
                : renderRows(shownGoals.map(g => ({ ...g, isCompleted: normalizeRoadmapStatus(g.goalStatus) === 'completed' })), false))}

            {tab === 'milestones' && (orderedMilestones.length === 0
              ? <EmptyState message="No milestones found." submessage="Create a journal entry with the Milestone topic to get started." />
              : view === 'board'
                ? <KanbanBoard columns={milestoneColumns} noun="milestone" onOpen={openInJournal}
                    onMove={persistMilestoneStatus} onReorder={refined ? undefined : reorder(setOrderedMilestones)}
                    onAdd={key => addIn(milestoneFieldsForStatus(key))()} />
                : renderRows(shownMilestones, false))}

            {tab === 'tasks' && (linkedTasks.length === 0
              ? <EmptyState message="No tasks found." submessage="Tasks linked to a goal or milestone show here; unlinked ones are Todos." />
              : view === 'board'
                ? <KanbanBoard columns={taskColumns(shownTasks)} noun="task" onOpen={openInJournal}
                    onMove={persistTaskStatus}
                    onAdd={key => addIn({ isAutoMigrating: true, ...taskFieldsForStatus(key) })()} />
                : renderRows(shownTasks, tasksMixed))}

            {tab === 'todos' && (todos.length === 0
              ? <EmptyState message="No todos found." submessage="Create a task without linking it to a milestone or goal." />
              : view === 'board'
                ? <KanbanBoard columns={taskColumns(shownTodos)} noun="todo" onOpen={openInJournal}
                    onMove={persistTaskStatus}
                    onAdd={key => addIn({ isAutoMigrating: true, ...taskFieldsForStatus(key) })()} />
                : renderRows(shownTodos, todosMixed))}
          </Body>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
