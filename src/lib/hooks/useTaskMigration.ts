'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';

interface DecryptedField {
  fieldKey: string;
  value: boolean;
}

export function useTaskMigration(today: string) {
  const { isKeyReady, decryptData } = useEncryption();
  const { getEntriesByType, isInitialized, updateEntry } = useEntriesCache();
  const midnightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasMigratedRef = useRef(false);
  const scheduleNextMidnightRef = useRef<() => void>(() => {});

  const migrateIncompleteTasks = useCallback(async () => {
    if (!isKeyReady || !today || !isInitialized) return;

    try {
      // Get all task entries from cache
      const entries = getEntriesByType('task');

      // Filter tasks that are before today
      const pastTasks = entries.filter((entry) => entry.entryDate < today);

      if (pastTasks.length === 0) return;

      const taskIdsToMigrate: string[] = [];

      for (const task of pastTasks) {
        if (!task.custom_fields || task.custom_fields.length === 0) continue;

        let isCompleted = false;
        let isAutoMigrating = false;

        // Decrypt custom fields to check isCompleted and isAutoMigrating
        for (const cf of task.custom_fields) {
          try {
            const decryptedJson = await decryptData(cf.encryptedData, cf.iv);
            const field: DecryptedField = JSON.parse(decryptedJson);

            if (field.fieldKey === 'isCompleted') {
              isCompleted = field.value === true;
            }
            if (field.fieldKey === 'isAutoMigrating') {
              isAutoMigrating = field.value === true;
            }
          } catch (error) {
            console.error('Failed to decrypt custom field:', error);
          }
        }

        // Only migrate incomplete tasks with auto-migrate enabled
        if (!isCompleted && isAutoMigrating) {
          taskIdsToMigrate.push(task.id);
        }
      }

      if (taskIdsToMigrate.length > 0) {
        const migrateResponse = await fetch('/api/tasks/migrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: taskIdsToMigrate,
            newDate: today,
          }),
        });

        if (migrateResponse.ok) {
          const result = await migrateResponse.json();

          // Update cache with new dates
          for (const taskId of taskIdsToMigrate) {
            updateEntry(taskId, { entryDate: today });
          }
        }
      }
    } catch (error) {
      console.error('Task migration failed:', error);
    }
  }, [isKeyReady, today, decryptData, isInitialized, getEntriesByType, updateEntry]);

  const scheduleNextMidnight = useCallback(() => {
    if (midnightTimeoutRef.current) {
      clearTimeout(midnightTimeoutRef.current);
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    midnightTimeoutRef.current = setTimeout(() => {
      hasMigratedRef.current = false;
      migrateIncompleteTasks();
      scheduleNextMidnightRef.current?.();
    }, msUntilMidnight);
  }, [migrateIncompleteTasks]);

  // Keep ref in sync with latest callback
  useEffect(() => {
    scheduleNextMidnightRef.current = scheduleNextMidnight;
  }, [scheduleNextMidnight]);

  useEffect(() => {
    // Run migration on app load when encryption key is ready and cache is initialized
    if (isKeyReady && today && isInitialized && !hasMigratedRef.current) {
      hasMigratedRef.current = true;
      migrateIncompleteTasks();
      scheduleNextMidnight();
    }

    return () => {
      if (midnightTimeoutRef.current) {
        clearTimeout(midnightTimeoutRef.current);
      }
    };
  }, [isKeyReady, today, isInitialized, migrateIncompleteTasks, scheduleNextMidnight]);
}
