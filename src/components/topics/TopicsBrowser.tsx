'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { generateTopicToken } from '@/lib/crypto/topicTokens';
import Link from 'next/link';
import { IconPicker, TopicIcon } from './IconPicker';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

interface SortableTopicItemProps {
  topic: Topic;
  isSelected: boolean;
  decryptedName: string;
  isEditing: boolean;
  editingTopic: { id: string; name: string; color: string; icon: string | null } | null;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onEditChange: (updates: Partial<{ name: string; color: string; icon: string | null }>) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

function SortableTopicItem({
  topic,
  isSelected,
  decryptedName,
  isEditing,
  editingTopic,
  onSelect,
  onEdit,
  onDelete,
  onEditChange,
  onEditSave,
  onEditCancel,
}: SortableTopicItemProps) {
  const { accentColor } = useAccentColor();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: topic.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (isEditing && editingTopic) {
    return (
      <div ref={setNodeRef} style={style} className="p-3 backdrop-blur-sm bg-white/30 border border-border rounded-lg space-y-3">
        <input
          type="text"
          value={editingTopic.name}
          onChange={(e) => onEditChange({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditSave();
            if (e.key === 'Escape') onEditCancel();
          }}
          className="w-full px-3 py-2 text-sm border border-border rounded backdrop-blur-sm bg-white/30 text-gray-900"
          autoFocus
        />
        <div className="border rounded p-2 backdrop-blur-sm bg-white/30">
          <p className="text-xs text-gray-500 mb-1">Icon:</p>
          <IconPicker
            selectedIcon={editingTopic.icon}
            onSelectIcon={(icon) => onEditChange({ icon })}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEditSave}
            className="flex-1 px-3 py-1.5 text-sm text-white rounded"
            style={{ backgroundColor: accentColor }}
          >
            Save
          </button>
          <button
            onClick={onEditCancel}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
        isSelected
          ? 'backdrop-blur-sm bg-white/50 text-gray-900 font-medium'
          : 'hover:backdrop-blur-sm bg-white/50 text-gray-900'
      } ${isDragging ? 'shadow-lg z-10' : ''}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none opacity-0 group-hover:opacity-100 transition-opacity"
        {...attributes}
        {...listeners}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
        </svg>
      </button>

      <button
        onClick={onSelect}
        className="flex items-center gap-2 flex-1 text-left"
      >
        <TopicIcon iconName={topic.icon} size="sm" />
        {decryptedName}
      </button>

      {/* Edit/Delete buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 text-gray-400 hover:text-gray-600"
          title="Edit"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-500"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function TopicsBrowser() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [decryptedTopics, setDecryptedTopics] = useState<Map<string, string>>(new Map());
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, string>>(new Map());
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [mobileEntriesExpanded, setMobileEntriesExpanded] = useState(false);
  const { decryptData, encryptData, isKeyReady } = useEncryption();
  const { accentColor, hoverColor } = useAccentColor();

  // CRUD state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicColor, setNewTopicColor] = useState(PRESET_COLORS[0]);
  const [newTopicIcon, setNewTopicIcon] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingTopic, setEditingTopic] = useState<{ id: string; name: string; color: string; icon: string | null } | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const decryptTopicsData = useCallback(async () => {
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

  // CRUD handlers
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
      setShowAddForm(false);
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
        setSelectedTopicId(null);
      }
      await fetchTopics();
    } catch (error) {
      console.error('Failed to delete topic:', error);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = topics.findIndex((t) => t.id === active.id);
      const newIndex = topics.findIndex((t) => t.id === over.id);

      const newTopics = arrayMove(topics, oldIndex, newIndex);
      setTopics(newTopics);

      // Save new order to server
      const topicIds = newTopics.map((t) => t.id);
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
    }
  };

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  useEffect(() => {
    if (isKeyReady && topics.length > 0) {
      decryptTopicsData();
    }
  }, [topics, isKeyReady, decryptTopicsData]);

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
    <div className="flex flex-row h-full backdrop-blur-sm bg-white/30">
      {/* Topics sidebar - hidden on mobile when viewing entries */}
      <div
        className={`backdrop-blur-sm bg-white/30 overflow-auto ${
          mobileEntriesExpanded ? 'hidden md:block md:w-72' : 'flex-1 md:w-72 md:flex-none'
        }`}
      >
        {/* Topics list */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Topics</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="p-1 rounded hover:backdrop-blur-sm bg-white/50 transition-colors"
              title={showAddForm ? 'Cancel' : 'Add topic'}
              style={{ color: accentColor }}
            >
              {showAddForm ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>
          </div>

          {/* Add new topic form */}
          {showAddForm && (
            <div className="mb-4 p-3 backdrop-blur-sm bg-white/30 border border-border rounded-lg space-y-3">
              <input
                type="text"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                placeholder="Topic name"
                className="w-full px-3 py-2 text-sm border border-border rounded backdrop-blur-sm bg-white/30 text-gray-900 placeholder-gray-400"
                autoFocus
              />
              <div className="border rounded p-2 backdrop-blur-sm bg-white/30">
                <p className="text-xs text-gray-500 mb-1">Icon (optional):</p>
                <IconPicker
                  selectedIcon={newTopicIcon}
                  onSelectIcon={setNewTopicIcon}
                />
              </div>
              <button
                onClick={handleAddTopic}
                disabled={isAdding || !newTopicName.trim()}
                className="w-full px-3 py-2 text-sm text-white rounded disabled:bg-gray-400"
                style={{ backgroundColor: (isAdding || !newTopicName.trim()) ? undefined : accentColor }}
              >
                {isAdding ? 'Adding...' : 'Add Topic'}
              </button>
            </div>
          )}

          <button
            onClick={() => handleTopicSelect(null)}
            className={`w-full text-left px-3 py-2 pl-5 ml-3 rounded-md text-sm mb-2 ${
              selectedTopicId === null
                ? 'backdrop-blur-sm bg-white/50 text-gray-900 font-medium'
                : 'hover:backdrop-blur-sm bg-white/50 text-gray-900'
            }`}
          >
            All Entries
          </button>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={topics.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {topics.map((topic) => (
                  <SortableTopicItem
                    key={topic.id}
                    topic={topic}
                    isSelected={selectedTopicId === topic.id}
                    decryptedName={decryptedTopics.get(topic.id) || 'Loading...'}
                    isEditing={editingTopic?.id === topic.id}
                    editingTopic={editingTopic}
                    onSelect={() => handleTopicSelect(topic.id)}
                    onEdit={() => setEditingTopic({
                      id: topic.id,
                      name: decryptedTopics.get(topic.id) || '',
                      color: topic.color,
                      icon: topic.icon,
                    })}
                    onDelete={() => handleDeleteTopic(topic.id)}
                    onEditChange={(updates) => {
                      if (editingTopic) {
                        setEditingTopic({ ...editingTopic, ...updates });
                      }
                    }}
                    onEditSave={() => {
                      if (editingTopic) {
                        handleEditTopic(topic.id, editingTopic.name, editingTopic.color, editingTopic.icon);
                      }
                    }}
                    onEditCancel={() => setEditingTopic(null)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {topics.length === 0 && !showAddForm && (
            <p className="text-sm text-gray-500 mt-4">No topics yet. Click + to create one.</p>
          )}
        </div>
      </div>

      {/* Entries list - full screen on mobile when viewing, always visible on desktop */}
      <div
        className={`overflow-auto backdrop-blur-sm bg-white/30 flex-1 ${
          mobileEntriesExpanded ? 'block' : 'hidden md:block'
        }`}
      >
        {/* Entries content */}
        <div className="p-6">
          {/* Back button on mobile */}
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
            <h1 className="text-1xl font-semibold text-gray-900">
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
                  className="block p-3 mb-[5px] backdrop-blur-sm bg-white/30 border border-border rounded-md hover:border-teal-300 hover:shadow-sm transition-all"
                >
                  {entry.topicId && selectedTopicId === null && (
                    <div className="flex items-center gap-2 mb-2">
                      {(() => {
                        const topic = topics.find(t => t.id === entry.topicId);
                        return (
                          <span className="text-xs py-1 mb-[10px] rounded flex items-center gap-1 backdrop-blur-md bg-white/50 text-gray-700">
                            <TopicIcon iconName={topic?.icon || null} size="sm" />
                            {decryptedTopics.get(entry.topicId) || 'Loading...'}
                          </span>
                        );
                      })()}
                    </div>
                  )}
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
