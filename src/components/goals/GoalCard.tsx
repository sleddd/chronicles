'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';
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
  hasStatus: boolean; // true if isCompleted field exists (In Progress or Completed), false if no status (Not Started)
  orderIndex: number;
}

interface AvailableMilestone {
  id: string;
  title: string;
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
  onMilestoneLinked?: () => void;
  onStatusChanged?: () => void;
}

export function GoalCard({
  goalId,
  encryptedContent,
  iv,
  customFields,
  milestones,
  onUnlinkMilestone,
  onMilestoneLinked,
  onStatusChanged,
}: Props) {
  const router = useRouter();
  const { decryptData, encryptData, isKeyReady } = useEncryption();
  const { accentColor } = useAccentColor();
  const { getEntriesByType, updateEntry, addEntry, getEntry } = useEntriesCache();
  const [title, setTitle] = useState<string>('');
  const [goalFields, setGoalFields] = useState<GoalCustomFields | null>(null);
  const [decryptedMilestones, setDecryptedMilestones] = useState<DecryptedMilestone[]>([]);
  const [milestonesExpanded, setMilestonesExpanded] = useState(false);
  const [isMilestonesClosing, setIsMilestonesClosing] = useState(false);
  const [togglingMilestone, setTogglingMilestone] = useState<string | null>(null);

  // Add milestone state
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [availableMilestones, setAvailableMilestones] = useState<AvailableMilestone[]>([]);
  const [linkingMilestone, setLinkingMilestone] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [milestoneSearch, setMilestoneSearch] = useState('');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [creatingMilestone, setCreatingMilestone] = useState(false);

  // Handle milestones expand/collapse with animation
  const toggleMilestones = useCallback(() => {
    if (milestonesExpanded && !isMilestonesClosing) {
      setIsMilestonesClosing(true);
      setTimeout(() => {
        setMilestonesExpanded(false);
        setIsMilestonesClosing(false);
      }, 150);
    } else if (!milestonesExpanded) {
      setMilestonesExpanded(true);
    }
  }, [milestonesExpanded, isMilestonesClosing]);

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

  // Create a new milestone inline and auto-link to this goal
  const handleCreateInlineMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isKeyReady || creatingMilestone || !newMilestoneTitle.trim()) return;

    setCreatingMilestone(true);
    try {
      // Encrypt the milestone title as content
      const { ciphertext, iv } = await encryptData(`<p>${newMilestoneTitle.trim()}</p>`);

      // Create the milestone entry
      const today = new Date().toISOString().split('T')[0];
      const createResponse = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedContent: ciphertext,
          iv,
          customType: 'milestone',
          entryDate: today,
          searchTokens: [],
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create milestone');
      }

      const { entry } = await createResponse.json();

      // Link the milestone to this goal
      await fetch(`/api/milestones/${entry.id}/goals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalIds: [goalId] }),
      });

      // Add the new milestone to the cache with goal link
      addEntry({
        id: entry.id,
        encryptedContent: ciphertext,
        iv,
        topicId: null,
        customType: 'milestone',
        entryDate: today,
        searchTokens: [],
        custom_fields: null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        goalIds: [goalId],
      });

      // Update the goal's milestoneIds in the cache
      const cachedGoal = getEntry(goalId);
      if (cachedGoal) {
        const currentMilestoneIds = cachedGoal.milestoneIds || [];
        updateEntry(goalId, {
          milestoneIds: [...currentMilestoneIds, entry.id],
        });
      }

      // Clear input and refresh
      setNewMilestoneTitle('');
      setShowAddMilestone(false);
      onMilestoneLinked?.();
    } catch (error) {
      console.error('Failed to create milestone:', error);
    } finally {
      setCreatingMilestone(false);
    }
  };

  const handleLinkExistingMilestone = async (e: React.MouseEvent, milestoneId: string) => {
    e.stopPropagation();
    if (linkingMilestone) return;

    setLinkingMilestone(true);
    try {
      // Get current goal IDs for this milestone
      const response = await fetch(`/api/milestones/${milestoneId}/goals`);
      const data = await response.json();
      const currentGoalIds = data.goalIds || [];

      // Add this goal to the milestone's goals
      if (!currentGoalIds.includes(goalId)) {
        const updateResponse = await fetch(`/api/milestones/${milestoneId}/goals`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goalIds: [...currentGoalIds, goalId] }),
        });

        if (updateResponse.ok) {
          setShowAddMilestone(false);
          onMilestoneLinked?.();
        }
      }
    } catch (error) {
      console.error('Failed to link milestone:', error);
    } finally {
      setLinkingMilestone(false);
    }
  };

  const handleToggleActive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isKeyReady || togglingActive || !customFields) return;

    const isCurrentlyActive = goalFields?.status === 'active';
    const newStatus = isCurrentlyActive ? 'completed' : 'active';

    setTogglingActive(true);
    try {
      // Get existing custom fields to preserve other fields
      const existingFields: Array<{ fieldKey: string; value: unknown }> = [];
      for (const cf of customFields) {
        try {
          const fieldData = await decryptData(cf.encryptedData, cf.iv);
          const parsed = JSON.parse(fieldData);
          if (parsed.fieldKey !== 'status') {
            existingFields.push(parsed);
          }
        } catch {
          // Skip failed fields
        }
      }

      // Add updated status field
      existingFields.push({ fieldKey: 'status', value: newStatus });

      // Re-encrypt all fields
      const encryptedFields = [];
      for (const field of existingFields) {
        const fieldStr = JSON.stringify(field);
        const encrypted = await encryptData(fieldStr);
        encryptedFields.push({ encryptedData: encrypted.ciphertext, iv: encrypted.iv });
      }

      // Update the goal
      const response = await fetch(`/api/entries/${goalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: encryptedFields }),
      });

      if (response.ok) {
        // Update local state
        setGoalFields(prev => prev ? { ...prev, status: newStatus } : null);
        // Update the cache with new custom fields
        updateEntry(goalId, {
          custom_fields: encryptedFields.map((ef, idx) => ({
            id: customFields[idx]?.id || `temp-${idx}`,
            entryId: goalId,
            encryptedData: ef.encryptedData,
            iv: ef.iv,
          })),
        });
        // Notify parent to refresh the list
        onStatusChanged?.();
      }
    } catch (error) {
      console.error('Failed to toggle active status:', error);
    } finally {
      setTogglingActive(false);
    }
  };

  // Three-state toggle: Not Started -> In Progress -> Completed -> Not Started
  const handleToggleMilestoneComplete = async (e: React.MouseEvent, milestoneId: string, currentlyCompleted: boolean, currentlyHasStatus: boolean) => {
    e.stopPropagation();
    if (!isKeyReady || togglingMilestone) return;

    setTogglingMilestone(milestoneId);
    try {
      const milestone = milestones.find(m => m.id === milestoneId);
      if (!milestone) return;

      // Determine next state:
      // Not Started (hasStatus=false) -> In Progress (hasStatus=true, isCompleted=false)
      // In Progress (hasStatus=true, isCompleted=false) -> Completed (hasStatus=true, isCompleted=true)
      // Completed (hasStatus=true, isCompleted=true) -> Not Started (remove isCompleted field)
      let newIsCompleted: boolean | null;
      let newHasStatus: boolean;

      if (!currentlyHasStatus) {
        // Not Started -> In Progress
        newIsCompleted = false;
        newHasStatus = true;
      } else if (!currentlyCompleted) {
        // In Progress -> Completed
        newIsCompleted = true;
        newHasStatus = true;
      } else {
        // Completed -> Not Started (remove the field)
        newIsCompleted = null;
        newHasStatus = false;
      }

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

      // Add isCompleted field only if we have a status
      if (newIsCompleted !== null) {
        existingFields.push({ fieldKey: 'isCompleted', value: newIsCompleted });
      }

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
            m.id === milestoneId ? { ...m, isCompleted: newIsCompleted === true, hasStatus: newHasStatus } : m
          )
        );
        // Update the cache with new custom fields
        updateEntry(milestoneId, {
          custom_fields: encryptedFields.map((ef, idx) => ({
            id: `cf_${milestoneId}_${idx}`,
            entryId: milestoneId,
            encryptedData: ef.encryptedData,
            iv: ef.iv,
          })),
        });
      }
    } catch (error) {
      console.error('Failed to toggle milestone:', error);
    } finally {
      setTogglingMilestone(null);
    }
  };

  // Load available milestones (not already linked to this goal)
  const loadAvailableMilestones = useCallback(async () => {
    if (!isKeyReady) return;

    const allMilestones = getEntriesByType('milestone');
    const linkedMilestoneIds = new Set(milestones.map(m => m.id));

    const available: AvailableMilestone[] = [];
    for (const milestone of allMilestones) {
      if (linkedMilestoneIds.has(milestone.id)) continue;

      try {
        const content = await decryptData(milestone.encryptedContent, milestone.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();
        available.push({
          id: milestone.id,
          title: plainText.split('\n')[0] || 'Untitled Milestone',
        });
      } catch {
        available.push({
          id: milestone.id,
          title: 'Untitled Milestone',
        });
      }
    }

    setAvailableMilestones(available);
  }, [isKeyReady, getEntriesByType, milestones, decryptData]);

  useEffect(() => {
    if (showAddMilestone) {
      loadAvailableMilestones();
    }
  }, [showAddMilestone, loadAvailableMilestones]);

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
    if (!isKeyReady || !milestones || milestones.length === 0) return;

    const decrypted: DecryptedMilestone[] = [];
    for (const milestone of milestones) {
      try {
        const content = await decryptData(milestone.encryptedContent, milestone.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();

        let isCompleted = false;
        let hasStatus = false;
        let orderIndex = 0;

        if (milestone.custom_fields) {
          for (const cf of milestone.custom_fields) {
            try {
              const fieldData = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(fieldData);
              if (parsed.fieldKey === 'isCompleted') {
                isCompleted = parsed.value === true;
                hasStatus = true; // Status field exists
              }
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
          hasStatus,
          orderIndex,
        });
      } catch {
        decrypted.push({
          id: milestone.id,
          content: 'Decryption failed',
          isCompleted: false,
          hasStatus: false,
          orderIndex: 0,
        });
      }
    }

    // Sort by orderIndex
    decrypted.sort((a, b) => a.orderIndex - b.orderIndex);
    setDecryptedMilestones(decrypted);
  }, [milestones, decryptData, isKeyReady]);

  useEffect(() => {
    void decryptGoal();
  }, [decryptGoal]);

  useEffect(() => {
    void decryptMilestones();
  }, [decryptMilestones]);

  // Calculate progress from milestones
  const completedCount = decryptedMilestones.filter(m => m.isCompleted).length;
  const totalCount = decryptedMilestones.length;
  const calculatedProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  // Use calculated progress when there are milestones, otherwise use stored value
  const displayProgress = totalCount > 0 ? calculatedProgress : (goalFields?.progressPercentage ?? 0);

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
          <div
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none p-1"
            {...attributes}
            {...listeners}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
            </svg>
          </div>
          <h3 className="font-medium text-gray-900 flex-1">{title || 'Loading...'}</h3>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {getTypeLabel() && (
            <span className="hidden md:inline text-xs px-2 py-0.5 rounded backdrop-blur-md bg-white/60 text-gray-700">
              {getTypeLabel()}
            </span>
          )}
          {/* Active checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer" title="Toggle active status">
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={togglingActive}
              className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
                goalFields?.status === 'active'
                  ? 'text-white'
                  : 'border-gray-300'
              } ${togglingActive ? 'opacity-50' : ''}`}
              style={goalFields?.status === 'active' ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
            >
              {goalFields?.status === 'active' && (
                <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className="text-xs text-gray-500">Active</span>
          </label>
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

      {/* Milestones Section */}
      <div className="pt-2 mt-0">
        <div className="flex items-center justify-between mb-2">
          {decryptedMilestones.length > 0 ? (
            <button
              type="button"
              onClick={toggleMilestones}
              className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${milestonesExpanded && !isMilestonesClosing ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Milestones ({completedCount}/{totalCount})
            </button>
          ) : (
            <span className="text-sm text-gray-400">No milestones</span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddMilestone(!showAddMilestone);
            }}
            className="flex items-center gap-1 text-sm font-medium transition-colors px-2 py-1 rounded"
            style={{ color: accentColor }}
            title="Add milestone"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {/* Add Milestone Dropdown */}
        {showAddMilestone && (
          <div className="mb-3 p-3 bg-white/80 rounded-lg border border-border animate-dropdown">
            <div className="flex flex-col gap-2">
              {/* Inline milestone creation */}
              <form onSubmit={handleCreateInlineMilestone} className="flex gap-2">
                <input
                  type="text"
                  placeholder="New milestone title..."
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={creatingMilestone}
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={creatingMilestone || !newMilestoneTitle.trim()}
                  className="px-3 py-2 text-sm text-white rounded-md transition-colors bg-gray-500 hover:bg-gray-600 disabled:opacity-50"
                >
                  {creatingMilestone ? '...' : 'Add'}
                </button>
              </form>

              {availableMilestones.length > 0 && (
                <>
                  <div className="text-xs text-gray-500 mt-1">Or link existing:</div>
                  <input
                    type="text"
                    placeholder="Search milestones..."
                    value={milestoneSearch}
                    onChange={(e) => setMilestoneSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {availableMilestones
                      .filter((m) => m.title.toLowerCase().includes(milestoneSearch.toLowerCase()))
                      .map((milestone) => (
                        <button
                          key={milestone.id}
                          type="button"
                          onClick={(e) => handleLinkExistingMilestone(e, milestone.id)}
                          disabled={linkingMilestone}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                        >
                          {milestone.title}
                        </button>
                      ))}
                    {availableMilestones.filter((m) => m.title.toLowerCase().includes(milestoneSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">
                        No matching milestones
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Existing Milestones List */}
        {milestonesExpanded && decryptedMilestones.length > 0 && (
          <div className={`space-y-2 px-3 py-2 ${isMilestonesClosing ? 'animate-dropdown-out' : 'animate-dropdown'}`}>
            {decryptedMilestones.map((milestone, index) => (
              <div key={milestone.id}>
                <div className="flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={(e) => handleToggleMilestoneComplete(e, milestone.id, milestone.isCompleted, milestone.hasStatus)}
                    disabled={togglingMilestone === milestone.id}
                    className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer bg-gray-100 text-gray-600 ${
                      togglingMilestone === milestone.id ? 'opacity-50' : ''
                    }`}
                    title={!milestone.hasStatus ? 'Set to in progress' : milestone.isCompleted ? 'Set to not started' : 'Set to complete'}
                  >
                    {!milestone.hasStatus ? 'Not Started' : milestone.isCompleted ? 'Completed' : 'In Progress'}
                  </button>
                  <span className={`flex-1 ${milestone.isCompleted ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                    {milestone.content}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleEditMilestone(e, milestone.id)}
                    className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded transition-colors"
                    title="Edit milestone"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnlinkMilestone(goalId, milestone.id);
                    }}
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded transition-colors"
                    title="Unlink milestone"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {index < decryptedMilestones.length - 1 && (
                  <hr className="mt-2 border-gray-200" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
