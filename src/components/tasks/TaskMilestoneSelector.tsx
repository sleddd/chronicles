'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';

interface Props {
  selectedMilestoneIds: string[];
  onMilestoneIdsChange: (milestoneIds: string[]) => void;
}

export function TaskMilestoneSelector({
  selectedMilestoneIds = [],
  onMilestoneIdsChange,
}: Props) {
  const [decryptedMilestones, setDecryptedMilestones] = useState<Map<string, string>>(new Map());
  const { decryptData, isKeyReady } = useEncryption();
  const { getEntriesByType, isInitialized } = useEntriesCache();

  // Get milestones from cache
  const milestones = useMemo(() => {
    if (!isInitialized) return [];
    return getEntriesByType('milestone');
  }, [isInitialized, getEntriesByType]);

  const decryptMilestoneTitles = useCallback(async () => {
    if (!isKeyReady || milestones.length === 0) return;

    const decrypted = new Map<string, string>();
    for (const milestone of milestones) {
      try {
        const content = await decryptData(milestone.encryptedContent, milestone.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();
        decrypted.set(milestone.id, plainText.split('\n')[0] || 'Untitled Milestone');
      } catch {
        decrypted.set(milestone.id, 'Decryption failed');
      }
    }
    setDecryptedMilestones(decrypted);
  }, [milestones, decryptData, isKeyReady]);

  useEffect(() => {
    decryptMilestoneTitles();
  }, [decryptMilestoneTitles]);

  const toggleMilestone = (milestoneId: string) => {
    const currentSet = new Set(selectedMilestoneIds || []);
    if (currentSet.has(milestoneId)) {
      currentSet.delete(milestoneId);
    } else {
      currentSet.add(milestoneId);
    }
    onMilestoneIdsChange(Array.from(currentSet));
  };

  if (!isInitialized) {
    return <p className="text-sm text-gray-500">Loading milestones...</p>;
  }

  if (milestones.length === 0) {
    return <p className="text-sm text-gray-500">No milestones available</p>;
  }

  return (
    <div className="rounded-md max-h-40 overflow-y-auto">
      {milestones.map((milestone) => (
        <label
          key={milestone.id}
          className="flex items-center gap-3 py-2 hover:backdrop-blur-sm bg-white/30 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={(selectedMilestoneIds || []).includes(milestone.id)}
            onChange={() => toggleMilestone(milestone.id)}
            className="w-4 h-4 text-gray-600 rounded border-border "
          />
          <span className="text-sm text-gray-700">
            {decryptedMilestones.get(milestone.id) || 'Loading...'}
          </span>
        </label>
      ))}
    </div>
  );
}
