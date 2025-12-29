'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

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

interface DecryptedMilestone {
  id: string;
  content: string;
  isCompleted: boolean;
  orderIndex: number;
}

interface GoalCustomFields {
  type: 'short_term' | 'long_term';
  status: 'active' | 'completed' | 'archived';
  targetDate?: string;
  progressPercentage?: number;
}

interface Props {
  goalId: string;
  encryptedContent: string;
  iv: string;
  customFields: CustomField[] | null;
  milestones: Milestone[];
  onUnlinkMilestone: (goalId: string, milestoneId: string) => void;
  onGoalClick: (goalId: string) => void;
  isSelected?: boolean;
}

export function GoalCard({
  goalId,
  encryptedContent,
  iv,
  customFields,
  milestones,
  onUnlinkMilestone,
  onGoalClick,
  isSelected,
}: Props) {
  const { decryptData, isKeyReady } = useEncryption();
  const [title, setTitle] = useState<string>('');
  const [goalFields, setGoalFields] = useState<GoalCustomFields | null>(null);
  const [decryptedMilestones, setDecryptedMilestones] = useState<DecryptedMilestone[]>([]);

  const decryptGoal = useCallback(async () => {
    if (!isKeyReady) return;

    try {
      const content = await decryptData(encryptedContent, iv);
      const plainText = content.replace(/<[^>]*>/g, '').trim();
      setTitle(plainText.split('\n')[0] || 'Untitled Goal');
    } catch {
      setTitle('Decryption failed');
    }

    // Decrypt custom fields
    if (customFields && customFields.length > 0) {
      const fields: Partial<GoalCustomFields> = {};
      for (const cf of customFields) {
        try {
          const decrypted = await decryptData(cf.encryptedData, cf.iv);
          const parsed = JSON.parse(decrypted);
          if (parsed.fieldKey === 'type') fields.type = parsed.value;
          if (parsed.fieldKey === 'status') fields.status = parsed.value;
          if (parsed.fieldKey === 'targetDate') fields.targetDate = parsed.value;
          if (parsed.fieldKey === 'progressPercentage') fields.progressPercentage = parsed.value;
        } catch {
          // Skip failed fields
        }
      }
      setGoalFields(fields as GoalCustomFields);
    }
  }, [encryptedContent, iv, customFields, decryptData, isKeyReady]);

  const decryptMilestones = useCallback(async () => {
    if (!isKeyReady || milestones.length === 0) return;

    const decrypted: DecryptedMilestone[] = [];
    for (const milestone of milestones) {
      try {
        const content = await decryptData(milestone.encryptedContent, milestone.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();

        let isCompleted = false;
        let orderIndex = 0;

        if (milestone.custom_fields) {
          for (const cf of milestone.custom_fields) {
            try {
              const fieldData = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(fieldData);
              if (parsed.fieldKey === 'isCompleted') isCompleted = parsed.value === true;
              if (parsed.fieldKey === 'orderIndex') orderIndex = parsed.value;
            } catch {
              // Skip failed fields
            }
          }
        }

        decrypted.push({
          id: milestone.id,
          content: plainText.split('\n')[0] || 'Untitled Milestone',
          isCompleted,
          orderIndex,
        });
      } catch {
        decrypted.push({
          id: milestone.id,
          content: 'Decryption failed',
          isCompleted: false,
          orderIndex: 0,
        });
      }
    }

    // Sort by orderIndex
    decrypted.sort((a, b) => a.orderIndex - b.orderIndex);
    setDecryptedMilestones(decrypted);
  }, [milestones, decryptData, isKeyReady]);

  useEffect(() => {
    // Decryption must happen in effect since it depends on encrypted props
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void decryptGoal();
  }, [decryptGoal]);

  useEffect(() => {
    // Decryption must happen in effect since it depends on encrypted props
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void decryptMilestones();
  }, [decryptMilestones]);

  // Calculate progress from milestones
  const completedCount = decryptedMilestones.filter(m => m.isCompleted).length;
  const totalCount = decryptedMilestones.length;
  const calculatedProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const displayProgress = goalFields?.progressPercentage ?? calculatedProgress;

  const getStatusColor = () => {
    switch (goalFields?.status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'archived': return 'bg-gray-100 text-gray-600';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getTypeLabel = () => {
    switch (goalFields?.type) {
      case 'short_term': return 'Short-term';
      case 'long_term': return 'Long-term';
      default: return null;
    }
  };

  return (
    <div
      onClick={() => onGoalClick(goalId)}
      className={`p-4 border rounded-lg bg-white cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-indigo-500 border-indigo-300' : 'hover:border-gray-400 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-gray-900 flex-1">{title || 'Loading...'}</h3>
        <div className="flex gap-2 ml-2">
          {getTypeLabel() && (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800">
              {getTypeLabel()}
            </span>
          )}
          {goalFields?.status && (
            <span className={`text-xs px-2 py-0.5 rounded capitalize ${getStatusColor()}`}>
              {goalFields.status}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span>
          <span>{displayProgress}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
      </div>

      {/* Target date */}
      {goalFields?.targetDate && (
        <div className="text-xs text-gray-500 mb-3">
          Target: {new Date(goalFields.targetDate).toLocaleDateString()}
        </div>
      )}

      {/* Milestones */}
      {decryptedMilestones.length > 0 && (
        <div className="border-t pt-3 mt-2">
          <div className="text-xs font-medium text-gray-500 mb-2">
            Milestones ({completedCount}/{totalCount})
          </div>
          <div className="space-y-1.5">
            {decryptedMilestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-2 text-sm"
              >
                <span className={milestone.isCompleted ? 'text-green-600' : 'text-gray-400'}>
                  {milestone.isCompleted ? '✓' : '○'}
                </span>
                <span className={`flex-1 ${milestone.isCompleted ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                  {milestone.content}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnlinkMilestone(goalId, milestone.id);
                  }}
                  className="text-gray-400 hover:text-red-500 text-xs px-1"
                  title="Unlink milestone"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
