'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import Link from 'next/link';
import { TopicIcon } from './IconPicker';

interface Topic {
  id: string;
  encryptedName: string;
  iv: string;
  color: string;
  icon: string | null;
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
  const [mobileEntriesExpanded, setMobileEntriesExpanded] = useState(false);
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

  const handleTopicSelect = (topicId: string | null) => {
    setSelectedTopicId(topicId);
    setMobileEntriesExpanded(true);
  };

  const handleCollapseEntries = () => {
    setMobileEntriesExpanded(false);
  };

  return (
    <div className="flex flex-row h-full bg-white">
      {/* Topics sidebar - collapses on mobile when entries expanded */}
      <div
        className={`border-r bg-gray-50 overflow-auto transition-all duration-300 ${
          mobileEntriesExpanded ? 'w-0 md:w-64 overflow-hidden' : 'flex-1 md:w-64 md:flex-none'
        }`}
      >
        {/* Topics list */}
        <div className={`p-4 ${mobileEntriesExpanded ? 'hidden md:block' : 'block'}`}>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Topics</h2>

          <button
            onClick={() => handleTopicSelect(null)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm mb-1 ${
              selectedTopicId === null
                ? 'bg-gray-200 text-gray-900 font-medium'
                : 'hover:bg-gray-200 text-gray-900'
            }`}
          >
            All Entries
          </button>

          <div className="space-y-1">
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleTopicSelect(topic.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                  selectedTopicId === topic.id
                    ? 'bg-gray-200 text-gray-900 font-medium'
                    : 'hover:bg-gray-200 text-gray-900'
                }`}
              >
                <span
                  className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: topic.color }}
                >
                  <TopicIcon iconName={topic.icon} color="#ffffff" size="sm" />
                </span>
                {decryptedTopics.get(topic.id) || 'Loading...'}
              </button>
            ))}
          </div>

          {topics.length === 0 && (
            <p className="text-sm text-gray-500 mt-4">No topics yet. Create one when adding an entry.</p>
          )}
        </div>
      </div>

      {/* Entries list - 40px wide when collapsed, full width when expanded (mobile only) */}
      <div
        className={`overflow-auto bg-white transition-all duration-300 ${
          mobileEntriesExpanded ? 'flex-1' : 'w-10 md:flex-1'
        }`}
      >
        {/* Mobile collapsed strip when entries are collapsed */}
        {!mobileEntriesExpanded && (
          <button
            onClick={() => setMobileEntriesExpanded(true)}
            className="md:hidden w-10 h-full flex flex-col items-center justify-center bg-gray-100 border-l"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs text-gray-500 mt-2 writing-mode-vertical" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
              {entries.length > 0 ? `${entries.length} entries` : 'Entries'}
            </span>
          </button>
        )}

        {/* Entries content */}
        <div className={`p-6 ${mobileEntriesExpanded ? 'block' : 'hidden md:block'}`}>
          {/* Back button on mobile when expanded */}
          {mobileEntriesExpanded && (
            <button
              onClick={handleCollapseEntries}
              className="md:hidden flex items-center gap-1 text-sm text-gray-600 mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Topics
            </button>
          )}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">
              {selectedTopicId
                ? decryptedTopics.get(selectedTopicId) || 'Loading...'
                : 'All Entries'}
            </h1>
            <Link
              href="/"
              className="hidden md:inline text-sm text-gray-600 hover:underline"
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
                  className="block p-4 bg-white border rounded-lg hover:border-teal-300 hover:shadow-sm transition-all"
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
                            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            <TopicIcon iconName={topic?.icon || null} color="#ffffff" size="sm" />
                          </span>
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
    </div>
  );
}
