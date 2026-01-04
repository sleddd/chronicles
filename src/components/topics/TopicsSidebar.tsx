'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { AddTopicModal } from './AddTopicModal';
import { TopicIcon } from './IconPicker';

interface Topic {
  id: string;
  encryptedName: string;
  iv: string;
  nameToken: string;
  color: string;
  icon: string | null;
}

interface Props {
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
}

export function TopicsSidebar({ selectedTopicId, onSelectTopic }: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [decryptedNames, setDecryptedNames] = useState<Map<string, string>>(new Map());
  const [showAddModal, setShowAddModal] = useState(false);
  const { decryptData, isKeyReady } = useEncryption();
  const { accentColor } = useAccentColor();

  const fetchTopics = useCallback(async () => {
    const response = await fetch('/api/topics');
    const data = await response.json();
    setTopics(data.topics || []);
  }, []);

  const decryptTopicNames = useCallback(async () => {
    const names = new Map<string, string>();
    for (const topic of topics) {
      try {
        const name = await decryptData(topic.encryptedName, topic.iv);
        names.set(topic.id, name);
      } catch {
        names.set(topic.id, 'Decryption failed');
      }
    }
    setDecryptedNames(names);
  }, [topics, decryptData]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  useEffect(() => {
    if (isKeyReady && topics.length > 0) {
      decryptTopicNames();
    }
  }, [topics, isKeyReady, decryptTopicNames]);

  return (
    <div className="w-64 backdrop-blur-sm bg-white/10 border-r border-border h-full p-4">
      <h2 className="text-lg font-semibold mb-4">Topics</h2>

      <button
        onClick={() => onSelectTopic(null)}
        className={`w-full text-left px-3 py-2 rounded mb-2 ${
          selectedTopicId === null ? 'bg-gray-100 text-gray-700' : 'hover:bg-white/20'
        }`}
      >
        All Entries
      </button>

      <div className="space-y-1">
        {topics.map((topic) => (
          <button
            key={topic.id}
            onClick={() => onSelectTopic(topic.id)}
            className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 ${
              selectedTopicId === topic.id ? 'bg-gray-100 text-gray-700' : 'hover:bg-white/20'
            }`}
          >
            <TopicIcon iconName={topic.icon} size="sm" color={accentColor} />
            <span className="truncate">{decryptedNames.get(topic.id) || 'Decrypting...'}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowAddModal(true)}
        className="w-full mt-4 text-sm hover:underline"
        style={{ color: accentColor }}
      >
        + Add Topic
      </button>

      <AddTopicModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onTopicAdded={fetchTopics}
      />
    </div>
  );
}
