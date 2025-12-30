'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { TopicIcon } from '@/components/topics/IconPicker';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns';

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
  favoriteId?: string;
  favoritedAt?: string;
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

type ViewMode = 'date' | 'all' | 'favorites' | 'search';

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
  const [decryptedEntries, setDecryptedEntries] = useState<Record<string, string>>({});
  const [decryptedTopics, setDecryptedTopics] = useState<Record<string, string>>({});
  const [taskFields, setTaskFields] = useState<Map<string, TaskFields>>(new Map());
  const [filterTopicId, setFilterTopicId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(true);
  const [quickEntry, setQuickEntry] = useState('');
  const [quickEntryTopicId, setQuickEntryTopicId] = useState<string | null>(null);
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  const fetchEntries = useCallback(async () => {
    if (viewMode === 'favorites') {
      // Fetch favorites
      const response = await fetch('/api/favorites');
      const data = await response.json();
      setEntries(data.favorites || []);
      setFavoriteIds(new Set((data.favorites || []).map((f: Entry) => f.id)));
    } else if (viewMode === 'search' && searchQuery.trim()) {
      // Search entries (client-side for now since we need to decrypt)
      const response = await fetch('/api/entries?all=true');
      const data = await response.json();
      setEntries(data.entries || []);
    } else if (viewMode === 'all') {
      // Fetch all entries
      const params = new URLSearchParams();
      params.set('all', 'true');
      if (filterTopicId) params.set('topicId', filterTopicId);

      const response = await fetch(`/api/entries?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
    } else {
      // Fetch by date
      const params = new URLSearchParams();
      if (selectedDate && !filterTopicId) params.set('date', selectedDate);
      if (filterTopicId) params.set('topicId', filterTopicId);

      const response = await fetch(`/api/entries?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
    }
  }, [selectedDate, filterTopicId, viewMode, searchQuery]);

  const fetchTopics = useCallback(async () => {
    const response = await fetch('/api/topics');
    const data = await response.json();
    setTopics(data.topics || []);
  }, []);

  const fetchFavorites = useCallback(async () => {
    if (viewMode !== 'favorites') {
      const response = await fetch('/api/favorites');
      const data = await response.json();
      setFavoriteIds(new Set((data.favorites || []).map((f: Entry) => f.id)));
    }
  }, [viewMode]);

  const decryptEntries = useCallback(async () => {
    const decrypted: Record<string, string> = {};
    for (const entry of entries) {
      try {
        const content = await decryptData(entry.encryptedContent, entry.iv);
        const plainText = content.replace(/<[^>]*>/g, '');
        decrypted[entry.id] = plainText.slice(0, 100) + (plainText.length > 100 ? '...' : '');
      } catch {
        decrypted[entry.id] = 'Decryption failed';
      }
    }
    setDecryptedEntries(decrypted);
  }, [entries, decryptData]);

  const decryptTopics = useCallback(async () => {
    const decrypted: Record<string, string> = {};
    for (const topic of topics) {
      try {
        const name = await decryptData(topic.encryptedName, topic.iv);
        decrypted[topic.id] = name;
      } catch {
        decrypted[topic.id] = 'Unknown';
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
    fetchFavorites();
  }, [fetchFavorites]);

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

  const getTopic = (topicId: string | null) => {
    if (!topicId) return null;
    return topics.find(t => t.id === topicId) || null;
  };

  const getTopicName = (topicId: string | null) => {
    if (!topicId) return null;
    return decryptedTopics[topicId] || 'Loading...';
  };

  const handleIconClick = (topicId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFilterTopicId(topicId);
  };

  const clearFilter = () => {
    setFilterTopicId(null);
  };

  const handleQuickEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEntry.trim() || !isKeyReady) return;

    try {
      const { ciphertext, iv } = await encryptData(`<p>${quickEntry}</p>`);

      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedContent: ciphertext,
          iv,
          topicId: quickEntryTopicId,
          entryDate: selectedDate || today,
        }),
      });

      if (response.ok) {
        setQuickEntry('');
        setQuickEntryTopicId(null);
        fetchEntries();
        onEntryCreated();
      }
    } catch (error) {
      console.error('Failed to create quick entry:', error);
    }
  };

  // Filter entries by search query (client-side)
  const filteredEntries = viewMode === 'search' && searchQuery.trim()
    ? entries.filter(entry => {
        const decrypted = decryptedEntries[entry.id] || '';
        return decrypted.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : entries;

  // Group entries by date for "all" view
  const entriesByDate = viewMode === 'all' || viewMode === 'favorites' || viewMode === 'search'
    ? filteredEntries.reduce((acc, entry) => {
        const date = entry.entryDate;
        if (!acc[date]) acc[date] = [];
        acc[date].push(entry);
        return acc;
      }, {} as Record<string, Entry[]>)
    : null;

  const sortedDates = entriesByDate
    ? Object.keys(entriesByDate).sort((a, b) => b.localeCompare(a))
    : [];

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'undefined' || dateStr === 'null') {
      return 'Past entries';
    }
    const date = new Date(dateStr + 'T12:00:00');
    if (isNaN(date.getTime())) {
      return 'Past entries';
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="p-4 bg-gray-50 h-full flex flex-col min-h-0">
      {/* Collapsible Mini Calendar */}
      <div className="mb-4 bg-white border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setIsCalendarCollapsed(!isCalendarCollapsed)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-gray-700">Calendar</span>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isCalendarCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!isCalendarCollapsed && (
          <MiniCalendar
            selectedDate={selectedDate}
            onDateSelect={onDateChange}
            today={today}
          />
        )}
      </div>

      {/* View Mode Tabs */}
      <div className="mb-4 flex gap-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setViewMode('date')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'date'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Date
        </button>
        <button
          onClick={() => setViewMode('all')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'all'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setViewMode('favorites')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors flex items-center justify-center gap-1 ${
            viewMode === 'favorites'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Bookmarks
        </button>
        <button
          onClick={() => setViewMode('search')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'search'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Search
        </button>
      </div>

      {/* Search Input */}
      {viewMode === 'search' && (
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="w-full px-3 py-2 border rounded-md bg-white text-gray-900 placeholder-gray-400"
          />
        </div>
      )}

      {/* Filter indicator when clicking topic icons */}
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

      {/* Quick Entry Form */}
      <form onSubmit={handleQuickEntry} className="mb-4 bg-white border rounded-md p-3">
        <div className="flex gap-2 mb-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTopicDropdown(!showTopicDropdown)}
              className="px-2 py-1 text-sm rounded-md bg-white text-gray-700 flex items-center gap-1 hover:bg-gray-50"
            >
              {quickEntryTopicId ? (
                <>
                  <TopicIcon
                    iconName={getTopic(quickEntryTopicId)?.icon || null}
                    color={getTopic(quickEntryTopicId)?.color || '#6b7280'}
                    size="sm"
                  />
                  <span>{decryptedTopics[quickEntryTopicId] || 'Loading...'}</span>
                </>
              ) : (
                <span className="text-gray-500">No topic</span>
              )}
              <svg className="w-3 h-3 text-gray-400 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTopicDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border rounded-md shadow-lg z-10 min-w-[120px]">
                <button
                  type="button"
                  onClick={() => {
                    setQuickEntryTopicId(null);
                    setShowTopicDropdown(false);
                  }}
                  className="w-full px-3 py-1.5 text-sm text-left text-gray-500 hover:bg-gray-100"
                >
                  No topic
                </button>
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      setQuickEntryTopicId(topic.id);
                      setShowTopicDropdown(false);
                    }}
                    className="w-full px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <TopicIcon iconName={topic.icon} color={topic.color} size="sm" />
                    {decryptedTopics[topic.id] || 'Loading...'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={quickEntry}
            onChange={(e) => setQuickEntry(e.target.value)}
            placeholder="Quick entry..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm bg-white text-gray-900 placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={!quickEntry.trim() || !isKeyReady}
            className="px-3 py-2 text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#1aaeae' }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#158f8f'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1aaeae'}
          >
            Add
          </button>
        </div>
      </form>

      {/* Entries List */}
      <div className="flex-1 overflow-auto space-y-2 min-h-0">
        {viewMode === 'date' ? (
          // Date view - flat list
          <>
            {filteredEntries.length === 0 && (
              <p className="text-gray-500 text-sm">No entries for this date</p>
            )}
            {filteredEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                isSelected={selectedEntryId === entry.id}
                isFavorite={favoriteIds.has(entry.id)}
                taskFields={taskFields.get(entry.id)}
                decryptedContent={decryptedEntries[entry.id]}
                topic={getTopic(entry.topicId)}
                topicName={getTopicName(entry.topicId)}
                onSelect={() => onSelectEntry(entry.id)}
                onTaskToggle={(e) => handleTaskToggle(entry.id, e)}
                onTopicClick={(e) => entry.topicId && handleIconClick(entry.topicId, e)}
              />
            ))}
          </>
        ) : (
          // Grouped by date view
          <>
            {sortedDates.length === 0 && (
              <p className="text-gray-500 text-sm">
                {viewMode === 'favorites' ? 'No bookmarks yet' :
                 viewMode === 'search' ? 'No matching entries' : 'No entries'}
              </p>
            )}
            {sortedDates.map((date) => (
              <div key={date} className="mb-4">
                <div className="text-xs font-medium text-gray-500 mb-2 sticky top-0 bg-gray-50 py-1">
                  {formatDate(date)}
                </div>
                <div className="space-y-2">
                  {entriesByDate![date].map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      isSelected={selectedEntryId === entry.id}
                      isFavorite={favoriteIds.has(entry.id)}
                      taskFields={taskFields.get(entry.id)}
                      decryptedContent={decryptedEntries[entry.id]}
                      topic={getTopic(entry.topicId)}
                      topicName={getTopicName(entry.topicId)}
                      onSelect={() => onSelectEntry(entry.id)}
                      onTaskToggle={(e) => handleTaskToggle(entry.id, e)}
                      onTopicClick={(e) => entry.topicId && handleIconClick(entry.topicId, e)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

    </div>
  );
}

// Extracted entry card component for reuse
function EntryCard({
  entry,
  isSelected,
  isFavorite,
  taskFields,
  decryptedContent,
  topic,
  topicName,
  onSelect,
  onTaskToggle,
  onTopicClick,
}: {
  entry: Entry;
  isSelected: boolean;
  isFavorite: boolean;
  taskFields: TaskFields | undefined;
  decryptedContent: string | undefined;
  topic: Topic | null;
  topicName: string | null;
  onSelect: () => void;
  onTaskToggle: (e: React.MouseEvent) => void;
  onTopicClick: (e: React.MouseEvent) => void;
}) {
  const isTask = entry.customType === 'task';
  const isCompleted = taskFields?.isCompleted ?? false;

  return (
    <div
      onClick={onSelect}
      className={`p-3 border rounded-md cursor-pointer bg-white ${
        isSelected ? 'ring-2 ring-teal-500 border-teal-300' : 'hover:border-gray-400'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {topic && (
          <button
            type="button"
            onClick={onTopicClick}
            className="text-xs px-1.5 py-1 rounded flex items-center justify-center hover:ring-2 hover:ring-gray-300 transition-all"
            style={{
              backgroundColor: `${topic.color}20`,
            }}
            title={`Filter by ${topicName}`}
          >
            <TopicIcon iconName={topic.icon} color={topic.color} size="sm" />
          </button>
        )}
        {isTask && (
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Task</span>
        )}
        {isFavorite && (
          <svg className="w-4 h-4 text-teal-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        )}
      </div>
      <div className="flex items-start gap-2">
        {isTask && (
          <button
            type="button"
            onClick={onTaskToggle}
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
          {decryptedContent || 'Decrypting...'}
        </p>
      </div>
    </div>
  );
}

// Mini Calendar Component
function MiniCalendar({
  selectedDate,
  onDateSelect,
  today,
}: {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  today: string;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    return selectedDate ? parseISO(selectedDate) : new Date();
  });

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => (direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)));
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const todayDate = parseISO(today);
  const selectedDateObj = selectedDate ? parseISO(selectedDate) : null;

  return (
    <div className="p-3">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => navigateMonth('prev')}
          className="p-1 hover:bg-gray-100 rounded text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-900">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => navigateMonth('next')}
          className="p-1 hover:bg-gray-100 rounded text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div key={i} className="text-center text-xs text-gray-400 font-medium py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Days */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = isSameDay(day, todayDate);
          const isSelected = selectedDateObj && isSameDay(day, selectedDateObj);
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <button
              key={day.toString()}
              onClick={() => onDateSelect(dateStr)}
              className={`
                text-xs p-1.5 rounded-full transition-colors
                ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-700'}
                ${isToday && !isSelected ? 'bg-teal-100 font-medium' : ''}
                ${isSelected ? 'text-white font-medium' : 'hover:bg-gray-100'}
              `}
              style={isToday && !isSelected ? { color: '#1aaeae' } : isSelected ? { backgroundColor: '#1aaeae' } : undefined}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      {/* Today Button */}
      <button
        onClick={() => {
          onDateSelect(today);
          setCurrentMonth(parseISO(today));
        }}
        className="w-full mt-2 text-xs hover:underline py-1"
        style={{ color: '#1aaeae' }}
      >
        Today
      </button>
    </div>
  );
}
