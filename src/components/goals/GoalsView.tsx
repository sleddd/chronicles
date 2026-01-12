'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { GoalCard } from './GoalCard';
import { MilestoneCard } from './MilestoneCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  MeasuringStrategy,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface MilestoneEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
}

interface TaskEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
}

interface Goal {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
  milestoneIds: string[];
  milestones?: MilestoneEntry[];
}

interface Milestone {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
  goalIds: string[];
  taskIds: string[];
  tasks: TaskEntry[];
  linkedGoals: Array<{ id: string; title: string }>;
}

interface DecryptedGoalFields {
  type?: 'short_term' | 'long_term';
  status?: 'active' | 'completed' | 'archived';
  priority?: number;
}

interface DecryptedMilestoneFields {
  isCompleted?: boolean;
  hasStatus?: boolean; // true if isCompleted field exists (In Progress or Completed), false if no status (Not Started)
}

type MainTab = 'goals' | 'milestones';
type GoalFilter = 'active' | 'short_term' | 'long_term' | 'completed' | 'all';
type MilestoneFilter = 'not_started' | 'in_progress' | 'completed' | 'all';

export function GoalsView() {
  const [mainTab, setMainTab] = useState<MainTab>('goals');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalFilter, setGoalFilter] = useState<GoalFilter>('active');
  const [milestoneFilter, setMilestoneFilter] = useState<MilestoneFilter>('in_progress');
  const [decryptedGoalFields, setDecryptedGoalFields] = useState<Map<string, DecryptedGoalFields>>(new Map());
  const [decryptedMilestoneFields, setDecryptedMilestoneFields] = useState<Map<string, DecryptedMilestoneFields>>(new Map());
  const [decryptedGoalTitles, setDecryptedGoalTitles] = useState<Map<string, string>>(new Map());
  const { decryptData, encryptData, isKeyReady } = useEncryption();
  const { accentColor } = useAccentColor();

  const {
    getEntriesByType,
    getEntry: getCachedEntry,
    updateEntry,
    isInitialized: isCacheInitialized,
  } = useEntriesCache();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Decrypt goal titles for milestone linking
  const decryptGoalTitlesFunc = useCallback(async () => {
    if (!isKeyReady || goals.length === 0) return;

    const titlesMap = new Map<string, string>();
    for (const goal of goals) {
      try {
        const content = await decryptData(goal.encryptedContent, goal.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();
        titlesMap.set(goal.id, plainText.split('\n')[0] || 'Untitled Goal');
      } catch {
        titlesMap.set(goal.id, 'Untitled Goal');
      }
    }
    setDecryptedGoalTitles(titlesMap);
  }, [goals, decryptData, isKeyReady]);

  // Load goals from cache
  const loadGoalsFromCache = useCallback(() => {
    if (!isCacheInitialized) return;

    const cachedGoals = getEntriesByType('goal');
    const goalsWithMilestones: Goal[] = [];

    for (const goal of cachedGoals) {
      const goalMilestones: MilestoneEntry[] = [];
      if (goal.milestoneIds) {
        for (const milestoneId of goal.milestoneIds) {
          const milestone = getCachedEntry(milestoneId);
          if (milestone) {
            goalMilestones.push({
              id: milestone.id,
              encryptedContent: milestone.encryptedContent,
              iv: milestone.iv,
              custom_fields: milestone.custom_fields,
            });
          }
        }
      }

      goalsWithMilestones.push({
        id: goal.id,
        encryptedContent: goal.encryptedContent,
        iv: goal.iv,
        custom_fields: goal.custom_fields,
        milestoneIds: goal.milestoneIds || [],
        milestones: goalMilestones,
      });
    }

    setGoals(goalsWithMilestones);
  }, [isCacheInitialized, getEntriesByType, getCachedEntry]);

  // Load milestones from cache
  const loadMilestonesFromCache = useCallback(() => {
    if (!isCacheInitialized) return;

    const cachedMilestones = getEntriesByType('milestone');
    const cachedTasks = getEntriesByType('task');
    const milestonesWithData: Milestone[] = [];

    for (const milestone of cachedMilestones) {
      // Get tasks linked to this milestone
      const linkedTasks: TaskEntry[] = [];
      for (const task of cachedTasks) {
        if (task.milestoneIds?.includes(milestone.id)) {
          linkedTasks.push({
            id: task.id,
            encryptedContent: task.encryptedContent,
            iv: task.iv,
            custom_fields: task.custom_fields,
          });
        }
      }

      // Get linked goals - we'll populate titles later after decryption
      const linkedGoals: Array<{ id: string; title: string }> = [];
      if (milestone.goalIds) {
        for (const goalId of milestone.goalIds) {
          linkedGoals.push({ id: goalId, title: '' }); // Title will be filled in after decryption
        }
      }

      milestonesWithData.push({
        id: milestone.id,
        encryptedContent: milestone.encryptedContent,
        iv: milestone.iv,
        custom_fields: milestone.custom_fields,
        goalIds: milestone.goalIds || [],
        taskIds: linkedTasks.map(t => t.id),
        tasks: linkedTasks,
        linkedGoals,
      });
    }

    setMilestones(milestonesWithData);
  }, [isCacheInitialized, getEntriesByType]);

  // Update milestone linked goal titles when decrypted titles are available
  useEffect(() => {
    if (decryptedGoalTitles.size === 0 || milestones.length === 0) return;

    setMilestones(prev => prev.map(m => ({
      ...m,
      linkedGoals: m.goalIds.map(goalId => ({
        id: goalId,
        title: decryptedGoalTitles.get(goalId) || 'Untitled Goal',
      })),
    })));
  }, [decryptedGoalTitles, milestones.length]);

  const decryptGoalFields = useCallback(async () => {
    if (!isKeyReady || goals.length === 0) return;

    const fieldsMap = new Map<string, DecryptedGoalFields>();

    for (const goal of goals) {
      if (!goal.custom_fields) continue;

      const fields: DecryptedGoalFields = {};
      for (const cf of goal.custom_fields) {
        try {
          const decrypted = await decryptData(cf.encryptedData, cf.iv);
          const parsed = JSON.parse(decrypted);
          if (parsed.fieldKey === 'type') fields.type = parsed.value;
          if (parsed.fieldKey === 'status') fields.status = parsed.value;
          if (parsed.fieldKey === 'priority') fields.priority = parsed.value;
        } catch {
          // Skip failed fields
        }
      }
      fieldsMap.set(goal.id, fields);
    }

    setDecryptedGoalFields(fieldsMap);
  }, [goals, decryptData, isKeyReady]);

  const decryptMilestoneFields = useCallback(async () => {
    if (!isKeyReady || milestones.length === 0) return;

    const fieldsMap = new Map<string, DecryptedMilestoneFields>();

    for (const milestone of milestones) {
      const fields: DecryptedMilestoneFields = { hasStatus: false };

      if (milestone.custom_fields) {
        for (const cf of milestone.custom_fields) {
          try {
            const decrypted = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(decrypted);
            if (parsed.fieldKey === 'isCompleted') {
              fields.isCompleted = parsed.value === true;
              fields.hasStatus = true; // Status field exists
            }
          } catch {
            // Skip failed fields
          }
        }
      }
      fieldsMap.set(milestone.id, fields);
    }

    setDecryptedMilestoneFields(fieldsMap);
  }, [milestones, decryptData, isKeyReady]);

  useEffect(() => {
    if (!isCacheInitialized) return;
    setLoading(true);
    loadGoalsFromCache();
    loadMilestonesFromCache();
    setLoading(false);
  }, [isCacheInitialized, loadGoalsFromCache, loadMilestonesFromCache]);

  // Reload data when switching tabs to pick up any cache updates
  useEffect(() => {
    if (!isCacheInitialized) return;
    loadGoalsFromCache();
    loadMilestonesFromCache();
  }, [mainTab, isCacheInitialized, loadGoalsFromCache, loadMilestonesFromCache]);

  useEffect(() => {
    decryptGoalFields();
    decryptGoalTitlesFunc();
  }, [decryptGoalFields, decryptGoalTitlesFunc]);

  useEffect(() => {
    decryptMilestoneFields();
  }, [decryptMilestoneFields]);

  const handleUnlinkMilestone = async (goalId: string, milestoneId: string) => {
    try {
      // Get current goal IDs for this milestone
      const getResponse = await fetch(`/api/milestones/${milestoneId}/goals`);
      if (!getResponse.ok) {
        throw new Error('Failed to get milestone goals');
      }
      const data = await getResponse.json();
      const currentGoalIds: string[] = data.goalIds || [];

      // Remove this goal from the milestone's goals
      const newGoalIds = currentGoalIds.filter((id) => id !== goalId);

      const updateResponse = await fetch(`/api/milestones/${milestoneId}/goals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalIds: newGoalIds }),
      });

      if (updateResponse.ok) {
        // Update local state
        setGoals((prevGoals) =>
          prevGoals.map((goal) => {
            if (goal.id !== goalId) return goal;
            return {
              ...goal,
              milestoneIds: goal.milestoneIds.filter((id) => id !== milestoneId),
              milestones: (goal.milestones || []).filter((m) => m.id !== milestoneId),
            };
          })
        );

        // Update the goal in the cache
        const cachedGoal = getCachedEntry(goalId);
        if (cachedGoal) {
          const currentMilestoneIds = cachedGoal.milestoneIds || [];
          updateEntry(goalId, {
            milestoneIds: currentMilestoneIds.filter((id) => id !== milestoneId),
          });
        }

        // Update the milestone in the cache to remove goal link
        const cachedMilestone = getCachedEntry(milestoneId);
        if (cachedMilestone) {
          updateEntry(milestoneId, {
            goalIds: newGoalIds,
          });
        }
      }
    } catch (error) {
      console.error('Failed to unlink milestone:', error);
    }
  };

  const handleUnlinkTask = async (milestoneId: string, taskId: string) => {
    try {
      // Get current milestone IDs for this task
      const getResponse = await fetch(`/api/tasks/${taskId}/milestones`);
      if (!getResponse.ok) {
        throw new Error('Failed to get task milestones');
      }
      const data = await getResponse.json();
      const currentMilestoneIds: string[] = data.milestoneIds || [];

      // Remove this milestone from the task's milestones
      const newMilestoneIds = currentMilestoneIds.filter((id) => id !== milestoneId);

      const updateResponse = await fetch(`/api/tasks/${taskId}/milestones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneIds: newMilestoneIds }),
      });

      if (updateResponse.ok) {
        // Update local state
        setMilestones((prev) =>
          prev.map((m) => {
            if (m.id !== milestoneId) return m;
            return {
              ...m,
              taskIds: m.taskIds.filter((id) => id !== taskId),
              tasks: m.tasks.filter((t) => t.id !== taskId),
            };
          })
        );

        // Update the task in the cache to remove milestone link
        const cachedTask = getCachedEntry(taskId);
        if (cachedTask) {
          updateEntry(taskId, {
            milestoneIds: newMilestoneIds,
          });
        }
      }
    } catch (error) {
      console.error('Failed to unlink task:', error);
    }
  };

  // Filter goals
  const filteredGoals = goals.filter((goal) => {
    const fields = decryptedGoalFields.get(goal.id);

    switch (goalFilter) {
      case 'active':
        return fields?.status === 'active' || !fields?.status;
      case 'short_term':
        return fields?.type === 'short_term' && fields?.status !== 'completed' && fields?.status !== 'archived';
      case 'long_term':
        return fields?.type === 'long_term' && fields?.status !== 'completed' && fields?.status !== 'archived';
      case 'completed':
        return fields?.status === 'completed';
      case 'all':
        return true;
      default:
        return true;
    }
  }).sort((a, b) => {
    const priorityA = decryptedGoalFields.get(a.id)?.priority ?? Infinity;
    const priorityB = decryptedGoalFields.get(b.id)?.priority ?? Infinity;
    return priorityA - priorityB;
  });

  // Filter milestones
  const filteredMilestones = milestones.filter((milestone) => {
    const fields = decryptedMilestoneFields.get(milestone.id);

    switch (milestoneFilter) {
      case 'not_started':
        return !fields?.hasStatus; // No isCompleted field exists
      case 'in_progress':
        return fields?.hasStatus && !fields?.isCompleted;
      case 'completed':
        return fields?.isCompleted === true;
      case 'all':
        return true;
      default:
        return true;
    }
  });

  // Handle drag end for reordering goals
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !isKeyReady) return;

    const oldIndex = filteredGoals.findIndex((g) => g.id === active.id);
    const newIndex = filteredGoals.findIndex((g) => g.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedGoals = arrayMove(filteredGoals, oldIndex, newIndex);

    setGoals((prevGoals) => {
      const filteredIds = new Set(filteredGoals.map((g) => g.id));
      const otherGoals = prevGoals.filter((g) => !filteredIds.has(g.id));
      return [...reorderedGoals, ...otherGoals];
    });

    setDecryptedGoalFields((prev) => {
      const newMap = new Map(prev);
      reorderedGoals.forEach((goal, index) => {
        const existing = newMap.get(goal.id) || {};
        newMap.set(goal.id, { ...existing, priority: index });
      });
      return newMap;
    });

    try {
      const priorities = await Promise.all(
        reorderedGoals.map(async (goal, index) => {
          const data = JSON.stringify({ fieldKey: 'priority', value: index });
          const { ciphertext, iv } = await encryptData(data);
          return {
            goalId: goal.id,
            encryptedData: ciphertext,
            iv,
            index,
          };
        })
      );

      const response = await fetch('/api/goals/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorities }),
      });

      if (response.ok) {
        // Update both the cache and local goals state with new custom fields
        const priorityMap = new Map(priorities.map(p => [p.goalId, p]));

        // Update local goals state with new custom_fields
        setGoals(prevGoals => prevGoals.map(goal => {
          const priority = priorityMap.get(goal.id);
          if (!priority) return goal;

          const priorityFieldId = `priority_${goal.id}`;
          const existingFields = (goal.custom_fields || []).filter(
            cf => cf.id !== priorityFieldId
          );
          return {
            ...goal,
            custom_fields: [
              ...existingFields,
              {
                id: priorityFieldId,
                encryptedData: priority.encryptedData,
                iv: priority.iv,
              },
            ],
          };
        }));

        // Update the cache with new custom fields for each goal
        for (const priority of priorities) {
          const cachedGoal = getCachedEntry(priority.goalId);
          if (cachedGoal) {
            const priorityFieldId = `priority_${priority.goalId}`;
            const existingFields = (cachedGoal.custom_fields || []).filter(
              cf => cf.id !== priorityFieldId
            );
            const updatedCustomFields = [
              ...existingFields,
              {
                id: priorityFieldId,
                entryId: priority.goalId,
                encryptedData: priority.encryptedData,
                iv: priority.iv,
              },
            ];
            updateEntry(priority.goalId, { custom_fields: updatedCustomFields });
          }
        }
      }
    } catch (error) {
      console.error('Failed to save goal order:', error);
      loadGoalsFromCache();
    }
  };

  const goalTabs: { key: GoalFilter; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'short_term', label: 'Short-term' },
    { key: 'long_term', label: 'Long-term' },
    { key: 'completed', label: 'Completed' },
    { key: 'all', label: 'All' },
  ];

  const milestoneTabs: { key: MilestoneFilter; label: string }[] = [
    { key: 'in_progress', label: 'In Progress' },
    { key: 'not_started', label: 'Not Started' },
    { key: 'completed', label: 'Completed' },
    { key: 'all', label: 'All' },
  ];

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col backdrop-blur-md bg-white/70">
      {/* Main Tab Navigation */}
      <div className="backdrop-blur-md bg-white/50 border-b border-border px-4 overflow-x-auto">
        <div className="flex gap-1 min-w-max md:min-w-0 md:flex-wrap">
          <button
            onClick={() => setMainTab('goals')}
            className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              mainTab === 'goals'
                ? 'border-b-2 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={mainTab === 'goals' ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            Goals
          </button>
          <button
            onClick={() => setMainTab('milestones')}
            className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              mainTab === 'milestones'
                ? 'border-b-2 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={mainTab === 'milestones' ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            Milestones
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Sub-filter Selector */}
        <div className="mb-4">
          <div className="flex gap-1 p-1 bg-white/30 backdrop-blur-sm rounded-lg border border-border">
            {mainTab === 'goals' ? (
              goalTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setGoalFilter(tab.key)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    goalFilter === tab.key
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            ) : (
              milestoneTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMilestoneFilter(tab.key)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    milestoneFilter === tab.key
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            )}
          </div>
        </div>
        {mainTab === 'goals' ? (
          // Goals Tab Content
          filteredGoals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No goals found</p>
              <p className="text-sm text-gray-400 mt-1">
                Create a new entry with type &quot;goal&quot; to get started
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              measuring={{
                droppable: {
                  strategy: MeasuringStrategy.Always,
                },
              }}
            >
              <SortableContext
                items={filteredGoals.map((g) => g.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-4">
                  {filteredGoals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goalId={goal.id}
                      encryptedContent={goal.encryptedContent}
                      iv={goal.iv}
                      customFields={goal.custom_fields}
                      milestones={goal.milestones || []}
                      onUnlinkMilestone={handleUnlinkMilestone}
                      onMilestoneLinked={() => {
                        loadGoalsFromCache();
                        loadMilestonesFromCache();
                      }}
                      onStatusChanged={() => {
                        loadGoalsFromCache();
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )
        ) : (
          // Milestones Tab Content
          filteredMilestones.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No milestones found</p>
              <p className="text-sm text-gray-400 mt-1">
                Create a new entry with type &quot;milestone&quot; to get started
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredMilestones.map((milestone, index) => (
                <div key={milestone.id}>
                  <MilestoneCard
                    milestoneId={milestone.id}
                    encryptedContent={milestone.encryptedContent}
                    iv={milestone.iv}
                    customFields={milestone.custom_fields}
                    tasks={milestone.tasks}
                    linkedGoals={milestone.linkedGoals}
                    onUnlinkTask={handleUnlinkTask}
                    onTaskLinked={() => {
                      loadMilestonesFromCache();
                    }}
                    onStatusChanged={() => {
                      loadMilestonesFromCache();
                    }}
                  />
                  {index < filteredMilestones.length - 1 && (
                    <hr className="my-4 border-gray-200" />
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
