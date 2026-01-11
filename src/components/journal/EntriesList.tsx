'use client';

import { useEffect, useCallback, useReducer, useState, useRef, useLayoutEffect } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache, CachedEntry, CachedTopic } from '@/lib/hooks/useEntriesCache';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { useSecurityClear } from '@/lib/hooks/useSecurityClear';
import { TopicIcon } from '@/components/topics/IconPicker';
import { entriesListReducer, initialEntriesListState } from './entriesListReducer';
import { TaskFields } from '@/components/forms/TaskFields';
import { GoalFields } from '@/components/forms/GoalFields';
import { MeetingFields } from '@/components/forms/MeetingFields';
import { EventFields } from '@/components/forms/EventFields';
import { MedicationFields } from '@/components/forms/MedicationFields';
import { ExerciseFields } from '@/components/forms/ExerciseFields';
import { FoodFields } from '@/components/forms/FoodFields';
import { SymptomFields } from '@/components/forms/SymptomFields';
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

interface Topic {
  id: string;
  encryptedName: string;
  iv: string;
  color: string;
  icon: string | null;
}

type ViewMode = 'date' | 'all' | 'favorites' | 'tasks' | 'search';

interface Props {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onSelectEntry: (entryId: string | null) => void;
  onEntryCreated: (entryId?: string) => void;
  today: string;
  selectedEntryId?: string | null;
}

