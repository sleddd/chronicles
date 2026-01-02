'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
        <div className="absolute z-10 mt-1 w-80 bg-white border rounded-md shadow-lg">
          {/* Search input */}
          <div className="p-2 border-b">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type to search topics..."
              className="w-full px-3 py-1.5 text-sm border rounded bg-white text-gray-900 placeholder-gray-400"
            />
          </div>
          <div className="p-2 border-b max-h-64 overflow-auto">
            {(!searchQuery.trim() || 'none'.includes(searchQuery.toLowerCase())) && (
              <button
                onClick={() => {
                  onSelectTopic(null);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                  !selectedTopicId ? 'bg-teal-50 text-teal-700' : 'text-gray-900'
                }`}
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
            <Link
              href="/topics"
              onClick={() => {
                setIsOpen(false);
                setSearchQuery('');
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-teal-50 rounded"
              style={{ color: '#1aaeae' }}
            >
              Manage Topics...
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
