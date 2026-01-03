'use client';

import { useEffect, useCallback, useReducer, useState } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { TopicIcon } from '@/components/topics/IconPicker';
import { entriesListReducer, initialEntriesListState } from './entriesListReducer';
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
  onSelectEntry: (entryId: string | null) => void;
  onEntryCreated: (entryId?: string) => void;
  today: string;
}

export function EntriesList({
  selectedDate,
  onDateChange,
  onSelectEntry,
  onEntryCreated,
  today,
}: Props) {
  const [state, dispatch] = useReducer(entriesListReducer, initialEntriesListState);
  const { encryptData, decryptData, isKeyReady } = useEncryption();
  const { accentColor, hoverColor } = useAccentColor();

  // Destructure state for easier access
  const {
    entries,
    topics,
    decryptedEntries,
    decryptedTopics,
    taskFields,
    favoriteIds,
    filterTopicId,
    viewMode,
    searchQuery,
    searchTopicId,
    isDatePickerExpanded,
    quickEntry,
    quickEntryTopicId,
    showTopicDropdown,
    topicSearchQuery,
  } = state;

  const fetchEntries = useCallback(async () => {
    if (viewMode === 'favorites') {
      // Fetch favorites
      const response = await fetch('/api/favorites');
      const data = await response.json();
      dispatch({ type: 'SET_ENTRIES', payload: data.favorites || [] });
      dispatch({ type: 'SET_FAVORITE_IDS', payload: new Set((data.favorites || []).map((f: Entry) => f.id)) });
    } else if (viewMode === 'search' && searchQuery.trim()) {
      // Search entries (client-side for now since we need to decrypt)
      const response = await fetch('/api/entries?all=true');
      const data = await response.json();
      dispatch({ type: 'SET_ENTRIES', payload: data.entries || [] });
    } else if (viewMode === 'all') {
      // Fetch all entries
      const params = new URLSearchParams();
      params.set('all', 'true');
      if (filterTopicId) params.set('topicId', filterTopicId);

      const response = await fetch(`/api/entries?${params}`);
      const data = await response.json();
      dispatch({ type: 'SET_ENTRIES', payload: data.entries || [] });
    } else {
      // Fetch by date
      const params = new URLSearchParams();
      if (selectedDate && !filterTopicId) params.set('date', selectedDate);
      if (filterTopicId) params.set('topicId', filterTopicId);

      const response = await fetch(`/api/entries?${params}`);
      const data = await response.json();
      dispatch({ type: 'SET_ENTRIES', payload: data.entries || [] });
    }
  }, [selectedDate, filterTopicId, viewMode, searchQuery]);

  const fetchTopics = useCallback(async () => {
    const response = await fetch('/api/topics');
    const data = await response.json();
    dispatch({ type: 'SET_TOPICS', payload: data.topics || [] });
  }, []);

  const fetchFavorites = useCallback(async () => {
    if (viewMode !== 'favorites') {
      const response = await fetch('/api/favorites');
      const data = await response.json();
      dispatch({ type: 'SET_FAVORITE_IDS', payload: new Set((data.favorites || []).map((f: Entry) => f.id)) });
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
    dispatch({ type: 'SET_DECRYPTED_ENTRIES', payload: decrypted });
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
    dispatch({ type: 'SET_DECRYPTED_TOPICS', payload: decrypted });
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
    dispatch({ type: 'SET_TASK_FIELDS', payload: fields });
  }, [entries, decryptData]);

  const handleTaskToggle = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const currentFields = taskFields.get(entryId);
    if (!currentFields) return;

    const newIsCompleted = !currentFields.isCompleted;

    // Optimistically update UI
    dispatch({
      type: 'UPDATE_TASK_FIELD',
      payload: { entryId, fields: { ...currentFields, isCompleted: newIsCompleted } },
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
      dispatch({
        type: 'UPDATE_TASK_FIELD',
        payload: { entryId, fields: currentFields },
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
    dispatch({ type: 'SET_FILTER_TOPIC_ID', payload: topicId });
  };

  const clearFilter = () => {
    dispatch({ type: 'CLEAR_FILTER' });
  };

  // Get topic name for quick entry to determine which custom fields to show
  const quickEntryTopicName = quickEntryTopicId ? decryptedTopics[quickEntryTopicId]?.toLowerCase() : null;

  const resetQuickEntryFields = () => {
    dispatch({ type: 'RESET_QUICK_ENTRY' });
  };

  const handleQuickEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEntry.trim() || !isKeyReady) return;

    try {
      const { ciphertext, iv } = await encryptData(`<p>${quickEntry}</p>`);

      // Build custom fields based on topic type
      const customFields: { encryptedData: string; iv: string }[] = [];
      const topicName = quickEntryTopicName;

      if (topicName === 'task') {
        // Task fields: isCompleted, isAutoMigrating
        const completedField = JSON.stringify({ fieldKey: 'isCompleted', value: state.task.isCompleted });
        const migrateField = JSON.stringify({ fieldKey: 'isAutoMigrating', value: state.task.isAutoMigrating });
        const enc1 = await encryptData(completedField);
        const enc2 = await encryptData(migrateField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
      } else if (topicName === 'goal') {
        // Goal fields: type, status, targetDate, progressPercentage
        const typeField = JSON.stringify({ fieldKey: 'type', value: state.goal.type });
        const statusField = JSON.stringify({ fieldKey: 'status', value: state.goal.status });
        const targetField = JSON.stringify({ fieldKey: 'targetDate', value: state.goal.targetDate || null });
        const progressField = JSON.stringify({ fieldKey: 'progressPercentage', value: 0 });
        const enc1 = await encryptData(typeField);
        const enc2 = await encryptData(statusField);
        const enc3 = await encryptData(targetField);
        const enc4 = await encryptData(progressField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
        customFields.push({ encryptedData: enc3.ciphertext, iv: enc3.iv });
        customFields.push({ encryptedData: enc4.ciphertext, iv: enc4.iv });
      } else if (topicName === 'meeting') {
        // Meeting fields: startDate, startTime, endDate, endTime, location, address, phone, topic, attendees
        const startDateField = JSON.stringify({ fieldKey: 'startDate', value: state.meeting.startDate || selectedDate || today });
        const startTimeField = JSON.stringify({ fieldKey: 'startTime', value: state.meeting.startTime });
        const endDateField = JSON.stringify({ fieldKey: 'endDate', value: state.meeting.endDate || state.meeting.startDate || selectedDate || today });
        const endTimeField = JSON.stringify({ fieldKey: 'endTime', value: state.meeting.endTime });
        const enc1 = await encryptData(startDateField);
        const enc2 = await encryptData(startTimeField);
        const enc3 = await encryptData(endDateField);
        const enc4 = await encryptData(endTimeField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
        customFields.push({ encryptedData: enc3.ciphertext, iv: enc3.iv });
        customFields.push({ encryptedData: enc4.ciphertext, iv: enc4.iv });
        if (state.meeting.location) {
          const locationField = JSON.stringify({ fieldKey: 'location', value: state.meeting.location });
          const enc = await encryptData(locationField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (state.meeting.address) {
          const addressField = JSON.stringify({ fieldKey: 'address', value: state.meeting.address });
          const enc = await encryptData(addressField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (state.meeting.phone) {
          const phoneField = JSON.stringify({ fieldKey: 'phone', value: state.meeting.phone });
          const enc = await encryptData(phoneField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (state.meeting.topic) {
          const topicField = JSON.stringify({ fieldKey: 'topic', value: state.meeting.topic });
          const enc = await encryptData(topicField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (state.meeting.attendees) {
          const attendeesField = JSON.stringify({ fieldKey: 'attendees', value: state.meeting.attendees });
          const enc = await encryptData(attendeesField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
      } else if (topicName === 'event') {
        // Event fields: startDate, startTime, endDate, endTime, location, address, phone
        const startDateField = JSON.stringify({ fieldKey: 'startDate', value: state.event.startDate || selectedDate || today });
        const startTimeField = JSON.stringify({ fieldKey: 'startTime', value: state.event.startTime });
        const endDateField = JSON.stringify({ fieldKey: 'endDate', value: state.event.endDate || state.event.startDate || selectedDate || today });
        const endTimeField = JSON.stringify({ fieldKey: 'endTime', value: state.event.endTime });
        const enc1 = await encryptData(startDateField);
        const enc2 = await encryptData(startTimeField);
        const enc3 = await encryptData(endDateField);
        const enc4 = await encryptData(endTimeField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
        customFields.push({ encryptedData: enc3.ciphertext, iv: enc3.iv });
        customFields.push({ encryptedData: enc4.ciphertext, iv: enc4.iv });
        if (state.event.location) {
          const locationField = JSON.stringify({ fieldKey: 'location', value: state.event.location });
          const enc = await encryptData(locationField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (state.event.address) {
          const addressField = JSON.stringify({ fieldKey: 'address', value: state.event.address });
          const enc = await encryptData(addressField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (state.event.phone) {
          const phoneField = JSON.stringify({ fieldKey: 'phone', value: state.event.phone });
          const enc = await encryptData(phoneField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
      } else if (topicName === 'medication') {
        // Medication fields: dosage, frequency, scheduleTimes, isActive, startDate
        const dosageField = JSON.stringify({ fieldKey: 'dosage', value: state.medication.dosage });
        const frequencyField = JSON.stringify({ fieldKey: 'frequency', value: state.medication.frequency });
        const scheduleTimesField = JSON.stringify({ fieldKey: 'scheduleTimes', value: state.medication.scheduleTimes });
        const isActiveField = JSON.stringify({ fieldKey: 'isActive', value: state.medication.isActive });
        const startDateField = JSON.stringify({ fieldKey: 'startDate', value: selectedDate || today });
        const enc1 = await encryptData(dosageField);
        const enc2 = await encryptData(frequencyField);
        const enc3 = await encryptData(scheduleTimesField);
        const enc4 = await encryptData(isActiveField);
        const enc5 = await encryptData(startDateField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
        customFields.push({ encryptedData: enc3.ciphertext, iv: enc3.iv });
        customFields.push({ encryptedData: enc4.ciphertext, iv: enc4.iv });
        customFields.push({ encryptedData: enc5.ciphertext, iv: enc5.iv });
      } else if (topicName === 'exercise') {
        // Exercise fields: exerciseType, duration, intensity, distance, distanceUnit, calories, performedAt
        if (state.exercise.type) {
          const typeField = JSON.stringify({ fieldKey: 'exerciseType', value: state.exercise.type });
          const enc = await encryptData(typeField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (state.exercise.duration) {
          const durField = JSON.stringify({ fieldKey: 'duration', value: parseInt(state.exercise.duration) || null });
          const enc = await encryptData(durField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        const intensityField = JSON.stringify({ fieldKey: 'intensity', value: state.exercise.intensity });
        const encIntensity = await encryptData(intensityField);
        customFields.push({ encryptedData: encIntensity.ciphertext, iv: encIntensity.iv });
        if (state.exercise.distance) {
          const distanceField = JSON.stringify({ fieldKey: 'distance', value: parseFloat(state.exercise.distance) || null });
          const enc = await encryptData(distanceField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
          const unitField = JSON.stringify({ fieldKey: 'distanceUnit', value: state.exercise.distanceUnit });
          const encUnit = await encryptData(unitField);
          customFields.push({ encryptedData: encUnit.ciphertext, iv: encUnit.iv });
        }
        if (state.exercise.calories) {
          const calField = JSON.stringify({ fieldKey: 'calories', value: parseInt(state.exercise.calories) || null });
          const enc = await encryptData(calField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        const performedField = JSON.stringify({ fieldKey: 'performedAt', value: new Date().toISOString() });
        const encPerformed = await encryptData(performedField);
        customFields.push({ encryptedData: encPerformed.ciphertext, iv: encPerformed.iv });
      } else if (topicName === 'food') {
        // Food fields: mealType, consumedAt, ingredients
        if (state.food.mealType) {
          const mealField = JSON.stringify({ fieldKey: 'mealType', value: state.food.mealType });
          const enc = await encryptData(mealField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (state.food.ingredients) {
          const ingredients = state.food.ingredients.split(',').map((i: string) => i.trim()).filter((i: string) => i);
          const ingredientsField = JSON.stringify({ fieldKey: 'ingredients', value: ingredients });
          const enc = await encryptData(ingredientsField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        const consumedField = JSON.stringify({ fieldKey: 'consumedAt', value: new Date().toISOString() });
        const encConsumed = await encryptData(consumedField);
        customFields.push({ encryptedData: encConsumed.ciphertext, iv: encConsumed.iv });
      } else if (topicName === 'symptom' || topicName === 'symptoms') {
        // Symptom fields: severity, occurredAt, duration
        const sevField = JSON.stringify({ fieldKey: 'severity', value: state.symptom.severity });
        const enc = await encryptData(sevField);
        customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        if (state.symptom.duration) {
          const durField = JSON.stringify({ fieldKey: 'duration', value: parseInt(state.symptom.duration) || null });
          const encDur = await encryptData(durField);
          customFields.push({ encryptedData: encDur.ciphertext, iv: encDur.iv });
        }
        const occurredField = JSON.stringify({ fieldKey: 'occurredAt', value: new Date().toISOString() });
        const encOccurred = await encryptData(occurredField);
        customFields.push({ encryptedData: encOccurred.ciphertext, iv: encOccurred.iv });
      }

      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedContent: ciphertext,
          iv,
          topicId: quickEntryTopicId,
          entryDate: selectedDate || today,
          ...(topicName && { customType: topicName }),
          ...(customFields.length > 0 && { customFields }),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        resetQuickEntryFields();
        fetchEntries();
        onEntryCreated(data.entry?.id);
      }
    } catch (error) {
      console.error('Failed to create quick entry:', error);
    }
  };

  // Filter entries by search query and topic (client-side)
  const filteredEntries = viewMode === 'search'
    ? entries.filter(entry => {
        // Filter by topic if selected
        if (searchTopicId && entry.topicId !== searchTopicId) {
          return false;
        }
        // Filter by search query if provided
        if (searchQuery.trim()) {
          const decrypted = decryptedEntries[entry.id] || '';
          return decrypted.toLowerCase().includes(searchQuery.toLowerCase());
        }
        // If only topic filter is active (no search query), include entry
        return searchTopicId ? true : false;
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

  // Handle date selection from calendar (collapses picker)
  const handleDateSelect = (date: string) => {
    onDateChange(date);
    dispatch({ type: 'SET_DATE_PICKER_EXPANDED', payload: false });
  };

  return (
    <div className="p-4 h-full overflow-auto">
      {/* View Mode Tabs */}
      <div className="view-tabs">
        <button
          onClick={() => {
            if (viewMode === 'date') {
              // Toggle date picker if already on date tab
              dispatch({ type: 'SET_DATE_PICKER_EXPANDED', payload: !isDatePickerExpanded });
            } else {
              // Switch to date mode and show picker
              dispatch({ type: 'SET_VIEW_MODE', payload: 'date' });
              dispatch({ type: 'SET_DATE_PICKER_EXPANDED', payload: true });
            }
          }}
          className={`view-tab ${viewMode === 'date' ? 'view-tab-active' : ''}`}
        >
          Date
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'all' })}
          className={`view-tab ${viewMode === 'all' ? 'view-tab-active' : ''}`}
        >
          All
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'favorites' })}
          className={`view-tab ${viewMode === 'favorites' ? 'view-tab-active' : ''}`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Bookmarks
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'search' })}
          className={`view-tab ${viewMode === 'search' ? 'view-tab-active' : ''}`}
        >
          Search
        </button>
      </div>

      {/* Date Filter Panel - only shows calendar when expanded */}
      {viewMode === 'date' && isDatePickerExpanded && (
        <div className="mb-4 backdrop-blur-sm bg-white/10 border border-border rounded-md overflow-hidden">
          <MiniCalendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            today={today}
          />
        </div>
      )}

      {/* Search Input and Topic Filter */}
      {viewMode === 'search' && (
        <div className="mb-4 space-y-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value })}
            placeholder="Search entries..."
            className="input-glass"
          />
          {searchTopicId ? (
            <div className="card flex items-center gap-2 px-3 py-2">
              <TopicIcon iconName={getTopic(searchTopicId)?.icon || null} size="sm" />
              <span className="text-sm text-gray-700">
                <strong>{getTopicName(searchTopicId)}</strong>
              </span>
              <button
                onClick={() => dispatch({ type: 'SET_SEARCH_TOPIC_ID', payload: null })}
                className="btn-ghost ml-auto text-sm"
              >
                × Clear
              </button>
            </div>
          ) : (
            <select
              value=""
              onChange={(e) => dispatch({ type: 'SET_SEARCH_TOPIC_ID', payload: e.target.value || null })}
              className="select-glass"
            >
              <option value="">Filter by topic...</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {decryptedTopics[topic.id] || 'Loading...'}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Filter indicator when clicking topic icons */}
      {filterTopicId && (() => {
        const topic = getTopic(filterTopicId);
        const topicName = getTopicName(filterTopicId);
        if (!topic) return null;
        return (
          <div className="card mb-4 flex items-center gap-2 px-3 py-2">
            <TopicIcon iconName={topic.icon} size="sm" />
            <span className="text-sm text-gray-700">
              Filtering by: <strong>{topicName}</strong>
            </span>
            <button
              onClick={clearFilter}
              className="btn-ghost ml-auto text-sm"
            >
              × Clear
            </button>
          </div>
        );
      })()}

      {/* Quick Entry Form */}
      <form onSubmit={handleQuickEntry} className="quick-entry relative z-20 mb-4">
        <div className="quick-entry-header">
          <div className="relative">
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_SHOW_TOPIC_DROPDOWN', payload: !showTopicDropdown })}
              className="quick-entry-topic"
            >
              {quickEntryTopicId ? (
                <>
                  <TopicIcon
                    iconName={getTopic(quickEntryTopicId)?.icon || null}
                    size="sm"
                  />
                  <span>{decryptedTopics[quickEntryTopicId] || 'Loading...'}</span>
                </>
              ) : (
                <span className="topic-selector-placeholder">No topic</span>
              )}
              <svg className="w-3 h-3 text-gray-400 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTopicDropdown && (
              <div className="topic-selector-dropdown">
                <div className="topic-selector-search">
                  <input
                    type="text"
                    value={topicSearchQuery}
                    onChange={(e) => dispatch({ type: 'SET_TOPIC_SEARCH_QUERY', payload: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                    placeholder="Type to search topics..."
                    className="input-glass text-sm"
                    autoFocus
                  />
                </div>
                <div className="topic-selector-list max-h-48 overflow-auto">
                  {(!topicSearchQuery.trim() || 'no topic'.includes(topicSearchQuery.toLowerCase())) && (
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'SET_QUICK_ENTRY_TOPIC_ID', payload: null });
                        dispatch({ type: 'SET_SHOW_TOPIC_DROPDOWN', payload: false });
                        dispatch({ type: 'SET_TOPIC_SEARCH_QUERY', payload: '' });
                      }}
                      className="topic-selector-item"
                    >
                      No topic
                    </button>
                  )}
                  {topics
                    .filter((topic) => {
                      if (!topicSearchQuery.trim()) return true;
                      const name = decryptedTopics[topic.id] || '';
                      return name.toLowerCase().includes(topicSearchQuery.toLowerCase());
                    })
                    .map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'SET_QUICK_ENTRY_TOPIC_ID', payload: topic.id });
                        dispatch({ type: 'SET_SHOW_TOPIC_DROPDOWN', payload: false });
                        dispatch({ type: 'SET_TOPIC_SEARCH_QUERY', payload: '' });
                      }}
                      className="topic-selector-item"
                    >
                      <TopicIcon iconName={topic.icon} size="sm" />
                      {decryptedTopics[topic.id] || 'Loading...'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="quick-entry-body">
          <input
            type="text"
            value={quickEntry}
            onChange={(e) => dispatch({ type: 'SET_QUICK_ENTRY', payload: e.target.value })}
            placeholder="Quick entry..."
            className="quick-entry-input"
          />
          {(quickEntry.trim() || quickEntryTopicId) && (
            <button
              type="button"
              onClick={resetQuickEntryFields}
              className="btn btn-ghost"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!quickEntry.trim() || !isKeyReady}
            className="btn btn-primary"
            style={{ backgroundColor: accentColor }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = hoverColor}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = accentColor}
          >
            Add
          </button>
        </div>

        {/* Custom fields based on selected topic - shown below text input */}
        {quickEntryTopicName === 'task' && (
          <div className="custom-fields-body">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={state.task.isAutoMigrating}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_TASK', payload: { isAutoMigrating: e.target.checked } })}
              />
              Auto-migrate
            </label>
          </div>
        )}

        {quickEntryTopicName === 'goal' && (
          <div className="custom-fields-body">
            <div className="field-row">
              <select
                value={state.goal.type}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_GOAL', payload: { type: e.target.value } })}
                className="select-glass select-sm"
              >
                <option value="personal">Personal</option>
                <option value="professional">Professional</option>
                <option value="health">Health</option>
                <option value="financial">Financial</option>
                <option value="educational">Educational</option>
              </select>
              <select
                value={state.goal.status}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_GOAL', payload: { status: e.target.value } })}
                className="select-glass select-sm"
              >
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
              <div className="field-inline">
                <label className="field-label">Target:</label>
                <input
                  type="date"
                  value={state.goal.targetDate}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_GOAL', payload: { targetDate: e.target.value } })}
                  className="input-glass input-sm"
                />
              </div>
            </div>
          </div>
        )}

        {quickEntryTopicName === 'meeting' && (
          <div className="custom-fields-body">
            <div className="field-row">
              <div className="field-inline">
                <label className="field-label">Start:</label>
                <input
                  type="date"
                  value={state.meeting.startDate}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_MEETING', payload: { startDate: e.target.value } })}
                  placeholder={selectedDate || today}
                  className="input-glass input-sm"
                />
                <input
                  type="time"
                  value={state.meeting.startTime}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_MEETING', payload: { startTime: e.target.value } })}
                  className="input-glass input-sm"
                />
              </div>
              <div className="field-inline">
                <label className="field-label">End:</label>
                <input
                  type="date"
                  value={state.meeting.endDate}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_MEETING', payload: { endDate: e.target.value } })}
                  placeholder={state.meeting.startDate || selectedDate || today}
                  className="input-glass input-sm"
                />
                <input
                  type="time"
                  value={state.meeting.endTime}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_MEETING', payload: { endTime: e.target.value } })}
                  className="input-glass input-sm"
                />
              </div>
            </div>
            <div className="field-row">
              <input
                type="text"
                value={state.meeting.location}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_MEETING', payload: { location: e.target.value } })}
                placeholder="Location"
                className="input-glass input-sm flex-1 min-w-[100px]"
              />
              <input
                type="text"
                value={state.meeting.topic}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_MEETING', payload: { topic: e.target.value } })}
                placeholder="Meeting topic"
                className="input-glass input-sm flex-1 min-w-[120px]"
              />
            </div>
          </div>
        )}

        {quickEntryTopicName === 'event' && (
          <div className="custom-fields-body">
            <div className="field-row">
              <div className="field-inline">
                <label className="field-label">Start:</label>
                <input
                  type="date"
                  value={state.event.startDate}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_EVENT', payload: { startDate: e.target.value } })}
                  placeholder={selectedDate || today}
                  className="input-glass input-sm"
                />
                <input
                  type="time"
                  value={state.event.startTime}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_EVENT', payload: { startTime: e.target.value } })}
                  className="input-glass input-sm"
                />
              </div>
              <div className="field-inline">
                <label className="field-label">End:</label>
                <input
                  type="date"
                  value={state.event.endDate}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_EVENT', payload: { endDate: e.target.value } })}
                  placeholder={state.event.startDate || selectedDate || today}
                  className="input-glass input-sm"
                />
                <input
                  type="time"
                  value={state.event.endTime}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_EVENT', payload: { endTime: e.target.value } })}
                  className="input-glass input-sm"
                />
              </div>
            </div>
            <div className="field-row">
              <input
                type="text"
                value={state.event.location}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_EVENT', payload: { location: e.target.value } })}
                placeholder="Location"
                className="input-glass input-sm flex-1 min-w-[100px]"
              />
            </div>
          </div>
        )}

        {quickEntryTopicName === 'medication' && (
          <div className="custom-fields-body">
            <div className="field-row">
              <input
                type="text"
                value={state.medication.dosage}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_MEDICATION', payload: { dosage: e.target.value } })}
                placeholder="Dosage (e.g., 10mg)"
                className="input-glass input-sm w-32"
              />
              <select
                value={state.medication.frequency}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_MEDICATION', payload: { frequency: e.target.value } })}
                className="select-glass select-sm"
              >
                <option value="once_daily">Once Daily</option>
                <option value="twice_daily">Twice Daily</option>
                <option value="three_times_daily">3x Daily</option>
                <option value="four_times_daily">4x Daily</option>
                <option value="as_needed">As Needed</option>
                <option value="weekly">Weekly</option>
              </select>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={state.medication.isActive}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_MEDICATION', payload: { isActive: e.target.checked } })}
                />
                Active
              </label>
            </div>
            <div className="field-row">
              <label className="field-label">Schedule times:</label>
              {state.medication.scheduleTimes.map((time: string, idx: number) => (
                <div key={idx} className="schedule-time-item">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      const newTimes = [...state.medication.scheduleTimes];
                      newTimes[idx] = e.target.value;
                      dispatch({ type: 'UPDATE_QF_MEDICATION', payload: { scheduleTimes: newTimes } });
                    }}
                    className="input-glass input-sm"
                  />
                  {state.medication.scheduleTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'UPDATE_QF_MEDICATION', payload: { scheduleTimes: state.medication.scheduleTimes.filter((_: string, i: number) => i !== idx) } })}
                      className="schedule-time-remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => dispatch({ type: 'UPDATE_QF_MEDICATION', payload: { scheduleTimes: [...state.medication.scheduleTimes, '12:00'] } })}
                className="schedule-time-add"
              >
                + Add time
              </button>
            </div>
          </div>
        )}

        {quickEntryTopicName === 'exercise' && (
          <div className="custom-fields-body">
            <div className="field-row">
              <select
                value={state.exercise.type}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_EXERCISE', payload: { type: e.target.value } })}
                className="select-glass select-sm"
              >
                <option value="">Type...</option>
                <option value="walking">Walking</option>
                <option value="running">Running</option>
                <option value="cycling">Cycling</option>
                <option value="swimming">Swimming</option>
                <option value="yoga">Yoga</option>
                <option value="strength">Strength</option>
                <option value="cardio">Cardio</option>
                <option value="hiking">Hiking</option>
                <option value="other">Other</option>
              </select>
              <div className="field-inline">
                <input
                  type="number"
                  value={state.exercise.duration}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_EXERCISE', payload: { duration: e.target.value } })}
                  placeholder="Duration"
                  className="input-glass input-sm w-20"
                  min="0"
                />
                <span className="field-unit">min</span>
              </div>
              <select
                value={state.exercise.intensity}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_EXERCISE', payload: { intensity: e.target.value } })}
                className="select-glass select-sm"
              >
                <option value="low">Low intensity</option>
                <option value="medium">Medium intensity</option>
                <option value="high">High intensity</option>
              </select>
            </div>
            <div className="field-row">
              <div className="field-inline">
                <input
                  type="number"
                  value={state.exercise.distance}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_EXERCISE', payload: { distance: e.target.value } })}
                  placeholder="Distance"
                  className="input-glass input-sm w-20"
                  min="0"
                  step="0.1"
                />
                <select
                  value={state.exercise.distanceUnit}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_EXERCISE', payload: { distanceUnit: e.target.value } })}
                  className="select-glass select-sm"
                >
                  <option value="miles">mi</option>
                  <option value="km">km</option>
                  <option value="meters">m</option>
                </select>
              </div>
              <div className="field-inline">
                <input
                  type="number"
                  value={state.exercise.calories}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_EXERCISE', payload: { calories: e.target.value } })}
                  placeholder="Calories"
                  className="input-glass input-sm w-20"
                  min="0"
                />
                <span className="field-unit">cal</span>
              </div>
            </div>
          </div>
        )}

        {quickEntryTopicName === 'food' && (
          <div className="custom-fields-body">
            <div className="field-row">
              <select
                value={state.food.mealType}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_FOOD', payload: { mealType: e.target.value } })}
                className="select-glass select-sm"
              >
                <option value="">Meal type...</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
              <input
                type="text"
                value={state.food.ingredients}
                onChange={(e) => dispatch({ type: 'UPDATE_QF_FOOD', payload: { ingredients: e.target.value } })}
                placeholder="Ingredients (comma separated)"
                className="input-glass input-sm flex-1 min-w-[150px]"
              />
            </div>
          </div>
        )}

        {(quickEntryTopicName === 'symptom' || quickEntryTopicName === 'symptoms') && (
          <div className="custom-fields-body">
            <div className="field-row">
              <div className="field-inline">
                <label className="field-label">Severity:</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={state.symptom.severity}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_SYMPTOM', payload: { severity: parseInt(e.target.value) } })}
                  className="range-input w-24"
                />
                <span className="range-value">{state.symptom.severity}</span>
              </div>
              <div className="field-inline">
                <input
                  type="number"
                  value={state.symptom.duration}
                  onChange={(e) => dispatch({ type: 'UPDATE_QF_SYMPTOM', payload: { duration: e.target.value } })}
                  placeholder="Duration"
                  className="input-glass input-sm w-20"
                  min="0"
                />
                <span className="field-unit">min</span>
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Entries List */}
      <div className="space-y-2">
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
                <div className="text-xs font-medium text-gray-500 mb-2 sticky top-0 backdrop-blur-sm bg-white/10 py-1">
                  {formatDate(date)}
                </div>
                <div className="space-y-2">
                  {entriesByDate![date].map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
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
      className="entry-card"
    >
      <div className="entry-card-header">
        {topic && (
          <button
            type="button"
            onClick={onTopicClick}
            className="entry-card-topic"
            title={`Filter by ${topicName}`}
          >
            <TopicIcon iconName={topic.icon} size="sm" />
            {topicName && <span>{topicName}</span>}
          </button>
        )}
        {isFavorite && (
          <svg className="entry-card-bookmark" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        )}
      </div>
      <div className="entry-card-content">
        {isTask && (
          <button
            type="button"
            onClick={onTaskToggle}
            className={`entry-card-checkbox ${isCompleted ? 'entry-card-checkbox-checked' : ''}`}
            title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
          >
            {isCompleted && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )}
        <p className={`entry-card-preview ${isCompleted ? 'entry-card-preview-completed' : ''}`}>
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
  const { accentColor } = useAccentColor();
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
    <div className="mini-calendar">
      {/* Month Navigation */}
      <div className="mini-calendar-header">
        <button
          onClick={() => navigateMonth('prev')}
          className="mini-calendar-nav"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mini-calendar-title">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => navigateMonth('next')}
          className="mini-calendar-nav"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day Headers */}
      <div className="mini-calendar-weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div key={i} className="mini-calendar-weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Days */}
      <div className="mini-calendar-days">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = isSameDay(day, todayDate);
          const isSelected = selectedDateObj && isSameDay(day, selectedDateObj);
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <button
              key={day.toString()}
              onClick={() => onDateSelect(dateStr)}
              className={`mini-calendar-day ${!isCurrentMonth ? 'mini-calendar-day-outside' : ''} ${isToday && !isSelected ? 'mini-calendar-day-today' : ''} ${isSelected ? 'mini-calendar-day-selected' : ''}`}
              style={isToday && !isSelected ? { color: accentColor, backgroundColor: '#e5e7eb' } : isSelected ? { backgroundColor: accentColor } : undefined}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

    </div>
  );
}
