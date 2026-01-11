'use client';

import { useEffect, useCallback, useRef, useReducer } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { useSecurityClear } from '@/lib/hooks/useSecurityClear';
import { generateSearchTokens } from '@/lib/crypto/searchTokens';
import { sanitizeHtml } from '@/lib/sanitize';
import { TopicSelector } from '@/components/topics/TopicSelector';
import { MilestoneGoalSelector } from '@/components/goals/MilestoneEditor';
import { TaskMilestoneSelector } from '@/components/tasks/TaskMilestoneSelector';
import { ShareModal } from '@/components/sharing/ShareModal';
import { entryReducer, initialState } from './entryEditorReducer';
// Import existing form field components
import { GoalFields } from '@/components/forms/GoalFields';
import { TaskFields } from '@/components/forms/TaskFields';
import { MilestoneFields } from '@/components/forms/MilestoneFields';
import { MedicationFields } from '@/components/forms/MedicationFields';
import { FoodFields } from '@/components/forms/FoodFields';
import { SymptomFields } from '@/components/forms/SymptomFields';
import { ExerciseFields } from '@/components/forms/ExerciseFields';
import { EventFields } from '@/components/forms/EventFields';
import { MeetingFields } from '@/components/forms/MeetingFields';
import { CustomFieldSection } from '@/components/forms/CustomFieldSection';
import { loadCustomFields, buildCustomFields } from '@/lib/customFields';
import type {
  GoalFields as GoalFieldValues,
  TaskFields as TaskFieldValues,
  MilestoneFields as MilestoneFieldValues,
  MedicationFields as MedicationFieldValues,
  FoodFields as FoodFieldValues,
  SymptomFields as SymptomFieldValues,
  ExerciseFields as ExerciseFieldValues,
  EventFields as EventFieldValues,
  MeetingFields as MeetingFieldValues,
} from '@/lib/hooks/useCustomFields';

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`entry-editor-toolbar-btn ${isActive ? 'entry-editor-toolbar-btn-active' : ''}`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor, onImageClick }: { editor: Editor | null; onImageClick?: () => void }) {
  if (!editor) return null;

  return (
    <div className="entry-editor-toolbar hidden md:flex flex-wrap">
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="Inline Code"
      >
        <span className="font-mono text-xs">&lt;/&gt;</span>
      </ToolbarButton>

      <div className="entry-editor-toolbar-divider" />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        H3
      </ToolbarButton>

      <div className="entry-editor-toolbar-divider" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <span className="text-xs">• List</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <span className="text-xs">1. List</span>
      </ToolbarButton>

      <div className="entry-editor-toolbar-divider" />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Quote"
      >
        <span className="text-xs">&quot;</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title="Code Block"
      >
        <span className="font-mono text-xs">{'{}'}</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <span className="text-xs">—</span>
      </ToolbarButton>

      <div className="entry-editor-toolbar-divider" />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <span className="text-xs">↶</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <span className="text-xs">↷</span>
      </ToolbarButton>

      {onImageClick && (
        <>
          <div className="entry-editor-toolbar-divider" />
          <ToolbarButton
            onClick={onImageClick}
            title="Add Image"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </ToolbarButton>
        </>
      )}
    </div>
  );
}

interface Props {
  entryId: string | null;
  date: string;
  onEntrySaved: () => void;
  onSelectEntry?: (entryId: string | null) => void;
  today: string;
  customType?: 'task' | 'goal' | 'milestone' | 'medication' | 'food' | 'symptom' | 'event' | 'meeting' | 'exercise' | null;
  onTopicsChange?: () => void;
}


