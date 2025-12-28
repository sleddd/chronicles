'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import Link from 'next/link';

interface Topic {
  id: string;
  encryptedName: string;
  iv: string;
  color: string;
}

interface Entry {
  id: string;
  encryptedContent: string;
  iv: string;
  topicId: string | null;
  entryDate: string;
}

export function TopicsBrowser() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [decryptedTopics, setDecryptedTopics] = useState<Map<string, string>>(new Map());
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, string>>(new Map());
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const { decryptData, isKeyReady } = useEncryption();

  const fetchTopics = useCallback(async () => {
    try {
      const response = await fetch('/api/topics');
      const data = await response.json();
      setTopics(data.topics || []);
    } catch (error) {
      console.error('Failed to fetch topics:', error);
    }
  }, []);

  const fetchEntriesByTopic = useCallback(async (topicId: string | null) => {
    try {
      const params = new URLSearchParams();
      if (topicId) params.set('topicId', topicId);

      const response = await fetch(`/api/entries?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch entries:', error);
    }
  }, []);

  const decryptTopics = useCallback(async () => {
    const decrypted = new Map<string, string>();
    for (const topic of topics) {
      try {
        const name = await decryptData(topic.encryptedName, topic.iv);
        decrypted.set(topic.id, name);
      } catch {
        decrypted.set(topic.id, 'Unknown');
      }
    }
    setDecryptedTopics(decrypted);
  }, [topics, decryptData]);

  const decryptEntries = useCallback(async () => {
    const decrypted = new Map<string, string>();
    for (const entry of entries) {
      try {
        const content = await decryptData(entry.encryptedContent, entry.iv);
        const plainText = content.replace(/<[^>]*>/g, '');
        decrypted.set(entry.id, plainText.slice(0, 150) + (plainText.length > 150 ? '...' : ''));
      } catch {
        decrypted.set(entry.id, 'Decryption failed');
      }
    }
    setDecryptedEntries(decrypted);
  }, [entries, decryptData]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  useEffect(() => {
    if (isKeyReady && topics.length > 0) {
      decryptTopics();
    }
  }, [topics, isKeyReady, decryptTopics]);

  useEffect(() => {
    fetchEntriesByTopic(selectedTopicId);
  }, [selectedTopicId, fetchEntriesByTopic]);

  useEffect(() => {
    if (isKeyReady && entries.length > 0) {
      decryptEntries();
    }
  }, [entries, isKeyReady, decryptEntries]);

  if (!isKeyReady) {
    return <div className="p-8 text-gray-500">Waiting for encryption key...</div>;
  }

  return (
    <div className="flex h-full bg-white">
      {/* Topics sidebar */}
      <div className="w-64 border-r bg-gray-50 overflow-auto">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Topics</h2>

          <button
            onClick={() => setSelectedTopicId(null)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm mb-1 ${
              selectedTopicId === null
                ? 'bg-indigo-100 text-indigo-800'
                : 'hover:bg-gray-200 text-gray-900'
            }`}
          >
            All Entries
          </button>

          <div className="space-y-1">
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => setSelectedTopicId(topic.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                  selectedTopicId === topic.id
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'hover:bg-gray-200 text-gray-900'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: topic.color }}
                />
                {decryptedTopics.get(topic.id) || 'Loading...'}
              </button>
            ))}
          </div>

          {topics.length === 0 && (
            <p className="text-sm text-gray-500 mt-4">No topics yet. Create one when adding an entry.</p>
          )}
        </div>
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-auto p-6 bg-white">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            {selectedTopicId
              ? decryptedTopics.get(selectedTopicId) || 'Loading...'
              : 'All Entries'}
          </h1>
          <Link
            href="/"
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            Back to Journal
          </Link>
        </div>

        {entries.length === 0 ? (
          <p className="text-gray-500">No entries found.</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={`/?entry=${entry.id}`}
                className="block p-4 bg-white border rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500">
                    {new Date(entry.entryDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  {entry.topicId && selectedTopicId === null && (() => {
                    const topic = topics.find(t => t.id === entry.topicId);
                    const color = topic?.color || '#6366F1';
                    return (
                      <span
                        className="text-xs px-2 py-0.5 rounded flex items-center gap-1"
                        style={{
                          backgroundColor: `${color}20`,
                          color: color,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {decryptedTopics.get(entry.topicId) || 'Loading...'}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-sm text-gray-900">
                  {decryptedEntries.get(entry.id) || 'Decrypting...'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
