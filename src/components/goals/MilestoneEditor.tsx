'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface Goal {
  id: string;
  encryptedContent: string;
  iv: string;
}

interface Props {
  milestoneId: string;
  initialGoalIds?: string[];
  onSave: (goalIds: string[]) => void;
  onCancel: () => void;
}

export function MilestoneEditor({ milestoneId, initialGoalIds = [], onSave, onCancel }: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [decryptedGoals, setDecryptedGoals] = useState<Map<string, string>>(new Map());
  const [selectedGoalIds, setSelectedGoalIds] = useState<Set<string>>(new Set(initialGoalIds));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { decryptData, isKeyReady } = useEncryption();

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/entries?customType=goal');
      const data = await response.json();
      setGoals(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch goals:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const decryptGoalTitles = useCallback(async () => {
    if (!isKeyReady || goals.length === 0) return;

    const decrypted = new Map<string, string>();
    for (const goal of goals) {
      try {
        const content = await decryptData(goal.encryptedContent, goal.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();
        decrypted.set(goal.id, plainText.split('\n')[0] || 'Untitled Goal');
      } catch {
        decrypted.set(goal.id, 'Decryption failed');
      }
    }
    setDecryptedGoals(decrypted);
  }, [goals, decryptData, isKeyReady]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  useEffect(() => {
    decryptGoalTitles();
  }, [decryptGoalTitles]);

  // Load current goal links when editing existing milestone
  useEffect(() => {
    if (milestoneId && initialGoalIds.length === 0) {
      fetch(`/api/milestones/${milestoneId}/goals`)
        .then(res => res.json())
        .then(data => {
          if (data.goalIds) {
            setSelectedGoalIds(new Set(data.goalIds));
          }
        })
        .catch(console.error);
    }
  }, [milestoneId, initialGoalIds]);

  const toggleGoal = (goalId: string) => {
    setSelectedGoalIds(prev => {
      const next = new Set(prev);
      if (next.has(goalId)) {
        next.delete(goalId);
      } else {
        next.add(goalId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const goalIds = Array.from(selectedGoalIds);

      const response = await fetch(`/api/milestones/${milestoneId}/goals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalIds }),
      });

      if (response.ok) {
        onSave(goalIds);
      } else {
        console.error('Failed to save goal links');
      }
    } catch (error) {
      console.error('Failed to save goal links:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-white border rounded-lg">
        <p className="text-gray-500">Loading goals...</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Linked to Goals:</h3>

      {goals.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No goals available. Create a goal first.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto border rounded-md mb-4">
          {goals.map((goal) => (
            <label
              key={goal.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
            >
              <input
                type="checkbox"
                checked={selectedGoalIds.has(goal.id)}
                onChange={() => toggleGoal(goal.id)}
                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">
                {decryptedGoals.get(goal.id) || 'Loading...'}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
        >
          {saving ? 'Saving...' : 'Save Links'}
        </button>
      </div>
    </div>
  );
}

// Inline version for use in EntryEditor
export function MilestoneGoalSelector({
  selectedGoalIds,
  onGoalIdsChange,
}: {
  selectedGoalIds: string[];
  onGoalIdsChange: (goalIds: string[]) => void;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [decryptedGoals, setDecryptedGoals] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const { decryptData, isKeyReady } = useEncryption();

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/entries?customType=goal');
      const data = await response.json();
      setGoals(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch goals:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const decryptGoalTitles = useCallback(async () => {
    if (!isKeyReady || goals.length === 0) return;

    const decrypted = new Map<string, string>();
    for (const goal of goals) {
      try {
        const content = await decryptData(goal.encryptedContent, goal.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();
        decrypted.set(goal.id, plainText.split('\n')[0] || 'Untitled Goal');
      } catch {
        decrypted.set(goal.id, 'Decryption failed');
      }
    }
    setDecryptedGoals(decrypted);
  }, [goals, decryptData, isKeyReady]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  useEffect(() => {
    decryptGoalTitles();
  }, [decryptGoalTitles]);

  const toggleGoal = (goalId: string) => {
    const currentSet = new Set(selectedGoalIds);
    if (currentSet.has(goalId)) {
      currentSet.delete(goalId);
    } else {
      currentSet.add(goalId);
    }
    onGoalIdsChange(Array.from(currentSet));
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading goals...</p>;
  }

  if (goals.length === 0) {
    return <p className="text-sm text-gray-500">No goals available</p>;
  }

  return (
    <div className="border rounded-md max-h-40 overflow-y-auto">
      {goals.map((goal) => (
        <label
          key={goal.id}
          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
        >
          <input
            type="checkbox"
            checked={selectedGoalIds.includes(goal.id)}
            onChange={() => toggleGoal(goal.id)}
            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">
            {decryptedGoals.get(goal.id) || 'Loading...'}
          </span>
        </label>
      ))}
    </div>
  );
}