export function EntryEditor({ entryId, date: _date, onEntrySaved, onSelectEntry, today, customType, onTopicsChange }: Props) {
  // Note: _date is available for future use (e.g., viewing entries from past dates)
  void _date;

  // Use reducer for all state management
  const [state, dispatch] = useReducer(entryReducer, initialState);

  const { encryptData, decryptData, isKeyReady } = useEncryption();
  const { accentColor, hoverColor } = useAccentColor();
  const { registerCleanup, unregisterCleanup } = useSecurityClear();

  // Use entries cache
  const {
    getEntry: getCachedEntry,
    isFavorite: isCachedFavorite,
    addEntry: addToCache,
    updateEntry: updateInCache,
    removeEntry: removeFromCache,
    addFavorite: addFavoriteToCache,
    removeFavorite: removeFavoriteFromCache,
  } = useEntriesCache();

  const MAX_CHARS_SHORT = 200;

  // Register security cleanup on mount, unregister on unmount
  useEffect(() => {
    const cleanup = () => {
      dispatch({ type: 'RESET_ALL' });
      if (editorRef.current) {
        editorRef.current.commands.clearContent();
      }
    };

    registerCleanup('entry-editor', cleanup);

    // Cleanup on unmount only - clear all sensitive state and editor content
    return () => {
      cleanup();
      unregisterCleanup('entry-editor');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  // Fetch and decrypt topic name when selectedTopicId changes
  useEffect(() => {
    const fetchTopicName = async () => {
      if (!state.selectedTopicId || !isKeyReady) {
        dispatch({ type: 'SET_TOPIC_NAME', payload: null });
        return;
      }
      try {
        const response = await fetch('/api/topics');
        const data = await response.json();
        const topic = data.topics?.find((t: { id: string }) => t.id === state.selectedTopicId);
        if (topic) {
          const name = await decryptData(topic.encryptedName, topic.iv);
          dispatch({ type: 'SET_TOPIC_NAME', payload: name });
        }
      } catch {
        dispatch({ type: 'SET_TOPIC_NAME', payload: null });
      }
    };
    fetchTopicName();
  }, [state.selectedTopicId, isKeyReady, decryptData]);

  // Ref to track save function for keyboard shortcut
  const handleSaveRef = useRef<(() => void) | null>(null);
  // Ref to store editor for cleanup
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap min-h-[80px] py-4 px-2 text-gray-900 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      dispatch({ type: 'SET_CHAR_COUNT', payload: text.length });
    },
  });

  // Keep editorRef in sync with editor for cleanup access
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const loadEntry = useCallback(async () => {
    if (!entryId || !isKeyReady || !editor) return;
    dispatch({ type: 'SET_LOADING', payload: true });

    // Reset all custom fields to defaults before loading entry-specific data
    dispatch({ type: 'RESET_ALL' });

    try {
      // Try to get entry from cache first
      const cachedEntry = getCachedEntry(entryId);

      // For goals and milestones, we need the full API response to get nested milestones/tasks
      // For other entry types, cache is sufficient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let entry: any;

      const needsRelationships = cachedEntry?.customType === 'goal' || cachedEntry?.customType === 'milestone';

      if (!cachedEntry || needsRelationships) {
        // Fetch from API to get full entry with relationships
        const response = await fetch(`/api/entries/${entryId}`);
        const data = await response.json();
        entry = data.entry;
        // Update cache with basic entry data (not relationships)
        if (entry && !cachedEntry) {
          addToCache({
            id: entry.id,
            encryptedContent: entry.encryptedContent,
            iv: entry.iv,
            topicId: entry.topicId,
            customType: entry.customType,
            custom_fields: entry.custom_fields,
            searchTokens: [],
            entryDate: '',
            createdAt: '',
            updatedAt: '',
          });
        }
      } else {
        entry = cachedEntry;
      }

      if (!entry) {
        throw new Error('Entry not found');
      }

      const content = await decryptData(entry.encryptedContent, entry.iv);
      editor.commands.setContent(content);
      dispatch({ type: 'SET_TOPIC', payload: { id: entry.topicId } });
      dispatch({ type: 'SET_STORED_CUSTOM_TYPE', payload: entry.customType || null });

      // Check content length and auto-expand if over limit
      const plainText = content.replace(/<[^>]*>/g, '');
      dispatch({ type: 'SET_CHAR_COUNT', payload: plainText.length });
      dispatch({ type: 'SET_EXPAND_ENTRY', payload: plainText.length > MAX_CHARS_SHORT });

      // Load custom fields based on entry type
      if (entry.customType) {
        const fieldUpdates = await loadCustomFields(
          entry.customType,
          entry.custom_fields,
          entry,
          decryptData
        );
        dispatch({ type: 'LOAD_ENTRY', payload: fieldUpdates });

        // Load linked milestones for goals
        if (entry.customType === 'goal' && entry.milestones && entry.milestones.length > 0) {
          const decryptedMilestones: Array<{ id: string; content: string }> = [];
          for (const milestone of entry.milestones) {
            try {
              const content = await decryptData(milestone.encryptedContent, milestone.iv);
              const plainText = content.replace(/<[^>]*>/g, '').trim();
              decryptedMilestones.push({
                id: milestone.id,
                content: plainText.split('\n')[0] || 'Untitled Milestone',
              });
            } catch {
              decryptedMilestones.push({ id: milestone.id, content: 'Decryption failed' });
            }
          }
          dispatch({ type: 'UPDATE_GOAL', payload: { linkedMilestones: decryptedMilestones } });
        }

        // Load linked tasks for milestones
        if (entry.customType === 'milestone' && entry.tasks && entry.tasks.length > 0) {
          const decryptedTasks: Array<{ id: string; content: string; isCompleted: boolean }> = [];
          for (const task of entry.tasks) {
            try {
              const content = await decryptData(task.encryptedContent, task.iv);
              const plainText = content.replace(/<[^>]*>/g, '').trim();

              // Check if task is completed from custom fields
              let isCompleted = false;
              if (task.custom_fields) {
                for (const cf of task.custom_fields) {
                  try {
                    const fieldData = await decryptData(cf.encryptedData, cf.iv);
                    const parsed = JSON.parse(fieldData);
                    if (parsed.fieldKey === 'isCompleted') {
                      isCompleted = parsed.value === true;
                      break;
                    }
                  } catch {
                    // Skip failed fields
                  }
                }
              }

              decryptedTasks.push({
                id: task.id,
                content: plainText.split('\n')[0] || 'Untitled Task',
                isCompleted,
              });
            } catch {
              decryptedTasks.push({ id: task.id, content: 'Decryption failed', isCompleted: false });
            }
          }
          dispatch({ type: 'UPDATE_MILESTONE', payload: { linkedTasks: decryptedTasks } });
        }

        // Load task milestone links
        if (entry.customType === 'task') {
          try {
            const milestonesResponse = await fetch(`/api/tasks/${entryId}/milestones`);
            const milestonesData = await milestonesResponse.json();
            if (milestonesData.milestoneIds) {
              dispatch({ type: 'UPDATE_TASK', payload: { milestoneIds: milestonesData.milestoneIds } });
            }
          } catch {
            // Ignore if milestone fetch fails
          }
        }
      }

      // Check if entry is favorited (from cache)
      dispatch({ type: 'SET_FAVORITE', payload: isCachedFavorite(entryId) });

    } catch (error) {
      console.error('Failed to load entry:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [entryId, isKeyReady, editor, decryptData, getCachedEntry, addToCache, isCachedFavorite]);

  useEffect(() => {
    if (entryId && isKeyReady) {
      loadEntry();
    } else if (!entryId && editor) {
      editor.commands.setContent('');
      dispatch({ type: 'RESET_ALL' });
    }
  }, [entryId, isKeyReady, loadEntry, editor]);

  const handleSave = async () => {
    if (!editor || !isKeyReady) return;

    // Check character limit if not expanded
    if (!state.expandEntry && state.charCount > MAX_CHARS_SHORT) {
      alert(`Entry is ${state.charCount - MAX_CHARS_SHORT} characters over the limit. Enable "Expand entry" or shorten your text.`);
      return;
    }

    dispatch({ type: 'SET_SAVING', payload: true });

    try {
      // Sanitize HTML content before encryption to prevent XSS
      const rawContent = editor.getHTML();
      const content = sanitizeHtml(rawContent);
      const { encryptionKey } = useEncryption.getState();

      const { ciphertext, iv } = await encryptData(content);

      const plainText = editor.getText();
      const searchTokens = await generateSearchTokens(plainText, encryptionKey!);

      // Determine entry type from prop, stored customType, or topic name (case-insensitive, stored lowercase)
      const topicNameLower = state.selectedTopicName?.toLowerCase();
      const entryType = customType?.toLowerCase() || state.storedCustomType || topicNameLower;

      // Build custom fields based on entry type
      const customFields = entryType
        ? await buildCustomFields(entryType, state, today, encryptData)
        : undefined;

      if (entryId) {
        // Update existing entry
        const response = await fetch(`/api/entries/${entryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedContent: ciphertext,
            iv,
            searchTokens,
            topicId: state.selectedTopicId,
            ...(entryType && { customType: entryType }),
            ...(customFields && { customFields }),
          }),
        });

        if (response.ok) {
          // Update cache with new data
          updateInCache(entryId, {
            encryptedContent: ciphertext,
            iv,
            searchTokens,
            topicId: state.selectedTopicId,
            customType: entryType || null,
            custom_fields: customFields?.map((cf, i) => ({
              id: `cf_${entryId}_${i}`,
              entryId,
              encryptedData: cf.encryptedData,
              iv: cf.iv,
            })) || null,
            updatedAt: new Date().toISOString(),
          });
        }

        // Update milestone goal links if editing a milestone
        if (entryType === 'milestone') {
          await fetch(`/api/milestones/${entryId}/goals`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goalIds: state.milestone.goalIds }),
          });
        }

        // Update task milestone links if editing a task
        if (entryType === 'task') {
          await fetch(`/api/tasks/${entryId}/milestones`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ milestoneIds: state.task.milestoneIds }),
          });
        }
      } else {
        // Create new entry
        const response = await fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedContent: ciphertext,
            iv,
            searchTokens,
            ...(state.selectedTopicId && { topicId: state.selectedTopicId }),
            ...(entryType && { customType: entryType }),
            ...(customFields && { customFields }),
            entryDate: today,
          }),
        });

        const data = await response.json();
        const newEntryId = data.entry?.id;

        // Add new entry to cache
        if (data.entry) {
          addToCache({
            ...data.entry,
            custom_fields: customFields?.map((cf, i) => ({
              id: `cf_${newEntryId}_${i}`,
              entryId: newEntryId,
              encryptedData: cf.encryptedData,
              iv: cf.iv,
            })) || null,
          });
        }

        // Link milestone to goals after creation
        if (entryType === 'milestone' && state.milestone.goalIds.length > 0 && newEntryId) {
          await fetch(`/api/milestones/${newEntryId}/goals`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goalIds: state.milestone.goalIds }),
          });
        }

        // Link task to milestones after creation
        if (entryType === 'task' && state.task.milestoneIds.length > 0 && newEntryId) {
          await fetch(`/api/tasks/${newEntryId}/milestones`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ milestoneIds: state.task.milestoneIds }),
          });
        }
      }

      onEntrySaved();

      // Clear editor and deselect entry to show new entry view
      if (onSelectEntry) {
        onSelectEntry(null);
      }
      if (editor) {
        editor.commands.setContent('');
      }
    } catch (error) {
      console.error('Failed to save entry:', error);
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  };

  // Update the ref so keyboard shortcut can call handleSave
  handleSaveRef.current = handleSave;

  const handleDelete = async () => {
    if (!entryId) return;
    dispatch({ type: 'SET_DELETING', payload: true });

    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove from cache
        removeFromCache(entryId);

        dispatch({ type: 'SET_SHOW_DELETE_CONFIRM', payload: false });
        onEntrySaved();
        // Close entry editor and show new entry view
        if (onSelectEntry) {
          onSelectEntry(null);
        }
        if (editor) {
          editor.commands.clearContent();
        }
      } else {
        console.error('Failed to delete entry');
      }
    } catch (error) {
      console.error('Failed to delete entry:', error);
    } finally {
      dispatch({ type: 'SET_DELETING', payload: false });
    }
  };

  const handleToggleFavorite = async () => {
    if (!entryId || state.togglingFavorite) return;
    dispatch({ type: 'SET_TOGGLING_FAVORITE', payload: true });

    try {
      if (state.isFavorite) {
        // Remove from favorites
        const response = await fetch(`/api/favorites?entryId=${entryId}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          removeFavoriteFromCache(entryId);
          dispatch({ type: 'SET_FAVORITE', payload: false });
        }
      } else {
        // Add to favorites
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId }),
        });
        if (response.ok) {
          addFavoriteToCache(entryId);
          dispatch({ type: 'SET_FAVORITE', payload: true });
        }
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    } finally {
      dispatch({ type: 'SET_TOGGLING_FAVORITE', payload: false });
    }
  };

  if (state.loading) {
    return <div className="p-4 text-gray-500">Loading entry...</div>;
  }

  if (!isKeyReady) {
    return <div className="p-4 text-gray-500">Waiting for encryption key...</div>;
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Top toolbar with topic selector and bookmark/share buttons */}
      <div className="mb-4">
        {/* First row: Topic selector + bookmark/share buttons */}
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <TopicSelector
              selectedTopicId={state.selectedTopicId}
              onSelectTopic={(id) => dispatch({ type: 'SET_TOPIC', payload: { id } })}
              onTopicsChange={onTopicsChange}
            />
          </div>
          <div className="flex items-center gap-2 ml-4">
            {/* Expand entry - hidden on mobile, shown on desktop */}
            <label className="hidden md:flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.expandEntry}
                onChange={(e) => dispatch({ type: 'SET_EXPAND_ENTRY', payload: e.target.checked })}
                className="w-4 h-4 rounded border-border text-gray-600"
              />
              <span className="text-sm text-gray-600">
                Expand entry{' '}
                <span className={
                  !state.expandEntry && state.charCount > MAX_CHARS_SHORT
                    ? 'text-red-600 font-medium'
                    : state.charCount > MAX_CHARS_SHORT * 0.8
                      ? 'text-amber-600'
                      : ''
                }>
                  ({state.charCount}{!state.expandEntry && `/${MAX_CHARS_SHORT}`})
                </span>
              </span>
            </label>
            {entryId && (
              <>
              <button
                onClick={handleToggleFavorite}
                disabled={state.togglingFavorite}
                className={`p-2 rounded-md transition-colors ${
                  state.isFavorite
                    ? 'text-gray-600 bg-gray-50 hover:bg-gray-100'
                    : 'text-gray-600 hover:backdrop-blur-sm bg-white/40'
                }`}
                title={state.isFavorite ? 'Remove bookmark' : 'Add bookmark'}
              >
                <svg
                  className="w-5 h-5"
                  fill={state.isFavorite ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_SHOW_SHARE_MODAL', payload: true })}
                className="p-2 text-gray-600 hover:backdrop-blur-sm bg-white/40 rounded-md"
                title="Share entry"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {state.showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content modal-sm modal-confirm">
            <div className="modal-body">
              <h3 className="modal-title mb-2">Delete Entry?</h3>
              <p className="text-gray-600 mb-4">
                This action cannot be undone. The entry will be permanently deleted.
              </p>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => dispatch({ type: 'SET_SHOW_DELETE_CONFIRM', payload: false })}
                disabled={state.deleting}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={state.deleting}
                className="btn btn-danger"
              >
                {state.deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor with character limit - no border */}
      <div className={`mb-2 pb-3 border-b border-border md:border-b-0 md:pb-0 ${state.expandEntry ? 'flex-1 flex flex-col' : ''}`}>
        <div className={`overflow-auto backdrop-blur-sm bg-white/30 flex flex-col ${state.expandEntry ? 'flex-1' : ''}`}>
          <EditorToolbar editor={editor} />
          <EditorContent
            editor={editor}
            className={`border-t border-border md:border-t-0 ${state.expandEntry ? 'flex-1' : 'min-h-[40px]'}`}
          />
        </div>
      </div>

      {/* Expand entry option - shown on mobile only, between editor and custom fields */}
      <div className="md:hidden mb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={state.expandEntry}
            onChange={(e) => dispatch({ type: 'SET_EXPAND_ENTRY', payload: e.target.checked })}
            className="w-4 h-4 rounded border-border text-gray-600"
          />
          <span className="text-sm text-gray-600">
            Expand entry{' '}
            <span className={
              !state.expandEntry && state.charCount > MAX_CHARS_SHORT
                ? 'text-red-600 font-medium'
                : state.charCount > MAX_CHARS_SHORT * 0.8
                  ? 'text-amber-600'
                  : ''
            }>
              ({state.charCount}{!state.expandEntry && `/${MAX_CHARS_SHORT}`})
            </span>
          </span>
        </label>
      </div>

      {/* Goal Settings */}
      <CustomFieldSection
        fieldType="goal"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Goal Settings"
      >
        <GoalFields
          fields={state.goal as GoalFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_GOAL', payload: { [key]: value } })}
          glass
        />
        {state.goal.linkedMilestones.length > 0 && (
          <div className="custom-fields-body mt-4 pt-4 border-t">
            <label className="field-label">
              Linked Milestones ({state.goal.linkedMilestones.length})
            </label>
            <div className="space-y-1">
              {state.goal.linkedMilestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className="text-sm text-gray-700 flex items-center gap-2 py-1"
                >
                  <span className="text-gray-400">-</span>
                  <span>{milestone.content}</span>
                </div>
              ))}
            </div>
            <p className="field-hint">
              Milestones are linked from the Milestones view
            </p>
          </div>
        )}
      </CustomFieldSection>

      {/* Milestone Settings */}
      <CustomFieldSection
        fieldType="milestone"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Milestone Settings"
      >
        <MilestoneFields
          fields={state.milestone as MilestoneFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_MILESTONE', payload: { [key]: value } })}
          goalSelector={
            <MilestoneGoalSelector
              selectedGoalIds={state.milestone.goalIds}
              onGoalIdsChange={(ids) => dispatch({ type: 'UPDATE_MILESTONE', payload: { goalIds: ids } })}
            />
          }
          glass
        />
        {state.milestone.linkedTasks.length > 0 && (
          <div className="custom-fields-body mt-4 pt-4 border-t">
            <label className="field-label">
              Linked Tasks ({state.milestone.linkedTasks.filter(t => t.isCompleted).length}/{state.milestone.linkedTasks.length} completed)
            </label>
            <div className="space-y-1">
              {state.milestone.linkedTasks.map((task) => (
                <div
                  key={task.id}
                  className="text-sm flex items-center gap-2 py-1"
                >
                  <span className={task.isCompleted ? 'text-gray-500' : 'text-gray-400'}>
                    {task.isCompleted ? '✓' : '○'}
                  </span>
                  <span className={task.isCompleted ? 'text-gray-500 line-through' : 'text-gray-700'}>
                    {task.content}
                  </span>
                </div>
              ))}
            </div>
            <p className="field-hint">
              Tasks are linked from the Task editor
            </p>
          </div>
        )}
      </CustomFieldSection>

      {/* Task Settings */}
      <CustomFieldSection
        fieldType="task"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Task Settings"
      >
        <TaskFields
          fields={state.task as TaskFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_TASK', payload: { [key]: value } })}
          glass
        />
        <div className="custom-fields-body mt-4 pt-4 border-t">
          <label className="field-label">Link to Milestones</label>
          <TaskMilestoneSelector
            selectedMilestoneIds={state.task.milestoneIds}
            onMilestoneIdsChange={(ids) => dispatch({ type: 'UPDATE_TASK', payload: { milestoneIds: ids } })}
          />
          <p className="field-hint">
            Link this task to milestones to track progress
          </p>
        </div>
      </CustomFieldSection>

      {/* Medication Details */}
      <CustomFieldSection
        fieldType="medication"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Medication Details"
      >
        <MedicationFields
          fields={state.medication as MedicationFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_MEDICATION', payload: { [key]: value } })}
          glass
        />
      </CustomFieldSection>

      {/* Food Details */}
      <CustomFieldSection
        fieldType="food"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Food Details"
      >
        <FoodFields
          fields={state.food as FoodFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_FOOD', payload: { [key]: value } })}
          glass
        />
      </CustomFieldSection>

      {/* Symptom Details */}
      <CustomFieldSection
        fieldType="symptom"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Symptom Details"
      >
        <SymptomFields
          fields={state.symptom as SymptomFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_SYMPTOM', payload: { [key]: value } })}
          glass
        />
      </CustomFieldSection>

      {/* Exercise Details */}
      <CustomFieldSection
        fieldType="exercise"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Exercise Details"
      >
        <ExerciseFields
          fields={state.exercise as ExerciseFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_EXERCISE', payload: { [key]: value } })}
          glass
        />
      </CustomFieldSection>

      {/* Event Details */}
      <CustomFieldSection
        fieldType="event"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Event Details"
      >
        <EventFields
          fields={state.event as EventFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_EVENT', payload: { [key]: value } })}
          glass
        />
      </CustomFieldSection>

      {/* Meeting Details */}
      <CustomFieldSection
        fieldType="meeting"
        customType={customType}
        selectedTopicName={state.selectedTopicName}
        title="Meeting Details"
      >
        <MeetingFields
          fields={state.meeting as MeetingFieldValues}
          onChange={(key, value) => dispatch({ type: 'UPDATE_MEETING', payload: { [key]: value } })}
          glass
        />
      </CustomFieldSection>

      {/* Bottom action buttons */}
      <div className="entry-editor-actions mt-4 pt-4 border-t border-border pb-16 md:pb-0">
        <div className="flex gap-2">
          {entryId && (
            <button
              onClick={() => dispatch({ type: 'SET_SHOW_DELETE_CONFIRM', payload: true })}
              className="btn btn-danger btn-outline"
            >
              Delete
            </button>
          )}
          {entryId && onSelectEntry && (
            <button
              onClick={() => onSelectEntry(null)}
              className="btn btn-ghost"
            >
              Close
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={state.saving || (!state.expandEntry && state.charCount > MAX_CHARS_SHORT)}
          className="btn btn-primary"
          style={{ backgroundColor: state.saving || (!state.expandEntry && state.charCount > MAX_CHARS_SHORT) ? undefined : accentColor }}
          onMouseOver={(e) => { if (!state.saving && (state.expandEntry || state.charCount <= MAX_CHARS_SHORT)) e.currentTarget.style.backgroundColor = hoverColor; }}
          onMouseOut={(e) => { if (!state.saving && (state.expandEntry || state.charCount <= MAX_CHARS_SHORT)) e.currentTarget.style.backgroundColor = accentColor; }}
          title="Save"
        >
          {state.saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Share modal */}
      {state.showShareModal && entryId && editor && (
        <ShareModal
          entryId={entryId}
          plaintextContent={editor.getHTML()}
          onClose={() => dispatch({ type: 'SET_SHOW_SHARE_MODAL', payload: false })}
        />
      )}
    </div>
  );
}
