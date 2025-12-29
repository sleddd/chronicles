'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { TopicIcon } from '@/components/topics/IconPicker';

interface CustomField {
  id: string;
  entryId: string;
  encryptedData: string;
  iv: string;
}

interface Entry {
  id: string;
  encryptedContent: string;
  iv: string;
  topicId: string | null;
  customType: string | null;
  entryDate: string;
  custom_fields: CustomField[] | null;
}

interface TaskFields {
  isCompleted: boolean;
  isAutoMigrating: boolean;
}

interface Topic {
  id: string;
  encryptedName: string;
  iv: string;
  color: string;
  icon: string | null;
}

interface Props {
  selectedDate: string;
  onDateChange: (date: string) => void;
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string | null) => void;
  onEntryCreated: () => void;
  today: string;
}

export function EntriesList({
  selectedDate,
  onDateChange,
  selectedEntryId,
  onSelectEntry,
  onEntryCreated,
  today,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, string>>(new Map());
  const [decryptedTopics, setDecryptedTopics] = useState<Map<string, string>>(new Map());
  const [taskFields, setTaskFields] = useState<Map<string, TaskFields>>(new Map());
  const [quickEntry, setQuickEntry] = useState('');
  const [filterTopicId, setFilterTopicId] = useState<string | null>(null);
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  const fetchEntries = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedDate && !filterTopicId) params.set('date', selectedDate);
    if (filterTopicId) params.set('topicId', filterTopicId);

    const response = await fetch(`/api/entries?${params}`);
    const data = await response.json();
    setEntries(data.entries || []);
  }, [selectedDate, filterTopicId]);

  const fetchTopics = useCallback(async () => {
    const response = await fetch('/api/topics');
    const data = await response.json();
    setTopics(data.topics || []);
  }, []);

  const decryptEntries = useCallback(async () => {
    const decrypted = new Map<string, string>();
    for (const entry of entries) {
      try {
        const content = await decryptData(entry.encryptedContent, entry.iv);
        const plainText = content.replace(/<[^>]*>/g, '');
        decrypted.set(entry.id, plainText.slice(0, 100) + (plainText.length > 100 ? '...' : ''));
      } catch {
        decrypted.set(entry.id, 'Decryption failed');
      }
    }
    setDecryptedEntries(decrypted);
  }, [entries, decryptData]);

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

  const decryptTaskFields = useCallback(async () => {
    const fields = new Map<string, TaskFields>();
    for (const entry of entries) {
      if (entry.customType === 'task' && entry.custom_fields) {
        let isCompleted = false;
        let isAutoMigrating = false;

        for (const cf of entry.custom_fields) {
          try {
            const decryptedJson = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(decryptedJson);
            if (parsed.fieldKey === 'isCompleted') {
              isCompleted = parsed.value === true;
            }
            if (parsed.fieldKey === 'isAutoMigrating') {
              isAutoMigrating = parsed.value === true;
            }
          } catch {
            // Skip failed fields
          }
        }

        fields.set(entry.id, { isCompleted, isAutoMigrating });
      }
    }
    setTaskFields(fields);
  }, [entries, decryptData]);

  const handleTaskToggle = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const currentFields = taskFields.get(entryId);
    if (!currentFields) return;

    const newIsCompleted = !currentFields.isCompleted;

    // Optimistically update UI
    setTaskFields((prev) => {
      const updated = new Map(prev);
      updated.set(entryId, { ...currentFields, isCompleted: newIsCompleted });
      return updated;
    });

    try {
      // Re-encrypt both custom fields with updated isCompleted
      const isCompletedField = JSON.stringify({ fieldKey: 'isCompleted', value: newIsCompleted });
      const isAutoMigratingField = JSON.stringify({ fieldKey: 'isAutoMigrating', value: currentFields.isAutoMigrating });

      const encryptedCompleted = await encryptData(isCompletedField);
      const encryptedAutoMigrating = await encryptData(isAutoMigratingField);

      const customFields = [
        { encryptedData: encryptedCompleted.ciphertext, iv: encryptedCompleted.iv },
        { encryptedData: encryptedAutoMigrating.ciphertext, iv: encryptedAutoMigrating.iv },
      ];

      await fetch(`/api/entries/${entryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields }),
      });
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
      // Revert on error
      setTaskFields((prev) => {
        const updated = new Map(prev);
        updated.set(entryId, currentFields);
        return updated;
      });
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  useEffect(() => {
    if (isKeyReady && entries.length > 0) {
      decryptEntries();
    }
  }, [entries, isKeyReady, decryptEntries]);

  useEffect(() => {
    if (isKeyReady && topics.length > 0) {
      decryptTopics();
    }
  }, [topics, isKeyReady, decryptTopics]);

  useEffect(() => {
    if (isKeyReady && entries.length > 0) {
      decryptTaskFields();
    }
  }, [entries, isKeyReady, decryptTaskFields]);

  const handleQuickEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEntry.trim() || !isKeyReady) return;

    const { ciphertext, iv } = await encryptData(quickEntry);

    // Always save new entries to today (user's timezone)
    await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encryptedContent: ciphertext,
        iv,
        entryDate: today,
      }),
    });

    setQuickEntry('');
    onEntryCreated();
    fetchEntries();
  };

  const getTopic = (topicId: string | null) => {
    if (!topicId) return null;
    return topics.find(t => t.id === topicId) || null;
  };

  const getTopicName = (topicId: string | null) => {
    if (!topicId) return null;
    return decryptedTopics.get(topicId) || 'Loading...';
  };

  const handleIconClick = (topicId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFilterTopicId(topicId);
  };

  const clearFilter = () => {
    setFilterTopicId(null);
  };

  return (
    <div className="p-4 bg-gray-50 h-full">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Journal</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
          disabled={!!filterTopicId}
        />
      </div>

      {filterTopicId && (() => {
        const topic = getTopic(filterTopicId);
        const topicName = getTopicName(filterTopicId);
        if (!topic) return null;
        return (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-white border rounded-md">
            <TopicIcon iconName={topic.icon} color={topic.color} size="sm" />
            <span className="text-sm text-gray-700">
              Filtering by: <strong>{topicName}</strong>
            </span>
            <button
              onClick={clearFilter}
              className="ml-auto text-gray-400 hover:text-gray-600 text-sm"
            >
              × Clear
            </button>
          </div>
        );
      })()}

      <form onSubmit={handleQuickEntry} className="mb-4">
        <input
          type="text"
          value={quickEntry}
          onChange={(e) => setQuickEntry(e.target.value)}
          placeholder="Quick entry... (press Enter)"
          className="w-full px-3 py-2 border rounded-md bg-white text-gray-900 placeholder-gray-400"
        />
      </form>

      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-gray-500 text-sm">No entries for this date</p>
        )}
        {entries.map((entry) => {
          const isTask = entry.customType === 'task';
          const taskData = isTask ? taskFields.get(entry.id) : null;
          const isCompleted = taskData?.isCompleted ?? false;

          return (
            <div
              key={entry.id}
              onClick={() => onSelectEntry(entry.id)}
              className={`p-3 border rounded-md cursor-pointer bg-white ${
                selectedEntryId === entry.id ? 'ring-2 ring-indigo-500 border-indigo-300' : 'hover:border-gray-400'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {entry.topicId && (() => {
                  const topic = getTopic(entry.topicId);
                  const topicName = getTopicName(entry.topicId);
                  if (!topic) return null;
                  return (
                    <button
                      type="button"
                      onClick={(e) => handleIconClick(entry.topicId!, e)}
                      className="text-xs px-1.5 py-1 rounded flex items-center justify-center hover:ring-2 hover:ring-gray-300 transition-all"
                      style={{
                        backgroundColor: `${topic.color}20`,
                      }}
                      title={`Filter by ${topicName}`}
                    >
                      <TopicIcon iconName={topic.icon} color={topic.color} size="sm" />
                    </button>
                  );
                })()}
                {isTask && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Task</span>
                )}
              </div>
              <div className="flex items-start gap-2">
                {isTask && (
                  <button
                    type="button"
                    onClick={(e) => handleTaskToggle(entry.id, e)}
                    className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      isCompleted
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {isCompleted && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )}
                <p className={`text-sm ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                  {decryptedEntries.get(entry.id) || 'Decrypting...'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onSelectEntry(null)}
        className="w-full mt-4 py-2 text-sm text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-300 rounded-md bg-white"
      >
        + New Entry
      </button>
    </div>
  );
}
