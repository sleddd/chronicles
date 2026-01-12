'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface Task {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
}

interface DecryptedTask {
  id: string;
  content: string;
  isCompleted: boolean;
  hasStatus: boolean; // true if isCompleted field exists (In Progress or Completed), false if no status (Not Started)
}

interface LinkedGoal {
  id: string;
  title: string;
}

interface AvailableTask {
  id: string;
  title: string;
}

interface Props {
  milestoneId: string;
  encryptedContent: string;
  iv: string;
  customFields: CustomField[] | null;
  tasks: Task[];
  linkedGoals: LinkedGoal[];
  onUnlinkTask?: (milestoneId: string, taskId: string) => void;
  onTaskLinked?: () => void;
  onStatusChanged?: () => void;
}

export function MilestoneCard({
  milestoneId,
  encryptedContent,
  iv,
  customFields,
  tasks,
  linkedGoals,
  onUnlinkTask,
  onTaskLinked,
  onStatusChanged,
}: Props) {
  const router = useRouter();
  const { decryptData, encryptData, isKeyReady } = useEncryption();
  const { accentColor } = useAccentColor();
  const { getEntriesByType, updateEntry, addEntry } = useEntriesCache();
  const [title, setTitle] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasStatus, setHasStatus] = useState(false); // true if isCompleted field exists
  const [togglingMilestoneStatus, setTogglingMilestoneStatus] = useState(false);
  const [decryptedTasks, setDecryptedTasks] = useState<DecryptedTask[]>([]);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [isTasksClosing, setIsTasksClosing] = useState(false);
  const [togglingTask, setTogglingTask] = useState<string | null>(null);

  // Add task state
  const [showAddTask, setShowAddTask] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<AvailableTask[]>([]);
  const [linkingTask, setLinkingTask] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  // Handle tasks expand/collapse with animation
  const toggleTasks = useCallback(() => {
    if (tasksExpanded && !isTasksClosing) {
      setIsTasksClosing(true);
      setTimeout(() => {
        setTasksExpanded(false);
        setIsTasksClosing(false);
      }, 150);
    } else if (!tasksExpanded) {
      setTasksExpanded(true);
    }
  }, [tasksExpanded, isTasksClosing]);

  const handleEditMilestone = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/?entry=${milestoneId}`);
  };

  const handleEditTask = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    router.push(`/?entry=${taskId}`);
  };

  const handleLinkExistingTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (linkingTask) return;

    setLinkingTask(true);
    try {
      // Get current milestone IDs for this task
      const response = await fetch(`/api/tasks/${taskId}/milestones`);
      const data = await response.json();
      const currentMilestoneIds = data.milestoneIds || [];

      // Add this milestone to the task's milestones
      if (!currentMilestoneIds.includes(milestoneId)) {
        const updateResponse = await fetch(`/api/tasks/${taskId}/milestones`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ milestoneIds: [...currentMilestoneIds, milestoneId] }),
        });

        if (updateResponse.ok) {
          setShowAddTask(false);
          onTaskLinked?.();
        }
      }
    } catch (error) {
      console.error('Failed to link task:', error);
    } finally {
      setLinkingTask(false);
    }
  };

  // Create a new task inline and auto-link to this milestone
  const handleCreateInlineTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isKeyReady || creatingTask || !newTaskTitle.trim()) return;

    setCreatingTask(true);
    try {
      // Encrypt the task title as content
      const { ciphertext, iv } = await encryptData(`<p>${newTaskTitle.trim()}</p>`);

      // Create the task entry
      const today = new Date().toISOString().split('T')[0];
      const createResponse = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedContent: ciphertext,
          iv,
          customType: 'task',
          entryDate: today,
          searchTokens: [],
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create task');
      }

      const { entry } = await createResponse.json();

      // Link the task to this milestone
      await fetch(`/api/tasks/${entry.id}/milestones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneIds: [milestoneId] }),
      });

      // Add the new task to the cache with milestone link
      addEntry({
        id: entry.id,
        encryptedContent: ciphertext,
        iv,
        topicId: null,
        customType: 'task',
        entryDate: today,
        searchTokens: [],
        custom_fields: null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        milestoneIds: [milestoneId],
      });

      // Clear input and refresh
      setNewTaskTitle('');
      setShowAddTask(false);
      onTaskLinked?.();
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setCreatingTask(false);
    }
  };

  // Three-state toggle for milestone: Not Started -> In Progress -> Completed -> Not Started
  const handleToggleMilestoneStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isKeyReady || togglingMilestoneStatus) return;

    setTogglingMilestoneStatus(true);
    try {
      // Determine next state:
      // Not Started (hasStatus=false) -> In Progress (hasStatus=true, isCompleted=false)
      // In Progress (hasStatus=true, isCompleted=false) -> Completed (hasStatus=true, isCompleted=true)
      // Completed (hasStatus=true, isCompleted=true) -> Not Started (remove isCompleted field)
      let newIsCompleted: boolean | null;
      let newHasStatus: boolean;

      if (!hasStatus) {
        // Not Started -> In Progress
        newIsCompleted = false;
        newHasStatus = true;
      } else if (!isCompleted) {
        // In Progress -> Completed
        newIsCompleted = true;
        newHasStatus = true;
      } else {
        // Completed -> Not Started (remove the field)
        newIsCompleted = null;
        newHasStatus = false;
      }

      // Get existing custom fields to preserve other fields
      const existingFields: Array<{ fieldKey: string; value: unknown }> = [];
      if (customFields) {
        for (const cf of customFields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey !== 'isCompleted') {
              existingFields.push(parsed);
            }
          } catch {
            // Skip failed fields
          }
        }
      }

      // Add isCompleted field only if we have a status
      if (newIsCompleted !== null) {
        existingFields.push({ fieldKey: 'isCompleted', value: newIsCompleted });
      }

      // Re-encrypt all fields
      const encryptedFields = [];
      for (const field of existingFields) {
        const fieldStr = JSON.stringify(field);
        const encrypted = await encryptData(fieldStr);
        encryptedFields.push({ encryptedData: encrypted.ciphertext, iv: encrypted.iv });
      }

      // Update the milestone
      const response = await fetch(`/api/entries/${milestoneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: encryptedFields }),
      });

      if (response.ok) {
        // Update local state
        setIsCompleted(newIsCompleted === true);
        setHasStatus(newHasStatus);
        // Update the cache with new custom fields
        updateEntry(milestoneId, {
          custom_fields: encryptedFields.map((ef, idx) => ({
            id: `cf_${milestoneId}_${idx}`,
            entryId: milestoneId,
            encryptedData: ef.encryptedData,
            iv: ef.iv,
          })),
        });
        // Notify parent to refresh
        onStatusChanged?.();
      }
    } catch (error) {
      console.error('Failed to toggle milestone status:', error);
    } finally {
      setTogglingMilestoneStatus(false);
    }
  };

  // Load available tasks (not already linked to this milestone)
  const loadAvailableTasks = useCallback(async () => {
    if (!isKeyReady) return;

    const allTasks = getEntriesByType('task');
    const linkedTaskIds = new Set(tasks.map(t => t.id));

    const available: AvailableTask[] = [];
    for (const task of allTasks) {
      if (linkedTaskIds.has(task.id)) continue;

      try {
        const content = await decryptData(task.encryptedContent, task.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();
        available.push({
          id: task.id,
          title: plainText.split('\n')[0] || 'Untitled Task',
        });
      } catch {
        available.push({
          id: task.id,
          title: 'Untitled Task',
        });
      }
    }

    setAvailableTasks(available);
  }, [isKeyReady, getEntriesByType, tasks, decryptData]);

  useEffect(() => {
    if (showAddTask) {
      loadAvailableTasks();
    }
  }, [showAddTask, loadAvailableTasks]);

  // Three-state toggle: Not Started -> In Progress -> Completed -> Not Started
  const handleToggleTaskComplete = async (e: React.MouseEvent, taskId: string, currentlyCompleted: boolean, currentlyHasStatus: boolean) => {
    e.stopPropagation();
    if (!isKeyReady || togglingTask) return;

    setTogglingTask(taskId);
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Determine next state:
      // Not Started (hasStatus=false) -> In Progress (hasStatus=true, isCompleted=false)
      // In Progress (hasStatus=true, isCompleted=false) -> Completed (hasStatus=true, isCompleted=true)
      // Completed (hasStatus=true, isCompleted=true) -> Not Started (remove isCompleted field)
      let newIsCompleted: boolean | null;
      let newHasStatus: boolean;

      if (!currentlyHasStatus) {
        // Not Started -> In Progress
        newIsCompleted = false;
        newHasStatus = true;
      } else if (!currentlyCompleted) {
        // In Progress -> Completed
        newIsCompleted = true;
        newHasStatus = true;
      } else {
        // Completed -> Not Started (remove the field)
        newIsCompleted = null;
        newHasStatus = false;
      }

      // Get existing custom fields to preserve other fields
      const existingFields: Array<{ fieldKey: string; value: unknown }> = [];
      if (task.custom_fields) {
        for (const cf of task.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey !== 'isCompleted') {
              existingFields.push(parsed);
            }
          } catch {
            // Skip failed fields
          }
        }
      }

      // Add isCompleted field only if we have a status
      if (newIsCompleted !== null) {
        existingFields.push({ fieldKey: 'isCompleted', value: newIsCompleted });
      }

      // Re-encrypt all fields
      const encryptedFields = [];
      for (const field of existingFields) {
        const fieldStr = JSON.stringify(field);
        const encrypted = await encryptData(fieldStr);
        encryptedFields.push({ encryptedData: encrypted.ciphertext, iv: encrypted.iv });
      }

      // Update the task
      const response = await fetch(`/api/entries/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: encryptedFields }),
      });

      if (response.ok) {
        // Update local state
        setDecryptedTasks(prev =>
          prev.map(t =>
            t.id === taskId ? { ...t, isCompleted: newIsCompleted === true, hasStatus: newHasStatus } : t
          )
        );
        // Update the cache with new custom fields
        updateEntry(taskId, {
          custom_fields: encryptedFields.map((ef, idx) => ({
            id: `cf_${taskId}_${idx}`,
            entryId: taskId,
            encryptedData: ef.encryptedData,
            iv: ef.iv,
          })),
        });
        // Notify parent to refresh
        onStatusChanged?.();
      }
    } catch (error) {
      console.error('Failed to toggle task:', error);
    } finally {
      setTogglingTask(null);
    }
  };

  const decryptMilestone = useCallback(async () => {
    if (!isKeyReady) return;

    try {
      const content = await decryptData(encryptedContent, iv);
      const plainText = content.replace(/<[^>]*>/g, '').trim();
      setTitle(plainText.split('\n')[0] || 'Untitled Milestone');
    } catch {
      setTitle('Decryption failed');
    }

    // Decrypt custom fields
    let foundStatus = false;
    if (customFields && customFields.length > 0) {
      for (const cf of customFields) {
        try {
          const decrypted = await decryptData(cf.encryptedData, cf.iv);
          const parsed = JSON.parse(decrypted);
          if (parsed.fieldKey === 'isCompleted') {
            setIsCompleted(parsed.value === true);
            foundStatus = true;
          }
        } catch {
          // Skip failed fields
        }
      }
    }
    setHasStatus(foundStatus);
  }, [encryptedContent, iv, customFields, decryptData, isKeyReady]);

  const decryptTasks = useCallback(async () => {
    if (!isKeyReady || !tasks || tasks.length === 0) return;

    const decrypted: DecryptedTask[] = [];
    for (const task of tasks) {
      try {
        const content = await decryptData(task.encryptedContent, task.iv);
        const plainText = content.replace(/<[^>]*>/g, '').trim();

        let taskCompleted = false;
        let taskHasStatus = false;
        if (task.custom_fields) {
          for (const cf of task.custom_fields) {
            try {
              const fieldData = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(fieldData);
              if (parsed.fieldKey === 'isCompleted') {
                taskCompleted = parsed.value === true;
                taskHasStatus = true; // Status field exists
              }
            } catch {
              // Skip failed fields
            }
          }
        }

        decrypted.push({
          id: task.id,
          content: plainText.split('\n')[0] || 'Untitled Task',
          isCompleted: taskCompleted,
          hasStatus: taskHasStatus,
        });
      } catch {
        decrypted.push({
          id: task.id,
          content: 'Decryption failed',
          isCompleted: false,
          hasStatus: false,
        });
      }
    }

    setDecryptedTasks(decrypted);
  }, [tasks, decryptData, isKeyReady]);

  useEffect(() => {
    void decryptMilestone();
  }, [decryptMilestone]);

  useEffect(() => {
    void decryptTasks();
  }, [decryptTasks]);

  // Calculate progress from tasks
  const completedCount = decryptedTasks.filter(t => t.isCompleted).length;
  const totalCount = decryptedTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className={`p-4 border border-border rounded-lg backdrop-blur-md bg-white/70 hover:border-border hover:shadow-sm transition-all ${isCompleted ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-1">
          {/* Status badge */}
          <button
            type="button"
            onClick={handleToggleMilestoneStatus}
            disabled={togglingMilestoneStatus}
            className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer bg-gray-100 text-gray-600 flex-shrink-0 ${
              togglingMilestoneStatus ? 'opacity-50' : ''
            }`}
            title={!hasStatus ? 'Set to in progress' : isCompleted ? 'Set to not started' : 'Set to complete'}
          >
            {!hasStatus ? 'Not Started' : isCompleted ? 'Completed' : 'In Progress'}
          </button>
          <h3 className={`font-medium flex-1 ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
            {title || 'Loading...'}
          </h3>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {linkedGoals.length > 0 && (
            <span className="hidden md:inline text-xs text-gray-500 italic">
              <span className="font-medium">Related Goal: </span>
              {linkedGoals.map((goal, index) => (
                <span key={goal.id}>
                  {index > 0 && ', '}
                  {goal.title}
                </span>
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={handleEditMilestone}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit milestone"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar (only if has tasks) */}
      {totalCount > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Tasks</span>
            <span>{completedCount}/{totalCount}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#e5e7eb' }}>
            <div
              className="h-full transition-all duration-300"
              style={{ backgroundColor: accentColor, width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Tasks Section */}
      <div className="pt-2 mt-0">
        <div className="flex items-center justify-between mb-2">
          {decryptedTasks.length > 0 ? (
            <button
              type="button"
              onClick={toggleTasks}
              className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${tasksExpanded && !isTasksClosing ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Tasks ({completedCount}/{totalCount})
            </button>
          ) : (
            <span className="text-sm text-gray-400">No tasks</span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddTask(!showAddTask);
            }}
            className="flex items-center gap-1 text-sm font-medium transition-colors px-2 py-1 rounded"
            style={{ color: accentColor }}
            title="Add task"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {/* Add Task Dropdown */}
        {showAddTask && (
          <div className="mb-3 p-3 bg-white/80 rounded-lg border border-border animate-dropdown">
            <div className="flex flex-col gap-2">
              {/* Inline task creation */}
              <form onSubmit={handleCreateInlineTask} className="flex gap-2">
                <input
                  type="text"
                  placeholder="New task title..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={creatingTask}
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={creatingTask || !newTaskTitle.trim()}
                  className="px-3 py-2 text-sm text-white rounded-md transition-colors bg-gray-500 hover:bg-gray-600 disabled:opacity-50"
                >
                  {creatingTask ? '...' : 'Add'}
                </button>
              </form>

              {availableTasks.length > 0 && (
                <>
                  <div className="text-xs text-gray-500 mt-1">Or link existing:</div>
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {availableTasks
                      .filter((t) => t.title.toLowerCase().includes(taskSearch.toLowerCase()))
                      .map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={(e) => handleLinkExistingTask(e, task.id)}
                          disabled={linkingTask}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                        >
                          {task.title}
                        </button>
                      ))}
                    {availableTasks.filter((t) => t.title.toLowerCase().includes(taskSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">
                        No matching tasks
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Existing Tasks List */}
        {tasksExpanded && decryptedTasks.length > 0 && (
            <div className={`space-y-2 mt-2 ${isTasksClosing ? 'animate-dropdown-out' : 'animate-dropdown'}`}>
              {decryptedTasks.map((task, index) => (
                <div key={task.id}>
                  <div className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={(e) => handleToggleTaskComplete(e, task.id, task.isCompleted, task.hasStatus)}
                      disabled={togglingTask === task.id}
                      className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer bg-gray-100 text-gray-600 ${
                        togglingTask === task.id ? 'opacity-50' : ''
                      }`}
                      title={!task.hasStatus ? 'Set to in progress' : task.isCompleted ? 'Set to not started' : 'Set to complete'}
                    >
                      {!task.hasStatus ? 'Not Started' : task.isCompleted ? 'Completed' : 'In Progress'}
                    </button>
                    <span className={`flex-1 ${task.isCompleted ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                      {task.content}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleEditTask(e, task.id)}
                      className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded transition-colors"
                      title="Edit task"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {onUnlinkTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnlinkTask(milestoneId, task.id);
                        }}
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded transition-colors"
                        title="Unlink task"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {index < decryptedTasks.length - 1 && (
                    <hr className="mt-2 border-gray-200" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
