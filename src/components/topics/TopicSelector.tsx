'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import Link from 'next/link';
import { TopicIcon } from './IconPicker';

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
  onTopicsChange?: () => void;
}

export function TopicSelector({ selectedTopicId, onSelectTopic }: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [decryptedTopics, setDecryptedTopics] = useState<Map<string, string>>(new Map());
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { decryptData, isKeyReady } = useEncryption();
  const { accentColor } = useAccentColor();

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
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const selectedTopic = topics.find(t => t.id === selectedTopicId);
  const selectedTopicName = selectedTopicId ? decryptedTopics.get(selectedTopicId) : null;

  return (
    <div className="topic-selector" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="topic-selector-trigger"
      >
        {selectedTopic && (
          <span className="topic-selector-item-icon">
            <TopicIcon iconName={selectedTopic.icon} size="sm" color={accentColor} />
          </span>
        )}
        <span className={selectedTopicName ? 'topic-selector-value' : 'topic-selector-placeholder'}>
          {selectedTopicName || 'None'}
        </span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="topic-selector-dropdown w-80">
          {/* Search input */}
          <div className="topic-selector-search">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type to search topics..."
              className="input-glass text-sm"
            />
          </div>
          <div className="topic-selector-list max-h-64 overflow-auto">
            {(!searchQuery.trim() || 'none'.includes(searchQuery.toLowerCase())) && (
              <button
                onClick={() => {
                  onSelectTopic(null);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={!selectedTopicId ? 'topic-selector-item-active' : 'topic-selector-item'}
              >
                None
              </button>
            )}
            {topics
              .filter((topic) => {
                if (!searchQuery.trim()) return true;
                const name = decryptedTopics.get(topic.id) || '';
                return name.toLowerCase().includes(searchQuery.toLowerCase());
              })
              .map((topic) => (
              <button
                key={topic.id}
                onClick={() => {
                  onSelectTopic(topic.id);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={selectedTopicId === topic.id ? 'topic-selector-item-active' : 'topic-selector-item'}
              >
                <span className="topic-selector-item-icon">
                  <TopicIcon iconName={topic.icon} size="sm" color={accentColor} />
                </span>
                {decryptedTopics.get(topic.id) || 'Loading...'}
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-border">
            <Link
              href="/topics"
              onClick={() => {
                setIsOpen(false);
                setSearchQuery('');
              }}
              className="dropdown-item text-gray-600 hover:bg-gray-50"
            >
              Manage Topics...
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
