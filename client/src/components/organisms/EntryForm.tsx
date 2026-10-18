import { useState, useEffect, useMemo, useRef, Fragment, type MutableRefObject } from 'react';
import { PillButton } from '../atoms/PillButton.js';
import styled from 'styled-components';
import { stripHtml, summarizeUserFields, builtinEntryName } from '../../utils/stripHtml.js';
import { fieldLedSummary, generatedEntryText } from '../../utils/entryText.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Editor, type DictationControls, type DrawingControls } from './Editor.js';
import { RecipeEntry } from './RecipeEntry.js';
import { ImageLibraryPicker } from './ImageLibraryPicker.js';
import { TopicSelector } from './TopicSelector.js';
import { Spinner } from '../atoms/Spinner.js';
import { FieldRowLayoutContext } from '../molecules/FormField.js';
import { TaskFields, type TaskFieldValues } from '../molecules/fields/TaskFields.js';
import { GoalFields, type GoalFieldValues } from '../molecules/fields/GoalFields.js';
import { MilestoneFields, type MilestoneFieldValues } from '../molecules/fields/MilestoneFields.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { FoodFields, type FoodFieldValues } from '../molecules/fields/FoodFields.js';
import { MedicationFields, type MedicationFieldValues } from '../molecules/fields/MedicationFields.js';
import { MenuPlanFields, type MenuPlanFieldValues } from '../molecules/fields/MenuPlanFields.js';
import { SymptomFields, type SymptomFieldValues } from '../molecules/fields/SymptomFields.js';
import { ExerciseFields, type ExerciseFieldValues } from '../molecules/fields/ExerciseFields.js';
import { EventFields, type EventFieldValues } from '../molecules/fields/EventFields.js';
import { MeetingFields, type MeetingFieldValues } from '../molecules/fields/MeetingFields.js';
import { AllergyFields, type AllergyFieldValues } from '../molecules/fields/AllergyFields.js';
import { ShoppingListFields, type ShoppingListFieldValues } from '../molecules/fields/ShoppingListFields.js';
import { RecipeFields, type RecipeFieldValues } from '../molecules/fields/RecipeFields.js';
import { PrioritiesFields, type PrioritiesFieldValues } from '../molecules/fields/PrioritiesFields.js';
import { WellnessFields, type WellnessFieldValues } from '../molecules/fields/WellnessFields.js';
import { UserFieldsForm } from '../molecules/fields/UserFieldsForm.js';
import { useUIStore } from '../../stores/uiStore.js';
import { EntryHeroBanner, EntryImageStrip, EntryLightbox } from './EntryImageGallery.js';
import type { EntryImage } from '../../services/imageStorage.js';
import { useCalorieEstimate } from '../../hooks/useCalorieEstimate.js';
import { DEFAULT_ACCENT_COLOR } from '../../styles/accent.js';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Styled components ── */

const FormWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

/* Editor top bar — continues the journal list's quick-tabs bar (ViewTabs):
   same 60px height and --border-subtle hairline, edge to edge, so the two
   read as one seamless bar. Topic picker left, entry actions right. */
const EdToolRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-sizing: border-box;
  height: 60px;
  flex-shrink: 0;
  /* Above the writing area, so the ⋯ More menu sits on top of it */
  position: relative;
  z-index: 5;
  padding: 0 20px 0 32px;
  border-bottom: 1px solid var(--border-subtle);
`;

const EdActions = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
  min-width: 0;
  /* No overflow clipping here — it would hide the ⋯ More menu that drops below */
`;

