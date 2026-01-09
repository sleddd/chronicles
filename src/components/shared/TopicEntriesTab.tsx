'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Topic {
  id: string;
  encryptedName: string;
  iv: string;
}

interface Entry {
  id: string;
  encryptedContent: string;
  iv: string;
  entryDate: string;
  createdAt: string;
}

interface Props {
  topicName: string;
  refreshKey: number;
  onDataChange: () => void;
}

export function TopicEntriesTab({ topicName, refreshKey }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, string>>(new Map());
  const [matchedTopicName, setMatchedTopicName] = useState<string | null>(null);
  const { decryptData, isKeyReady } = useEncryption();

  const handleEditEntry = (entryId: string) => {
    router.push(`/?entry=${entryId}`);
  };

  const fetchEntries = useCallback(async () => {
    if (!isKeyReady) return;

    setLoading(true);
    try {
      // Fetch all topics first
      const topicsResponse = await fetch('/api/topics');
      if (!topicsResponse.ok) {
        setEntries([]);
        return;
      }
      const topicsData = await topicsResponse.json();
      const topics: Topic[] = topicsData.topics || [];

      // Decrypt topic names and find case-insensitive match
      let matchedTopicId: string | null = null;
      let foundTopicName: string | null = null;

      for (const topic of topics) {
        try {
          const decryptedName = await decryptData(topic.encryptedName, topic.iv);
          // Case-insensitive comparison
          if (decryptedName.toLowerCase() === topicName.toLowerCase()) {
            matchedTopicId = topic.id;
            foundTopicName = decryptedName;
            break;
          }
        } catch {
          // Skip topics that fail to decrypt
        }
      }

      if (!matchedTopicId) {
        setEntries([]);
        setMatchedTopicName(null);
        setLoading(false);
        return;
      }

      setMatchedTopicName(foundTopicName);

      // Fetch entries for the matched topic
      const response = await fetch(`/api/entries?topicId=${matchedTopicId}`);
      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      console.error(`Failed to fetch ${topicName} entries:`, error);
    } finally {
      setLoading(false);
    }
  }, [topicName, isKeyReady, decryptData]);

  const decryptEntries = useCallback(async () => {
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
    fetchEntries();
  }, [fetchEntries, refreshKey]);

  useEffect(() => {
    decryptEntries();
  }, [decryptEntries]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group entries by date
  const entriesByDate = entries.reduce((acc, entry) => {
    const date = entry.entryDate || 'unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, Entry[]>);

  const sortedDates = Object.keys(entriesByDate).sort((a, b) => b.localeCompare(a));

  // Display name: use matched topic name if found, otherwise use the requested name
  const displayName = matchedTopicName || topicName;

  if (loading) {
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
                  <button
                    key={entry.id}
                    onClick={() => handleEditEntry(entry.id)}
                    className="w-full text-left p-4 bg-white/60 backdrop-blur-sm rounded-lg border border-border hover:bg-white/80 transition-colors"
                  >
                    <p className="text-gray-900 line-clamp-2">{content}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
