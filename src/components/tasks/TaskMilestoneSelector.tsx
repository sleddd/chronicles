'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface Milestone {
  id: string;
  encryptedContent: string;
  iv: string;
}

interface Props {
  selectedMilestoneIds: string[];
  onMilestoneIdsChange: (milestoneIds: string[]) => void;
}

export function TaskMilestoneSelector({
  selectedMilestoneIds,
  onMilestoneIdsChange,
}: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [decryptedMilestones, setDecryptedMilestones] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const { decryptData, isKeyReady } = useEncryption();

  const fetchMilestones = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/entries?customType=milestone');
      const data = await response.json();
      setMilestones(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch milestones:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
    fetchMilestones();
  }, [fetchMilestones]);

  useEffect(() => {
    decryptMilestoneTitles();
  }, [decryptMilestoneTitles]);

  const toggleMilestone = (milestoneId: string) => {
    const currentSet = new Set(selectedMilestoneIds);
    if (currentSet.has(milestoneId)) {
      currentSet.delete(milestoneId);
    } else {
      currentSet.add(milestoneId);
    }
    onMilestoneIdsChange(Array.from(currentSet));
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading milestones...</p>;
  }

  if (milestones.length === 0) {
    return <p className="text-sm text-gray-500">No milestones available</p>;
  }

  return (
    <div className="border rounded-md max-h-40 overflow-y-auto">
      {milestones.map((milestone) => (
        <label
          key={milestone.id}
          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
        >
          <input
            type="checkbox"
            checked={selectedMilestoneIds.includes(milestone.id)}
            onChange={() => toggleMilestone(milestone.id)}
            className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
          />
          <span className="text-sm text-gray-700">
            {decryptedMilestones.get(milestone.id) || 'Loading...'}
          </span>
        </label>
      ))}
    </div>
  );
}
