'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Entry {
  id: string;
  encryptedContent: string;
  iv: string;
  entryDate: string | Date | null;
  createdAt: string | Date;
}

interface Props {
  topicName: string;
  refreshKey: number;
  onDataChange: () => void;
}

export function TopicEntriesTab({ topicName, refreshKey }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, string>>(new Map());
  const [matchedTopicId, setMatchedTopicId] = useState<string | null>(null);
  const [matchedTopicName, setMatchedTopicName] = useState<string | null>(null);
  const { decryptData, isKeyReady } = useEncryption();
  const { getAllTopics, getEntriesByTopic, isInitialized } = useEntriesCache();

  // Get topics from cache
  const topics = useMemo(() => {
    if (!isInitialized) return [];
    return getAllTopics();
  }, [isInitialized, getAllTopics]);

  // Get entries from cache based on matched topic
  const entries = useMemo(() => {
    if (!isInitialized || !matchedTopicId) return [];
    return getEntriesByTopic(matchedTopicId);
  }, [isInitialized, matchedTopicId, getEntriesByTopic]);

  const handleEditEntry = (entryId: string) => {
    router.push(`/?entry=${entryId}`);
  };

  // Find the matching topic by decrypting topic names
  const findMatchingTopic = useCallback(async () => {
    if (!isKeyReady || topics.length === 0) return;

    setLoading(true);
    try {
      // Decrypt topic names and find case-insensitive match
      for (const topic of topics) {
        try {
          const decryptedName = await decryptData(topic.encryptedName, topic.iv);
          // Case-insensitive comparison
          if (decryptedName.toLowerCase() === topicName.toLowerCase()) {
            setMatchedTopicId(topic.id);
            setMatchedTopicName(decryptedName);
            setLoading(false);
            return;
          }
        } catch {
          // Skip topics that fail to decrypt
        }
      }

      // No match found
      setMatchedTopicId(null);
      setMatchedTopicName(null);
    } catch (error) {
      console.error(`Failed to find topic ${topicName}:`, error);
    } finally {
      setLoading(false);
    }
  }, [topicName, isKeyReady, decryptData, topics]);

  const decryptEntriesData = useCallback(async () => {
    if (!isKeyReady || entries.length === 0) return;

    const decrypted = new Map<string, string>();

    for (const entry of entries) {
      try {
        const content = await decryptData(entry.encryptedContent, entry.iv);
        // Strip HTML tags for display
        const plainText = content.replace(/<[^>]*>/g, '').trim();
        decrypted.set(entry.id, plainText || 'Untitled');
      } catch {
        decrypted.set(entry.id, 'Decryption failed');
      }
    }

    setDecryptedEntries(decrypted);
  }, [entries, decryptData, isKeyReady]);

  useEffect(() => {
    findMatchingTopic();
  }, [findMatchingTopic, refreshKey]);

  useEffect(() => {
    decryptEntriesData();
  }, [decryptEntriesData]);

  // Normalize date to YYYY-MM-DD string format
  const normalizeDate = (dateValue: string | Date | null | undefined): string => {
    if (!dateValue) return 'unknown';

    // If it's already a string in YYYY-MM-DD format, return it
    if (typeof dateValue === 'string') {
      // Check if it's an ISO date string with time component
      if (dateValue.includes('T')) {
        return dateValue.split('T')[0];
      }
      // Already in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue;
      }
    }

    // If it's a Date object or other format, convert it
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return 'unknown';

    // Format as YYYY-MM-DD
    return date.toISOString().split('T')[0];
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'unknown') {
      return 'Unknown Date';
    }
    const date = new Date(dateStr + 'T12:00:00');
    if (isNaN(date.getTime())) {
      return 'Unknown Date';
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group entries by date - use entryDate, fall back to createdAt date portion
  const entriesByDate = entries.reduce((acc, entry) => {
    let date = normalizeDate(entry.entryDate);
    if (date === 'unknown' && entry.createdAt) {
      date = normalizeDate(entry.createdAt);
    }
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, Entry[]>);

  const sortedDates = Object.keys(entriesByDate).sort((a, b) => b.localeCompare(a));

  // Display name: use matched topic name if found, otherwise use the requested name
  const displayName = matchedTopicName || topicName;

  if (loading || !isInitialized) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-8 py-4 pb-12">
        <div className="text-center py-12">
          <p className="text-gray-500 mb-2">No {displayName.toLowerCase()} entries yet.</p>
          <p className="text-sm text-gray-400">
            Create entries with the &quot;{displayName}&quot; topic from the journal to see them here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-4 pb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
        <span className="text-sm text-gray-500">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
      </div>

      <div className="space-y-6">
        {sortedDates.map((date) => (
          <div key={date}>
            <h3 className="text-sm font-medium text-gray-500 mb-2">{formatDate(date)}</h3>
            <div className="space-y-2">
              {entriesByDate[date].map((entry) => {
                const content = decryptedEntries.get(entry.id) || 'Loading...';
                return (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 p-4 bg-white/60 backdrop-blur-sm rounded-lg border border-border"
                  >
                    <p className="text-gray-900 line-clamp-2 flex-1">{content}</p>
                    <button
                      type="button"
                      onClick={() => handleEditEntry(entry.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                      title="Edit entry"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
