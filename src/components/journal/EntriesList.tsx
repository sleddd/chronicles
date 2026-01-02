'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [decryptedEntries, setDecryptedEntries] = useState<Record<string, string>>({});
  const [decryptedTopics, setDecryptedTopics] = useState<Record<string, string>>({});
  const [taskFields, setTaskFields] = useState<Map<string, TaskFields>>(new Map());
  const [filterTopicId, setFilterTopicId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTopicId, setSearchTopicId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isDatePickerExpanded, setIsDatePickerExpanded] = useState(false);
  const [quickEntry, setQuickEntry] = useState('');
  const [quickEntryTopicId, setQuickEntryTopicId] = useState<string | null>(null);
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const [topicSearchQuery, setTopicSearchQuery] = useState('');
  // Quick entry custom fields
  // Task
  const [qfTaskCompleted, setQfTaskCompleted] = useState(false);
  const [qfTaskAutoMigrate, setQfTaskAutoMigrate] = useState(true);
  // Goal
  const [qfGoalType, setQfGoalType] = useState<string>('personal');
  const [qfGoalStatus, setQfGoalStatus] = useState<string>('not_started');
  const [qfGoalTargetDate, setQfGoalTargetDate] = useState('');
  // Meeting
  const [qfMeetingStartDate, setQfMeetingStartDate] = useState('');
  const [qfMeetingStartTime, setQfMeetingStartTime] = useState('09:00');
  const [qfMeetingEndDate, setQfMeetingEndDate] = useState('');
  const [qfMeetingEndTime, setQfMeetingEndTime] = useState('10:00');
  const [qfMeetingLocation, setQfMeetingLocation] = useState('');
  const [qfMeetingAddress, setQfMeetingAddress] = useState('');
  const [qfMeetingPhone, setQfMeetingPhone] = useState('');
  const [qfMeetingTopic, setQfMeetingTopic] = useState('');
  const [qfMeetingAttendees, setQfMeetingAttendees] = useState('');
  // Event
  const [qfEventStartDate, setQfEventStartDate] = useState('');
  const [qfEventStartTime, setQfEventStartTime] = useState('09:00');
  const [qfEventEndDate, setQfEventEndDate] = useState('');
  const [qfEventEndTime, setQfEventEndTime] = useState('10:00');
  const [qfEventLocation, setQfEventLocation] = useState('');
  const [qfEventAddress, setQfEventAddress] = useState('');
  const [qfEventPhone, setQfEventPhone] = useState('');
  // Medication
  const [qfMedDosage, setQfMedDosage] = useState('');
  const [qfMedFrequency, setQfMedFrequency] = useState<string>('once_daily');
  const [qfMedScheduleTimes, setQfMedScheduleTimes] = useState<string[]>(['08:00']);
  const [qfMedIsActive, setQfMedIsActive] = useState(true);
  // Exercise
  const [qfExerciseType, setQfExerciseType] = useState<string>('');
  const [qfExerciseDuration, setQfExerciseDuration] = useState('');
  const [qfExerciseIntensity, setQfExerciseIntensity] = useState<string>('medium');
  const [qfExerciseDistance, setQfExerciseDistance] = useState('');
  const [qfExerciseDistanceUnit, setQfExerciseDistanceUnit] = useState<string>('miles');
  const [qfExerciseCalories, setQfExerciseCalories] = useState('');
  // Food
  const [qfMealType, setQfMealType] = useState<string>('');
  const [qfFoodIngredients, setQfFoodIngredients] = useState('');
  // Symptom
  const [qfSeverity, setQfSeverity] = useState(5);
  const [qfSymptomDuration, setQfSymptomDuration] = useState('');
  const { encryptData, decryptData, isKeyReady } = useEncryption();
  const { accentColor, hoverColor } = useAccentColor();

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

  // Get topic name for quick entry to determine which custom fields to show
  const quickEntryTopicName = quickEntryTopicId ? decryptedTopics[quickEntryTopicId]?.toLowerCase() : null;

  const resetQuickEntryFields = () => {
    setQuickEntry('');
    setQuickEntryTopicId(null);
    // Task
    setQfTaskCompleted(false);
    setQfTaskAutoMigrate(true);
    // Goal
    setQfGoalType('personal');
    setQfGoalStatus('not_started');
    setQfGoalTargetDate('');
    // Meeting
    setQfMeetingStartDate('');
    setQfMeetingStartTime('09:00');
    setQfMeetingEndDate('');
    setQfMeetingEndTime('10:00');
    setQfMeetingLocation('');
    setQfMeetingAddress('');
    setQfMeetingPhone('');
    setQfMeetingTopic('');
    setQfMeetingAttendees('');
    // Event
    setQfEventStartDate('');
    setQfEventStartTime('09:00');
    setQfEventEndDate('');
    setQfEventEndTime('10:00');
    setQfEventLocation('');
    setQfEventAddress('');
    setQfEventPhone('');
    // Medication
    setQfMedDosage('');
    setQfMedFrequency('once_daily');
    setQfMedScheduleTimes(['08:00']);
    setQfMedIsActive(true);
    // Exercise
    setQfExerciseType('');
    setQfExerciseDuration('');
    setQfExerciseIntensity('medium');
    setQfExerciseDistance('');
    setQfExerciseDistanceUnit('miles');
    setQfExerciseCalories('');
    // Food
    setQfMealType('');
    setQfFoodIngredients('');
    // Symptom
    setQfSeverity(5);
    setQfSymptomDuration('');
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
        const completedField = JSON.stringify({ fieldKey: 'isCompleted', value: qfTaskCompleted });
        const migrateField = JSON.stringify({ fieldKey: 'isAutoMigrating', value: qfTaskAutoMigrate });
        const enc1 = await encryptData(completedField);
        const enc2 = await encryptData(migrateField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
      } else if (topicName === 'goal') {
        // Goal fields: type, status, targetDate, progressPercentage
        const typeField = JSON.stringify({ fieldKey: 'type', value: qfGoalType });
        const statusField = JSON.stringify({ fieldKey: 'status', value: qfGoalStatus });
        const targetField = JSON.stringify({ fieldKey: 'targetDate', value: qfGoalTargetDate || null });
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
        const startDateField = JSON.stringify({ fieldKey: 'startDate', value: qfMeetingStartDate || selectedDate || today });
        const startTimeField = JSON.stringify({ fieldKey: 'startTime', value: qfMeetingStartTime });
        const endDateField = JSON.stringify({ fieldKey: 'endDate', value: qfMeetingEndDate || qfMeetingStartDate || selectedDate || today });
        const endTimeField = JSON.stringify({ fieldKey: 'endTime', value: qfMeetingEndTime });
        const enc1 = await encryptData(startDateField);
        const enc2 = await encryptData(startTimeField);
        const enc3 = await encryptData(endDateField);
        const enc4 = await encryptData(endTimeField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
        customFields.push({ encryptedData: enc3.ciphertext, iv: enc3.iv });
        customFields.push({ encryptedData: enc4.ciphertext, iv: enc4.iv });
        if (qfMeetingLocation) {
          const locationField = JSON.stringify({ fieldKey: 'location', value: qfMeetingLocation });
          const enc = await encryptData(locationField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (qfMeetingAddress) {
          const addressField = JSON.stringify({ fieldKey: 'address', value: qfMeetingAddress });
          const enc = await encryptData(addressField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (qfMeetingPhone) {
          const phoneField = JSON.stringify({ fieldKey: 'phone', value: qfMeetingPhone });
          const enc = await encryptData(phoneField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (qfMeetingTopic) {
          const topicField = JSON.stringify({ fieldKey: 'topic', value: qfMeetingTopic });
          const enc = await encryptData(topicField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (qfMeetingAttendees) {
          const attendeesField = JSON.stringify({ fieldKey: 'attendees', value: qfMeetingAttendees });
          const enc = await encryptData(attendeesField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
      } else if (topicName === 'event') {
        // Event fields: startDate, startTime, endDate, endTime, location, address, phone
        const startDateField = JSON.stringify({ fieldKey: 'startDate', value: qfEventStartDate || selectedDate || today });
        const startTimeField = JSON.stringify({ fieldKey: 'startTime', value: qfEventStartTime });
        const endDateField = JSON.stringify({ fieldKey: 'endDate', value: qfEventEndDate || qfEventStartDate || selectedDate || today });
        const endTimeField = JSON.stringify({ fieldKey: 'endTime', value: qfEventEndTime });
        const enc1 = await encryptData(startDateField);
        const enc2 = await encryptData(startTimeField);
        const enc3 = await encryptData(endDateField);
        const enc4 = await encryptData(endTimeField);
        customFields.push({ encryptedData: enc1.ciphertext, iv: enc1.iv });
        customFields.push({ encryptedData: enc2.ciphertext, iv: enc2.iv });
        customFields.push({ encryptedData: enc3.ciphertext, iv: enc3.iv });
        customFields.push({ encryptedData: enc4.ciphertext, iv: enc4.iv });
        if (qfEventLocation) {
          const locationField = JSON.stringify({ fieldKey: 'location', value: qfEventLocation });
          const enc = await encryptData(locationField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (qfEventAddress) {
          const addressField = JSON.stringify({ fieldKey: 'address', value: qfEventAddress });
          const enc = await encryptData(addressField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (qfEventPhone) {
          const phoneField = JSON.stringify({ fieldKey: 'phone', value: qfEventPhone });
          const enc = await encryptData(phoneField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
      } else if (topicName === 'medication') {
        // Medication fields: dosage, frequency, scheduleTimes, isActive, startDate
        const dosageField = JSON.stringify({ fieldKey: 'dosage', value: qfMedDosage });
        const frequencyField = JSON.stringify({ fieldKey: 'frequency', value: qfMedFrequency });
        const scheduleTimesField = JSON.stringify({ fieldKey: 'scheduleTimes', value: qfMedScheduleTimes });
        const isActiveField = JSON.stringify({ fieldKey: 'isActive', value: qfMedIsActive });
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
        if (qfExerciseType) {
          const typeField = JSON.stringify({ fieldKey: 'exerciseType', value: qfExerciseType });
          const enc = await encryptData(typeField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (qfExerciseDuration) {
          const durField = JSON.stringify({ fieldKey: 'duration', value: parseInt(qfExerciseDuration) || null });
          const enc = await encryptData(durField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        const intensityField = JSON.stringify({ fieldKey: 'intensity', value: qfExerciseIntensity });
        const encIntensity = await encryptData(intensityField);
        customFields.push({ encryptedData: encIntensity.ciphertext, iv: encIntensity.iv });
        if (qfExerciseDistance) {
          const distanceField = JSON.stringify({ fieldKey: 'distance', value: parseFloat(qfExerciseDistance) || null });
          const enc = await encryptData(distanceField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
          const unitField = JSON.stringify({ fieldKey: 'distanceUnit', value: qfExerciseDistanceUnit });
          const encUnit = await encryptData(unitField);
          customFields.push({ encryptedData: encUnit.ciphertext, iv: encUnit.iv });
        }
        if (qfExerciseCalories) {
          const calField = JSON.stringify({ fieldKey: 'calories', value: parseInt(qfExerciseCalories) || null });
          const enc = await encryptData(calField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        const performedField = JSON.stringify({ fieldKey: 'performedAt', value: new Date().toISOString() });
        const encPerformed = await encryptData(performedField);
        customFields.push({ encryptedData: encPerformed.ciphertext, iv: encPerformed.iv });
      } else if (topicName === 'food') {
        // Food fields: mealType, consumedAt, ingredients
        if (qfMealType) {
          const mealField = JSON.stringify({ fieldKey: 'mealType', value: qfMealType });
          const enc = await encryptData(mealField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        if (qfFoodIngredients) {
          const ingredients = qfFoodIngredients.split(',').map(i => i.trim()).filter(i => i);
          const ingredientsField = JSON.stringify({ fieldKey: 'ingredients', value: ingredients });
          const enc = await encryptData(ingredientsField);
          customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        }
        const consumedField = JSON.stringify({ fieldKey: 'consumedAt', value: new Date().toISOString() });
        const encConsumed = await encryptData(consumedField);
        customFields.push({ encryptedData: encConsumed.ciphertext, iv: encConsumed.iv });
      } else if (topicName === 'symptom' || topicName === 'symptoms') {
        // Symptom fields: severity, occurredAt, duration
        const sevField = JSON.stringify({ fieldKey: 'severity', value: qfSeverity });
        const enc = await encryptData(sevField);
        customFields.push({ encryptedData: enc.ciphertext, iv: enc.iv });
        if (qfSymptomDuration) {
          const durField = JSON.stringify({ fieldKey: 'duration', value: parseInt(qfSymptomDuration) || null });
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
    setIsDatePickerExpanded(false);
  };

  return (
    <div className="p-4 h-full overflow-auto">
      {/* View Mode Tabs */}
      <div className="mb-4 flex gap-1 backdrop-blur-sm bg-white/30 p-1 rounded-lg border border-border">
        <button
          onClick={() => {
            if (viewMode === 'date') {
              // Toggle date picker if already on date tab
              setIsDatePickerExpanded(!isDatePickerExpanded);
            } else {
              // Switch to date mode and show picker
              setViewMode('date');
              setIsDatePickerExpanded(true);
            }
          }}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'date'
              ? 'backdrop-blur-sm bg-white/10 text-gray-900 border border-border'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Date
        </button>
        <button
          onClick={() => setViewMode('all')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'all'
              ? 'backdrop-blur-sm bg-white/10 text-gray-900 border border-border'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setViewMode('favorites')}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors flex items-center justify-center gap-1 ${
            viewMode === 'favorites'
              ? 'backdrop-blur-sm bg-white/10 text-gray-900 border border-border'
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
              ? 'backdrop-blur-sm bg-white/10 text-gray-900 border border-border'
              : 'text-gray-600 hover:text-gray-900'
          }`}
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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="w-full px-3 py-2 border border-border rounded-md backdrop-blur-sm bg-white/10 text-gray-900 placeholder-gray-400"
          />
          {searchTopicId ? (
            <div className="flex items-center gap-2 px-3 py-2 backdrop-blur-sm bg-white/10 border border-border rounded-md">
              <TopicIcon iconName={getTopic(searchTopicId)?.icon || null} size="sm" />
              <span className="text-sm text-gray-700">
                <strong>{getTopicName(searchTopicId)}</strong>
              </span>
              <button
                onClick={() => setSearchTopicId(null)}
                className="ml-auto text-gray-400 hover:text-gray-600 text-sm"
              >
                × Clear
              </button>
            </div>
          ) : (
            <select
              value=""
              onChange={(e) => setSearchTopicId(e.target.value || null)}
              className="w-full px-3 py-2 border border-border rounded-md backdrop-blur-sm bg-white/10 text-gray-900"
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
          <div className="mb-4 flex items-center gap-2 px-3 py-2 backdrop-blur-sm bg-white/10 border border-border rounded-md">
            <TopicIcon iconName={topic.icon} size="sm" />
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
      <form onSubmit={handleQuickEntry} className="relative z-20 mb-4 backdrop-blur-sm bg-white/10 border-t border-border py-3 px-4">
        <div className="flex gap-2 mb-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTopicDropdown(!showTopicDropdown)}
              className="px-2 py-1 text-sm rounded-md backdrop-blur-sm bg-white/10 text-gray-700 flex items-center gap-1 hover:backdrop-blur-sm bg-white/10"
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
                <span className="text-gray-500">No topic</span>
              )}
              <svg className="w-3 h-3 text-gray-400 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTopicDropdown && (
              <div className="absolute top-full left-0 mt-1 backdrop-blur-xl bg-white/90 border border-border rounded-md shadow-lg z-50 w-64">
                <div className="p-2 border-b border-border">
                  <input
                    type="text"
                    value={topicSearchQuery}
                    onChange={(e) => setTopicSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                    placeholder="Type to search topics..."
                    className="w-full px-2 py-1 text-sm border border-border rounded backdrop-blur-xl bg-white/70 text-gray-900 placeholder-gray-400"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-auto">
                  {(!topicSearchQuery.trim() || 'no topic'.includes(topicSearchQuery.toLowerCase())) && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickEntryTopicId(null);
                        setShowTopicDropdown(false);
                        setTopicSearchQuery('');
                      }}
                      className="w-full px-3 py-1.5 text-sm text-left text-gray-500 hover:backdrop-blur-sm bg-white/40"
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
                        setQuickEntryTopicId(topic.id);
                        setShowTopicDropdown(false);
                        setTopicSearchQuery('');
                      }}
                      className="w-full px-3 py-1.5 text-sm text-left text-gray-700 hover:backdrop-blur-sm bg-white/40 flex items-center gap-2"
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

        <div className="flex gap-2">
          <input
            type="text"
            value={quickEntry}
            onChange={(e) => setQuickEntry(e.target.value)}
            placeholder="Quick entry..."
            className="flex-1 px-4 py-2 border border-border rounded-md text-sm backdrop-blur-sm bg-white/10 text-gray-900 placeholder-gray-500"
          />
          {(quickEntry.trim() || quickEntryTopicId) && (
            <button
              type="button"
              onClick={resetQuickEntryFields}
              className="px-3 py-2 text-gray-600 text-sm rounded-md border border-border hover:backdrop-blur-sm bg-white/40"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!quickEntry.trim() || !isKeyReady}
            className="px-3 py-2 text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: accentColor }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = hoverColor}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = accentColor}
          >
            Add
          </button>
        </div>

        {/* Custom fields based on selected topic - shown below text input */}
        {quickEntryTopicName === 'task' && (
          <div className="flex items-center gap-4 mt-2 text-sm">
            <label className="flex items-center gap-1.5 text-gray-600">
              <input
                type="checkbox"
                checked={qfTaskAutoMigrate}
                onChange={(e) => setQfTaskAutoMigrate(e.target.checked)}
                className="rounded border-border"
              />
              Auto-migrate
            </label>
          </div>
        )}

        {quickEntryTopicName === 'goal' && (
          <div className="space-y-2 mt-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={qfGoalType}
                onChange={(e) => setQfGoalType(e.target.value)}
                className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              >
                <option value="personal">Personal</option>
                <option value="professional">Professional</option>
                <option value="health">Health</option>
                <option value="financial">Financial</option>
                <option value="educational">Educational</option>
              </select>
              <select
                value={qfGoalStatus}
                onChange={(e) => setQfGoalStatus(e.target.value)}
                className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              >
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
              <div className="flex items-center gap-1">
                <label className="text-gray-600">Target:</label>
                <input
                  type="date"
                  value={qfGoalTargetDate}
                  onChange={(e) => setQfGoalTargetDate(e.target.value)}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
              </div>
            </div>
          </div>
        )}

        {quickEntryTopicName === 'meeting' && (
          <div className="space-y-2 mt-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <label className="text-gray-600">Start:</label>
                <input
                  type="date"
                  value={qfMeetingStartDate}
                  onChange={(e) => setQfMeetingStartDate(e.target.value)}
                  placeholder={selectedDate || today}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
                <input
                  type="time"
                  value={qfMeetingStartTime}
                  onChange={(e) => setQfMeetingStartTime(e.target.value)}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-gray-600">End:</label>
                <input
                  type="date"
                  value={qfMeetingEndDate}
                  onChange={(e) => setQfMeetingEndDate(e.target.value)}
                  placeholder={qfMeetingStartDate || selectedDate || today}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
                <input
                  type="time"
                  value={qfMeetingEndTime}
                  onChange={(e) => setQfMeetingEndTime(e.target.value)}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={qfMeetingLocation}
                onChange={(e) => setQfMeetingLocation(e.target.value)}
                placeholder="Location"
                className="flex-1 min-w-[100px] px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              />
              <input
                type="text"
                value={qfMeetingTopic}
                onChange={(e) => setQfMeetingTopic(e.target.value)}
                placeholder="Meeting topic"
                className="flex-1 min-w-[120px] px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              />
            </div>
          </div>
        )}

        {quickEntryTopicName === 'event' && (
          <div className="space-y-2 mt-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <label className="text-gray-600">Start:</label>
                <input
                  type="date"
                  value={qfEventStartDate}
                  onChange={(e) => setQfEventStartDate(e.target.value)}
                  placeholder={selectedDate || today}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
                <input
                  type="time"
                  value={qfEventStartTime}
                  onChange={(e) => setQfEventStartTime(e.target.value)}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-gray-600">End:</label>
                <input
                  type="date"
                  value={qfEventEndDate}
                  onChange={(e) => setQfEventEndDate(e.target.value)}
                  placeholder={qfEventStartDate || selectedDate || today}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
                <input
                  type="time"
                  value={qfEventEndTime}
                  onChange={(e) => setQfEventEndTime(e.target.value)}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={qfEventLocation}
                onChange={(e) => setQfEventLocation(e.target.value)}
                placeholder="Location"
                className="flex-1 min-w-[100px] px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              />
            </div>
          </div>
        )}

        {quickEntryTopicName === 'medication' && (
          <div className="space-y-2 mt-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={qfMedDosage}
                onChange={(e) => setQfMedDosage(e.target.value)}
                placeholder="Dosage (e.g., 10mg)"
                className="w-32 px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              />
              <select
                value={qfMedFrequency}
                onChange={(e) => setQfMedFrequency(e.target.value)}
                className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              >
                <option value="once_daily">Once Daily</option>
                <option value="twice_daily">Twice Daily</option>
                <option value="three_times_daily">3x Daily</option>
                <option value="four_times_daily">4x Daily</option>
                <option value="as_needed">As Needed</option>
                <option value="weekly">Weekly</option>
              </select>
              <label className="flex items-center gap-1.5 text-gray-600">
                <input
                  type="checkbox"
                  checked={qfMedIsActive}
                  onChange={(e) => setQfMedIsActive(e.target.checked)}
                  className="rounded border-border"
                />
                Active
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-gray-600">Schedule times:</label>
              {qfMedScheduleTimes.map((time, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      const newTimes = [...qfMedScheduleTimes];
                      newTimes[idx] = e.target.value;
                      setQfMedScheduleTimes(newTimes);
                    }}
                    className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                  />
                  {qfMedScheduleTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setQfMedScheduleTimes(qfMedScheduleTimes.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setQfMedScheduleTimes([...qfMedScheduleTimes, '12:00'])}
                className="text-teal-600 hover:text-teal-800"
              >
                + Add time
              </button>
            </div>
          </div>
        )}

        {quickEntryTopicName === 'exercise' && (
          <div className="space-y-2 mt-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={qfExerciseType}
                onChange={(e) => setQfExerciseType(e.target.value)}
                className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
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
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={qfExerciseDuration}
                  onChange={(e) => setQfExerciseDuration(e.target.value)}
                  placeholder="Duration"
                  className="w-20 px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                  min="0"
                />
                <span className="text-gray-500">min</span>
              </div>
              <select
                value={qfExerciseIntensity}
                onChange={(e) => setQfExerciseIntensity(e.target.value)}
                className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              >
                <option value="low">Low intensity</option>
                <option value="medium">Medium intensity</option>
                <option value="high">High intensity</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={qfExerciseDistance}
                  onChange={(e) => setQfExerciseDistance(e.target.value)}
                  placeholder="Distance"
                  className="w-20 px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                  min="0"
                  step="0.1"
                />
                <select
                  value={qfExerciseDistanceUnit}
                  onChange={(e) => setQfExerciseDistanceUnit(e.target.value)}
                  className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                >
                  <option value="miles">mi</option>
                  <option value="km">km</option>
                  <option value="meters">m</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={qfExerciseCalories}
                  onChange={(e) => setQfExerciseCalories(e.target.value)}
                  placeholder="Calories"
                  className="w-20 px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                  min="0"
                />
                <span className="text-gray-500">cal</span>
              </div>
            </div>
          </div>
        )}

        {quickEntryTopicName === 'food' && (
          <div className="space-y-2 mt-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={qfMealType}
                onChange={(e) => setQfMealType(e.target.value)}
                className="px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              >
                <option value="">Meal type...</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
              <input
                type="text"
                value={qfFoodIngredients}
                onChange={(e) => setQfFoodIngredients(e.target.value)}
                placeholder="Ingredients (comma separated)"
                className="flex-1 min-w-[150px] px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
              />
            </div>
          </div>
        )}

        {(quickEntryTopicName === 'symptom' || quickEntryTopicName === 'symptoms') && (
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
            <div className="flex items-center gap-2">
              <label className="text-gray-600">Severity:</label>
              <input
                type="range"
                min="1"
                max="10"
                value={qfSeverity}
                onChange={(e) => setQfSeverity(parseInt(e.target.value))}
                className="w-24"
              />
              <span className="text-gray-700 font-medium w-6">{qfSeverity}</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={qfSymptomDuration}
                onChange={(e) => setQfSymptomDuration(e.target.value)}
                placeholder="Duration"
                className="w-20 px-2 py-1 border border-border rounded backdrop-blur-sm bg-white/10 text-gray-900"
                min="0"
              />
              <span className="text-gray-500">min</span>
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
      className="p-3 mb-[5px] border border-border rounded-md cursor-pointer backdrop-blur-sm bg-white/10"
    >
      <div className="flex items-center gap-2 mb-1">
        {topic && (
          <button
            type="button"
            onClick={onTopicClick}
            className="text-xs py-1 mb-[10px] rounded flex items-center gap-1 hover:ring-2 hover:ring-gray-300 transition-all"
            title={`Filter by ${topicName}`}
          >
            <TopicIcon iconName={topic.icon} size="sm" />
            {topicName && <span className="text-gray-700">{topicName}</span>}
          </button>
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
                : 'border-border hover:border-border'
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
    <div className="p-3">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => navigateMonth('prev')}
          className="p-1 hover:backdrop-blur-sm bg-white/40 rounded text-gray-600"
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
          className="p-1 hover:backdrop-blur-sm bg-white/40 rounded text-gray-600"
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
                ${isToday && !isSelected ? 'font-medium' : ''}
                ${isSelected ? 'text-white font-medium' : 'hover:backdrop-blur-sm bg-white/40'}
              `}
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
