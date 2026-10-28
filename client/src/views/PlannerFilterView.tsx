import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PillButton } from '../components/atoms/PillButton.js';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSlidersH } from '@fortawesome/free-solid-svg-icons';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { PlanningTabBar } from '../components/molecules/PlanningTabBar.js';
import { FormField } from '../components/molecules/FormField.js';
import { TextInput } from '../components/atoms/TextInput.js';
import { Select } from '../components/atoms/Select.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { entries as entriesApi } from '../services/api.js';
import { usePrivateSettings } from '../services/privateSettings.js';
import { stripHtml, builtinEntryName } from '../utils/stripHtml.js';
import type { MilestoneEntryData, TaskEntryData } from '../types/goals.js';
import type { PlannerFilterConfig, SavedPlannerFilter } from '../types/planner.js';
import { EMPTY_PLANNER_FILTER, isFilterEmpty, filtersEqual, encodePlannerFilter, decodePlannerFilter } from '../types/planner.js';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';

/* ── Styled components ── */

/* Unified Planning shell (mirrors GoalsView). */
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

const HeadActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
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

const TabsRow = styled.div`
  margin: 0;
`;

const Body = styled.div`
  padding-top: 8px;
`;

/* ── Filter card (matches the dashboards' bordered collapsible cards) ── */

const FilterCard = styled.section`
  border: 1px solid var(--border-default);
  border-radius: var(--r-lg, 2px);
  padding: 20px 24px;
  margin-top: 8px;
  @media (max-width: 480px) { padding: 16px; }
`;

const CardHead = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const CardToggle = styled.button`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-primary);
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; }
`;

/* Collapsed: what's filtered, beside the title */
const FilterSummary = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
`;

const ChevronBtn = styled.button<{ $open: boolean }>`
  display: inline-flex;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg);
  transition: transform 150ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  padding-top: 16px;
`;

/* A control plus its small actions on one line (select + Delete, name + Save/Cancel) */
const InlineControls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  & > :first-child { flex: 1; min-width: 0; }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

/* Type toggle: the standard pill; selected = accent outline + faint accent fill */
const ChipPill = styled(PillButton)<{ $on: boolean }>`
  min-width: 0;
  padding: 7px 16px;
  background: ${({ $on }) => ($on ? 'var(--color-accent-subtle)' : 'transparent')};
`;

const TextLink = styled.button<{ $danger?: boolean }>`
  flex-shrink: 0;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $danger }) => ($danger ? 'var(--text-tertiary)' : 'var(--color-accent)')};
  &:hover { color: ${({ $danger }) => ($danger ? 'var(--color-danger, #dc3232)' : 'var(--color-accent-hover)')}; }
`;

const CardActions = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
`;

/* ── Results section header ── */

const SectionHeader = styled.div<{ $color: string }>`
  padding: 16px 0 12px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  /* Room above the rows (sitewide entry-list spacing) */
  margin-bottom: 12px;
`;

const ResultCount = styled.span`
  font-weight: 400;
  opacity: 0.6;
  margin-left: 6px;
  font-size: 14px;
`;

const EmptyHint = styled.div`
  padding: 48px 16px;
  text-align: center;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`;

const HintIcon = styled.div`
  font-size: 28px;
  opacity: 0.3;
`;

/* ── Add button dropdown ── */

const AddBtnWrap = styled.div`
  position: relative;
`;

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme }) => theme.colors.textMuted};
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const AddDropdown = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 140px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  z-index: 50;
  overflow: hidden;
`;

const AddDropdownItem = styled.button`
  display: block;
  width: 100%;
  padding: 10px 14px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 14px;
  text-align: left;
  color: ${({ theme }) => theme.colors.text};
  background: none;
  border: none;
  cursor: pointer;
  &:hover { background: rgba(0, 0, 0, 0.04); }
  &:not(:last-child) { border-bottom: 1px solid ${({ theme }) => theme.colors.borderSoft}; }
