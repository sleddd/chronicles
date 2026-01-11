'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { GoalCard } from './GoalCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface Milestone {
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
  milestones?: Milestone[];
}

interface DecryptedGoalFields {
  type?: 'short_term' | 'long_term';
  status?: 'active' | 'completed' | 'archived';
  priority?: number;
}

type TabFilter = 'active' | 'short_term' | 'long_term' | 'all';

export function GoalsView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('active');
  const [decryptedGoalFields, setDecryptedGoalFields] = useState<Map<string, DecryptedGoalFields>>(new Map());
  const { decryptData, encryptData, isKeyReady } = useEncryption();
  const { accentColor } = useAccentColor();

  // Use entries cache
  const {
    getEntriesByType,
    getEntry: getCachedEntry,
    isInitialized: isCacheInitialized,
  } = useEntriesCache();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load goals from cache (no N+1 problem - all data already cached)
  const loadGoalsFromCache = useCallback(() => {
    if (!isCacheInitialized) return;

    setLoading(true);
    try {
      const cachedGoals = getEntriesByType('goal');
      const goalsWithMilestones: Goal[] = [];

      for (const goal of cachedGoals) {
        // Get milestone data from cache using milestoneIds
        const milestones: Milestone[] = [];
        if (goal.milestoneIds) {
          for (const milestoneId of goal.milestoneIds) {
            const milestone = getCachedEntry(milestoneId);
            if (milestone) {
              milestones.push({
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
          milestones,
        });
      }

      setGoals(goalsWithMilestones);
    } catch (error) {
      console.error('Failed to load goals from cache:', error);
    } finally {
      setLoading(false);
    }
  }, [isCacheInitialized, getEntriesByType, getCachedEntry]);

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

  useEffect(() => {
    loadGoalsFromCache();
  }, [loadGoalsFromCache]);

  useEffect(() => {
    decryptGoalFields();
  }, [decryptGoalFields]);

  const handleUnlinkMilestone = async (goalId: string, milestoneId: string) => {
    try {
      const response = await fetch(
        `/api/goals/${goalId}/milestones?milestoneId=${milestoneId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        // Update local state to remove the milestone
        setGoals((prevGoals) =>
          prevGoals.map((goal) => {
            if (goal.id !== goalId) return goal;
            return {
              ...goal,
              milestoneIds: goal.milestoneIds.filter((id) => id !== milestoneId),
              milestones: goal.milestones?.filter((m) => m.id !== milestoneId),
            };
          })
        );
      }
    } catch (error) {
      console.error('Failed to unlink milestone:', error);
    }
  };

  // Filter goals based on active tab
  const filteredGoals = goals.filter((goal) => {
    const fields = decryptedGoalFields.get(goal.id);

    switch (activeTab) {
      case 'active':
        return fields?.status === 'active' || !fields?.status;
      case 'short_term':
        return fields?.type === 'short_term';
      case 'long_term':
        return fields?.type === 'long_term';
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

  // Handle drag end for reordering
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !isKeyReady) return;

    const oldIndex = filteredGoals.findIndex((g) => g.id === active.id);
    const newIndex = filteredGoals.findIndex((g) => g.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder the goals array
    const reorderedGoals = arrayMove(filteredGoals, oldIndex, newIndex);

    // Update goals state optimistically
    setGoals((prevGoals) => {
      const filteredIds = new Set(filteredGoals.map((g) => g.id));
      const otherGoals = prevGoals.filter((g) => !filteredIds.has(g.id));
      return [...reorderedGoals, ...otherGoals];
    });

    // Update decrypted fields with new priorities
    setDecryptedGoalFields((prev) => {
      const newMap = new Map(prev);
      reorderedGoals.forEach((goal, index) => {
        const existing = newMap.get(goal.id) || {};
        newMap.set(goal.id, { ...existing, priority: index });
      });
      return newMap;
    });

    // Update priorities on server
    try {
      const priorities = await Promise.all(
        reorderedGoals.map(async (goal, index) => {
          const data = JSON.stringify({ fieldKey: 'priority', value: index });
          const { ciphertext, iv } = await encryptData(data);
          return {
            goalId: goal.id,
            encryptedData: ciphertext,
            iv,
          };
        })
      );

      await fetch('/api/goals/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorities }),
      });
    } catch (error) {
      console.error('Failed to save goal order:', error);
      // Reload from cache on error to restore correct order
      loadGoalsFromCache();
    }
  };

  const tabs: { key: TabFilter; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'short_term', label: 'Short-term' },
    { key: 'long_term', label: 'Long-term' },
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
      {/* Tab Navigation */}
      <div className="backdrop-blur-md bg-white/50 border-b border-border px-4 overflow-x-auto">
        <div className="flex gap-1 min-w-max md:min-w-0 md:flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-b-2 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === tab.key ? { color: accentColor, borderColor: accentColor } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">

        {/* Goals grid */}
        {filteredGoals.length === 0 ? (
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
          >
            <SortableContext
              items={filteredGoals.map((g) => g.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goalId={goal.id}
                    encryptedContent={goal.encryptedContent}
                    iv={goal.iv}
                    customFields={goal.custom_fields}
                    milestones={goal.milestones || []}
                    onUnlinkMilestone={handleUnlinkMilestone}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
