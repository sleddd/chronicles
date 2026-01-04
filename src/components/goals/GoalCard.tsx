'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
}

export function GoalCard({
  goalId,
  encryptedContent,
  iv,
  customFields,
  milestones,
  onUnlinkMilestone,
}: Props) {
  const router = useRouter();
  const { decryptData, encryptData, isKeyReady } = useEncryption();
  const { accentColor } = useAccentColor();
  const [title, setTitle] = useState<string>('');
  const [goalFields, setGoalFields] = useState<GoalCustomFields | null>(null);
  const [decryptedMilestones, setDecryptedMilestones] = useState<DecryptedMilestone[]>([]);
  const [milestonesExpanded, setMilestonesExpanded] = useState(false);
  const [togglingMilestone, setTogglingMilestone] = useState<string | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goalId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleEditGoal = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/?entry=${goalId}`);
  };

  const handleEditMilestone = (e: React.MouseEvent, milestoneId: string) => {
    e.stopPropagation();
    router.push(`/?entry=${milestoneId}`);
  };

  const handleToggleMilestoneComplete = async (e: React.MouseEvent, milestoneId: string, currentlyCompleted: boolean) => {
    e.stopPropagation();
    if (!isKeyReady || togglingMilestone) return;

    setTogglingMilestone(milestoneId);
    try {
      const milestone = milestones.find(m => m.id === milestoneId);
      if (!milestone) return;

      // Get existing custom fields to preserve orderIndex and linkedGoalIds
      const existingFields: Array<{ fieldKey: string; value: unknown }> = [];
      if (milestone.custom_fields) {
        for (const cf of milestone.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey !== 'isCompleted') {
              existingFields.push(parsed);
            }
          } catch {
            // Skip failed fields
          }
        }
      }

      // Add updated isCompleted field
      existingFields.push({ fieldKey: 'isCompleted', value: !currentlyCompleted });

      // Re-encrypt all fields
      const encryptedFields = [];
      for (const field of existingFields) {
        const fieldStr = JSON.stringify(field);
        const encrypted = await encryptData(fieldStr);
        encryptedFields.push({ encryptedData: encrypted.ciphertext, iv: encrypted.iv });
      }

      // Update the milestone
      const response = await fetch(`/api/entries/${milestoneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: encryptedFields }),
      });

      if (response.ok) {
        // Update local state
        setDecryptedMilestones(prev =>
          prev.map(m =>
            m.id === milestoneId ? { ...m, isCompleted: !currentlyCompleted } : m
          )
        );
      }
    } catch (error) {
      console.error('Failed to toggle milestone:', error);
    } finally {
      setTogglingMilestone(null);
    }
  };

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
  // Use calculated progress when there are milestones, otherwise use stored value
  const displayProgress = totalCount > 0 ? calculatedProgress : (goalFields?.progressPercentage ?? 0);

  const getStatusColor = (): { className: string; style?: React.CSSProperties } => {
    switch (goalFields?.status) {
      case 'completed': return { className: '', style: { backgroundColor: '#e5e7eb', color: accentColor } };
      case 'archived': return { className: 'text-gray-600', style: { backgroundColor: '#e5e7eb' } };
      default: return { className: '', style: { backgroundColor: '#e5e7eb', color: accentColor } };
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
      ref={setNodeRef}
      style={style}
      className={`p-4 border border-border rounded-lg backdrop-blur-md bg-white/70 hover:border-border hover:shadow-sm transition-all ${isDragging ? 'shadow-lg z-10' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-1">
          {/* Drag handle */}
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
            {...attributes}
            {...listeners}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
            </svg>
          </button>
          <h3 className="font-medium text-gray-900 flex-1">{title || 'Loading...'}</h3>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {getTypeLabel() && (
            <span className="text-xs px-2 py-0.5 rounded backdrop-blur-md bg-white/60 text-gray-700">
              {getTypeLabel()}
            </span>
          )}
          {goalFields?.status && (
            <span
              className={`text-xs px-2 py-0.5 rounded capitalize ${getStatusColor().className}`}
              style={getStatusColor().style}
            >
              {goalFields.status}
            </span>
          )}
          <button
            type="button"
            onClick={handleEditGoal}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit goal"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span>
          <span>{displayProgress}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#e5e7eb' }}>
          <div
            className="h-full transition-all duration-300"
            style={{ backgroundColor: accentColor, width: `${displayProgress}%` }}
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
        <div className="border-t border-border pt-3 mt-2">
          <button
            type="button"
            onClick={() => setMilestonesExpanded(!milestonesExpanded)}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 w-full"
          >
            <svg
              className={`w-3 h-3 transition-transform ${milestonesExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Milestones ({completedCount}/{totalCount})
          </button>
          {milestonesExpanded && (
            <div className="space-y-1.5 mt-2">
              {decryptedMilestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <button
                    type="button"
                    onClick={(e) => handleToggleMilestoneComplete(e, milestone.id, milestone.isCompleted)}
                    disabled={togglingMilestone === milestone.id}
                    className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
                      milestone.isCompleted
                        ? 'text-white'
                        : 'border-border'
                    } ${togglingMilestone === milestone.id ? 'opacity-50' : ''}`}
                    style={milestone.isCompleted ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
                    title={milestone.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {milestone.isCompleted && (
                      <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 ${milestone.isCompleted ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                    {milestone.content}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleEditMilestone(e, milestone.id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                    title="Edit milestone"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnlinkMilestone(goalId, milestone.id);
                    }}
                    className="text-gray-400 hover:text-red-500 text-2xl px-2 py-1 leading-none"
                    title="Unlink milestone"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
