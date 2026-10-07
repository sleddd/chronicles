import { useState, useEffect, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { PlanningTabBar } from '../components/molecules/PlanningTabBar.js';
import { GoalCard } from '../components/organisms/GoalCard.js';
import { MilestoneCard } from '../components/organisms/MilestoneCard.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { EntryTableHead } from '../components/molecules/EntryTable.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { NewEntryCard } from '../components/organisms/NewEntryCard.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { entries as entriesApi } from '../services/api.js';
import { stripHtml, builtinEntryName } from '../utils/stripHtml.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { journalOriginState } from '../utils/topicBreadcrumb.js';
import type { GoalEntry, MilestoneEntryData, TaskEntryData, RoadmapStatus } from '../types/goals.js';
import { ROADMAP_COLUMNS, normalizeRoadmapStatus, normalizeMilestoneRoadmapStatus, milestoneFieldsForStatus } from '../types/goals.js';
import { useDroppable } from '@dnd-kit/core';

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

const NewBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 9px 4px;
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 120ms ease;
  &:hover { opacity: 0.7; }
`;

const TabsRow = styled.div`
  margin: 0;
`;

const Body = styled.div`
  padding-top: 8px;
`;

/* ── Roadmap (Kanban) board ── */
const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
  padding-top: 20px;
  @media (min-width: 901px) { margin-left: -10px; }
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;

const Column = styled.div<{ $over?: boolean }>`
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: ${({ $over }) => $over ? 'var(--bg-hover)' : 'var(--bg-sunken)'};
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px;
  min-height: 120px;
  transition: background 120ms ease;
`;

const ColumnHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 10px;
`;

const ColumnTitle = styled.span`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
`;

const ColumnCount = styled.span`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  min-width: 18px;
  text-align: center;
`;

const ColumnBody = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 40px;
`;

const ColumnEmpty = styled.div`
  font-family: var(--font-sans);
  font-size: 12px;
  font-style: italic;
  color: var(--text-tertiary);
  padding: 12px 8px;
  text-align: center;
`;

/* A single droppable roadmap column. Children are the sortable goal cards. */
function RoadmapColumn({ status, label, count, children }: {
  status: RoadmapStatus; label: string; count: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <Column ref={setNodeRef} $over={isOver}>
      <ColumnHead>
        <ColumnTitle>{label}</ColumnTitle>
        <ColumnCount>{count}</ColumnCount>
      </ColumnHead>
      <ColumnBody>{children}</ColumnBody>
    </Column>
  );
}

export function GoalsView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const removeEntry = useEntriesStore(s => s.removeEntry);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const setShowMobileEditor = useUIStore(s => s.setShowMobileEditor);
  const navigate = useNavigate();
  const location = useLocation();
  const { encryptPost } = useEncryption();

  const tabFromPath = location.pathname.endsWith('/milestones') ? 'milestones' as const
    : location.pathname.endsWith('/tasks') ? 'tasks' as const
    : location.pathname.endsWith('/todos') ? 'todos' as const : 'goals' as const;
  const [tab, setTab] = useState<'goals' | 'milestones' | 'tasks' | 'todos'>(tabFromPath);

  useEffect(() => {
    setTab(tabFromPath);
  }, [tabFromPath]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  const goalOptions = useMemo(() => goals.map(g => ({ id: g.id, title: g.title })), [goals]);
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

  const handleToggleMilestone = useCallback(async (m: MilestoneEntryData) => {
    let newStatus: string, newCompleted: boolean;
    if (!m.isCompleted && m.milestoneStatus !== 'active') { newStatus = 'active'; newCompleted = false; }
    else if (!m.isCompleted) { newStatus = 'completed'; newCompleted = true; }
    else { newStatus = 'not_started'; newCompleted = false; }
    try {
      await persistEntry(m.id, m.content, m.taxonomyId, { ...m.customFields, milestoneStatus: newStatus, isCompleted: newCompleted });
      await syncParentGoal(m.parentGoalId);
    }
    catch (err) { console.error('Failed to toggle milestone:', err); }
  }, [persistEntry, goalTopicId, milestoneTopicId]);

  const handleUnlinkMilestone = useCallback(async (m: MilestoneEntryData) => {
    try { await persistEntry(m.id, m.content, m.taxonomyId, { ...m.customFields, parentGoalId: null }); }
    catch (err) { console.error('Failed to unlink milestone:', err); }
  }, [persistEntry]);

  const handleToggleTask = useCallback(async (t: TaskEntryData) => {
    const newCompleted = !t.isCompleted;
    try {
      await persistEntry(t.id, t.content, t.taxonomyId, { ...t.customFields, isCompleted: newCompleted });

      // Auto-complete parent milestone when all tasks are done
      // Read fresh from store to avoid stale closure
      if (t.parentMilestoneId && milestoneTopicId && taskTopicId) {
        const freshEntries = useEntriesStore.getState().decryptedEntries;

        const parentEntry = freshEntries.find(e => e.id === t.parentMilestoneId);
        if (parentEntry) {
          const parentCf = (parentEntry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
          const parentIsCompleted = !!parentCf.isCompleted;

          const siblingTasks = freshEntries
            .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === taskTopicId)
            .filter(e => {
              const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
              return cf.parentMilestoneId === t.parentMilestoneId;
            });

          const allDone = siblingTasks.length > 0 && siblingTasks.every(e => {
            const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
            return !!cf.isCompleted;
          });

          const anyUndone = siblingTasks.some(e => {
            const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
            return !cf.isCompleted;
          });

          if (allDone && !parentIsCompleted) {
            await persistEntry(parentEntry.id, parentEntry.content, milestoneTopicId,
              { ...parentCf, milestoneStatus: 'completed', isCompleted: true });
          } else if (anyUndone && parentIsCompleted) {
            await persistEntry(parentEntry.id, parentEntry.content, milestoneTopicId,
              { ...parentCf, milestoneStatus: 'in_progress', isCompleted: false });
          }
        }
      }
    }
    catch (err) { console.error('Failed to toggle task:', err); }
  }, [persistEntry, milestoneTopicId, taskTopicId]);

  const handleUnlinkTask = useCallback(async (t: TaskEntryData) => {
    try { await persistEntry(t.id, t.content, t.taxonomyId, { ...t.customFields, parentMilestoneId: null }); }
    catch (err) { console.error('Failed to unlink task:', err); }
  }, [persistEntry]);

  const handleCreateTask = useCallback(async (milestoneId: number, title: string) => {
    if (!taskTopicId) return;
    const content = `<p>${title}</p>`;
    const customFields = { isCompleted: false, isInProgress: false, isAutoMigrating: true, parentMilestoneId: milestoneId };
    const metadata: Record<string, unknown> = { _taxonomyId: taskTopicId, _customFields: customFields };
    const encrypted = await encryptPost(content, metadata);
    const result = await entriesApi.create({
      contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      isEncrypted: true, taxonomyIds: [taskTopicId],
    });
    addDecryptedEntry({
      id: result.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(result.createdAt as string), updatedAt: new Date((result.updatedAt || result.createdAt) as string),
    });
  }, [taskTopicId, encryptPost, addDecryptedEntry]);

  const handleLinkMilestone = useCallback(async (goalId: number, milestoneId: number) => {
    const m = milestones.find(ms => ms.id === milestoneId);
    if (!m) return;
    await persistEntry(m.id, m.content, m.taxonomyId, { ...m.customFields, parentGoalId: goalId });
  }, [milestones, persistEntry]);

  const handleLinkTask = useCallback(async (milestoneId: number, taskId: number) => {
    const t = tasks.find(ts => ts.id === taskId);
    if (!t) return;
    if (!taskTopicId) return;
    await persistEntry(t.id, t.content, t.taxonomyId, { ...t.customFields, parentMilestoneId: milestoneId });
  }, [tasks, taskTopicId, persistEntry]);

  const handleCreateMilestone = useCallback(async (goalId: number, title: string) => {
    if (!milestoneTopicId) return;
    const content = `<p>${title}</p>`;
    const customFields = { milestoneStatus: 'not_started', isCompleted: false, targetDate: '', parentGoalId: goalId };
    const metadata: Record<string, unknown> = { _taxonomyId: milestoneTopicId, _customFields: customFields };
    const encrypted = await encryptPost(content, metadata);
    const result = await entriesApi.create({
      contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      isEncrypted: true, taxonomyIds: [milestoneTopicId],
    });
    addDecryptedEntry({
      id: result.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(result.createdAt as string), updatedAt: new Date((result.updatedAt || result.createdAt) as string),
    });
  }, [milestoneTopicId, encryptPost, addDecryptedEntry]);

  // Local display order — synced from filtered lists, reordered by drag
  const [orderedGoals, setOrderedGoals] = useState<typeof filteredGoals>([]);
  const [orderedMilestones, setOrderedMilestones] = useState<typeof filteredMilestones>([]);

  useEffect(() => { setOrderedGoals(filteredGoals); }, [filteredGoals]);
  useEffect(() => { setOrderedMilestones(filteredMilestones); }, [filteredMilestones]);

  // Group goals into roadmap columns by normalized status.
  const goalsByStatus = useMemo(() => {
    const map: Record<RoadmapStatus, GoalEntry[]> = { new: [], planned: [], in_progress: [], completed: [] };
    for (const g of orderedGoals) map[normalizeRoadmapStatus(g.goalStatus)].push(g);
    return map;
  }, [orderedGoals]);

  // Persist a goal's new roadmap status (used by drag-drop and the card control).
  const persistGoalStatus = useCallback(async (g: GoalEntry, status: RoadmapStatus) => {
    if (normalizeRoadmapStatus(g.goalStatus) === status) return;
    // Optimistic local reflow
    setOrderedGoals(prev => prev.map(x => x.id === g.id ? { ...x, goalStatus: status } : x));
    try {
      await persistEntry(g.id, g.content, g.taxonomyId, { ...g.customFields, goalStatus: status });
    } catch (err) { console.error('Failed to update goal status:', err); }
  }, [persistEntry]);

  // Board drag: dropping onto a column (or a card within it) sets the goal's status.
  const handleGoalDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = Number(active.id);
    const goal = orderedGoals.find(g => g.id === activeId);
    if (!goal) return;

    // The droppable target is either a column ("col:<status>") or another card (its id).
    const overId = String(over.id);
    let targetStatus: RoadmapStatus | null = null;
    if (overId.startsWith('col:')) {
      targetStatus = overId.slice(4) as RoadmapStatus;
    } else {
      const overGoal = orderedGoals.find(g => g.id === Number(over.id));
      if (overGoal) targetStatus = normalizeRoadmapStatus(overGoal.goalStatus);
    }
    if (!targetStatus) return;

    if (normalizeRoadmapStatus(goal.goalStatus) !== targetStatus) {
      persistGoalStatus(goal, targetStatus);
    } else if (over.id !== active.id) {
      // Reorder within the same column
      setOrderedGoals(prev => {
        const oldIndex = prev.findIndex(g => g.id === activeId);
        const newIndex = prev.findIndex(g => g.id === Number(over.id));
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, [orderedGoals, persistGoalStatus]);

  // Group milestones into roadmap columns by normalized status.
  const milestonesByStatus = useMemo(() => {
    const map: Record<RoadmapStatus, MilestoneEntryData[]> = { new: [], planned: [], in_progress: [], completed: [] };
    for (const m of orderedMilestones) map[normalizeMilestoneRoadmapStatus(m.milestoneStatus, m.isCompleted)].push(m);
    return map;
  }, [orderedMilestones]);

  // Persist a milestone's new roadmap status (drag-drop), then roll up to parent goal.
  const persistMilestoneStatus = useCallback(async (m: MilestoneEntryData, status: RoadmapStatus) => {
    if (normalizeMilestoneRoadmapStatus(m.milestoneStatus, m.isCompleted) === status) return;
    const fields = milestoneFieldsForStatus(status);
    setOrderedMilestones(prev => prev.map(x => x.id === m.id ? { ...x, ...fields } : x));
    try {
      await persistEntry(m.id, m.content, m.taxonomyId, { ...m.customFields, ...fields });
      await syncParentGoal(m.parentGoalId);
    } catch (err) { console.error('Failed to update milestone status:', err); }
  }, [persistEntry, syncParentGoal]);

  const handleMilestoneDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = Number(active.id);
    const m = orderedMilestones.find(x => x.id === activeId);
    if (!m) return;

    const overId = String(over.id);
    let targetStatus: RoadmapStatus | null = null;
    if (overId.startsWith('col:')) {
      targetStatus = overId.slice(4) as RoadmapStatus;
    } else {
      const overM = orderedMilestones.find(x => x.id === Number(over.id));
      if (overM) targetStatus = normalizeMilestoneRoadmapStatus(overM.milestoneStatus, overM.isCompleted);
    }
    if (!targetStatus) return;

    if (normalizeMilestoneRoadmapStatus(m.milestoneStatus, m.isCompleted) !== targetStatus) {
      persistMilestoneStatus(m, targetStatus);
    } else if (over.id !== active.id) {
      setOrderedMilestones(prev => {
        const oldIndex = prev.findIndex(x => x.id === activeId);
        const newIndex = prev.findIndex(x => x.id === Number(over.id));
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, [orderedMilestones, persistMilestoneStatus]);

  const handleDeleteEntry = useCallback(async (id: number) => {
    try {
      await deleteEntryWithImages(id);
    } catch (err) { console.error('Failed to delete entry:', err); }
  }, []);

  // Goals & milestones open in the standard journal editor (not inline). The
  // editor shows a "Planning" link back to this board.
  const openInJournal = useCallback((id: number) => {
    setSelectedEntryId(id);
    setShowMobileEditor(true);
    navigate('/journal', { state: journalOriginState(location.pathname, location.search) });
  }, [setSelectedEntryId, setShowMobileEditor, navigate, location.pathname, location.search]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const activeAddTopic = tab === 'goals' ? allTopics.find(t => t.id === goalTopicId)
    : tab === 'milestones' ? allTopics.find(t => t.id === milestoneTopicId)
    : allTopics.find(t => t.id === taskTopicId);
  const addLabel = tab === 'goals' ? 'New Goal'
    : tab === 'milestones' ? 'New Milestone'
    : tab === 'todos' ? 'New Todo' : 'New Task';

  if (needsUnlock) {
    return (<><ContentTemplate><EmptyState message="Unlock your journal to view goals" /></ContentTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  }
  if (isLoading || !isReady) {
    return (<ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>);
  }

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Planning</Title>
            {activeAddTopic && (
              <NewBtn onClick={() => setIsAddOpen(true)}>
                <MaterialIcon $size={16} aria-hidden="true">add</MaterialIcon>
                {addLabel}
              </NewBtn>
            )}
          </Head>

          <TabsRow><PlanningTabBar /></TabsRow>

          <Body>
        {activeAddTopic && (
          <NewEntryCard
            topic={activeAddTopic}
            accentColor={accentColor}
            hideButton
            isOpen={isAddOpen}
            onOpenChange={setIsAddOpen}
          />
        )}

        {tab === 'goals' && (orderedGoals.length === 0
          ? <EmptyState message="No goals found." submessage="Create a journal entry with the Goal topic to get started." />
          : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGoalDragEnd}>
              <Board>
                {ROADMAP_COLUMNS.map(({ key, label }) => {
                  const colGoals = goalsByStatus[key];
                  return (
                    <RoadmapColumn key={key} status={key} label={label} count={colGoals.length}>
                      <SortableContext items={colGoals.map(g => g.id)} strategy={verticalListSortingStrategy}>
                        {colGoals.length === 0
                          ? <ColumnEmpty>Drop goals here</ColumnEmpty>
                          : colGoals.map(g => (
                              <GoalCard key={g.id} goal={g} milestones={milestones} accentColor={accentColor}
                                isEditing={false} onSelect={() => openInJournal(g.id)}
                                onClose={() => {}} onSaved={() => {}}
                                onToggleMilestone={handleToggleMilestone} onUnlinkMilestone={handleUnlinkMilestone}
                                onLinkMilestone={handleLinkMilestone}
                                onCreateMilestone={handleCreateMilestone}
                                roadmapStatus={normalizeRoadmapStatus(g.goalStatus)} />
                            ))}
                      </SortableContext>
                    </RoadmapColumn>
                  );
                })}
              </Board>
            </DndContext>
        )}

        {tab === 'milestones' && (orderedMilestones.length === 0
          ? <EmptyState message="No milestones found." submessage="Create a journal entry with the Milestone topic to get started." />
          : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMilestoneDragEnd}>
              <Board>
                {ROADMAP_COLUMNS.map(({ key, label }) => {
                  const colMilestones = milestonesByStatus[key];
                  return (
                    <RoadmapColumn key={key} status={key} label={label} count={colMilestones.length}>
                      <SortableContext items={colMilestones.map(m => m.id)} strategy={verticalListSortingStrategy}>
                        {colMilestones.length === 0
                          ? <ColumnEmpty>Drop milestones here</ColumnEmpty>
                          : colMilestones.map(m => (
                              <MilestoneCard key={m.id} milestone={m} tasks={tasks}
                                goalTitle={m.parentGoalId ? (goalTitles.get(m.parentGoalId) || null) : null}
                                goalOptions={goalOptions} accentColor={accentColor}
                                isEditing={false} onSelect={() => openInJournal(m.id)}
                                onClose={() => {}} onSaved={() => {}}
                                onToggleTask={handleToggleTask} onUnlinkTask={handleUnlinkTask}
                                onCreateTask={handleCreateTask}
                                onLinkTask={handleLinkTask} />
                            ))}
                      </SortableContext>
                    </RoadmapColumn>
                  );
                })}
              </Board>
            </DndContext>
        )}

        {tab === 'tasks' && (tasks.length === 0
            ? <EmptyState message="No tasks found." submessage="Create a journal entry with the Task topic to get started." />
            : <><EntryTableHead />{[...tasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(t => {
                const entry = entries.find(e => e.id === t.id);
                if (!entry) return null;
                const topic = allTopics.find(tp => tp.id === t.taxonomyId);
                return (
                  <SwipeActions key={t.id} accentColor={accentColor} onEdit={() => openInJournal(t.id)} onDelete={() => handleDeleteEntry(t.id)}>
                    <EntryListCard
                      content={entry.content}
                      createdAt={entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt)}
                      topicName={topic?.name}
                      topicColor={topic?.color || accentColor}
                      completed={t.isCompleted}
                      fallbackTitle={builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)}
                      onClick={() => openInJournal(t.id)}
                    />
                  </SwipeActions>
                );
              })}</>
        )}

        {tab === 'todos' && (todos.length === 0
            ? <EmptyState message="No todos found." submessage="Create a task without linking it to a milestone or goal." />
            : <><EntryTableHead />{[...todos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(t => {
                const entry = entries.find(e => e.id === t.id);
                if (!entry) return null;
                const topic = allTopics.find(tp => tp.id === t.taxonomyId);
                return (
                  <SwipeActions key={t.id} accentColor={accentColor} onEdit={() => openInJournal(t.id)} onDelete={() => handleDeleteEntry(t.id)}>
                    <EntryListCard
                      content={entry.content}
                      createdAt={entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt)}
                      topicName={topic?.name}
                      topicColor={topic?.color || accentColor}
                      completed={t.isCompleted}
                      fallbackTitle={builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)}
                      onClick={() => openInJournal(t.id)}
                    />
                  </SwipeActions>
                );
              })}</>
        )}
          </Body>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
