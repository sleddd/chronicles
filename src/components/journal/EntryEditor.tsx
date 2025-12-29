'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { generateSearchTokens } from '@/lib/crypto/searchTokens';
import { TopicSelector } from '@/components/topics/TopicSelector';
import { MilestoneGoalSelector } from '@/components/goals/MilestoneEditor';

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
      className={`p-1.5 rounded text-sm font-medium transition-colors ${
        isActive
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-gray-50">
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

      <div className="w-px h-5 bg-gray-300 mx-1" />

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

      <div className="w-px h-5 bg-gray-300 mx-1" />

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

      <div className="w-px h-5 bg-gray-300 mx-1" />

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

      <div className="w-px h-5 bg-gray-300 mx-1" />

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
    </div>
  );
}

interface Props {
  entryId: string | null;
  date: string;
  onEntrySaved: () => void;
  today: string;
  customType?: 'task' | 'goal' | 'milestone' | 'medication' | 'food' | 'symptom' | null;
}

export function EntryEditor({ entryId, date: _date, onEntrySaved, today, customType }: Props) {
  // Note: _date is available for future use (e.g., viewing entries from past dates)
  void _date;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedTopicName, setSelectedTopicName] = useState<string | null>(null);
  const [storedCustomType, setStoredCustomType] = useState<string | null>(null);
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  // Fetch and decrypt topic name when selectedTopicId changes
  useEffect(() => {
    const fetchTopicName = async () => {
      if (!selectedTopicId || !isKeyReady) {
        setSelectedTopicName(null);
        return;
      }
      try {
        const response = await fetch('/api/topics');
        const data = await response.json();
        const topic = data.topics?.find((t: { id: string }) => t.id === selectedTopicId);
        if (topic) {
          const name = await decryptData(topic.encryptedName, topic.iv);
          setSelectedTopicName(name);
        }
      } catch {
        setSelectedTopicName(null);
      }
    };
    fetchTopicName();
  }, [selectedTopicId, isKeyReady, decryptData]);

  // Goal-specific fields
  const [goalType, setGoalType] = useState<'short_term' | 'long_term'>('short_term');
  const [goalStatus, setGoalStatus] = useState<'active' | 'completed' | 'archived'>('active');
  const [targetDate, setTargetDate] = useState<string>('');
  const [linkedMilestones, setLinkedMilestones] = useState<Array<{ id: string; content: string }>>([]);

  // Milestone-specific fields
  const [milestoneGoalIds, setMilestoneGoalIds] = useState<string[]>([]);

  // Task-specific fields
  const [isTaskCompleted, setIsTaskCompleted] = useState(false);
  const [isAutoMigrating, setIsAutoMigrating] = useState(true);

  // Medication-specific fields
  const [medDosage, setMedDosage] = useState('');
  const [medFrequency, setMedFrequency] = useState<'once_daily' | 'twice_daily' | 'three_times_daily' | 'as_needed' | 'custom'>('once_daily');
  const [medScheduleTimes, setMedScheduleTimes] = useState<string[]>(['08:00']);
  const [medIsActive, setMedIsActive] = useState(true);
  const [medNotes, setMedNotes] = useState('');

  // Food-specific fields
  const [foodMealType, setFoodMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [foodConsumedAt, setFoodConsumedAt] = useState('');
  const [foodIngredients, setFoodIngredients] = useState('');
  const [foodNotes, setFoodNotes] = useState('');

  // Symptom-specific fields
  const [symptomSeverity, setSymptomSeverity] = useState(5);
  const [symptomOccurredAt, setSymptomOccurredAt] = useState('');
  const [symptomDuration, setSymptomDuration] = useState('');
  const [symptomNotes, setSymptomNotes] = useState('');

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap min-h-[200px] p-4 text-gray-900 focus:outline-none',
      },
    },
  });

  const loadEntry = useCallback(async () => {
    if (!entryId || !isKeyReady || !editor) return;
    setLoading(true);

    // Reset all custom fields to defaults before loading entry-specific data
    setGoalType('short_term');
    setGoalStatus('active');
    setTargetDate('');
    setLinkedMilestones([]);
    setMilestoneGoalIds([]);
    setIsTaskCompleted(false);
    setIsAutoMigrating(true);
    setStoredCustomType(null);
    // Reset medication fields
    setMedDosage('');
    setMedFrequency('once_daily');
    setMedScheduleTimes(['08:00']);
    setMedIsActive(true);
    setMedNotes('');
    // Reset food fields
    setFoodMealType('breakfast');
    setFoodConsumedAt('');
    setFoodIngredients('');
    setFoodNotes('');
    // Reset symptom fields
    setSymptomSeverity(5);
    setSymptomOccurredAt('');
    setSymptomDuration('');
    setSymptomNotes('');

    try {
      const response = await fetch(`/api/entries/${entryId}`);
      const { entry } = await response.json();

      const content = await decryptData(entry.encryptedContent, entry.iv);
      editor.commands.setContent(content);
      setSelectedTopicId(entry.topicId);
      setStoredCustomType(entry.customType || null);

      // Load goal custom fields
      if (entry.customType === 'goal' && entry.custom_fields) {
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'type') setGoalType(parsed.value);
            if (parsed.fieldKey === 'status') setGoalStatus(parsed.value);
            if (parsed.fieldKey === 'targetDate') setTargetDate(parsed.value || '');
          } catch {
            // Skip failed fields
          }
        }

        // Load linked milestones for goals
        if (entry.milestones && entry.milestones.length > 0) {
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
          setLinkedMilestones(decryptedMilestones);
        }
      }

      // Load milestone goal IDs
      if (entry.customType === 'milestone' && entry.goalIds) {
        setMilestoneGoalIds(entry.goalIds);
      }

      // Load task custom fields
      if (entry.customType === 'task' && entry.custom_fields) {
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'isCompleted') setIsTaskCompleted(parsed.value === true);
            if (parsed.fieldKey === 'isAutoMigrating') setIsAutoMigrating(parsed.value !== false);
          } catch {
            // Skip failed fields
          }
        }
      }

      // Load medication custom fields
      if (entry.customType === 'medication' && entry.custom_fields) {
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'dosage') setMedDosage(parsed.value || '');
            if (parsed.fieldKey === 'frequency') setMedFrequency(parsed.value || 'once_daily');
            if (parsed.fieldKey === 'scheduleTimes') setMedScheduleTimes(parsed.value || ['08:00']);
            if (parsed.fieldKey === 'isActive') setMedIsActive(parsed.value !== false);
            if (parsed.fieldKey === 'notes') setMedNotes(parsed.value || '');
          } catch {
            // Skip failed fields
          }
        }
      }

      // Load food custom fields
      if (entry.customType === 'food' && entry.custom_fields) {
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'mealType') setFoodMealType(parsed.value || 'breakfast');
            if (parsed.fieldKey === 'consumedAt') setFoodConsumedAt(parsed.value || '');
            if (parsed.fieldKey === 'ingredients') setFoodIngredients((parsed.value || []).join(', '));
            if (parsed.fieldKey === 'notes') setFoodNotes(parsed.value || '');
          } catch {
            // Skip failed fields
          }
        }
      }

      // Load symptom custom fields
      if (entry.customType === 'symptom' && entry.custom_fields) {
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'severity') setSymptomSeverity(parsed.value || 5);
            if (parsed.fieldKey === 'occurredAt') setSymptomOccurredAt(parsed.value || '');
            if (parsed.fieldKey === 'duration') setSymptomDuration(parsed.value?.toString() || '');
            if (parsed.fieldKey === 'notes') setSymptomNotes(parsed.value || '');
          } catch {
            // Skip failed fields
          }
        }
      }
    } catch (error) {
      console.error('Failed to load entry:', error);
    } finally {
      setLoading(false);
    }
  }, [entryId, isKeyReady, editor, decryptData]);

  useEffect(() => {
    if (entryId && isKeyReady) {
      loadEntry();
    } else if (!entryId && editor) {
      editor.commands.setContent('');
      setSelectedTopicId(null);
      setStoredCustomType(null);
      // Reset goal/milestone/task fields for new entries
      setGoalType('short_term');
      setGoalStatus('active');
      setTargetDate('');
      setLinkedMilestones([]);
      setMilestoneGoalIds([]);
      setIsTaskCompleted(false);
      setIsAutoMigrating(true);
      // Reset medication fields
      setMedDosage('');
      setMedFrequency('once_daily');
      setMedScheduleTimes(['08:00']);
      setMedIsActive(true);
      setMedNotes('');
      // Reset food fields
      setFoodMealType('breakfast');
      setFoodConsumedAt('');
      setFoodIngredients('');
      setFoodNotes('');
      // Reset symptom fields
      setSymptomSeverity(5);
      setSymptomOccurredAt('');
      setSymptomDuration('');
      setSymptomNotes('');
    }
  }, [entryId, isKeyReady, loadEntry, editor]);

  const handleSave = async () => {
    if (!editor || !isKeyReady) return;
    setSaving(true);

    try {
      const content = editor.getHTML();
      const { encryptionKey } = useEncryption.getState();

      const { ciphertext, iv } = await encryptData(content);

      const plainText = editor.getText();
      const searchTokens = await generateSearchTokens(plainText, encryptionKey!);

      // Determine entry type from prop, stored customType, or topic name (case-insensitive, stored lowercase)
      const topicNameLower = selectedTopicName?.toLowerCase();
      const entryType = customType?.toLowerCase() || storedCustomType || topicNameLower;

      // Build custom fields based on entry type
      let customFields: { encryptedData: string; iv: string }[] | undefined;

      if (entryType === 'task') {
        const isCompletedField = JSON.stringify({ fieldKey: 'isCompleted', value: isTaskCompleted });
        const isAutoMigratingField = JSON.stringify({ fieldKey: 'isAutoMigrating', value: isAutoMigrating });

        const encryptedCompleted = await encryptData(isCompletedField);
        const encryptedAutoMigrating = await encryptData(isAutoMigratingField);

        customFields = [
          { encryptedData: encryptedCompleted.ciphertext, iv: encryptedCompleted.iv },
          { encryptedData: encryptedAutoMigrating.ciphertext, iv: encryptedAutoMigrating.iv },
        ];
      } else if (entryType === 'goal') {
        const typeField = JSON.stringify({ fieldKey: 'type', value: goalType });
        const statusField = JSON.stringify({ fieldKey: 'status', value: goalStatus });
        const targetDateField = JSON.stringify({ fieldKey: 'targetDate', value: targetDate || null });
        const progressField = JSON.stringify({ fieldKey: 'progressPercentage', value: 0 });

        const encryptedType = await encryptData(typeField);
        const encryptedStatus = await encryptData(statusField);
        const encryptedTargetDate = await encryptData(targetDateField);
        const encryptedProgress = await encryptData(progressField);

        customFields = [
          { encryptedData: encryptedType.ciphertext, iv: encryptedType.iv },
          { encryptedData: encryptedStatus.ciphertext, iv: encryptedStatus.iv },
          { encryptedData: encryptedTargetDate.ciphertext, iv: encryptedTargetDate.iv },
          { encryptedData: encryptedProgress.ciphertext, iv: encryptedProgress.iv },
        ];
      } else if (entryType === 'milestone') {
        const orderIndexField = JSON.stringify({ fieldKey: 'orderIndex', value: 0 });
        const isCompletedField = JSON.stringify({ fieldKey: 'isCompleted', value: false });
        const completedAtField = JSON.stringify({ fieldKey: 'completedAt', value: null });

        const encryptedOrderIndex = await encryptData(orderIndexField);
        const encryptedIsCompleted = await encryptData(isCompletedField);
        const encryptedCompletedAt = await encryptData(completedAtField);

        customFields = [
          { encryptedData: encryptedOrderIndex.ciphertext, iv: encryptedOrderIndex.iv },
          { encryptedData: encryptedIsCompleted.ciphertext, iv: encryptedIsCompleted.iv },
          { encryptedData: encryptedCompletedAt.ciphertext, iv: encryptedCompletedAt.iv },
        ];
      } else if (entryType === 'medication') {
        const dosageField = JSON.stringify({ fieldKey: 'dosage', value: medDosage });
        const frequencyField = JSON.stringify({ fieldKey: 'frequency', value: medFrequency });
        const scheduleTimesField = JSON.stringify({ fieldKey: 'scheduleTimes', value: medScheduleTimes });
        const isActiveField = JSON.stringify({ fieldKey: 'isActive', value: medIsActive });
        const notesField = JSON.stringify({ fieldKey: 'notes', value: medNotes });
        const startDateField = JSON.stringify({ fieldKey: 'startDate', value: today });

        const encryptedDosage = await encryptData(dosageField);
        const encryptedFrequency = await encryptData(frequencyField);
        const encryptedScheduleTimes = await encryptData(scheduleTimesField);
        const encryptedIsActive = await encryptData(isActiveField);
        const encryptedNotes = await encryptData(notesField);
        const encryptedStartDate = await encryptData(startDateField);

        customFields = [
          { encryptedData: encryptedDosage.ciphertext, iv: encryptedDosage.iv },
          { encryptedData: encryptedFrequency.ciphertext, iv: encryptedFrequency.iv },
          { encryptedData: encryptedScheduleTimes.ciphertext, iv: encryptedScheduleTimes.iv },
          { encryptedData: encryptedIsActive.ciphertext, iv: encryptedIsActive.iv },
          { encryptedData: encryptedNotes.ciphertext, iv: encryptedNotes.iv },
          { encryptedData: encryptedStartDate.ciphertext, iv: encryptedStartDate.iv },
        ];
      } else if (entryType === 'food') {
        const mealTypeField = JSON.stringify({ fieldKey: 'mealType', value: foodMealType });
        const consumedAtField = JSON.stringify({ fieldKey: 'consumedAt', value: foodConsumedAt || new Date().toISOString() });
        const ingredientsField = JSON.stringify({ fieldKey: 'ingredients', value: foodIngredients.split(',').map(i => i.trim()).filter(i => i) });
        const notesField = JSON.stringify({ fieldKey: 'notes', value: foodNotes });

        const encryptedMealType = await encryptData(mealTypeField);
        const encryptedConsumedAt = await encryptData(consumedAtField);
        const encryptedIngredients = await encryptData(ingredientsField);
        const encryptedNotes = await encryptData(notesField);

        customFields = [
          { encryptedData: encryptedMealType.ciphertext, iv: encryptedMealType.iv },
          { encryptedData: encryptedConsumedAt.ciphertext, iv: encryptedConsumedAt.iv },
          { encryptedData: encryptedIngredients.ciphertext, iv: encryptedIngredients.iv },
          { encryptedData: encryptedNotes.ciphertext, iv: encryptedNotes.iv },
        ];
      } else if (entryType === 'symptom') {
        const severityField = JSON.stringify({ fieldKey: 'severity', value: symptomSeverity });
        const occurredAtField = JSON.stringify({ fieldKey: 'occurredAt', value: symptomOccurredAt || new Date().toISOString() });
        const durationField = JSON.stringify({ fieldKey: 'duration', value: symptomDuration ? parseInt(symptomDuration) : null });
        const notesField = JSON.stringify({ fieldKey: 'notes', value: symptomNotes });

        const encryptedSeverity = await encryptData(severityField);
        const encryptedOccurredAt = await encryptData(occurredAtField);
        const encryptedDuration = await encryptData(durationField);
        const encryptedNotes = await encryptData(notesField);

        customFields = [
          { encryptedData: encryptedSeverity.ciphertext, iv: encryptedSeverity.iv },
          { encryptedData: encryptedOccurredAt.ciphertext, iv: encryptedOccurredAt.iv },
          { encryptedData: encryptedDuration.ciphertext, iv: encryptedDuration.iv },
          { encryptedData: encryptedNotes.ciphertext, iv: encryptedNotes.iv },
        ];
      }

      if (entryId) {
        // Update existing entry
        await fetch(`/api/entries/${entryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedContent: ciphertext,
            iv,
            searchTokens,
            topicId: selectedTopicId,
            ...(entryType && { customType: entryType }),
            ...(customFields && { customFields }),
          }),
        });

        // Update milestone goal links if editing a milestone
        if (entryType === 'milestone') {
          await fetch(`/api/milestones/${entryId}/goals`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goalIds: milestoneGoalIds }),
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
            ...(selectedTopicId && { topicId: selectedTopicId }),
            ...(entryType && { customType: entryType }),
            ...(customFields && { customFields }),
            entryDate: today,
          }),
        });

        // Link milestone to goals after creation
        if (entryType === 'milestone' && milestoneGoalIds.length > 0) {
          const data = await response.json();
          const newEntryId = data.entry?.id;
          if (newEntryId) {
            await fetch(`/api/milestones/${newEntryId}/goals`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ goalIds: milestoneGoalIds }),
            });
          }
        }
      }

      onEntrySaved();
    } catch (error) {
      console.error('Failed to save entry:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entryId) return;
    setDeleting(true);

    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShowDeleteConfirm(false);
        onEntrySaved();
      } else {
        console.error('Failed to delete entry');
      }
    } catch (error) {
      console.error('Failed to delete entry:', error);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading entry...</div>;
  }

  if (!isKeyReady) {
    return <div className="p-4 text-gray-500">Waiting for encryption key...</div>;
  }

  return (
    <div className="p-4 h-full flex flex-col bg-white">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">
          {entryId ? 'Edit Entry' : 'New Entry'}
        </h2>
        <div className="flex items-center gap-2">
          {entryId && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md border border-red-200"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Entry?</h3>
            <p className="text-gray-600 mb-4">
              This action cannot be undone. The entry will be permanently deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <TopicSelector
          selectedTopicId={selectedTopicId}
          onSelectTopic={setSelectedTopicId}
        />
      </div>

      {/* Goal-specific fields */}
      {(customType === 'goal' || storedCustomType === 'goal' || selectedTopicName?.toLowerCase() === 'goal') && (
        <div className="mb-4 p-4 border rounded-md bg-gray-50">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Goal Settings</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={goalType}
                onChange={(e) => setGoalType(e.target.value as 'short_term' | 'long_term')}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              >
                <option value="short_term">Short-term</option>
                <option value="long_term">Long-term</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={goalStatus}
                onChange={(e) => setGoalStatus(e.target.value as 'active' | 'completed' | 'archived')}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Target Date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              />
            </div>
          </div>

          {/* Linked Milestones */}
          {linkedMilestones.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <label className="block text-xs text-gray-500 mb-2">
                Linked Milestones ({linkedMilestones.length})
              </label>
              <div className="space-y-1">
                {linkedMilestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className="text-sm text-gray-700 flex items-center gap-2 py-1"
                  >
                    <span className="text-gray-400">-</span>
                    <span>{milestone.content}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Milestones are linked from the Milestones view
              </p>
            </div>
          )}
        </div>
      )}

      {/* Milestone-specific fields */}
      {(customType === 'milestone' || storedCustomType === 'milestone' || selectedTopicName?.toLowerCase() === 'milestone') && (
        <div className="mb-4 p-4 border rounded-md bg-gray-50">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Link to Goals</h3>
          <MilestoneGoalSelector
            selectedGoalIds={milestoneGoalIds}
            onGoalIdsChange={setMilestoneGoalIds}
          />
        </div>
      )}

      {/* Task-specific fields - shown when topic is "task" or entry has task customType */}
      {(selectedTopicName?.toLowerCase() === 'task' || storedCustomType === 'task') && (
        <div className="mb-4 p-4 border rounded-md bg-amber-50 border-amber-200">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Task Settings</h3>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isTaskCompleted}
                onChange={(e) => setIsTaskCompleted(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Completed</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAutoMigrating}
                onChange={(e) => setIsAutoMigrating(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Auto-migrate if incomplete</span>
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Auto-migrating tasks move to the current date at midnight if not completed.
          </p>
        </div>
      )}

      {/* Medication-specific fields */}
      {(customType === 'medication' || storedCustomType === 'medication' || selectedTopicName?.toLowerCase() === 'medication') && (
        <div className="mb-4 p-4 border rounded-md bg-blue-50 border-blue-200">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Medication Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dosage</label>
              <input
                type="text"
                value={medDosage}
                onChange={(e) => setMedDosage(e.target.value)}
                placeholder="e.g., 500mg"
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Frequency</label>
              <select
                value={medFrequency}
                onChange={(e) => setMedFrequency(e.target.value as typeof medFrequency)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              >
                <option value="once_daily">Once daily</option>
                <option value="twice_daily">Twice daily</option>
                <option value="three_times_daily">Three times daily</option>
                <option value="as_needed">As needed</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">Schedule Times</label>
            <div className="flex flex-wrap gap-2">
              {medScheduleTimes.map((time, index) => (
                <div key={index} className="flex items-center gap-1">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      const newTimes = [...medScheduleTimes];
                      newTimes[index] = e.target.value;
                      setMedScheduleTimes(newTimes);
                    }}
                    className="px-2 py-1 border rounded text-sm bg-white text-gray-900"
                  />
                  {medScheduleTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMedScheduleTimes(medScheduleTimes.filter((_, i) => i !== index))}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setMedScheduleTimes([...medScheduleTimes, '12:00'])}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                + Add time
              </button>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              type="text"
              value={medNotes}
              onChange={(e) => setMedNotes(e.target.value)}
              placeholder="e.g., Take with food"
              className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
            />
          </div>
          <div className="mt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={medIsActive}
                onChange={(e) => setMedIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Active medication</span>
            </label>
          </div>
        </div>
      )}

      {/* Food-specific fields */}
      {(customType === 'food' || storedCustomType === 'food' || selectedTopicName?.toLowerCase() === 'food') && (
        <div className="mb-4 p-4 border rounded-md bg-green-50 border-green-200">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Food Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Meal Type</label>
              <select
                value={foodMealType}
                onChange={(e) => setFoodMealType(e.target.value as typeof foodMealType)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Time Consumed</label>
              <input
                type="time"
                value={foodConsumedAt ? foodConsumedAt.split('T')[1]?.substring(0, 5) : ''}
                onChange={(e) => setFoodConsumedAt(`${today}T${e.target.value}:00`)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">Ingredients (comma-separated)</label>
            <input
              type="text"
              value={foodIngredients}
              onChange={(e) => setFoodIngredients(e.target.value)}
              placeholder="e.g., oats, blueberries, honey"
              className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">Used for correlation analysis with symptoms</p>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              type="text"
              value={foodNotes}
              onChange={(e) => setFoodNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
            />
          </div>
        </div>
      )}

      {/* Symptom-specific fields */}
      {(customType === 'symptom' || storedCustomType === 'symptom' || selectedTopicName?.toLowerCase() === 'symptom') && (
        <div className="mb-4 p-4 border rounded-md bg-red-50 border-red-200">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Symptom Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Severity: {symptomSeverity}/10</label>
              <input
                type="range"
                min="1"
                max="10"
                value={symptomSeverity}
                onChange={(e) => setSymptomSeverity(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>Mild</span>
                <span>Moderate</span>
                <span>Severe</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Time Occurred</label>
              <input
                type="time"
                value={symptomOccurredAt ? symptomOccurredAt.split('T')[1]?.substring(0, 5) : ''}
                onChange={(e) => setSymptomOccurredAt(`${today}T${e.target.value}:00`)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Duration (minutes)</label>
              <input
                type="number"
                value={symptomDuration}
                onChange={(e) => setSymptomDuration(e.target.value)}
                placeholder="e.g., 30"
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input
                type="text"
                value={symptomNotes}
                onChange={(e) => setSymptomNotes(e.target.value)}
                placeholder="Any additional details..."
                className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
              />
            </div>
          </div>
        </div>
      )}

      <div className="border rounded-md flex-1 overflow-auto bg-white flex flex-col">
        <EditorToolbar editor={editor} />
        <EditorContent editor={editor} className="flex-1" />
      </div>
    </div>
  );
}