export function EntriesList({
  selectedDate,
  onDateChange,
  onSelectEntry,
  onEntryCreated,
  today,
  selectedEntryId,
}: Props) {
  const [state, dispatch] = useReducer(entriesListReducer, initialEntriesListState);
  const { encryptData, decryptData, isKeyReady } = useEncryption();
  const { accentColor, hoverColor } = useAccentColor();
  const { registerCleanup, unregisterCleanup } = useSecurityClear();

  // Use entries cache instead of direct API fetches
  const {
    getEntries: getCachedEntries,
    getFavoriteEntries,
    getAllTopics: getCachedTopics,
    isFavorite,
    isInitialized: isCacheInitialized,
    addEntry: addToCache,
    updateEntry: updateInCache,
  } = useEntriesCache();

  // Register security cleanup on mount, unregister on unmount
  useEffect(() => {
    const cleanup = () => {
      dispatch({ type: 'CLEAR_DECRYPTED_DATA' });
    };

    registerCleanup('entries-list', cleanup);

    // Cleanup on unmount only
    return () => {
      cleanup();
      unregisterCleanup('entries-list');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  // Destructure state for easier access
  const {
    entries,
    topics,
    decryptedEntries,
    decryptedTopics,
    decryptedTaskFields,
    filterTopicId,
    viewMode,
    taskFilter,
    searchQuery,
    searchTopicId,
    isDatePickerExpanded,
    quickEntry,
    quickEntryTopicId,
    showTopicDropdown,
    topicSearchQuery,
  } = state;

  // Load entries from cache based on view mode
  const loadEntriesFromCache = useCallback(() => {
    if (!isCacheInitialized) return;

    let cachedEntries: CachedEntry[];

    if (viewMode === 'favorites') {
      cachedEntries = getFavoriteEntries();
    } else if (viewMode === 'search' || viewMode === 'all') {
      cachedEntries = getCachedEntries({ all: true, topicId: filterTopicId || undefined });
    } else if (viewMode === 'tasks') {
      cachedEntries = getCachedEntries({ customType: 'task' });
    } else {
      // Date view - entries for selected date + all tasks
      cachedEntries = getCachedEntries({
        date: filterTopicId ? undefined : selectedDate,
        topicId: filterTopicId || undefined,
        includeTasks: !filterTopicId,
      });
    }

    dispatch({ type: 'SET_ENTRIES', payload: cachedEntries as Entry[] });
  }, [isCacheInitialized, viewMode, selectedDate, filterTopicId, getCachedEntries, getFavoriteEntries]);

  // Load topics from cache
  const loadTopicsFromCache = useCallback(() => {
    if (!isCacheInitialized) return;
    const cachedTopics = getCachedTopics();
    dispatch({ type: 'SET_TOPICS', payload: cachedTopics as Topic[] });
  }, [isCacheInitialized, getCachedTopics]);

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
    const decrypted: Record<string, { isCompleted: boolean; isInProgress: boolean; isAutoMigrating: boolean }> = {};
    for (const entry of entries) {
      if (entry.customType === 'task' && entry.custom_fields) {
        let isCompleted = false;
        let isInProgress = false;
        let isAutoMigrating = false;
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'isCompleted') {
              isCompleted = parsed.value === true;
            }
            if (parsed.fieldKey === 'isInProgress') {
              isInProgress = parsed.value === true;
            }
            if (parsed.fieldKey === 'isAutoMigrating') {
              isAutoMigrating = parsed.value === true;
            }
          } catch {
            // Skip failed fields
          }
        }
        decrypted[entry.id] = { isCompleted, isInProgress, isAutoMigrating };
      }
    }
    dispatch({ type: 'SET_DECRYPTED_TASK_FIELDS', payload: decrypted });
  }, [entries, decryptData]);

  // Load entries from cache when cache is initialized or view params change
  useEffect(() => {
    loadEntriesFromCache();
  }, [loadEntriesFromCache]);

  // Load topics from cache when initialized
  useEffect(() => {
    loadTopicsFromCache();
  }, [loadTopicsFromCache]);

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

  // Handle task completion toggle - saves via entry PUT API
  const handleTaskToggle = useCallback(async (entryId: string, completed: boolean) => {
    if (!isKeyReady) return;

    const currentFields = decryptedTaskFields[entryId];
    if (!currentFields) return;

    try {
      // When marking as completed, also disable auto-migration
      const newAutoMigrating = completed ? false : currentFields.isAutoMigrating;

      // Encrypt all task fields (isCompleted with new value, auto-migrate disabled if completed)
      const completedField = JSON.stringify({ fieldKey: 'isCompleted', value: completed });
      const inProgressField = JSON.stringify({ fieldKey: 'isInProgress', value: currentFields.isInProgress });
      const migrateField = JSON.stringify({ fieldKey: 'isAutoMigrating', value: newAutoMigrating });
      const enc1 = await encryptData(completedField);
      const enc2 = await encryptData(inProgressField);
      const enc3 = await encryptData(migrateField);

      const customFields = [
        { encryptedData: enc1.ciphertext, iv: enc1.iv },
        { encryptedData: enc2.ciphertext, iv: enc2.iv },
        { encryptedData: enc3.ciphertext, iv: enc3.iv },
      ];

      // Update via existing entry PUT API
      const response = await fetch(`/api/entries/${entryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields }),
      });

      if (response.ok) {
        // Update cache with new custom fields
        updateInCache(entryId, {
          custom_fields: customFields.map((cf, i) => ({
            id: `cf_${entryId}_${i}`,
            entryId,
            encryptedData: cf.encryptedData,
            iv: cf.iv,
          })),
        });

        // Update local decrypted state
        dispatch({
          type: 'SET_DECRYPTED_TASK_FIELDS',
          payload: {
            ...decryptedTaskFields,
            [entryId]: { ...currentFields, isCompleted: completed, isAutoMigrating: newAutoMigrating },
          },
        });
      }
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
    }
  }, [isKeyReady, encryptData, decryptedTaskFields, updateInCache]);

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
        // Task fields: isCompleted, isInProgress, isAutoMigrating
        const completedField = JSON.stringify({ fieldKey: 'isCompleted', value: state.task.isCompleted });
        const inProgressField = JSON.stringify({ fieldKey: 'isInProgress', value: state.task.isInProgress });
        const migrateField = JSON.stringify({ fieldKey: 'isAutoMigrating', value: state.task.isAutoMigrating });
        const enc1 = await encryptData(completedField);
        const enc2 = await encryptData(inProgressField);
        const enc3 = await encryptData(migrateField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
        customFields.push({ encryptedData: enc3.ciphertext, iv: enc3.iv });
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
        // Add the new entry to cache
        if (data.entry) {
          addToCache({
            ...data.entry,
            custom_fields: customFields.length > 0 ? customFields.map((cf, i) => ({
              id: `cf_${data.entry.id}_${i}`,
              entryId: data.entry.id,
              encryptedData: cf.encryptedData,
              iv: cf.iv,
            })) : null,
          });
        }
        resetQuickEntryFields();
        loadEntriesFromCache(); // Refresh from cache
        onEntryCreated(data.entry?.id);
      }
    } catch (error) {
      console.error('Failed to create quick entry:', error);
    }
  };

  // Helper to normalize date strings for comparison
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    if (dateStr.length === 10 && dateStr[4] === '-' && dateStr[7] === '-') {
      return dateStr;
    }
    return dateStr.slice(0, 10);
  };

  // Filter entries by search query, topic, and task completion (client-side)
  const filteredEntries = entries.filter(entry => {
    // In date view, show tasks if they were created for this date OR have auto-migrate enabled
    // Also hide completed tasks in date view
    if (viewMode === 'date' && entry.customType === 'task') {
      const taskFields = decryptedTaskFields[entry.id];
      const taskDate = normalizeDate(entry.entryDate);
      const isTaskForSelectedDate = taskDate === selectedDate;

      // If task fields not yet decrypted, show the task (will filter after decryption)
      if (taskFields) {
        // Hide completed tasks in date view
        if (taskFields.isCompleted) {
          return false;
        }
        // Show task if it's for the selected date OR has auto-migrate enabled
        if (!isTaskForSelectedDate && !taskFields.isAutoMigrating) {
          return false;
        }
      }
    }

    // Tasks view - only show tasks, with optional status filter
    if (viewMode === 'tasks') {
      if (entry.customType !== 'task') return false;

      // Apply task status filter
      const taskFields = decryptedTaskFields[entry.id];
      if (taskFilter === 'completed') {
        return taskFields?.isCompleted === true;
      } else if (taskFilter === 'incomplete') {
        return taskFields?.isCompleted !== true;
      } else if (taskFilter === 'in-progress') {
        return taskFields?.isInProgress === true && taskFields?.isCompleted !== true;
      }
      // 'all' - show all tasks
      return true;
    }

    // Search mode filtering
    if (viewMode === 'search') {
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
    }

    return true;
  }).sort((a, b) => {
    // In date view, sort tasks to the bottom
    if (viewMode === 'date') {
      const aIsTask = a.customType === 'task';
      const bIsTask = b.customType === 'task';

      // Non-tasks first, tasks at bottom
      if (!aIsTask && bIsTask) return -1;
      if (aIsTask && !bIsTask) return 1;
    }
    return 0;
  });

  // Group entries by date for "all", "favorites", "tasks", and "search" views
  const entriesByDate = viewMode === 'all' || viewMode === 'favorites' || viewMode === 'tasks' || viewMode === 'search'
    ? filteredEntries.reduce((acc, entry) => {
        const date = entry.entryDate || 'unknown';
        if (!acc[date]) acc[date] = [];
        acc[date].push(entry);
        return acc;
      }, {} as Record<string, Entry[]>)
    : null;

  const sortedDates = entriesByDate
    ? Object.keys(entriesByDate).sort((a, b) => b.localeCompare(a))
    : [];

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'undefined' || dateStr === 'null' || dateStr === 'unknown') {
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

  // Refs for measuring tab positions
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [sliderStyle, setSliderStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const VIEW_MODES = ['date', 'tasks', 'all', 'favorites', 'search'] as const;
  const activeIndex = VIEW_MODES.indexOf(viewMode);

  // Update slider position when viewMode changes
  useLayoutEffect(() => {
    const activeTab = tabRefs.current[activeIndex];
    const container = tabsContainerRef.current;
    if (activeTab && container) {
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      setSliderStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });
    }
  }, [activeIndex, viewMode]);

  return (
    <div className="p-4 h-full overflow-auto">
      {/* View Mode Tabs */}
      <div className="view-tabs" ref={tabsContainerRef}>
        {/* Sliding indicator */}
        <div
          className="view-tabs-slider"
          style={{
            left: sliderStyle.left,
            width: sliderStyle.width,
          }}
        />
        <button
          ref={(el) => { tabRefs.current[0] = el; }}
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
          ref={(el) => { tabRefs.current[1] = el; }}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'tasks' })}
          className={`view-tab ${viewMode === 'tasks' ? 'view-tab-active' : ''}`}
        >
          Tasks
        </button>
        <button
          ref={(el) => { tabRefs.current[2] = el; }}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'all' })}
          className={`view-tab ${viewMode === 'all' ? 'view-tab-active' : ''}`}
        >
          All
        </button>
        <button
          ref={(el) => { tabRefs.current[3] = el; }}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'favorites' })}
          className={`view-tab ${viewMode === 'favorites' ? 'view-tab-active' : ''}`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Bookmarks
        </button>
        <button
          ref={(el) => { tabRefs.current[4] = el; }}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'search' })}
          className={`view-tab ${viewMode === 'search' ? 'view-tab-active' : ''}`}
        >
          Search
        </button>
      </div>

      {/* Date Filter Panel - only shows calendar when expanded */}
      {viewMode === 'date' && isDatePickerExpanded && (
        <div className="mb-4 backdrop-blur-sm bg-white/10 border border-border rounded-md overflow-hidden panel-expand">
          <MiniCalendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            today={today}
          />
        </div>
      )}

      {/* Task Filter Options */}
      {viewMode === 'tasks' && (
        <div className="mb-4 panel-expand">
          <div className="flex gap-1 p-1 bg-white/30 backdrop-blur-sm rounded-lg border border-border">
            {[
              { key: 'all', label: 'All' },
              { key: 'incomplete', label: 'To Do' },
              { key: 'in-progress', label: 'In Progress' },
              { key: 'completed', label: 'Done' },
            ].map((filter) => (
              <button
                key={filter.key}
                onClick={() => dispatch({ type: 'SET_TASK_FILTER', payload: filter.key as typeof taskFilter })}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  taskFilter === filter.key
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Input and Topic Filter */}
      {viewMode === 'search' && (
        <div className="mb-4 space-y-2 panel-expand">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value })}
              placeholder="Search entries..."
              className="input-glass pr-10"
            />
            {(searchQuery || searchTopicId) && (
              <button
                onClick={() => {
                  dispatch({ type: 'SET_SEARCH_QUERY', payload: '' });
                  dispatch({ type: 'SET_SEARCH_TOPIC_ID', payload: null });
                  dispatch({ type: 'SET_VIEW_MODE', payload: 'date' });
                  onDateChange(today);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                title="Clear search and go to today"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchTopicId ? (
            <div className="card flex items-center gap-2 px-3 py-2">
              <TopicIcon iconName={getTopic(searchTopicId)?.icon || null} size="sm" color={accentColor} />
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
          <div className="card mb-4 flex items-center gap-2 px-3 py-2 panel-expand">
            <TopicIcon iconName={topic.icon} size="sm" color={accentColor} />
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
                    color={accentColor}
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
                      <TopicIcon iconName={topic.icon} size="sm" color={accentColor} />
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
              className="btn btn-ghost hidden md:block"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!quickEntry.trim() || !isKeyReady}
            className="btn btn-primary hidden md:block"
            style={{ backgroundColor: accentColor }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = hoverColor}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = accentColor}
          >
            Add
          </button>
        </div>

        {/* Custom fields based on selected topic - shown below text input */}
        {quickEntryTopicName === 'task' && (
          <TaskFields
            fields={state.task}
            onChange={(key, value) => dispatch({ type: 'UPDATE_QF_TASK', payload: { [key]: value } })}
            glass
            noBorder
          />
        )}

        {quickEntryTopicName === 'goal' && (
          <GoalFields
            fields={state.goal}
            onChange={(key, value) => dispatch({ type: 'UPDATE_QF_GOAL', payload: { [key]: value } })}
            glass
            noBorder
          />
        )}

        {quickEntryTopicName === 'meeting' && (
          <MeetingFields
            fields={state.meeting}
            onChange={(key, value) => dispatch({ type: 'UPDATE_QF_MEETING', payload: { [key]: value } })}
            glass
            noBorder
          />
        )}

        {quickEntryTopicName === 'event' && (
          <EventFields
            fields={state.event}
            onChange={(key, value) => dispatch({ type: 'UPDATE_QF_EVENT', payload: { [key]: value } })}
            glass
            noBorder
          />
        )}

        {quickEntryTopicName === 'medication' && (
          <MedicationFields
            fields={state.medication}
            onChange={(key, value) => dispatch({ type: 'UPDATE_QF_MEDICATION', payload: { [key]: value } })}
            glass
            noBorder
          />
        )}

        {quickEntryTopicName === 'exercise' && (
          <ExerciseFields
            fields={state.exercise}
            onChange={(key, value) => dispatch({ type: 'UPDATE_QF_EXERCISE', payload: { [key]: value } })}
            glass
            noBorder
          />
        )}

        {quickEntryTopicName === 'food' && (
          <FoodFields
            fields={state.food}
            onChange={(key, value) => dispatch({ type: 'UPDATE_QF_FOOD', payload: { [key]: value } })}
            glass
            noBorder
          />
        )}

        {(quickEntryTopicName === 'symptom' || quickEntryTopicName === 'symptoms') && (
          <SymptomFields
            fields={state.symptom}
            onChange={(key, value) => dispatch({ type: 'UPDATE_QF_SYMPTOM', payload: { [key]: value } })}
            glass
            noBorder
          />
        )}

        {/* Mobile Add button - full width at bottom */}
        <button
          type="submit"
          disabled={!quickEntry.trim() || !isKeyReady}
          className="btn btn-primary w-full mt-3 md:hidden"
          style={{ backgroundColor: accentColor }}
          onTouchStart={(e) => e.currentTarget.style.backgroundColor = hoverColor}
          onTouchEnd={(e) => e.currentTarget.style.backgroundColor = accentColor}
        >
          Add
        </button>
      </form>

      {/* Entries List */}
      <div key={viewMode} className="space-y-2 view-content-enter">
        {viewMode === 'date' ? (
          // Date view - flat list
          <>
            {filteredEntries.length === 0 && (
              <p className="text-gray-500 text-sm">No entries for this date</p>
            )}
            {/* Non-task entries */}
            {filteredEntries.filter(e => e.customType !== 'task').map((entry) => (
              <EntryCard
                key={entry.id}
                isFavorite={isFavorite(entry.id)}
                decryptedContent={decryptedEntries[entry.id]}
                topic={getTopic(entry.topicId)}
                topicName={getTopicName(entry.topicId)}
                onSelect={() => onSelectEntry(entry.id)}
                onTopicClick={(e) => entry.topicId && handleIconClick(entry.topicId, e)}
                isActive={selectedEntryId === entry.id}
              />
            ))}
            {/* Auto-migrated tasks section - only show label if there are also non-task entries */}
            {filteredEntries.some(e => e.customType === 'task') && (
              <>
                {filteredEntries.some(e => e.customType !== 'task') && (
                  <div className="text-xs font-medium text-gray-500 mt-4 mb-2">
                    Tasks ( includes auto-migrated tasks )
                  </div>
                )}
                {filteredEntries.filter(e => e.customType === 'task').map((entry) => (
                  <EntryCard
                    key={entry.id}
                    isFavorite={isFavorite(entry.id)}
                    decryptedContent={decryptedEntries[entry.id]}
                    topic={getTopic(entry.topicId)}
                    topicName={getTopicName(entry.topicId)}
                    onSelect={() => onSelectEntry(entry.id)}
                    onTopicClick={(e) => entry.topicId && handleIconClick(entry.topicId, e)}
                    taskFields={decryptedTaskFields[entry.id]}
                    onTaskToggle={(completed: boolean) => handleTaskToggle(entry.id, completed)}
                    isActive={selectedEntryId === entry.id}
                  />
                ))}
              </>
            )}
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
                      isFavorite={isFavorite(entry.id)}
                      decryptedContent={decryptedEntries[entry.id]}
                      topic={getTopic(entry.topicId)}
                      topicName={getTopicName(entry.topicId)}
                      onSelect={() => onSelectEntry(entry.id)}
                      onTopicClick={(e) => entry.topicId && handleIconClick(entry.topicId, e)}
                      taskFields={entry.customType === 'task' ? decryptedTaskFields[entry.id] : undefined}
                      onTaskToggle={entry.customType === 'task' ? (completed: boolean) => handleTaskToggle(entry.id, completed) : undefined}
                      isActive={selectedEntryId === entry.id}
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
  isFavorite,
  decryptedContent,
  topic,
  topicName,
  onSelect,
  onTopicClick,
  taskFields,
  onTaskToggle,
  isActive,
}: {
  isFavorite: boolean;
  decryptedContent: string | undefined;
  topic: Topic | null;
  topicName: string | null;
  onSelect: () => void;
  onTopicClick: (e: React.MouseEvent) => void;
  taskFields?: { isCompleted: boolean; isInProgress: boolean; isAutoMigrating: boolean };
  onTaskToggle?: (completed: boolean) => void;
  isActive?: boolean;
}) {
  const { accentColor } = useAccentColor();
  const showInProgress = taskFields?.isInProgress && !taskFields.isCompleted;

  return (
    <div
      onClick={onSelect}
      className={`entry-card ${isActive ? 'entry-card-active' : ''}`}
    >
      {(topic || showInProgress || isFavorite) && (
        <div className="entry-card-header">
          {topic && (
            <button
              type="button"
              onClick={onTopicClick}
              className="entry-card-topic px-2 rounded-full"
              style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
              title={`Filter by ${topicName}`}
            >
              <TopicIcon iconName={topic.icon} size="sm" color={accentColor} />
              {topicName && <span>{topicName}</span>}
            </button>
          )}
          {showInProgress && (
            <span
              className="text-xs px-3 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
            >
              In Progress
            </span>
          )}
          {isFavorite && (
            <svg className="entry-card-bookmark" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          )}
        </div>
      )}
      <div className="entry-card-content flex items-start gap-2">
        {taskFields && onTaskToggle && (
          <input
            type="checkbox"
            checked={taskFields.isCompleted}
            onChange={(e) => {
              e.stopPropagation();
              onTaskToggle(!taskFields.isCompleted);
            }}
            onClick={(e) => e.stopPropagation()}
            className="checkbox mt-1 cursor-pointer"
          />
        )}
        <p className={`entry-card-preview flex-1 ${taskFields?.isCompleted ? 'line-through text-gray-400' : ''}`}>
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
              style={isToday && !isSelected ? { color: accentColor, backgroundColor: `${accentColor}20` } : isSelected ? { backgroundColor: accentColor } : undefined}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

    </div>
  );
}