`;

/* ── Data ── */

const ITEM_TYPES = [
  { value: 'goals' as const, label: 'Goals' },
  { value: 'milestones' as const, label: 'Milestones' },
  { value: 'tasks' as const, label: 'Tasks' },
  { value: 'todos' as const, label: 'Todos' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Any Status' },
  { value: 'active', label: 'Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'not_completed', label: 'Not Completed' },
  { value: 'completed', label: 'Completed' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'Any Priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

export function PlannerFilterView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const openInJournal = useOpenInJournal();
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;
  const { encryptPost } = useEncryption();
  const { savePrivateSetting, loadPrivateSettings } = usePrivateSettings();

  // pending = what the user is editing; applied = what actually drives results.
  // The applied filter lives in the URL (?f=…) so it's still there after
  // opening a result in the journal and coming back (or reloading).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilter = decodePlannerFilter(searchParams.get('f'));
  const [pending, setPending] = useState<PlannerFilterConfig>(() => urlFilter ?? EMPTY_PLANNER_FILTER);
  const [filter, setFilterState] = useState<PlannerFilterConfig>(() => urlFilter ?? EMPTY_PLANNER_FILTER);
  const setFilter = (f: PlannerFilterConfig) => {
    setFilterState(f);
    setSearchParams(isFilterEmpty(f) ? {} : { f: encodePlannerFilter(f) }, { replace: true });
  };
  const [savedFilters, setSavedFilters] = useState<SavedPlannerFilter[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');
  // Coming back with a filter applied: show the results, panel folded away
  const [panelOpen, setPanelOpen] = useState(() => !urlFilter || isFilterEmpty(urlFilter));

  // Add new item state
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const newEntry = useNewEntryInJournal();
  const addDropdownRef = useRef<HTMLDivElement>(null);

  // Close add dropdown on outside click
  useEffect(() => {
    if (!addDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setAddDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [addDropdownOpen]);

  // Load saved filters
  useEffect(() => {
    loadPrivateSettings()
      .then(map => {
        if (Array.isArray(map.plannerFilters)) setSavedFilters(map.plannerFilters as SavedPlannerFilter[]);
      })
      .catch(() => {});
  }, [loadPrivateSettings]);

  const persistSaved = useCallback(async (filters: SavedPlannerFilter[]) => {
    setSavedFilters(filters);
    await savePrivateSetting('plannerFilters', filters).catch(() => {});
  }, [savePrivateSetting]);

  // Resolve topic IDs
  const goalTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'goal')?.id, [allTopics]);
  const milestoneTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'milestone')?.id, [allTopics]);
  const taskTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'task')?.id, [allTopics]);

  // Parse all planner items
  const goals = useMemo(() => {
    if (!goalTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === goalTopicId)
      .map(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
        return { id: e.id, content: e.content, title: stripHtml(e.content).slice(0, 120) || 'Untitled goal',
          goalType: (cf.goalType as string) || 'short_term', goalStatus: (cf.goalStatus as string) || 'active',
          targetDate: (cf.targetDate as string) || '', customFields: cf, taxonomyId: goalTopicId,
          createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt) };
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

  const goalOptions = useMemo(() => goals.map(g => ({ id: g.id, title: g.title })), [goals]);
  const milestoneOptions = useMemo(() => milestones.map(m => ({ id: m.id, title: m.title, parentGoalId: m.parentGoalId })), [milestones]);

  // Milestone IDs under selected goal (for cross-hierarchy task filtering — uses applied filter)
  const milestoneIdsUnderGoal = useMemo(() => {
    if (!filter.parentGoalId) return null;
    return new Set(milestones.filter(m => m.parentGoalId === filter.parentGoalId).map(m => m.id));
  }, [milestones, filter.parentGoalId]);

  // Visible milestone options in the dropdown — responsive to pending goal selection
  const visibleMilestoneOptions = useMemo(() => {
    if (!pending.parentGoalId) return milestoneOptions;
    return milestoneOptions.filter(m => m.parentGoalId === pending.parentGoalId);
  }, [milestoneOptions, pending.parentGoalId]);

  // Cross-hierarchy filter results
  const results = useMemo(() => {
    if (isFilterEmpty(filter)) return null;

    const { keyword, itemTypes, goalStatus, taskStatus, priority, parentGoalId, parentMilestoneId } = filter;
    const kw = keyword.trim().toLowerCase();
    const showAll = itemTypes.length === 0;

    const matchGoalStatus = (status: string) => {
      if (goalStatus === 'all') return true;
      if (goalStatus === 'completed') return status === 'completed';
      if (goalStatus === 'not_completed') return status !== 'completed';
      if (goalStatus === 'active') return status === 'active' || status === 'not_started' || status === '';
      if (goalStatus === 'not_started') return status === 'not_started' || status === '';
      if (goalStatus === 'in_progress') return status === 'in_progress';
      return true;
    };

    const matchTaskStatus = (completed: boolean, inProgress: boolean, inReview = false) => {
      if (taskStatus === 'all') return true;
      if (taskStatus === 'completed') return completed;
      if (taskStatus === 'not_completed') return !completed;
      if (taskStatus === 'in_progress') return !completed && inProgress;
      if (taskStatus === 'not_started') return !completed && !inProgress && !inReview;
      return true;
    };

    const matchPriority = (p: string) => priority === 'all' || p === priority;
    const matchKeyword = (text: string) => !kw || stripHtml(text).toLowerCase().includes(kw);

    const goalResults: typeof goals = [];
    const milestoneResults: MilestoneEntryData[] = [];
    const taskResults: TaskEntryData[] = [];
    const todoResults: TaskEntryData[] = [];

    if (showAll || itemTypes.includes('goals')) {
      goals.forEach(g => {
        if (!matchKeyword(g.content)) return;
        if (!matchGoalStatus(g.goalStatus)) return;
        goalResults.push(g);
      });
    }

    if (showAll || itemTypes.includes('milestones')) {
      milestones.forEach(m => {
        if (!matchKeyword(m.content)) return;
        if (!matchGoalStatus(m.milestoneStatus)) return;
        if (parentGoalId && m.parentGoalId !== parentGoalId) return;
        milestoneResults.push(m);
      });
    }

    if (showAll || itemTypes.includes('tasks') || itemTypes.includes('todos')) {
      tasks.forEach(t => {
        // A todo has no goal or milestone connection at all
        const isTodo = !t.parentMilestoneId && !t.parentGoalId;
        const wantTasks = showAll || itemTypes.includes('tasks');
        const wantTodos = showAll || itemTypes.includes('todos');
        if (isTodo && !wantTodos) return;
        if (!isTodo && !wantTasks) return;
        if (!matchKeyword(t.content)) return;
        if (!matchTaskStatus(t.isCompleted, !!(t.customFields as Record<string,unknown>).isInProgress, !!(t.customFields as Record<string,unknown>).isInReview)) return;
        if (!matchPriority(t.priority)) return;
        if (parentMilestoneId && t.parentMilestoneId !== parentMilestoneId) return;
        if (parentGoalId && !parentMilestoneId) {
          // Match tasks directly linked to the goal OR linked via one of the goal's milestones
          const linkedDirectly = t.parentGoalId === parentGoalId;
          const linkedViaMilestone = milestoneIdsUnderGoal ? milestoneIdsUnderGoal.has(t.parentMilestoneId as number) : false;
          if (!linkedDirectly && !linkedViaMilestone) return;
        }
        if (isTodo) todoResults.push(t);
        else taskResults.push(t);
      });
    }

    return { goalResults, milestoneResults, taskResults, todoResults };
  }, [filter, goals, milestones, tasks, milestoneIdsUnderGoal]);

  const totalCount = results
    ? results.goalResults.length + results.milestoneResults.length + results.taskResults.length + results.todoResults.length
    : 0;


  const handleDeleteEntry = useCallback(async (id: number) => {
    try {
      await deleteEntryWithImages(id);
    } catch (err) { console.error('Failed to delete entry:', err); }
  }, []);

  // Unified result row — click or swipe-edit opens the entry in the journal editor.
  // The first row rendered (across all sections) carries the "rows open" hint.
  let hinted = false;
  const renderResultCard = (id: number, taxonomyId: number, completed: boolean) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return null;
    const hint = !hinted;
    hinted = true;
    const topic = allTopics.find(tp => tp.id === taxonomyId);
    return (
      <SwipeActions key={id} accentColor={accentColor} onDelete={() => handleDeleteEntry(id)}>
        <EntryListCard
          content={entry.content}
          createdAt={entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt)}
          topicName={topic?.name}
          completed={completed}
          hint={hint}
          fallbackTitle={builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)}
          onClick={() => openInJournal(id)}
        />
      </SwipeActions>
    );
  };

  const hasPendingChanges = !filtersEqual(pending, filter);
  const isApplied = !isFilterEmpty(filter);

  const filterSummary = useMemo(() => {
    if (isFilterEmpty(filter)) return '';
    const parts: string[] = [];
    if (filter.itemTypes.length > 0) parts.push(filter.itemTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', '));
    if (filter.keyword.trim()) parts.push(`"${filter.keyword.trim()}"`);
    if (filter.parentGoalId) {
      const g = goalOptions.find(g => g.id === filter.parentGoalId);
      if (g) parts.push(`Goal: ${g.title.slice(0, 30)}`);
    }
    if (filter.goalStatus !== 'all') parts.push(filter.goalStatus.replace('_', ' '));
    if (filter.priority !== 'all') parts.push(filter.priority);
    return parts.join(' · ');
  }, [filter, goalOptions]);

  // Filter helpers — all operate on pending; Apply commits to filter
  const toggleType = (type: PlannerFilterConfig['itemTypes'][number]) => {
    const next = pending.itemTypes.includes(type)
      ? pending.itemTypes.filter(t => t !== type)
      : [...pending.itemTypes, type];
    setPending(f => ({ ...f, itemTypes: next }));
    setActiveSavedId(null);
  };

  const updateFilter = (patch: Partial<PlannerFilterConfig>) => {
    setPending(f => ({ ...f, ...patch }));
    setActiveSavedId(null);
  };

  const handleApply = () => {
    setFilter({ ...pending });
    setPanelOpen(false);
  };

  const handleApplySaved = (sf: SavedPlannerFilter) => {
    setPending(sf.config);
    setActiveSavedId(sf.id);
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    const sf: SavedPlannerFilter = { id: `${Date.now()}`, name: saveName.trim(), config: { ...pending } };
    persistSaved([...savedFilters, sf]);
    setActiveSavedId(sf.id);
    setSaveName('');
    setShowSaveInput(false);
  };

  const handleDeleteSaved = (id: string) => {
    persistSaved(savedFilters.filter(f => f.id !== id));
    if (activeSavedId === id) setActiveSavedId(null);
  };

  const handleClear = () => {
    setPending(EMPTY_PLANNER_FILTER);
    setFilter(EMPTY_PLANNER_FILTER);
    setActiveSavedId(null);
    setPanelOpen(true);
  };

  if (needsUnlock) {
    return (<><ContentTemplate><EmptyState message="Unlock your journal to use planner filters" /></ContentTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  }
  if (isLoading || !isReady) {
    return (<ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>);
  }

  const goalTopic = allTopics.find(t => t.name.toLowerCase() === 'goal');
  const milestoneTopic = allTopics.find(t => t.name.toLowerCase() === 'milestone');
  const taskTopic = allTopics.find(t => t.name.toLowerCase() === 'task');

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Planning</Title>
            <HeadActions>
            <AddBtnWrap ref={addDropdownRef}>
              <PillButton type="button" onClick={() => setAddDropdownOpen(o => !o)} aria-expanded={addDropdownOpen}>
                New
              </PillButton>
              {addDropdownOpen && (
                <AddDropdown>
                  {goalTopic && (
                    <AddDropdownItem onClick={() => { setAddDropdownOpen(false); if (goalTopic) newEntry(goalTopic.id); }}>
                      Goal
                    </AddDropdownItem>
                  )}
                  {milestoneTopic && (
                    <AddDropdownItem onClick={() => { setAddDropdownOpen(false); if (milestoneTopic) newEntry(milestoneTopic.id); }}>
                      Milestone
                    </AddDropdownItem>
                  )}
                  {taskTopic && (
                    <AddDropdownItem onClick={() => { setAddDropdownOpen(false); if (taskTopic) newEntry(taskTopic.id); }}>
                      Task / Todo
                    </AddDropdownItem>
                  )}
                </AddDropdown>
              )}
            </AddBtnWrap>
            </HeadActions>
          </Head>

          <TabsRow><PlanningTabBar /></TabsRow>

          <Body>

      {/* Filter panel — a bordered card like the dashboards; one column of
          standard field rows (filled boxes), pill toggles and pill actions */}
      <FilterCard>
        <CardHead>
          <CardToggle type="button" onClick={() => setPanelOpen(o => !o)} aria-expanded={panelOpen}>
            Filters
            {!panelOpen && filterSummary && <FilterSummary>{filterSummary}</FilterSummary>}
          </CardToggle>
          {isApplied && <TextLink type="button" onClick={handleClear}>Clear</TextLink>}
          <ChevronBtn type="button" onClick={() => setPanelOpen(o => !o)} tabIndex={-1} aria-hidden="true" $open={panelOpen}>
            <Icon name="chevron-down" size={18} strokeWidth={1.8} />
          </ChevronBtn>
        </CardHead>

        {panelOpen && (
          <CardBody>
            {savedFilters.length > 0 && (
              <FormField label="Saved filter">
                <InlineControls>
                  <Select
                    value={activeSavedId ?? ''}
                    onChange={e => {
                      const sf = savedFilters.find(f => f.id === e.target.value);
                      if (sf) handleApplySaved(sf);
                      else { setPending(EMPTY_PLANNER_FILTER); setFilter(EMPTY_PLANNER_FILTER); setActiveSavedId(null); }
                    }}
                  >
                    <option value="">None</option>
                    {savedFilters.map(sf => <option key={sf.id} value={sf.id}>{sf.name}</option>)}
                  </Select>
                  {activeSavedId !== null && (
                    <TextLink type="button" $danger onClick={() => handleDeleteSaved(activeSavedId)}>Delete</TextLink>
                  )}
                </InlineControls>
              </FormField>
            )}

            <FormField label="Keyword">
              <TextInput
                type="text"
                placeholder="Search goals, milestones, tasks and todos"
                value={pending.keyword}
                onChange={e => updateFilter({ keyword: e.target.value })}
              />
            </FormField>

            <FormField label="Show">
              <Chips>
                {ITEM_TYPES.map(({ value, label }) => {
                  const on = pending.itemTypes.includes(value);
                  return (
                    <ChipPill key={value} type="button" $variant={on ? 'accent' : 'neutral'} $on={on}
                      aria-pressed={on} onClick={() => toggleType(value)}>
                      {label}
                    </ChipPill>
                  );
                })}
              </Chips>
            </FormField>

            <FormField label="Status">
              <Select value={pending.goalStatus} onChange={e => updateFilter({ goalStatus: e.target.value, taskStatus: e.target.value })}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </FormField>

            <FormField label="Priority">
              <Select value={pending.priority} onChange={e => updateFilter({ priority: e.target.value })}>
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </FormField>

            <FormField label="Goal">
              <Select
                value={pending.parentGoalId ?? ''}
                onChange={e => updateFilter({ parentGoalId: e.target.value ? Number(e.target.value) : null, parentMilestoneId: null })}
              >
                <option value="">Any goal</option>
                {goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </Select>
            </FormField>

            <FormField label="Milestone">
              <Select
                value={pending.parentMilestoneId ?? ''}
                onChange={e => updateFilter({ parentMilestoneId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Any milestone</option>
                {visibleMilestoneOptions.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </Select>
            </FormField>

            {showSaveInput ? (
              <FormField label="Name">
                <InlineControls>
                  <TextInput
                    autoFocus
                    placeholder="Name this filter"
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSave();
                      if (e.key === 'Escape') { setShowSaveInput(false); setSaveName(''); }
                    }}
                  />
                  <PillButton type="button" onClick={handleSave}>Save</PillButton>
                  <PillButton type="button" $variant="neutral" onClick={() => { setShowSaveInput(false); setSaveName(''); }}>Cancel</PillButton>
                </InlineControls>
              </FormField>
            ) : (
              <CardActions>
                <PillButton type="button" $variant="neutral" onClick={() => setShowSaveInput(true)} disabled={isFilterEmpty(pending)}>
                  Save filter
                </PillButton>
                <PillButton type="button" onClick={handleApply} disabled={isFilterEmpty(pending)}>
                  Apply filter
                </PillButton>
              </CardActions>
            )}
          </CardBody>
        )}
      </FilterCard>

      {/* Results */}
      <div>
        {isFilterEmpty(filter) ? (
          <EmptyHint>
            <HintIcon><FontAwesomeIcon icon={faSlidersH} /></HintIcon>
            Set filter criteria above to find goals, milestones, tasks, and todos.
            <br />Save a named filter to reuse it anytime.
          </EmptyHint>
        ) : totalCount === 0 ? (
          <EmptyState message="No items match this filter." submessage="Try adjusting the criteria." />
        ) : (
          <>
            {results && results.goalResults.length > 0 && (
              <>
                <SectionHeader $color={accentColor}>
                  Goals <ResultCount>({results.goalResults.length})</ResultCount>
                </SectionHeader>
                {results.goalResults.map(g => renderResultCard(g.id, g.taxonomyId, g.goalStatus === 'completed'))}
              </>
            )}

            {results && results.milestoneResults.length > 0 && (
              <>
                <SectionHeader $color={accentColor}>
                  Milestones <ResultCount>({results.milestoneResults.length})</ResultCount>
                </SectionHeader>
                {results.milestoneResults.map(m => renderResultCard(m.id, m.taxonomyId, m.isCompleted))}
              </>
            )}

            {results && results.taskResults.length > 0 && (
              <>
                <SectionHeader $color={accentColor}>
                  Tasks <ResultCount>({results.taskResults.length})</ResultCount>
                </SectionHeader>
                {results.taskResults.map(t => renderResultCard(t.id, t.taxonomyId, t.isCompleted))}
              </>
            )}

            {results && results.todoResults.length > 0 && (
              <>
                <SectionHeader $color={accentColor}>
                  Todos <ResultCount>({results.todoResults.length})</ResultCount>
                </SectionHeader>
                {results.todoResults.map(t => renderResultCard(t.id, t.taxonomyId, t.isCompleted))}
              </>
            )}
          </>
        )}
      </div>
          </Body>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
