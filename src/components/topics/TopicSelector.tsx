'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { generateTopicToken } from '@/lib/crypto/topicTokens';
import { IconPicker, TopicIcon } from './IconPicker';

interface Topic {
  id: string;
  encryptedName: string;
  iv: string;
  color: string;
  icon: string | null;
}

interface Props {
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
}

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#10B981', // green
  '#F59E0B', // amber
  '#EC4899', // pink
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
];

export function TopicSelector({ selectedTopicId, onSelectTopic }: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [decryptedTopics, setDecryptedTopics] = useState<Map<string, string>>(new Map());
  const [isOpen, setIsOpen] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicColor, setNewTopicColor] = useState(PRESET_COLORS[0]);
  const [newTopicIcon, setNewTopicIcon] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<{ id: string; name: string; color: string; icon: string | null } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  const fetchTopics = useCallback(async () => {
    try {
      const response = await fetch('/api/topics');
      const data = await response.json();
      setTopics(data.topics || []);
    } catch (error) {
      console.error('Failed to fetch topics:', error);
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

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  useEffect(() => {
    if (isKeyReady && topics.length > 0) {
      decryptTopics();
    }
  }, [topics, isKeyReady, decryptTopics]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowManage(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddTopic = async () => {
    if (!newTopicName.trim() || !isKeyReady) return;
    setIsAdding(true);

    try {
      const { encryptionKey } = useEncryption.getState();
      const { ciphertext, iv } = await encryptData(newTopicName);
      const nameToken = await generateTopicToken(newTopicName, encryptionKey!);

      await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedName: ciphertext,
          iv,
          nameToken,
          color: newTopicColor,
          icon: newTopicIcon,
        }),
      });

      setNewTopicName('');
      setNewTopicColor(PRESET_COLORS[0]);
      setNewTopicIcon(null);
      await fetchTopics();
    } catch (error) {
      console.error('Failed to add topic:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditTopic = async (topicId: string, newName: string, newColor: string, newIcon: string | null) => {
    if (!newName.trim() || !isKeyReady) return;

    try {
      const { encryptionKey } = useEncryption.getState();
      const { ciphertext, iv } = await encryptData(newName);
      const nameToken = await generateTopicToken(newName, encryptionKey!);

      await fetch(`/api/topics/${topicId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedName: ciphertext,
          iv,
          nameToken,
          color: newColor,
          icon: newIcon,
        }),
      });

      setEditingTopic(null);
      await fetchTopics();
    } catch (error) {
      console.error('Failed to edit topic:', error);
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('Delete this topic? Entries with this topic will become untagged.')) return;

    try {
      await fetch(`/api/topics/${topicId}`, {
        method: 'DELETE',
      });

      if (selectedTopicId === topicId) {
        onSelectTopic(null);
      }
      await fetchTopics();
    } catch (error) {
      console.error('Failed to delete topic:', error);
    }
  };

  const handleMoveTopic = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= topics.length) return;

    // Create new order by swapping
    const newTopics = [...topics];
    [newTopics[index], newTopics[newIndex]] = [newTopics[newIndex], newTopics[index]];
    const topicIds = newTopics.map(t => t.id);

    // Optimistically update UI
    setTopics(newTopics);

    try {
      await fetch('/api/topics/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicIds }),
      });
    } catch (error) {
      console.error('Failed to reorder topics:', error);
      await fetchTopics(); // Revert on error
    }
  };

  const selectedTopic = topics.find(t => t.id === selectedTopicId);
  const selectedTopicName = selectedTopicId ? decryptedTopics.get(selectedTopicId) : null;

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 text-sm rounded-md bg-white hover:bg-gray-50 flex items-center gap-2"
        >
          {selectedTopic && (
            <TopicIcon iconName={selectedTopic.icon} color={selectedTopic.color} size="sm" />
          )}
          <span className={selectedTopicName ? 'text-gray-900' : 'text-gray-500'}>
            {selectedTopicName || 'None'}
          </span>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-72 bg-white border rounded-md shadow-lg">
          {!showManage ? (
            <>
              <div className="p-2 border-b max-h-64 overflow-auto">
                <button
                  onClick={() => {
                    onSelectTopic(null);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                    !selectedTopicId ? 'bg-teal-50 text-teal-700' : 'text-gray-900'
                  }`}
                >
                  None
                </button>
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => {
                      onSelectTopic(topic.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 flex items-center gap-2 ${
                      selectedTopicId === topic.id ? 'bg-teal-50 text-teal-700' : 'text-gray-900'
                    }`}
                  >
                    <TopicIcon iconName={topic.icon} color={topic.color} size="sm" />
                    {decryptedTopics.get(topic.id) || 'Loading...'}
                  </button>
                ))}
              </div>
              <div className="p-2">
                <button
                  onClick={() => setShowManage(true)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 rounded"
                  style={{ color: '#1aaeae' }}
                >
                  Manage Topics...
                </button>
              </div>
            </>
          ) : (
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm text-gray-900">Manage Topics</h3>
                <button
                  onClick={() => setShowManage(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Add new topic */}
              <div className="mb-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                    placeholder="New topic name"
                    className="flex-1 px-2 py-1 text-sm border rounded bg-white text-gray-900 placeholder-gray-400"
                  />
                  <button
                    onClick={handleAddTopic}
                    disabled={isAdding || !newTopicName.trim()}
                    className="px-2 py-1 text-sm text-white rounded disabled:bg-gray-400"
                    style={{ backgroundColor: (isAdding || !newTopicName.trim()) ? undefined : '#1aaeae' }}
                    onMouseOver={(e) => { if (!isAdding && newTopicName.trim()) e.currentTarget.style.backgroundColor = '#158f8f'; }}
                    onMouseOut={(e) => { if (!isAdding && newTopicName.trim()) e.currentTarget.style.backgroundColor = '#1aaeae'; }}
                  >
                    Add
                  </button>
                </div>
                <div className="flex gap-1 flex-wrap items-center">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTopicColor(color)}
                      className={`w-5 h-5 rounded-full border-2 ${
                        newTopicColor === color ? 'border-gray-800' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={newTopicColor}
                    onChange={(e) => setNewTopicColor(e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                    title="Custom color"
                  />
                </div>
                <div className="border rounded p-1">
                  <p className="text-xs text-gray-500 mb-1 px-1">Icon (optional):</p>
                  <IconPicker
                    selectedIcon={newTopicIcon}
                    onSelectIcon={setNewTopicIcon}
                    color={newTopicColor}
                  />
                </div>
              </div>

              {/* Topic list */}
              <div className="space-y-2 max-h-48 overflow-auto">
                {topics.length === 0 && (
                  <p className="text-sm text-gray-500">No topics yet</p>
                )}
                {topics.map((topic, index) => (
                  <div key={topic.id} className="flex items-center gap-2">
                    {editingTopic?.id === topic.id ? (
                      <div className="flex-1 space-y-2 border rounded p-2 bg-gray-50">
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={editingTopic.name}
                            onChange={(e) => setEditingTopic({ ...editingTopic, name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditTopic(topic.id, editingTopic.name, editingTopic.color, editingTopic.icon);
                              if (e.key === 'Escape') setEditingTopic(null);
                            }}
                            className="flex-1 px-2 py-1 text-sm border rounded bg-white text-gray-900"
                            autoFocus
                          />
                          <button
                            onClick={() => handleEditTopic(topic.id, editingTopic.name, editingTopic.color, editingTopic.icon)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setEditingTopic(null)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditingTopic({ ...editingTopic, color })}
                              className={`w-4 h-4 rounded-full border-2 ${
                                editingTopic.color === color ? 'border-gray-800' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                          <input
                            type="color"
                            value={editingTopic.color}
                            onChange={(e) => setEditingTopic({ ...editingTopic, color: e.target.value })}
                            className="w-4 h-4 rounded cursor-pointer border-0 p-0"
                            title="Custom color"
                          />
                        </div>
                        <div className="border rounded p-1 bg-white">
                          <p className="text-xs text-gray-500 mb-1 px-1">Icon:</p>
                          <IconPicker
                            selectedIcon={editingTopic.icon}
                            onSelectIcon={(icon) => setEditingTopic({ ...editingTopic, icon })}
                            color={editingTopic.color}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Reorder buttons */}
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleMoveTopic(index, 'up')}
                            disabled={index === 0}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleMoveTopic(index, 'down')}
                            disabled={index === topics.length - 1}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                        <TopicIcon iconName={topic.icon} color={topic.color} size="sm" />
                        <span className="flex-1 text-sm truncate text-gray-900">
                          {decryptedTopics.get(topic.id) || 'Loading...'}
                        </span>
                        <button
                          onClick={() => setEditingTopic({
                            id: topic.id,
                            name: decryptedTopics.get(topic.id) || '',
                            color: topic.color,
                            icon: topic.icon,
                          })}
                          className="text-gray-400 hover:text-gray-600"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteTopic(topic.id)}
                          className="text-red-400 hover:text-red-600"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
