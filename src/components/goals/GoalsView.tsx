'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { GoalCard } from './GoalCard';

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
}

type TabFilter = 'active' | 'short_term' | 'long_term' | 'all';

interface Props {
  onGoalSelect: (goalId: string | null) => void;
  selectedGoalId: string | null;
  refreshKey?: number;
}

export function GoalsView({ onGoalSelect, selectedGoalId, refreshKey }: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('active');
  const [decryptedGoalFields, setDecryptedGoalFields] = useState<Map<string, DecryptedGoalFields>>(new Map());
  const { decryptData, isKeyReady } = useEncryption();

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/entries?customType=goal');
      const data = await response.json();
      const goalsWithMilestones: Goal[] = [];

      // For each goal, fetch the full data including milestones
      for (const goal of data.entries || []) {
        try {
          const detailResponse = await fetch(`/api/entries/${goal.id}`);
          const detailData = await detailResponse.json();
          goalsWithMilestones.push({
            ...goal,
            milestones: detailData.entry?.milestones || [],
          });
        } catch {
          goalsWithMilestones.push({ ...goal, milestones: [] });
        }
      }

      setGoals(goalsWithMilestones);
    } catch (error) {
      console.error('Failed to fetch goals:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
        } catch {
          // Skip failed fields
        }
      }
      fieldsMap.set(goal.id, fields);
    }

    setDecryptedGoalFields(fieldsMap);
  }, [goals, decryptData, isKeyReady]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals, refreshKey]);

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
        // Refresh the goals list
        fetchGoals();
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
  });

  const tabs: { key: TabFilter; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'short_term', label: 'Short-term' },
    { key: 'long_term', label: 'Long-term' },
    { key: 'all', label: 'All' },
  ];

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <p className="text-gray-500">Loading goals...</p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-auto bg-gray-50">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Goals</h1>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Goals grid */}
      {filteredGoals.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No goals found</p>
          <p className="text-sm text-gray-400 mt-1">
            Create a new entry with type &quot;goal&quot; to get started
          </p>
        </div>
      ) : (
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
              onGoalClick={onGoalSelect}
              isSelected={selectedGoalId === goal.id}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => onGoalSelect(null)}
        className="w-full mt-6 py-3 text-sm text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-300 rounded-lg bg-white hover:bg-indigo-50 transition-colors"
      >
        + New Goal
      </button>
    </div>
  );
}
