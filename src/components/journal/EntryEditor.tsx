'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { generateSearchTokens } from '@/lib/crypto/searchTokens';
import { sanitizeHtml } from '@/lib/sanitize';
import { TopicSelector } from '@/components/topics/TopicSelector';
import { MilestoneGoalSelector } from '@/components/goals/MilestoneEditor';
import { TaskMilestoneSelector } from '@/components/tasks/TaskMilestoneSelector';
import { ShareModal } from '@/components/sharing/ShareModal';
// Images disabled for now
// import { ImageUpload } from '@/components/images/ImageUpload';

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
          ? 'bg-teal-100 text-teal-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor, onImageClick }: { editor: Editor | null; onImageClick?: () => void }) {
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

      {onImageClick && (
        <>
          <div className="w-px h-5 bg-gray-300 mx-1" />
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
}


export function EntryEditor({ entryId, date: _date, onEntrySaved, onSelectEntry, today, customType }: Props) {
  // Note: _date is available for future use (e.g., viewing entries from past dates)
  void _date;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedTopicName, setSelectedTopicName] = useState<string | null>(null);
  const [storedCustomType, setStoredCustomType] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [expandEntry, setExpandEntry] = useState(false);
  const [charCount, setCharCount] = useState(0);
  // Images disabled for now
  // const [showImageUpload, setShowImageUpload] = useState(false);
  // const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  const MAX_CHARS_SHORT = 200;

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
  const [linkedTasks, setLinkedTasks] = useState<Array<{ id: string; content: string; isCompleted: boolean }>>([]);

  // Task-specific fields
  const [isTaskCompleted, setIsTaskCompleted] = useState(false);
  const [isAutoMigrating, setIsAutoMigrating] = useState(true);
  const [taskMilestoneIds, setTaskMilestoneIds] = useState<string[]>([]);

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

  // Event-specific fields
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventEndTime, setEventEndTime] = useState('10:00');
  const [eventLocation, setEventLocation] = useState('');
  const [eventAddress, setEventAddress] = useState('');
  const [eventPhone, setEventPhone] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  // Meeting-specific fields (includes all event fields plus these)
  const [meetingStartDate, setMeetingStartDate] = useState('');
  const [meetingStartTime, setMeetingStartTime] = useState('09:00');
  const [meetingEndDate, setMeetingEndDate] = useState('');
  const [meetingEndTime, setMeetingEndTime] = useState('10:00');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingAddress, setMeetingAddress] = useState('');
  const [meetingPhone, setMeetingPhone] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingTopic, setMeetingTopic] = useState('');
  const [meetingAttendees, setMeetingAttendees] = useState('');

  // Exercise-specific fields
  const [exerciseType, setExerciseType] = useState<'yoga' | 'cardio' | 'strength' | 'swimming' | 'running' | 'cycling' | 'walking' | 'hiking' | 'other'>('cardio');
  const [exerciseOtherType, setExerciseOtherType] = useState('');
  const [exerciseDuration, setExerciseDuration] = useState('');
  const [exerciseIntensity, setExerciseIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [exerciseDistance, setExerciseDistance] = useState('');
  const [exerciseDistanceUnit, setExerciseDistanceUnit] = useState<'miles' | 'km'>('miles');
  const [exerciseCalories, setExerciseCalories] = useState('');
  const [exercisePerformedAt, setExercisePerformedAt] = useState('');
  const [exerciseNotes, setExerciseNotes] = useState('');

  // Ref to track save function for keyboard shortcut
  const handleSaveRef = useRef<(() => void) | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap min-h-[80px] p-4 text-gray-900 focus:outline-none',
      },
      handleKeyDown: (_view, event) => {
        // Enter saves the entry, Shift+Enter creates new line
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (handleSaveRef.current) {
            handleSaveRef.current();
          }
          return true;
        }
        // Shift+Enter creates a new line (default behavior with StarterKit's HardBreak)
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      setCharCount(text.length);
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
    setLinkedTasks([]);
    setIsTaskCompleted(false);
    setIsAutoMigrating(true);
    setTaskMilestoneIds([]);
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
    // Reset event fields
    setEventStartDate('');
    setEventStartTime('09:00');
    setEventEndDate('');
    setEventEndTime('10:00');
    setEventLocation('');
    setEventAddress('');
    setEventPhone('');
    setEventNotes('');
    // Reset meeting fields
    setMeetingStartDate('');
    setMeetingStartTime('09:00');
    setMeetingEndDate('');
    setMeetingEndTime('10:00');
    setMeetingLocation('');
    setMeetingAddress('');
    setMeetingPhone('');
    setMeetingNotes('');
    setMeetingTopic('');
    setMeetingAttendees('');
    // Reset exercise fields
    setExerciseType('cardio');
    setExerciseOtherType('');
    setExerciseDuration('');
    setExerciseIntensity('medium');
    setExerciseDistance('');
    setExerciseDistanceUnit('miles');
    setExerciseCalories('');
    setExercisePerformedAt('');
    setExerciseNotes('');

    try {
      const response = await fetch(`/api/entries/${entryId}`);
      const { entry } = await response.json();

      const content = await decryptData(entry.encryptedContent, entry.iv);
      editor.commands.setContent(content);
      setSelectedTopicId(entry.topicId);
      setStoredCustomType(entry.customType || null);

      // Check content length and auto-expand if over limit
      const plainText = content.replace(/<[^>]*>/g, '');
      setCharCount(plainText.length);
      setExpandEntry(plainText.length > MAX_CHARS_SHORT);

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

      // Load milestone goal IDs and linked tasks
      if (entry.customType === 'milestone') {
        if (entry.goalIds) {
          setMilestoneGoalIds(entry.goalIds);
        }

        // Load linked tasks for milestones
        if (entry.tasks && entry.tasks.length > 0) {
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
          setLinkedTasks(decryptedTasks);
        }
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

        // Load task milestone links
        try {
          const milestonesResponse = await fetch(`/api/tasks/${entryId}/milestones`);
          const milestonesData = await milestonesResponse.json();
          if (milestonesData.milestoneIds) {
            setTaskMilestoneIds(milestonesData.milestoneIds);
          }
        } catch {
          // Ignore if milestone fetch fails
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

      // Load event custom fields
      if (entry.customType === 'event' && entry.custom_fields) {
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'startDate') setEventStartDate(parsed.value || '');
            if (parsed.fieldKey === 'startTime') setEventStartTime(parsed.value || '09:00');
            if (parsed.fieldKey === 'endDate') setEventEndDate(parsed.value || '');
            if (parsed.fieldKey === 'endTime') setEventEndTime(parsed.value || '10:00');
            if (parsed.fieldKey === 'location') setEventLocation(parsed.value || '');
            if (parsed.fieldKey === 'address') setEventAddress(parsed.value || '');
            if (parsed.fieldKey === 'phone') setEventPhone(parsed.value || '');
            if (parsed.fieldKey === 'notes') setEventNotes(parsed.value || '');
          } catch {
            // Skip failed fields
          }
        }
      }

      // Load meeting custom fields
      if (entry.customType === 'meeting' && entry.custom_fields) {
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'startDate') setMeetingStartDate(parsed.value || '');
            if (parsed.fieldKey === 'startTime') setMeetingStartTime(parsed.value || '09:00');
            if (parsed.fieldKey === 'endDate') setMeetingEndDate(parsed.value || '');
            if (parsed.fieldKey === 'endTime') setMeetingEndTime(parsed.value || '10:00');
            if (parsed.fieldKey === 'location') setMeetingLocation(parsed.value || '');
            if (parsed.fieldKey === 'address') setMeetingAddress(parsed.value || '');
            if (parsed.fieldKey === 'phone') setMeetingPhone(parsed.value || '');
            if (parsed.fieldKey === 'notes') setMeetingNotes(parsed.value || '');
            if (parsed.fieldKey === 'topic') setMeetingTopic(parsed.value || '');
            if (parsed.fieldKey === 'attendees') setMeetingAttendees(parsed.value || '');
          } catch {
            // Skip failed fields
          }
        }
      }

      // Load exercise custom fields
      if (entry.customType === 'exercise' && entry.custom_fields) {
        for (const cf of entry.custom_fields) {
          try {
            const fieldData = await decryptData(cf.encryptedData, cf.iv);
            const parsed = JSON.parse(fieldData);
            if (parsed.fieldKey === 'exerciseType') {
              const validTypes = ['yoga', 'cardio', 'strength', 'swimming', 'running', 'cycling', 'walking', 'hiking', 'other'];
              if (validTypes.includes(parsed.value)) {
                setExerciseType(parsed.value);
              } else {
                setExerciseType('other');
                setExerciseOtherType(parsed.value || '');
              }
            }
            if (parsed.fieldKey === 'duration') setExerciseDuration(parsed.value?.toString() || '');
            if (parsed.fieldKey === 'intensity') setExerciseIntensity(parsed.value || 'medium');
            if (parsed.fieldKey === 'distance') setExerciseDistance(parsed.value?.toString() || '');
            if (parsed.fieldKey === 'distanceUnit') setExerciseDistanceUnit(parsed.value || 'miles');
            if (parsed.fieldKey === 'calories') setExerciseCalories(parsed.value?.toString() || '');
            if (parsed.fieldKey === 'performedAt') setExercisePerformedAt(parsed.value || '');
            if (parsed.fieldKey === 'notes') setExerciseNotes(parsed.value || '');
          } catch {
            // Skip failed fields
          }
        }
      }

      // Check if entry is favorited
      try {
        const favResponse = await fetch('/api/favorites');
        const favData = await favResponse.json();
        const isFav = (favData.favorites || []).some((f: { id: string }) => f.id === entryId);
        setIsFavorite(isFav);
      } catch {
        setIsFavorite(false);
      }

      // Images disabled for now
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
      setIsFavorite(false);
      setExpandEntry(false);
      setCharCount(0);
      // setUploadedImages([]);
      // Reset goal/milestone/task fields for new entries
      setGoalType('short_term');
      setGoalStatus('active');
      setTargetDate('');
      setLinkedMilestones([]);
      setMilestoneGoalIds([]);
      setLinkedTasks([]);
      setIsTaskCompleted(false);
      setIsAutoMigrating(true);
      setTaskMilestoneIds([]);
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
      // Reset event fields
      setEventStartDate('');
      setEventStartTime('09:00');
      setEventEndDate('');
      setEventEndTime('10:00');
      setEventLocation('');
      setEventAddress('');
      setEventPhone('');
      setEventNotes('');
      // Reset meeting fields
      setMeetingStartDate('');
      setMeetingStartTime('09:00');
      setMeetingEndDate('');
      setMeetingEndTime('10:00');
      setMeetingLocation('');
      setMeetingAddress('');
      setMeetingPhone('');
      setMeetingNotes('');
      setMeetingTopic('');
      setMeetingAttendees('');
      // Reset exercise fields
      setExerciseType('cardio');
      setExerciseOtherType('');
      setExerciseDuration('');
      setExerciseIntensity('medium');
      setExerciseDistance('');
      setExerciseDistanceUnit('miles');
      setExerciseCalories('');
      setExercisePerformedAt('');
      setExerciseNotes('');
    }
  }, [entryId, isKeyReady, loadEntry, editor]);

  const handleSave = async () => {
    if (!editor || !isKeyReady) return;

    // Check character limit if not expanded
    if (!expandEntry && charCount > MAX_CHARS_SHORT) {
      alert(`Entry is ${charCount - MAX_CHARS_SHORT} characters over the limit. Enable "Expand entry" or shorten your text.`);
      return;
    }

    setSaving(true);

    try {
      // Sanitize HTML content before encryption to prevent XSS
      const rawContent = editor.getHTML();
      const content = sanitizeHtml(rawContent);
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
      } else if (entryType === 'event') {
        const startDateField = JSON.stringify({ fieldKey: 'startDate', value: eventStartDate || today });
        const startTimeField = JSON.stringify({ fieldKey: 'startTime', value: eventStartTime });
        const endDateField = JSON.stringify({ fieldKey: 'endDate', value: eventEndDate || eventStartDate || today });
        const endTimeField = JSON.stringify({ fieldKey: 'endTime', value: eventEndTime });
        const locationField = JSON.stringify({ fieldKey: 'location', value: eventLocation });
        const addressField = JSON.stringify({ fieldKey: 'address', value: eventAddress });
        const phoneField = JSON.stringify({ fieldKey: 'phone', value: eventPhone });
        const notesField = JSON.stringify({ fieldKey: 'notes', value: eventNotes });

        const encryptedStartDate = await encryptData(startDateField);
        const encryptedStartTime = await encryptData(startTimeField);
        const encryptedEndDate = await encryptData(endDateField);
        const encryptedEndTime = await encryptData(endTimeField);
        const encryptedLocation = await encryptData(locationField);
        const encryptedAddress = await encryptData(addressField);
        const encryptedPhone = await encryptData(phoneField);
        const encryptedNotes = await encryptData(notesField);

        customFields = [
          { encryptedData: encryptedStartDate.ciphertext, iv: encryptedStartDate.iv },
          { encryptedData: encryptedStartTime.ciphertext, iv: encryptedStartTime.iv },
          { encryptedData: encryptedEndDate.ciphertext, iv: encryptedEndDate.iv },
          { encryptedData: encryptedEndTime.ciphertext, iv: encryptedEndTime.iv },
          { encryptedData: encryptedLocation.ciphertext, iv: encryptedLocation.iv },
          { encryptedData: encryptedAddress.ciphertext, iv: encryptedAddress.iv },
          { encryptedData: encryptedPhone.ciphertext, iv: encryptedPhone.iv },
          { encryptedData: encryptedNotes.ciphertext, iv: encryptedNotes.iv },
        ];
      } else if (entryType === 'meeting') {
        const startDateField = JSON.stringify({ fieldKey: 'startDate', value: meetingStartDate || today });
        const startTimeField = JSON.stringify({ fieldKey: 'startTime', value: meetingStartTime });
        const endDateField = JSON.stringify({ fieldKey: 'endDate', value: meetingEndDate || meetingStartDate || today });
        const endTimeField = JSON.stringify({ fieldKey: 'endTime', value: meetingEndTime });
        const locationField = JSON.stringify({ fieldKey: 'location', value: meetingLocation });
        const addressField = JSON.stringify({ fieldKey: 'address', value: meetingAddress });
        const phoneField = JSON.stringify({ fieldKey: 'phone', value: meetingPhone });
        const notesField = JSON.stringify({ fieldKey: 'notes', value: meetingNotes });
        const topicField = JSON.stringify({ fieldKey: 'topic', value: meetingTopic });
        const attendeesField = JSON.stringify({ fieldKey: 'attendees', value: meetingAttendees });

        const encryptedStartDate = await encryptData(startDateField);
        const encryptedStartTime = await encryptData(startTimeField);
        const encryptedEndDate = await encryptData(endDateField);
        const encryptedEndTime = await encryptData(endTimeField);
        const encryptedLocation = await encryptData(locationField);
        const encryptedAddress = await encryptData(addressField);
        const encryptedPhone = await encryptData(phoneField);
        const encryptedNotes = await encryptData(notesField);
        const encryptedTopic = await encryptData(topicField);
        const encryptedAttendees = await encryptData(attendeesField);

        customFields = [
          { encryptedData: encryptedStartDate.ciphertext, iv: encryptedStartDate.iv },
          { encryptedData: encryptedStartTime.ciphertext, iv: encryptedStartTime.iv },
          { encryptedData: encryptedEndDate.ciphertext, iv: encryptedEndDate.iv },
          { encryptedData: encryptedEndTime.ciphertext, iv: encryptedEndTime.iv },
          { encryptedData: encryptedLocation.ciphertext, iv: encryptedLocation.iv },
          { encryptedData: encryptedAddress.ciphertext, iv: encryptedAddress.iv },
          { encryptedData: encryptedPhone.ciphertext, iv: encryptedPhone.iv },
          { encryptedData: encryptedNotes.ciphertext, iv: encryptedNotes.iv },
          { encryptedData: encryptedTopic.ciphertext, iv: encryptedTopic.iv },
          { encryptedData: encryptedAttendees.ciphertext, iv: encryptedAttendees.iv },
        ];
      } else if (entryType === 'exercise') {
        const exerciseTypeValue = exerciseType === 'other' ? exerciseOtherType : exerciseType;
        const typeField = JSON.stringify({ fieldKey: 'exerciseType', value: exerciseTypeValue });
        const durationField = JSON.stringify({ fieldKey: 'duration', value: exerciseDuration ? parseInt(exerciseDuration) : null });
        const intensityField = JSON.stringify({ fieldKey: 'intensity', value: exerciseIntensity });
        const distanceField = JSON.stringify({ fieldKey: 'distance', value: exerciseDistance ? parseFloat(exerciseDistance) : null });
        const distanceUnitField = JSON.stringify({ fieldKey: 'distanceUnit', value: exerciseDistanceUnit });
        const caloriesField = JSON.stringify({ fieldKey: 'calories', value: exerciseCalories ? parseInt(exerciseCalories) : null });
        const performedAtField = JSON.stringify({ fieldKey: 'performedAt', value: exercisePerformedAt || new Date().toISOString() });
        const notesField = JSON.stringify({ fieldKey: 'notes', value: exerciseNotes });

        const encryptedType = await encryptData(typeField);
        const encryptedDuration = await encryptData(durationField);
        const encryptedIntensity = await encryptData(intensityField);
        const encryptedDistance = await encryptData(distanceField);
        const encryptedDistanceUnit = await encryptData(distanceUnitField);
        const encryptedCalories = await encryptData(caloriesField);
        const encryptedPerformedAt = await encryptData(performedAtField);
        const encryptedNotes = await encryptData(notesField);

        customFields = [
          { encryptedData: encryptedType.ciphertext, iv: encryptedType.iv },
          { encryptedData: encryptedDuration.ciphertext, iv: encryptedDuration.iv },
          { encryptedData: encryptedIntensity.ciphertext, iv: encryptedIntensity.iv },
          { encryptedData: encryptedDistance.ciphertext, iv: encryptedDistance.iv },
          { encryptedData: encryptedDistanceUnit.ciphertext, iv: encryptedDistanceUnit.iv },
          { encryptedData: encryptedCalories.ciphertext, iv: encryptedCalories.iv },
          { encryptedData: encryptedPerformedAt.ciphertext, iv: encryptedPerformedAt.iv },
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

        // Update task milestone links if editing a task
        if (entryType === 'task') {
          await fetch(`/api/tasks/${entryId}/milestones`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ milestoneIds: taskMilestoneIds }),
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

        const data = await response.json();
        const newEntryId = data.entry?.id;

        // Link milestone to goals after creation
        if (entryType === 'milestone' && milestoneGoalIds.length > 0 && newEntryId) {
          await fetch(`/api/milestones/${newEntryId}/goals`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goalIds: milestoneGoalIds }),
          });
        }

        // Link task to milestones after creation
        if (entryType === 'task' && taskMilestoneIds.length > 0 && newEntryId) {
          await fetch(`/api/tasks/${newEntryId}/milestones`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ milestoneIds: taskMilestoneIds }),
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
      setSaving(false);
    }
  };

  // Update the ref so keyboard shortcut can call handleSave
  handleSaveRef.current = handleSave;

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

  const handleToggleFavorite = async () => {
    if (!entryId || togglingFavorite) return;
    setTogglingFavorite(true);

    try {
      if (isFavorite) {
        // Remove from favorites
        const response = await fetch(`/api/favorites?entryId=${entryId}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setIsFavorite(false);
        }
      } else {
        // Add to favorites
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId }),
        });
        if (response.ok) {
          setIsFavorite(true);
        }
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    } finally {
      setTogglingFavorite(false);
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
      {/* Top toolbar with topic selector and bookmark/share buttons */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex-1">
          <TopicSelector
            selectedTopicId={selectedTopicId}
            onSelectTopic={setSelectedTopicId}
          />
        </div>
        {entryId && (
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleToggleFavorite}
              disabled={togglingFavorite}
              className={`p-2 rounded-md transition-colors ${
                isFavorite
                  ? 'text-teal-600 bg-teal-50 hover:bg-teal-100'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={isFavorite ? 'Remove bookmark' : 'Add bookmark'}
            >
              <svg
                className="w-5 h-5"
                fill={isFavorite ? 'currentColor' : 'none'}
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
              onClick={() => setShowShareModal(true)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-md"
              title="Share entry"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          </div>
        )}
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

      {/* Editor with character limit - no border */}
      <div className={`mb-4 ${expandEntry ? 'flex-1 flex flex-col' : ''}`}>
        <div className={`overflow-auto bg-white flex flex-col ${expandEntry ? 'flex-1' : ''}`}>
          <EditorToolbar editor={editor} />
          <EditorContent
            editor={editor}
            className={expandEntry ? 'flex-1' : 'max-h-[120px] overflow-auto'}
          />
        </div>

        {/* Character count and expand option */}
        <div className="px-4 py-2 pt-4 flex items-center justify-between border-t">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={expandEntry}
              onChange={(e) => setExpandEntry(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-600">Expand entry</span>
          </label>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${
              !expandEntry && charCount > MAX_CHARS_SHORT
                ? 'text-red-600 font-medium'
                : charCount > MAX_CHARS_SHORT * 0.8
                  ? 'text-amber-600'
                  : 'text-gray-500'
            }`}>
              {charCount}{!expandEntry && `/${MAX_CHARS_SHORT}`}
            </span>
            {!expandEntry && charCount > MAX_CHARS_SHORT && (
              <span className="text-xs text-red-500">
                Over limit - enable expand or shorten
              </span>
            )}
          </div>
        </div>

        {!expandEntry && (
          <p className="text-xs text-gray-400 px-4 pb-2">
            Keep entries brief. Check &quot;Expand entry&quot; for longer notes. Press Shift+Enter for new line.
          </p>
        )}
      </div>

      {/* Goal Settings - only show if current topic is goal */}
      {(customType === 'goal' || selectedTopicName?.toLowerCase() === 'goal') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Goal Settings</h3>
            <div className="px-4">
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
          </div>
        </>
      )}

      {/* Milestone Settings - only show if current topic is milestone */}
      {(customType === 'milestone' || selectedTopicName?.toLowerCase() === 'milestone') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Milestone Settings</h3>
            <div className="px-4">
              <MilestoneGoalSelector
                selectedGoalIds={milestoneGoalIds}
                onGoalIdsChange={setMilestoneGoalIds}
              />
              {linkedTasks.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <label className="block text-xs text-gray-500 mb-2">
                    Linked Tasks ({linkedTasks.filter(t => t.isCompleted).length}/{linkedTasks.length} completed)
                  </label>
                  <div className="space-y-1">
                    {linkedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="text-sm flex items-center gap-2 py-1"
                      >
                        <span className={task.isCompleted ? 'text-teal-500' : 'text-gray-400'}>
                          {task.isCompleted ? '✓' : '○'}
                        </span>
                        <span className={task.isCompleted ? 'text-gray-500 line-through' : 'text-gray-700'}>
                          {task.content}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Tasks are linked from the Task editor
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Task Settings - only show if current topic is task */}
      {(customType === 'task' || selectedTopicName?.toLowerCase() === 'task') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Task Settings</h3>
            <div className="px-4">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTaskCompleted}
                    onChange={(e) => setIsTaskCompleted(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Completed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAutoMigrating}
                    onChange={(e) => setIsAutoMigrating(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Auto-migrate if incomplete</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Auto-migrating tasks move to the current date at midnight if not completed.
              </p>
              <div className="mt-4 pt-4 border-t">
                <label className="block text-xs text-gray-500 mb-2">
                  Link to Milestones
                </label>
                <TaskMilestoneSelector
                  selectedMilestoneIds={taskMilestoneIds}
                  onMilestoneIdsChange={setTaskMilestoneIds}
                />
                <p className="text-xs text-gray-400 mt-2">
                  Link this task to milestones to track progress
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Medication Details - only show if current topic is medication */}
      {(customType === 'medication' || selectedTopicName?.toLowerCase() === 'medication') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Medication Details</h3>
            <div className="px-4">
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
                    className="text-xs hover:underline"
                    style={{ color: '#1aaeae' }}
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
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Active medication</span>
                </label>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Food Details - only show if current topic is food */}
      {(customType === 'food' || selectedTopicName?.toLowerCase() === 'food') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Food Details</h3>
            <div className="px-4">
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
          </div>
        </>
      )}

      {/* Symptom Details - only show if current topic is symptom */}
      {(customType === 'symptom' || selectedTopicName?.toLowerCase() === 'symptom') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Symptom Details</h3>
            <div className="px-4">
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
          </div>
        </>
      )}

      {/* Exercise Details - only show if current topic is exercise */}
      {(customType === 'exercise' || selectedTopicName?.toLowerCase() === 'exercise') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Exercise Details</h3>
            <div className="px-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Exercise Type</label>
                  <select
                    value={exerciseType}
                    onChange={(e) => setExerciseType(e.target.value as typeof exerciseType)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  >
                    <option value="yoga">Yoga</option>
                    <option value="cardio">Cardio</option>
                    <option value="strength">Strength Training</option>
                    <option value="swimming">Swimming</option>
                    <option value="running">Running</option>
                    <option value="cycling">Cycling</option>
                    <option value="walking">Walking</option>
                    <option value="hiking">Hiking</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {exerciseType === 'other' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Specify Type</label>
                    <input
                      type="text"
                      value={exerciseOtherType}
                      onChange={(e) => setExerciseOtherType(e.target.value)}
                      placeholder="e.g., Pilates, HIIT"
                      className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                    />
                  </div>
                )}
                {exerciseType !== 'other' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Time Performed</label>
                    <input
                      type="time"
                      value={exercisePerformedAt ? exercisePerformedAt.split('T')[1]?.substring(0, 5) : ''}
                      onChange={(e) => setExercisePerformedAt(`${today}T${e.target.value}:00`)}
                      className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                    />
                  </div>
                )}
              </div>
              {exerciseType === 'other' && (
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Time Performed</label>
                  <input
                    type="time"
                    value={exercisePerformedAt ? exercisePerformedAt.split('T')[1]?.substring(0, 5) : ''}
                    onChange={(e) => setExercisePerformedAt(`${today}T${e.target.value}:00`)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    value={exerciseDuration}
                    onChange={(e) => setExerciseDuration(e.target.value)}
                    placeholder="e.g., 45"
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Intensity</label>
                  <select
                    value={exerciseIntensity}
                    onChange={(e) => setExerciseIntensity(e.target.value as typeof exerciseIntensity)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Distance (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={exerciseDistance}
                      onChange={(e) => setExerciseDistance(e.target.value)}
                      placeholder="e.g., 5"
                      className="flex-1 px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                    />
                    <select
                      value={exerciseDistanceUnit}
                      onChange={(e) => setExerciseDistanceUnit(e.target.value as typeof exerciseDistanceUnit)}
                      className="w-20 px-2 py-2 border rounded-md text-sm bg-white text-gray-900"
                    >
                      <option value="miles">mi</option>
                      <option value="km">km</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Calories Burned (optional)</label>
                  <input
                    type="number"
                    value={exerciseCalories}
                    onChange={(e) => setExerciseCalories(e.target.value)}
                    placeholder="e.g., 300"
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <input
                  type="text"
                  value={exerciseNotes}
                  onChange={(e) => setExerciseNotes(e.target.value)}
                  placeholder="How did it feel? Any observations..."
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Event Details - only show if current topic is event */}
      {(customType === 'event' || selectedTopicName?.toLowerCase() === 'event') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Event Details</h3>
            <div className="px-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={eventStartDate}
                    onChange={(e) => setEventStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={eventEndDate}
                    onChange={(e) => setEventEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Time</label>
                  <input
                    type="time"
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location/Venue</label>
                  <input
                    type="text"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    placeholder="e.g., Conference Room A"
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone Contact</label>
                  <input
                    type="tel"
                    value={eventPhone}
                    onChange={(e) => setEventPhone(e.target.value)}
                    placeholder="e.g., +1 555-123-4567"
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input
                  type="text"
                  value={eventAddress}
                  onChange={(e) => setEventAddress(e.target.value)}
                  placeholder="e.g., 123 Main St, City"
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                />
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">Additional Notes</label>
                <textarea
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Any additional details..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Meeting Details - only show if current topic is meeting */}
      {(customType === 'meeting' || selectedTopicName?.toLowerCase() === 'meeting') && (
        <>
          <div className="border-t my-4" />
          <div className="mb-4">
            <h3 className="font-medium text-sm text-gray-700 px-4 mb-2">Meeting Details</h3>
            <div className="px-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Meeting Topic</label>
                  <input
                    type="text"
                    value={meetingTopic}
                    onChange={(e) => setMeetingTopic(e.target.value)}
                    placeholder="e.g., Q4 Planning"
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Attendees</label>
                  <input
                    type="text"
                    value={meetingAttendees}
                    onChange={(e) => setMeetingAttendees(e.target.value)}
                    placeholder="e.g., John, Sarah, Mike"
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={meetingStartDate}
                    onChange={(e) => setMeetingStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={meetingStartTime}
                    onChange={(e) => setMeetingStartTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={meetingEndDate}
                    onChange={(e) => setMeetingEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Time</label>
                  <input
                    type="time"
                    value={meetingEndTime}
                    onChange={(e) => setMeetingEndTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location/Venue</label>
                  <input
                    type="text"
                    value={meetingLocation}
                    onChange={(e) => setMeetingLocation(e.target.value)}
                    placeholder="e.g., Conference Room A"
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone Contact</label>
                  <input
                    type="tel"
                    value={meetingPhone}
                    onChange={(e) => setMeetingPhone(e.target.value)}
                    placeholder="e.g., +1 555-123-4567"
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input
                  type="text"
                  value={meetingAddress}
                  onChange={(e) => setMeetingAddress(e.target.value)}
                  placeholder="e.g., 123 Main St, City"
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                />
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">Additional Notes</label>
                <textarea
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  placeholder="Agenda, action items, etc..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bottom action buttons */}
      <div className="mt-4 pt-4 border-t flex justify-between items-center flex-shrink-0">
        <div>
          {entryId && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md border border-red-200"
            >
              Delete
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || (!expandEntry && charCount > MAX_CHARS_SHORT)}
          className="px-4 py-2 text-white rounded-md disabled:bg-gray-400"
          style={{ backgroundColor: saving || (!expandEntry && charCount > MAX_CHARS_SHORT) ? undefined : '#1aaeae' }}
          onMouseOver={(e) => { if (!saving && (expandEntry || charCount <= MAX_CHARS_SHORT)) e.currentTarget.style.backgroundColor = '#158f8f'; }}
          onMouseOut={(e) => { if (!saving && (expandEntry || charCount <= MAX_CHARS_SHORT)) e.currentTarget.style.backgroundColor = '#1aaeae'; }}
          title="Save (Enter)"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Share modal */}
      {showShareModal && entryId && editor && (
        <ShareModal
          entryId={entryId}
          plaintextContent={editor.getHTML()}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}