const IconBtn = styled.button<{ $active?: boolean; $activeColor?: string; $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  color: ${({ $active, $activeColor, $danger }) =>
    $active ? ($activeColor || 'var(--color-accent)') :
    $danger ? 'var(--text-tertiary)' :
    'var(--text-muted)'};
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: color 0.15s, background 0.15s;

  &:hover {
    background: var(--bg-hover);
    color: ${({ $danger }) => $danger ? 'var(--color-danger)' : 'var(--text-primary)'};
  }
`;

/* A thin rule between the entry actions and the window controls (expand / close) */
const ToolDivider = styled.span`
  width: 1px;
  height: 26px;
  margin: 0 8px;
  background: var(--border-card);
`;

/* ⋯ More: the less-used actions (share, add from library, draw) */
const MoreWrap = styled.div`
  position: relative;
`;

const MoreMenu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  min-width: 240px;
  padding: 6px;
  background: var(--bg-tile);
  border: 1px solid var(--border-pop);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
`;

const MoreText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const MoreHint = styled.span`
  font-size: 12px;
  color: var(--text-muted);
`;

const MoreItem = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  & > svg { flex: none; color: var(--text-muted); }
  &:hover:not(:disabled) { background: var(--bg-row-hover); }
  &:disabled { opacity: 0.4; cursor: default; }
`;

/* Scrollable body — all editing content */
const ScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

/* Centered content column */
const EdBody = styled.div`
  max-width: 90%;
  width: 100%;
  margin: 0 auto;
  padding: var(--s-4, 16px) var(--s-5, 20px) var(--s-4, 16px);
`;

/* The topic picker (left of the action row) — restyle the
   TopicSelector trigger to read as bright tracked-uppercase crumb text,
   keeping its dropdown intact. */
/* The topic picker at the left of the editor's top bar: the topic's name
   in bold sentence case with a chevron (restyles the TopicSelector trigger,
   keeping its dropdown intact). */
const CrumbTopic = styled.div`
  & > div > button {
    border: none;
    border-radius: 0;
    padding: 0 2px;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
    color: var(--text-primary);
    gap: 12px;
  }
  & > div > button:hover { background: transparent; color: var(--text-primary); }
  & > div > button > span:last-child { color: var(--text-muted); }
  /* Dropdown menu: drop the outer border (matches Quick Entry). */
  & > div > div { border: none; }
`;




/* cf-card: the card that wraps each custom-fields section */
const CustomFieldsSection = styled.div<{ $noRule?: boolean }>`
  background: transparent;
  border: none;
  /* Hairline separating the writing area from the topic's fields — only
     when there IS a writing area above */
  border-top: ${({ $noRule }) => ($noRule ? 'none' : '1px solid var(--border-subtle)')};
  border-radius: 0;
  /* Fields-only entries: clear space under the header's bottom rule */
  padding: ${({ $noRule }) => ($noRule ? '16px' : 'var(--s-6, 24px)')} 0 var(--s-5, 20px);
  position: relative;
  margin-top: var(--s-5, 20px);
`;

const CustomFieldsBody = styled.div`
  /* Editor wrappers/rows: no extra gap — each field row carries its own padding. */
  & > div { gap: 0 !important; }
`;

const EditorArea = styled.div<{ $hidden?: boolean }>`
  display: ${({ $hidden }) => ($hidden ? 'none' : 'flex')};
  flex-direction: column;
  overflow: hidden;
  margin-top: 24px;
  /* A real writing area even when the entry is one line (journal editor only —
     Quick Entry and cards share Editor and stay compact) */
  .tiptap { min-height: 220px; }
`;

/* "Done editing — view recipe" — accent text button above the recipe fields. */
const ViewRecipeBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin-bottom: 12px;
  padding: 4px 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-accent);
  transition: opacity 120ms ease;
  &:hover { opacity: 0.7; }
`;

/* Inline image upload error under the action row (dictation-error pattern). */
const ImageErrorText = styled.div`
  margin: 8px 0 0;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--color-danger, #c0392b);
`;

/* Delete in the footer — the standard rounded pill, neutral until hovered,
   then danger red (outline + text) so it still reads as destructive. */
const FooterDeleteBtn = styled(PillButton)`
  &&:hover:not(:disabled) {
    color: var(--color-danger, #dc3232);
    border-color: var(--color-danger, #dc3232);
    background: transparent;
  }
  @media (max-width: 768px) { order: 3; }
`;

/* Phones: the "Saved" note is dropped (a save failure still shows) */
const StatusSlot = styled.span<{ $failed?: boolean }>`
  display: contents;
  @media (max-width: 768px) { display: ${({ $failed }) => ($failed ? 'contents' : 'none')}; }
`;

const FooterLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
`;

/* Footer — bottom-docked, outside the scroll area. Phones (not tablets):
   the buttons stack full width — Save, Discard, Delete */
const SaveRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px var(--s-6, 24px);
  border-top: 1px solid var(--rule, ${({ theme }) => theme.colors.border});
  gap: 8px;
  flex-shrink: 0;
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 14px 16px;
    & > div { display: contents; }
    & button { width: 100%; min-height: 44px; }
  }
`;

const SaveRowActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
`;

/* Discard changes — the standard neutral outlined pill */
const DiscardBtn = styled(PillButton).attrs({ $variant: 'neutral' as const, type: 'button' as const })`
  @media (max-width: 768px) { order: 2; }
`;

const SaveHint = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-4, ${({ theme }) => theme.colors.textFaint});
`;

const StatusText = styled.span`
  font-family: var(--font-sans);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--danger, #c0392b);
`;

const SaveButton = styled.button<{ $disabled?: boolean }>`
  padding: 7px 22px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ $disabled }) => $disabled ? 'var(--text-disabled)' : 'var(--color-accent)'};
  background: transparent;
  border: 1px solid ${({ $disabled }) => $disabled ? 'var(--border-default)' : 'var(--color-accent)'};
  border-radius: var(--r-full, 999px);
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'pointer'};
  transition: background 150ms, color 150ms;
  &:hover:not(:disabled) { background: var(--color-accent-subtle); }
  @media (max-width: 768px) {
    order: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
`;

/* ── Helpers ── */

const TOPIC_TO_TYPE: Record<string, string> = {
  task: 'task', goal: 'goal', milestone: 'milestone',
  meals: 'food', medication: 'medication', symptom: 'symptom',
  exercise: 'exercise', event: 'event', events: 'event', meeting: 'meeting',
  allergy: 'allergy', 'shopping list': 'shopping_list',
  recipe: 'recipe', recipes: 'recipe',
  priorities: 'priorities', wellness: 'wellness', 'menu plan': 'menu_plan',
};

/** Topics whose entry name is a field rather than the text (see nameKey below) */
const NAME_FIELD_BY_TYPE: Record<string, string> = {
  food: 'mealDescription', medication: 'medicationName', allergy: 'allergen',
  goal: 'goalObjective', milestone: 'milestoneObjective', recipe: 'recipeName',
  event: 'eventName', meeting: 'meetingName', task: 'taskDescription',
};

function getCustomType(topicName: string | undefined): string | null {
  if (!topicName) return null;
  return TOPIC_TO_TYPE[topicName.toLowerCase()] || null;
}


/* ── Component ── */

interface EntryFormProps {
  entryId: number | null;
  content: string;
  onContentChange: (content: string) => void;
  topicId: number | null;
  onTopicChange: (id: number | null) => void;
  topics: { id: number; name: string; icon: string | null; color: string | null }[];
  customFields: Record<string, unknown>;
  onCustomFieldsChange: (fields: Record<string, unknown>) => void;
  onSave: () => Promise<void>;
  onAutoSave?: () => void;
  onDelete?: () => Promise<void>;
  onNew: () => void;
  onBookmark?: () => void;
  onShare?: () => void;
  onBack?: () => void;
  /** Recipe view actions (injected by JournalView) */
  /** Full-screen editor toggle in the toolbar (journal only — other views open expanded) */
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** × at the end of the toolbar (edit view: close and go back) */
  onClose?: () => void;
  isEditing: boolean;
  isSaving: boolean;
  saveStatus: string;
  lastSavedAt?: Date | null;
  placeholder?: string;
  dictationControlRef?: MutableRefObject<DictationControls | null>;
  // Entry images (only active when image storage is enabled + configured)
  images?: EntryImage[];
  featuredKey?: string | null;
  onImagesSelected?: (files: File[]) => void;
  /** Attach images that already exist in the bucket (picked from the library) */
  onExistingImagesSelected?: (images: EntryImage[]) => void;
  onImageRemoved?: (key: string) => void;
  onSetFeatured?: (key: string | null) => void;
  imageUploading?: boolean;
  imageError?: string;
  imagesReady?: boolean;
}

export function EntryForm({
  entryId, content, onContentChange, topicId, onTopicChange, topics,
  customFields, onCustomFieldsChange, onSave, onAutoSave, onDelete, onNew,
  onBookmark, onShare, onBack, expanded, onToggleExpand, onClose,
  isEditing, isSaving, saveStatus, lastSavedAt, placeholder = 'Start writing...',
  dictationControlRef,
  images = [], featuredKey = null, onImagesSelected, onExistingImagesSelected, onImageRemoved, onSetFeatured,
  imageUploading = false, imageError, imagesReady = false,
}: EntryFormProps) {
  const isFavorite = !!customFields._isFavorite;
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;
  const [toolbarOpen, setToolbarOpen] = useState(false);
  // ⋯ More menu: closes on an outside click or Escape
  const [moreOpen, setMoreOpen] = useState(false);
  const drawingControlRef = useRef<DrawingControls | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [moreOpen]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const featuredImage = featuredKey ? images.find(img => img.key === featuredKey) ?? null : null;
  const imagesFull = images.length >= 7;
  const [savedAgoText, setSavedAgoText] = useState('');
  useEffect(() => {
    if (!lastSavedAt) { setSavedAgoText(''); return; }
    const update = () => {
      const s = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
      setSavedAgoText(s < 60 ? `Auto-saved ${s}s ago` : `Auto-saved ${Math.floor(s / 60)}m ago`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastSavedAt]);
  const entries = useEntriesStore(s => s.decryptedEntries);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const topicHideText = useUIStore(s => s.topicHideText);
  const cycleTrackingEnabled = useUIStore(s => s.cycleTrackingEnabled);
  const calendarSyncEnabled = useUIStore(s => s.calendarSyncEnabled);

  const userFieldDefs = topicId != null ? (topicCustomFields[topicId] ?? []) : [];

  const selectedTopic = topics.find(t => t.id === topicId);
  const customType = getCustomType(selectedTopic?.name);
  const calorieEstimate = useCalorieEstimate(
    customType === 'food' || customType === 'exercise' ? customType : null,
    content, customFields, onCustomFieldsChange,
  );

  // Build goal options for milestone linking
  const goalOptions = useMemo(() => entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && getCustomType(t.name) === 'goal';
    })
    .map(e => ({ id: e.id, title: stripHtml(e.content).slice(0, 60) || `Goal #${e.id}` })), [entries, topics, entryId]);

  // Build milestone options for task linking (include parentGoalId for cascading)
  const milestoneOptions = useMemo(() => entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && getCustomType(t.name) === 'milestone';
    })
    .map(e => {
      const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
      return {
        id: e.id,
        title: stripHtml(e.content).slice(0, 60) || `Milestone #${e.id}`,
        parentGoalId: (cf?.parentGoalId as number) || undefined,
      };
    }), [entries, topics, entryId]);

  // Build recipe options for shopping list linking
  const recipeOptions = useMemo(() => entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && getCustomType(t.name) === 'recipe' && e.id !== entryId;
    })
    .map(e => {
      const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
      const name = typeof cf?.recipeName === 'string' ? cf.recipeName.trim() : '';
      return { id: e.id, title: name || stripHtml(e.content).slice(0, 60) || `Recipe #${e.id}` };
    }), [entries, topics, entryId]);

  // Build shopping list options for recipe linking
  const shoppingListOptions = useMemo(() => entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && getCustomType(t.name) === 'shopping_list' && e.id !== entryId;
    })
    .map(e => ({ id: e.id, title: stripHtml(e.content).slice(0, 60) || `Shopping List #${e.id}` })), [entries, topics, entryId]);

  // Build linked tasks for the current milestone (tasks whose parentMilestoneId === this entry)
  const linkedTasks = useMemo(() => entryId ? entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const cf = meta?._customFields as Record<string, unknown> | undefined;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && getCustomType(t.name) === 'task' && cf?.parentMilestoneId === entryId;
    })
    .map(e => {
      const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
      return { id: e.id, title: stripHtml(e.content).slice(0, 60) || `Task #${e.id}`, isCompleted: !!cf?.isCompleted };
    }) : [], [entries, topics, entryId]);

  // Toggle a linked task's completion status
  const handleToggleTaskComplete = (taskId: number, completed: boolean) => {
    const entry = entries.find(e => e.id === taskId);
    if (!entry) return;
    const meta = entry.metadata as Record<string, unknown>;
    const existingFields = (meta?._customFields as Record<string, unknown>) || {};
    const updatedFields = { ...existingFields, isCompleted: completed };
    const updatedMeta = { ...meta, _customFields: updatedFields };
    updateDecryptedEntry(taskId, { metadata: updatedMeta });
  };

  // Unlink a task from this milestone
  const handleUnlinkTask = (taskId: number) => {
    const entry = entries.find(e => e.id === taskId);
    if (!entry) return;
    const meta = entry.metadata as Record<string, unknown>;
    const existingFields = (meta?._customFields as Record<string, unknown>) || {};
    const updatedFields = { ...existingFields, parentMilestoneId: null };
    const updatedMeta = { ...meta, _customFields: updatedFields };
    updateDecryptedEntry(taskId, { metadata: updatedMeta });
  };

  const userFieldValues = (customFields._userFields as Record<string, unknown>) ?? {};
  // Any filled-in field makes an entry saveable — topics without a text area
  // (books, exercise, custom topics with only yes/no fields…) must still save
  const isFilled = (v: unknown) => v !== '' && v != null && v !== false && !(Array.isArray(v) && v.length === 0);
  const hasFieldValue = Object.entries(customFields).some(([k, v]) => !k.startsWith('_') && isFilled(v))
    || Object.values(userFieldValues).some(isFilled);
  const canSave = stripHtml(content).length > 0
    || hasFieldValue
    || builtinEntryName(customFields) !== ''
    || images.length > 0;

  // The main text area is hidden entirely (no affordance) for every topic
  // except Journal: built-in structured topics always, custom topics via
  // their "Hide main text field" option — the fields simply move up.
  // Existing text content always stays visible (hiding it would read as data
  // loss), and dictate/draw force-reveal the editor since they write into it.
  const [notesExpanded, setNotesExpanded] = useState(false);
  useEffect(() => { setNotesExpanded(false); }, [entryId]);
  const hasTextContent = stripHtml(content).trim().length > 0 || content.includes('data-type="drawing"');
  const isJournalTopic = !selectedTopic || selectedTopic.name.toLowerCase() === 'journal';
  const hideByTopicOption = topicId != null && !!topicHideText[topicId];
  // Quote/Books/Music entries live in their custom fields — no text area
  // …but only once the topic has fields: with none defined, the text area stays
  const fieldLedTopic = userFieldDefs.length > 0 && ['quote', 'quotes', 'book', 'books', 'music']
    .includes(selectedTopic?.name.toLowerCase() ?? '');
  // Shopping lists: the text is only ever a title, which is automated
  // ("Shopping list created on Oct 7, 2026") — so no text area at all.
  // Tasks: the opposite — the text area IS the task (room for longer notes).
  // Name-led topics: a field is the entry's name (Meals → Meal Description,
  // Medication → Medication Name, Allergy → Allergen), so no text area —
  // the hidden text mirrors the name so every list shows it. Writing already
  // on an entry beyond the name is kept (hidden, never overwritten).
  const nameKey = customType ? NAME_FIELD_BY_TYPE[customType] : undefined;
  const nameValue = nameKey && typeof customFields[nameKey] === 'string'
    ? (customFields[nameKey] as string).trim() : '';
  const contentText = stripHtml(content).trim();
  // Menu plans too: their text is just "Menu: Oct 12 – Oct 18"
  const titleOnlyTopic = customType === 'shopping_list' || customType === 'menu_plan' || !!nameKey;
  // Wellness is fields only: its auto-save writes a summary ("3/8 glasses · …")
  // as the text, which must not bring the text area back
  const editorCollapsed = !notesExpanded && (
    customType === 'event' || customType === 'wellness' || titleOnlyTopic ||
    (!hasTextContent && !isJournalTopic && customType !== 'task'
      && (customType !== null || hideByTopicOption || fieldLedTopic))
  );

  // Tasks used to have a separate "Task description" field; a task whose words
  // live only there gets them moved into the text area once, when opened.
  const migratedTaskRef = useRef<number | null>(null);
  useEffect(() => {
    if (customType !== 'task' || entryId == null || migratedTaskRef.current === entryId) return;
    migratedTaskRef.current = entryId;
    const desc = typeof customFields.taskDescription === 'string' ? customFields.taskDescription.trim() : '';
    if (desc && !hasTextContent) {
      onContentChange(`<p>${escapeHtml(desc)}</p>`);
    }
  }, [entryId, customType]); // eslint-disable-line react-hooks/exhaustive-deps

  // An entry whose name lives only in its text gets it copied into the name
  // field once, when opened. After that, editing the name keeps the (hidden)
  // text in step — only while the text is just the name.
  const migratedNameRef = useRef<number | null>(null);
  useEffect(() => {
    if (!nameKey || entryId == null || migratedNameRef.current === entryId) return;
    migratedNameRef.current = entryId;
    if (!nameValue && contentText) onCustomFieldsChange({ ...customFields, [nameKey]: contentText });
  }, [entryId, nameKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastNameRef = useRef<{ id: number | null; key: string | undefined; name: string } | null>(null);
  useEffect(() => {
    if (!nameKey) return;
    const prev = lastNameRef.current;
    lastNameRef.current = { id: entryId, key: nameKey, name: nameValue };
    if (!prev || prev.id !== entryId || prev.key !== nameKey || prev.name === nameValue) return;
    if (!contentText || contentText === prev.name) onContentChange(nameValue ? `<p>${escapeHtml(nameValue)}</p>` : '');
  }, [nameValue, entryId, nameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recipes render as a formatted page (RecipeEntry) once they have content;
  // empty/new recipes start in the fields editor. "Edit recipe" flips back.
  const isRecipe = customType === 'recipe';
  const recipeValues = { servings: '', prepTime: '', cookTime: '', cuisine: '', ingredients: [], instructions: '', linkedShoppingListIds: [], ...(customFields as Partial<RecipeFieldValues>) } as RecipeFieldValues;
  const recipeHasContent = !!(
    recipeValues.recipeName?.trim() ||
    recipeValues.ingredients.length > 0 ||
    (recipeValues.steps?.length ?? 0) > 0 ||
    recipeValues.instructions?.trim()
  );
  const [recipeEditing, setRecipeEditing] = useState(false);
  useEffect(() => { setRecipeEditing(false); }, [entryId]);
  const recipeViewMode = isRecipe && recipeHasContent && !recipeEditing;

  const toggleRecipeIngredient = (id: string) => {
    onCustomFieldsChange({
      ...customFields,
      ingredients: recipeValues.ingredients.map(i => i.id === id ? { ...i, checked: !i.checked } : i),
    });
  };

  const topicNameLower = selectedTopic?.name.toLowerCase() ?? '';
  const isQuoteTopic = topicNameLower === 'quote' || topicNameLower === 'quotes';
  // Books and quotes have no text area: their text is generated from the
  // fields — "Title — Author" / "“Quote” — Author" — so every list, the
  // calendar and search show that line. Text that is only an earlier summary
  // (or the old "a · b" auto-summary) is replaced; anything else is real
  // writing and stays visible and untouched.
  const isBookTopic = topicNameLower === 'book' || topicNameLower === 'books';
  // Exercise likewise: "Running · 30 min · 3 mi" (notes have their own field)
  const isExerciseTopic = customType === 'exercise';
  const summaryLedTopic = ((isQuoteTopic || isBookTopic) && userFieldDefs.length > 0) || isExerciseTopic;
  const quoteDef = isQuoteTopic ? userFieldDefs.find(d => ['quote', 'text'].some(p => d.label.toLowerCase().includes(p))) : undefined;
  // Same rules as the dashboard Quick Entry (utils/entryText)
  const fieldSummary = isQuoteTopic || isBookTopic
    ? fieldLedSummary(topicNameLower, userFieldDefs, userFieldValues)
    : isExerciseTopic ? generatedEntryText('exercise', customFields) : '';
  const legacySummary = isQuoteTopic || isBookTopic ? summarizeUserFields(userFieldDefs, userFieldValues) : '';
  const lastSummaryRef = useRef<{ id: number | null; text: string }>({ id: null, text: '' });
  const prevSummary = lastSummaryRef.current.id === entryId ? lastSummaryRef.current.text : '';
  const quoteValue = quoteDef ? String(userFieldValues[quoteDef.id] ?? '').trim() : '';
  const contentIsSummary = !contentText || contentText === fieldSummary
    || contentText === legacySummary || (!!prevSummary && contentText === prevSummary)
    || (!!quoteValue && contentText === quoteValue);
  // Books, quotes and exercise never show the text area — just their fields.
  // Other writing already on an entry is kept as-is (never deleted), only hidden.
  const summaryHidesEditor = summaryLedTopic;
  // A quote typed into the text area (Quote field empty) moves into the field once
  const migratedQuoteRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isQuoteTopic || !quoteDef || entryId == null || migratedQuoteRef.current === entryId) return;
    migratedQuoteRef.current = entryId;
    if (!quoteValue && contentText && !contentIsSummary) {
      onCustomFieldsChange({ ...customFields, _userFields: { ...userFieldValues, [quoteDef.id]: contentText } });
    }
  }, [entryId, isQuoteTopic, quoteDef?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!summaryLedTopic) return;
    lastSummaryRef.current = { id: entryId, text: fieldSummary };
    if (fieldSummary && contentIsSummary && contentText !== fieldSummary) {
      onContentChange(`<p>${escapeHtml(fieldSummary)}</p>`);
    }
  }, [fieldSummary, entryId, summaryLedTopic]); // eslint-disable-line react-hooks/exhaustive-deps

  const editorHidden = editorCollapsed || recipeViewMode || (summaryHidesEditor && !notesExpanded);

  const saveStatusNode = (() => {
    if (saveStatus === 'Save failed') return <StatusText>Save failed</StatusText>;
    if (isSaving) return <SaveHint>Saving...</SaveHint>;
    if (savedAgoText) return (
      <SaveHint>
        <Icon name="check-circle" size={8} strokeWidth={1.5} />
        {savedAgoText}
      </SaveHint>
    );
    if (entryId) return (
      <SaveHint>
        <Icon name="check-circle" size={8} strokeWidth={1.5} />
        Saved
      </SaveHint>
    );
    return null;
  })();

  return (
    <FormWrapper>
          {/* Top bar, outside the scroll: topic picker left, entry actions right — same
          60px height and hairline as the list's quick tabs, so the two read as one bar */}
          <EdToolRow>
          <CrumbTopic>
            <TopicSelector
              selectedId={topicId}
              onSelect={id => onTopicChange(id)}
              topics={topics}
              allowNone={false}
              hideIcon
            />
          </CrumbTopic>
          <EdActions aria-label="Entry actions">
              <IconBtn
                type="button"
                $active={isFavorite}
                $activeColor={accentColor}
                aria-label={isFavorite ? 'Remove bookmark' : 'Bookmark entry'}
                title="Bookmark"
                onClick={() => entryId && onBookmark?.()}
                style={{ opacity: entryId ? 1 : 0.35, cursor: entryId ? 'pointer' : 'default' }}
              >
                <Icon name="bookmark" size={20} strokeWidth={1.8} />
              </IconBtn>
              {imagesReady && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > 0) onImagesSelected?.(files);
                      e.target.value = '';
                    }}
                  />
                  <IconBtn
                    type="button"
                    aria-label="Add images"
                    title={imagesFull ? 'Maximum of 7 images per entry' : 'Add images'}
                    disabled={imagesFull || imageUploading}
                    onClick={() => !imagesFull && !imageUploading && fileInputRef.current?.click()}
                    style={{ opacity: imagesFull ? 0.35 : 1, cursor: imagesFull ? 'default' : 'pointer' }}
                  >
                    {imageUploading ? <Spinner size={14} /> : <Icon name="image" size={20} strokeWidth={1.8} />}
                  </IconBtn>
                  {onExistingImagesSelected && (
                    <IconBtn
                      type="button"
                      aria-label="Add image from library"
                      title={imagesFull ? 'Maximum of 7 images per entry' : 'Add from library'}
                      disabled={imagesFull}
                      onClick={() => !imagesFull && setLibraryOpen(true)}
                      style={{ opacity: imagesFull ? 0.35 : 1, cursor: imagesFull ? 'default' : 'pointer' }}
                    >
                      <MaterialIcon $size={22} aria-hidden="true">photo_library</MaterialIcon>
                    </IconBtn>
                  )}
                </>
              )}
              {/* Format: shows / hides the formatting bar (bold, lists, … and Draw) */}
              <IconBtn
                type="button"
                $active={toolbarOpen}
                aria-label="Formatting"
                title="Format"
                aria-pressed={toolbarOpen}
                onClick={() => { setNotesExpanded(true); setToolbarOpen(!toolbarOpen); }}
              >
                <Icon name="type" size={20} strokeWidth={1.8} />
              </IconBtn>
              {/* ⋯ More: Dictate, Share and Draw */}
              <MoreWrap ref={moreRef}>
                <IconBtn
                  type="button"
                  $active={moreOpen}
                  aria-label="More actions"
                  title="More"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen(o => !o)}
                >
                  <Icon name="more-horizontal" size={20} strokeWidth={2} />
                </IconBtn>
                {moreOpen && (
                  <MoreMenu role="menu">
                    {/* Every action is listed; one that can't be used right now says why */}
                    <MoreItem type="button" role="menuitem"
                      onClick={() => { setMoreOpen(false); setNotesExpanded(true); dictationControlRef?.current?.toggle(); }}>
                      <Icon name="mic" size={16} strokeWidth={1.8} />
                      <MoreText>Dictate</MoreText>
                    </MoreItem>
                    <MoreItem type="button" role="menuitem"
                      disabled={!entryId || (images.length > 0 && !isRecipe)}
                      onClick={() => { setMoreOpen(false); if (entryId) onShare?.(); }}>
                      <Icon name="share" size={16} strokeWidth={1.8} />
                      <MoreText>
                        Share
                        {!entryId ? <MoreHint>Save the entry first</MoreHint>
                          : images.length > 0 && !isRecipe ? <MoreHint>Not for entries with images</MoreHint> : null}
                      </MoreText>
                    </MoreItem>
                    <MoreItem type="button" role="menuitem"
                      onClick={() => { setMoreOpen(false); setNotesExpanded(true); drawingControlRef.current?.open(); }}>
                      <Icon name="pencil" size={16} strokeWidth={1.8} />
                      <MoreText>Draw</MoreText>
                    </MoreItem>
                  </MoreMenu>
                )}
              </MoreWrap>
              {(onToggleExpand || onClose) && <ToolDivider aria-hidden="true" />}
              {onToggleExpand && (
                <IconBtn
                  type="button"
                  $active={expanded}
                  aria-label={expanded ? 'Exit full screen' : 'Expand editor'}
                  title={expanded ? 'Exit full screen' : 'Expand'}
                  aria-pressed={!!expanded}
                  onClick={onToggleExpand}
                >
                  <Icon name={expanded ? 'minimize' : 'maximize'} size={20} strokeWidth={1.8} />
                </IconBtn>
              )}
              {onClose && (
                <IconBtn type="button" aria-label="Close" title="Close" onClick={onClose}>
                  <Icon name="x" size={20} strokeWidth={1.8} />
                </IconBtn>
              )}
          </EdActions>
          </EdToolRow>
      {/* Scrollable body */}
      <ScrollArea>
        <EdBody>
          {/* Featured image hero — at the top, above the topic / actions row
              (recipes place it inside their own layout) */}
          {featuredImage && !recipeViewMode && <EntryHeroBanner image={featuredImage} />}

          {imageError && <ImageErrorText>{imageError}</ImageErrorText>}

          {/* Recipe read view — the formatted recipe page */}
          {recipeViewMode && (
            <RecipeEntry
              values={recipeValues}
              hero={featuredImage ? <EntryHeroBanner image={featuredImage} /> : null}
              onToggleIngredient={toggleRecipeIngredient}
              onEdit={() => setRecipeEditing(true)}
            />
          )}


          {/* Rich text editor — hidden entirely for structured topics */}
          <EditorArea $hidden={editorHidden}>
            <Editor
              content={content}
              onChange={onContentChange}
              placeholder={placeholder}
              onEnterSave={canSave && !isSaving ? onSave : undefined}
              toolbarOpen={toolbarOpen}
              onToolbarToggle={setToolbarOpen}
              hideToolbarToggle
              dictationControlRef={dictationControlRef}
              drawingControlRef={drawingControlRef}
            />
          </EditorArea>

          {/* Custom fields, below editor — recipes in view mode render the
              formatted page instead; "Edit recipe" brings the fields back */}
          {customType && !recipeViewMode && (
            <CustomFieldsSection $noRule={editorHidden}>
                {isRecipe && recipeHasContent && (
                  <ViewRecipeBtn type="button" onClick={() => setRecipeEditing(false)}>
                    <Icon name="check" size={12} strokeWidth={2.5} />
                    Done editing — view recipe
                  </ViewRecipeBtn>
                )}
                <CustomFieldsBody>
                  <FieldRowLayoutContext.Provider value={true}>
                  {customType === 'task' && <TaskFields values={{ isInProgress: false, isCompleted: false, isAutoMigrating: false, parentGoalId: null, parentMilestoneId: null, priority: 'none', deadline: '', ...customFields } as TaskFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} goalOptions={goalOptions} milestoneOptions={milestoneOptions} />}
                  {customType === 'goal' && <GoalFields values={{ goalType: 'short_term', goalStatus: 'new', targetDate: '', ...customFields } as GoalFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
                  {customType === 'milestone' && <MilestoneFields values={{ milestoneStatus: 'not_started', targetDate: '', isCompleted: false, parentGoalId: null, ...customFields } as MilestoneFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} goalOptions={goalOptions} linkedTasks={linkedTasks} onToggleTaskComplete={handleToggleTaskComplete} onUnlinkTask={handleUnlinkTask} />}
                  {customType === 'food' && <FoodFields values={{ mealType: 'breakfast', consumedDate: '', consumedTime: '', ingredients: '', calories: '', notes: '', ...customFields } as FoodFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} onEstimateCalories={calorieEstimate.estimate} estimatingCalories={calorieEstimate.estimating} calorieError={calorieEstimate.error} />}
                  {customType === 'medication' && <MedicationFields values={{ dosage: '', frequency: 'once_daily', scheduleTimes: ['08:00'], isActive: true, notes: '', ...customFields } as MedicationFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} entryName={(typeof customFields.medicationName === 'string' && customFields.medicationName.trim()) || content.replace(/<[^>]+>/g, ' ').trim()} />}
                  {customType === 'symptom' && <SymptomFields values={{ severity: 5, occurredDate: '', occurredTime: '', duration: '', notes: '', ...customFields } as SymptomFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
                  {customType === 'exercise' && <ExerciseFields values={{ exerciseType: 'running', duration: '', intensity: 'medium', distance: '', distanceUnit: 'miles', calories: '', performedDate: '', performedTime: '', notes: '', ...customFields } as ExerciseFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} onEstimateCalories={calorieEstimate.estimate} estimatingCalories={calorieEstimate.estimating} calorieError={calorieEstimate.error} />}
                  {customType === 'event' && <EventFields values={{ startDate: '', startTime: '', endDate: '', endTime: '', location: '', address: '', phone: '', notes: '', ...customFields } as EventFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} showCalendarSync={calendarSyncEnabled} />}
                  {customType === 'meeting' && <MeetingFields values={{ startDate: '', startTime: '', endDate: '', endTime: '', meetingTopic: '', attendees: '', location: '', address: '', phone: '', notes: '', ...customFields } as MeetingFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} showCalendarSync={calendarSyncEnabled} />}
                  {customType === 'allergy' && <AllergyFields values={{ allergen: '', severity: 5, reaction: '', occurredDate: '', occurredTime: '', notes: '', ...customFields } as AllergyFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
                  {customType === 'menu_plan' && <MenuPlanFields values={{ weekStart: '', days: {}, ...(customFields as Partial<MenuPlanFieldValues>) } as MenuPlanFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} recipeOptions={recipeOptions} />}
                  {customType === 'shopping_list' && <ShoppingListFields values={{ items: [], notes: '', linkedRecipeIds: [], ...(customFields as Partial<ShoppingListFieldValues>) } as ShoppingListFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} recipeOptions={recipeOptions} />}
                  {customType === 'recipe' && <RecipeFields values={{ servings: '', prepTime: '', cookTime: '', cuisine: '', ingredients: [], instructions: '', linkedShoppingListIds: [], ...(customFields as Partial<RecipeFieldValues>) } as RecipeFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} shoppingListOptions={shoppingListOptions} />}
                  {customType === 'priorities' && <PrioritiesFields values={{ priorities: [], ...(customFields as Partial<PrioritiesFieldValues>) } as PrioritiesFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
                  {customType === 'wellness' && <WellnessFields values={{ date: '', waterGlasses: 0, waterGoal: 8, moodScore: 0, sleepHours: 0, sleepQuality: 0, ...customFields } as WellnessFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} cycleTrackingEnabled={cycleTrackingEnabled} onAutoSave={onAutoSave} />}
                  </FieldRowLayoutContext.Provider>
                </CustomFieldsBody>
            </CustomFieldsSection>
          )}

          {/* User-defined custom fields */}
          {userFieldDefs.length > 0 && !recipeViewMode && (
            <CustomFieldsSection $noRule={editorHidden}>
                <CustomFieldsBody>
                  <FieldRowLayoutContext.Provider value={true}>
                    <UserFieldsForm
                      fieldDefs={userFieldDefs}
                      values={(customFields._userFields as Record<string, unknown>) ?? {}}
                      onChange={vals => onCustomFieldsChange({ ...customFields, _userFields: vals })}
                    />
                  </FieldRowLayoutContext.Provider>
                </CustomFieldsBody>
            </CustomFieldsSection>
          )}

          {/* Image thumbnail strip at the bottom of the post */}
          {(imagesReady || images.length > 0) && (
            <EntryImageStrip
              images={images}
              featuredKey={featuredKey}
              uploading={imageUploading}
              onSetFeatured={key => onSetFeatured?.(key)}
              onRemove={key => onImageRemoved?.(key)}
              onOpen={setLightboxIndex}
            />
          )}
        </EdBody>
      </ScrollArea>

      {lightboxIndex !== null && images.length > 0 && (
        <EntryLightbox
          images={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {libraryOpen && onExistingImagesSelected && (
        <ImageLibraryPicker
          excludeKeys={images.map(i => i.key)}
          remainingSlots={7 - images.length}
          onSelect={onExistingImagesSelected}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {/* Footer — bottom-docked save/discard */}
      <SaveRow>
        <FooterLeft>
          {entryId && onDelete && (
            <FooterDeleteBtn type="button" $variant="neutral" onClick={onDelete} title="Delete entry">
              Delete
            </FooterDeleteBtn>
          )}
          {saveStatusNode && <StatusSlot $failed={saveStatus === 'Save failed'}>{saveStatusNode}</StatusSlot>}
        </FooterLeft>
        <SaveRowActions>
          <DiscardBtn onClick={onNew}>Discard changes</DiscardBtn>
          <SaveButton
            $disabled={!canSave || isSaving}
            disabled={!canSave || isSaving}
            onClick={async () => {
              await onSave();
              // Saving a recipe lands back on the formatted recipe view
              if (isRecipe) setRecipeEditing(false);
            }}
          >
            {isSaving ? <><Spinner size={14} /> Saving...</> : 'Save entry'}
          </SaveButton>
        </SaveRowActions>
      </SaveRow>
    </FormWrapper>
  );
}
