import { ChangeFields, type ChangeFieldValues } from '../molecules/fields/ChangeFields.js';
import { useState, useEffect, useMemo, useCallback, useRef, Fragment, type MutableRefObject, type ReactNode, type CSSProperties } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { onPhoto, photoTokens, solidUnderPhoto } from '../../styles/wallpaper.js';
import { cardLabel } from '../../styles/cardLabel.js';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { SectionLabel, RowBox, LabelledRow, RowLabel, DateTimeBox } from '../molecules/fields/formKit.js';
import { EntryTagsField } from '../molecules/fields/EntryTagsField.js';
import { tagsInUse, tagsOf } from '../../utils/entryTags.js';
import { topicKind } from '../../utils/topicKind.js';
import { TitleField } from '../molecules/fields/TitleInput.js';
import { isHiddenFromAi } from '../../services/aiPrivacy.js';
import { useAiPrivacy } from '../../hooks/useAiPrivacy.js';
import { NAME_FIELD_BY_TYPE, NAME_MAX, NAME_PLACEHOLDER_BY_TYPE, contentWithName, nameFromContent } from '../../utils/nameFields.js';
import { stripHtml, summarizeUserFields, builtinEntryName } from '../../utils/stripHtml.js';
import { fieldLedSummary, generatedEntryText } from '../../utils/entryText.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Editor, ToolbarRow, type DictationControls, type DrawingControls } from './Editor.js';
import { RecipeEntry } from './RecipeEntry.js';
import { ImageLibraryPicker } from './ImageLibraryPicker.js';
import { TopicSelector } from './TopicSelector.js';
import { Spinner } from '../atoms/Spinner.js';
import { FieldRowLayoutContext } from '../molecules/FormField.js';
import { TaskFields, type TaskFieldValues } from '../molecules/fields/TaskFields.js';
import { GoalFields, GoalCategoryPick, type GoalFieldValues } from '../molecules/fields/GoalFields.js';
import { MilestoneFields, MilestoneGoalPick, type MilestoneFieldValues } from '../molecules/fields/MilestoneFields.js';
import { HabitFields, type HabitFieldValues } from '../molecules/fields/HabitFields.js';
import { HABIT_DEFAULTS, HABIT_ICON, HABIT_TOPIC, describeTarget } from '../../utils/habits.js';
import { useHabits } from '../../hooks/useHabits.js';
import { LinkedHabits } from '../molecules/fields/LinkedHabits.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { FoodFields, type FoodFieldValues } from '../molecules/fields/FoodFields.js';
import { MedicationFields, type MedicationFieldValues } from '../molecules/fields/MedicationFields.js';
import { MenuPlanFields, type MenuPlanFieldValues } from '../molecules/fields/MenuPlanFields.js';
import { SymptomFields, type SymptomFieldValues } from '../molecules/fields/SymptomFields.js';
import { TimeTracker } from '../molecules/fields/TimeTracker.js';
import { TaskCardRows, TaskRow, TaskRowName, TaskPriorityPick, TaskFormatToggle } from '../molecules/fields/TaskCardFields.js';
import { TimeTrackingFields, type TimeTrackingFieldValues } from '../molecules/fields/TimeTrackingFields.js';
import { MediaFields, type MediaFieldValues } from '../molecules/fields/MediaFields.js';
import { MEDIA_DEFAULTS, mediaTags, mediaTopicIds } from '../../utils/media.js';
import { retagMedia } from '../../utils/retagMedia.js';
import { useSaveFields } from '../../hooks/useSaveFields.js';
import { showFlash } from '../../services/flashNotice.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { useCreateEntry } from '../../hooks/useCreateEntry.js';
import { aiMediaDetails } from '../../services/mediaDetails.js';
import { useAiReady } from '../../hooks/useAiReady.js';
import { useTimeTracking } from '../../hooks/useTimeTracking.js';
import { TIME_TRACKED_TYPES, timerFill } from '../../utils/timeTracking.js';
import { ExerciseFields, type ExerciseFieldValues } from '../molecules/fields/ExerciseFields.js';
import { RoutineFields } from '../molecules/fields/RoutineFields.js';
import { TrainingPlanFields } from '../molecules/fields/TrainingPlanFields.js';
import type { RoutineFieldValues, TrainingPlanFieldValues } from '../../types/fields.js';
import { categoryNames, trainingPlans } from '../../utils/training.js';
import { ROUTINE_DEFAULTS, describeDays } from '../../utils/routines.js';
import { EventFields, type EventFieldValues } from '../molecules/fields/EventFields.js';
import { MeetingFields, type MeetingFieldValues } from '../molecules/fields/MeetingFields.js';
import { AllergyFields, type AllergyFieldValues } from '../molecules/fields/AllergyFields.js';
import { ShoppingListFields, type ShoppingListFieldValues } from '../molecules/fields/ShoppingListFields.js';
import { RecipeFields, type RecipeFieldValues } from '../molecules/fields/RecipeFields.js';
import { PrioritiesFields, type PrioritiesFieldValues } from '../molecules/fields/PrioritiesFields.js';
import { WinsFields, type WinsFieldValues } from '../molecules/fields/WinsFields.js';
import { WellnessFields, type WellnessFieldValues } from '../molecules/fields/WellnessFields.js';
import { UserFieldsForm, titleFieldOf } from '../molecules/fields/UserFieldsForm.js';
import { useUIStore } from '../../stores/uiStore.js';
import { EntryHeroBanner, EntryPhotos, EntryLightbox } from './EntryImageGallery.js';
import type { EntryImage } from '../../services/imageStorage.js';
import { useCalorieEstimate } from '../../hooks/useCalorieEstimate.js';
import { DEFAULT_ACCENT_COLOR } from '../../styles/accent.js';
import { useEncryptedSetting } from '../../hooks/useEncryptedSetting.js';
import { EMPTY_SYMPTOM_CHIPS, symptomChipList, addSymptomChip, removeSymptomChip, type SymptomChipConfig } from '../../utils/symptomChips.js';
import { taskTypeList, addTaskType, removeTaskType } from '../../utils/taskTypes.js';
import { EMPTY_GOAL_CATEGORIES, parseGoalCategories, goalCategoryList, addGoalCategory, removeGoalCategory, type GoalCategoryConfig } from '../../utils/goalCategories.js';
import { ALLOWED_IMAGE_TYPES } from '../../utils/processImage.js';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Styled components ── */

const NO_TASK_TYPES: string[] = [];

const FormWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
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

/* ⋯ More: the less-used actions (share, add from library, draw) */
const MoreWrap = styled.div`
  position: relative;
`;

const MoreMenu = styled.div<{ $up?: boolean }>`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  /* In the journal's tool row (at the foot): opening upward, from the left */
  ${({ $up }) => ($up ? 'top: auto; bottom: calc(100% + 8px); right: auto; left: 0;' : '')}
  z-index: 40;
  min-width: 240px;
  padding: 6px;
  background: var(--bg-menu, var(--bg-tile));
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
  ${solidUnderPhoto}
`;

/* Centered content column */
/* At least the pane's height, so a short entry's foot (Close / Save) sits at the
   bottom of the pane — and a long one's at the end of the entry, scrolling with it */
const EdBody = styled.div<{ $full?: boolean }>`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  padding-bottom: 24px;
  /* Full width (the journal's Expand, or edit view): the whole entry pulled in from the nav rail and down from the top */
  ${({ $full }) => $full && css`
    @media (min-width: 1025px) {
      padding: 24px 56px 24px;
      /* …and never wider than 1100px, so the rows don't stretch across a wide screen */
      & > * { width: 100%; max-width: 1100px; }
    }
  `}
  & > * { flex: 1 0 auto; }
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
  /* Fields-only entries: the title field sits a little higher */
  margin-top: ${({ $noRule }) => ($noRule ? '8px' : 'var(--s-5, 20px)')};
`;

const CustomFieldsBody = styled.div<{ $nameInText?: boolean }>`
  /* Editor wrappers/rows: no extra gap — each field row carries its own padding. */
  & > div { gap: 0 !important; }
  /* The name is the text area's first line now: the forms' own title box stays out */
  /* …and whatever comes after it (a task's Todo List, which sets its own 30px) starts
     straight away, so the fields begin right under the writing area. When the title
     sits alone in a section of its own (TaskFields), that section goes too */
  ${({ $nameInText }) => ($nameInText ? `& ${TitleField} { display: none; } & ${TitleField} + * { margin-top: 0 !important; } & section:has(> ${TitleField}:only-child) { display: none; } & section:has(> ${TitleField}:only-child) + * { margin-top: 0 !important; }` : '')}
`;

const EditorArea = styled.div<{ $hidden?: boolean; $quick?: boolean; $titled?: boolean; $roomy?: boolean; $journalTitle?: boolean }>`
  /* One look in the journal and the Quick entry: the formatting bar on the card's
     colour, no rule above it, room under it before the text */
  & ${ToolbarRow} { margin-bottom: 28px; padding-top: 0; border-top: none; background: var(--editor-surface); }
  /* Name-led topics: the first line is the entry's name, set like a title */
  ${({ $titled }) => ($titled ? `
    .tiptap > :first-child, .tiptap > p.is-editor-empty:first-child::before {
      font-family: var(--font-display);
      font-size: 22px;
      font-weight: 300;
      line-height: 1.75;
    }
    .tiptap > :first-child { margin-bottom: 0.5em; }
  ` : '')}
  /* A journal entry (the journal and the Quick entry): its first line is its title —
     larger, with a hairline under it — once something is written; until then the
     "Enter title/text..." placeholder is the standard text size. A little room
     between its paragraphs */
  ${({ $journalTitle }) => ($journalTitle ? `
    .tiptap > :first-child:not(.is-editor-empty) {
      font-family: var(--font-display);
      font-size: 28px;
      font-weight: 300;
      line-height: 1.35;
    }
    .tiptap > :first-child:not(:only-child) {
      padding-bottom: 16px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .tiptap > p + p { margin-top: 1em; }
    /* No line length of its own: the writing runs the card's width (TEXT_ROW_MAX, 1000px) */
  ` : '')}
  display: ${({ $hidden }) => ($hidden ? 'none' : 'flex')};
  flex-direction: column;
  /* clip, not hidden: hidden would make this a scroll box of its own and the
     formatting bar would stick to it instead of the scrolling body */
  overflow: clip;
  /* What the sticky formatting bar paints behind itself: the card */
  --editor-surface: var(--bg-panel);
  /* Plain text on the card, only as tall as what's written (it grows as you type) */
  .tiptap { min-height: 0; padding: 0; font-size: 16px; line-height: 1.6; color: var(--text-primary); }
  /* The Quick entry with nothing but text (Journal, a topic with no fields): room to write */
  ${({ $roomy }) => ($roomy ? '.tiptap { min-height: 76px; }' : '')}
`;

/* The formatted recipe page, inset like the card's rows (36px a side, 20px on a narrow card) */
const RecipePad = styled.div`
  padding: 20px 36px 32px;
  @container entrycard (max-width: 600px) { padding: 16px 20px 24px; }
`;

/* The photos' row, lined up with the text (the entry card's side margins) */
const PhotosRow = styled.div<{ $foot?: boolean }>`
  padding: ${({ $foot }) => ($foot ? '28px' : '0')} 36px 20px;
  @media (max-width: 640px) { padding: ${({ $foot }) => ($foot ? '22px' : '0')} 20px 18px; }
`;

/* "Done editing — view recipe" — accent text button above the recipe fields. */
const ViewRecipeBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  /* Lined up with the card's rows (36px in, 20px on a narrow card) */
  margin: 18px 36px 14px;
  @container entrycard (max-width: 600px) { margin: 14px 20px 10px; }
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

/* Phones: the "Saved" note is dropped (a save failure still shows) */
const StatusSlot = styled.span<{ $failed?: boolean }>`
  display: contents;
  @media (max-width: 768px) { display: ${({ $failed }) => ($failed ? 'contents' : 'none')}; }
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
  html[data-theme='light'] & { text-transform: none; letter-spacing: normal; font-size: 13px; }
`;

const StatusText = styled.span`
  font-family: var(--font-sans);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--danger, #c0392b);
  html[data-theme='light'] & { text-transform: none; letter-spacing: normal; font-size: 13px; }
`;

const SaveButton = styled.button<{ $disabled?: boolean }>`
  padding: 7px 22px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ $disabled }) => $disabled ? 'var(--text-disabled)' : 'var(--color-accent-line)'};
  background: transparent;
  border: 1px solid ${({ $disabled }) => $disabled ? 'var(--border-default)' : 'var(--color-accent-line)'};
  border-radius: var(--r-full, 999px);
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'pointer'};
  transition: background 150ms, color 150ms;
  &:hover:not(:disabled) { background: var(--color-accent-subtle); }
  /* Light: the page's one solid focal point — a filled deep-accent pill, white text, sentence case */
  html[data-theme='light'] & {
    text-transform: none; letter-spacing: normal; font-size: 14px; font-weight: 600;
    ${({ $disabled }) => ($disabled ? '' : 'background: var(--color-accent-line); border-color: var(--color-accent-line); color: #fff;')}
  }
  html[data-theme='light'] &:hover:not(:disabled) { ${({ $disabled }) => ($disabled ? '' : 'background: var(--color-accent-active); border-color: var(--color-accent-active);')} }
  @media (max-width: 768px) {
    order: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
`;

/* ── The task card (journal and Quick entry) ── */

/* Its head: the topic picker and Single task | To-do list, full screen / close at the right; a rule under it */
const TaskHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  padding: 18px 26px;
  position: relative;
  z-index: 5; /* the topic menu drops over the rows */
  /* The journal: full screen / close 30px in from the pane's edge */
  /* …and a little more room under the row, above its rule */
  &[data-journal] { padding-top: 28px; padding-right: 30px; padding-bottom: 14px; margin-bottom: 32px; }
  /* The journal: a rule under the row, between the content's edges (--head-x: 26px on a task card, the card's 36px elsewhere) */
  &[data-journal]::after, [data-quick-open] > &::after {
    content: '';
    position: absolute;
    left: var(--head-x, 26px);
    right: var(--head-x, 26px);
    bottom: 0;
    border-bottom: 1px solid var(--border-card);
    pointer-events: none;
  }
  /* The journal's rule in the same tone as the hairline above its Save row (JournalFoot) */
  &[data-journal]::after { border-bottom-color: var(--border-subtle); }
  /* The Quick entry: the same rule under the picker row, a little room under it */
  [data-quick-open] > & { margin-bottom: 10px; }
  [data-quick-open] > &::after { border-bottom-color: var(--border-subtle); } /* the field rows' line tone (above Tags) */
  /* Full width: room between the topic picker / close row and the entry under it */
  @media (min-width: 1025px) { &[data-full] { margin-bottom: 32px; } }
  /* Phones / tablets: snug under the "Entry list" row above it */
  ${NAV_COMPACT} { &[data-journal] { padding-top: 18px; } }
  /* The Quick entry: the topic picker a little further down from the card's top */
  &:not([data-journal]) { padding-top: 26px; }
  /* Close: a round button with the reminders bell's fill and a light outline round its edge —
     the dark smoked glass in dark, the panel colour with a light shadow in light */
  && button[aria-label='Close'] {
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 50%;
    background: rgba(18, 20, 26, 0.5);
    color: #fff;
  }
  && button[aria-label='Close']:hover { background: rgba(18, 20, 26, 0.66); }
  html[data-theme='light'] && button[aria-label='Close'] {
    border-color: var(--border-subtle);
    background: var(--bg-panel);
    box-shadow: 0 1px 3px rgba(20, 24, 32, 0.08);
    color: var(--text-secondary);
  }
  html[data-theme='light'] && button[aria-label='Close']:hover { color: var(--text-primary); }
  ${NAV_COMPACT} { &[data-journal] { padding-right: 30px; } }
  & > :last-child:not(:first-child):not([role='radiogroup']) { margin-left: auto; }
  @container entrycard (max-width: 560px) { padding: 14px 18px; }
`;

/* The rows under the head */
const TaskBody = styled.div`
  padding: 10px 26px 12px;
  @container entrycard (max-width: 560px) { padding: 8px 18px 10px; }
`;

/* The title in a box: the writing area, then its Status and the tools under a hairline */
const TitleBox = styled.div`
  min-width: 0;
  border: 1px solid var(--border-card);
  border-radius: 14px;
  /* An outline only — no fill */
  background: transparent;
  overflow: clip;
  &&&& ${EditorArea} { --editor-surface: transparent; margin: 0; padding: 22px 16px 36px 22px; border: none; border-radius: 0; }
  /* Typing never lights it up: no accent outline on the box or the writing area */
  && .tiptap:focus, && .tiptap:focus-visible, && [contenteditable]:focus, && [contenteditable]:focus-visible { outline: none; box-shadow: none; }
`;

const TitleFoot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
  padding: 10px 10px 18px 16px;
  border-top: 1px solid var(--border-card);
  /* No fill of its own: the box's colour, ruled off by the hairline above */
  background: transparent;
`;

const TitleTools = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  /* A little faded, brightening on hover */
  & > button, & > div > button { width: 36px; height: 36px; color: color-mix(in srgb, var(--text-secondary) 62%, transparent); }
  & > button:hover:not(:disabled), & > div > button:hover:not(:disabled) { color: var(--text-primary); }
  & > button[aria-pressed="true"] { color: var(--color-accent); }
`;

/* The foot's left side: the tools (a topic with no text box) and Delete */
const FootLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

/* Shared with AI or hidden from it: the AI sparkle, with a slash drawn through it once
   the entry is hidden. The slash is a line of our own (the icon font has no crossed-out
   sparkle), ringed in the surface colour so it reads against the glyph. */
const AiMark = styled.span<{ $off: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  &::after {
    content: '';
    display: ${({ $off }) => ($off ? 'block' : 'none')};
    position: absolute;
    left: 50%;
    top: 50%;
    width: 24px;
    height: 1.6px;
    border-radius: 1px;
    background: currentColor;
    box-shadow: 0 0 0 1.5px var(--editor-surface, var(--bg-app));
    transform: translate(-50%, -50%) rotate(-45deg);
  }
`;

/* Delete at the foot's left: the trash and the word, in the danger colour */
const TaskDelete = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--color-danger);
  cursor: pointer;
  &:hover { opacity: 0.8; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 4px; }
`;

/* ── Quick entry (dashboard) ── */

/* No card: written straight on the page (on the photo, when there's a
   wallpaper — photoTokens turn its text and lines white there) */
const QuickCard = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-family: var(--font-sans);
`;

/* Everything under the question — the fields, the writing area, the tools and
   Save entry — in one frosted card */
/* The entry card (the Quick entry and the journal): the writing area as its
   title row (the T / pencil / mic tools at its top right), then the topic's
   fields as full-width rows — a small tracked-capitals label on the left, the
   field on the right, hairlines edge to edge — and a tinted foot with Save */
const CARD_X = '36px';
const LABEL_COL = '200px';
/** The widest a field gets beside its label: a topic's fields stay a readable width in a wide editor
    (a topic that is only text — Journal — has no fields; its card is TEXT_ROW_MAX wide instead) */
const FIELD_MAX = '600px';
const FIELD_COL = `minmax(0, ${FIELD_MAX})`;
/** A card with fields (journal) as wide as its rows: label, gap, field and the card's sides — its head, rules and foot with it (a text-only topic keeps the full width) */
export const FIELDS_ROW_MAX = `calc(${LABEL_COL} + 24px + ${FIELD_MAX} + 2 * ${CARD_X})`;
/** The same for the task card: its 140px names and 26px sides (TaskRow, TaskBody) */
export const TASK_ROW_MAX = `calc(140px + 24px + ${FIELD_MAX} + 2 * 26px)`;
/** A topic that is only text (Journal, a plain topic): its card in the journal is at most 1000px */
export const TEXT_ROW_MAX = '1000px';

/* Every other topic's text: a row like the fields' (their 200px label column), the writing area
   in the task card's box with the tools under it */
const TextRow = styled.div`
  display: grid;
  grid-template-columns: ${LABEL_COL} ${FIELD_COL};
  column-gap: 24px;
  align-items: start;
  padding: 20px ${CARD_X} 32px;
  & > :first-child { ${cardLabel} padding-top: 22px; }
  @container entrycard (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 10px;
    padding: 16px 20px 18px;
    & > :first-child { padding-top: 0; }
  }
`;

/* A topic that is only text (no fields of its own): the writing area alone — no label or box —
   its tools in the foot's left beside Delete */
const PlainText = styled.div`
  padding: 18px ${CARD_X} 6px;
  @container entrycard (max-width: 600px) { padding: 14px 20px 4px; }
  &&&& ${EditorArea} { --editor-surface: transparent; margin: 0; padding: 0; border: none; border-radius: 0; }
  && .tiptap:focus, && .tiptap:focus-visible, && [contenteditable]:focus, && [contenteditable]:focus-visible { outline: none; box-shadow: none; }
`;

/* A text-only entry's tags: their own line well under the writing, ruled off from it by a hairline
   that runs between the card's side margins */
const TagsLine = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin: 80px ${CARD_X} 0;
  padding: 20px 0 20px;
  border-top: 1px solid var(--border-subtle);
  & > :first-child { ${cardLabel} }
  @container entrycard (max-width: 600px) { margin: 56px 20px 0; padding: 16px 0; }
`;

const cardRows = css`
  /* Every field group is a row: its head (the label) in the left column, the field on the right */
  & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) {
    display: grid;
    grid-template-columns: ${LABEL_COL} ${FIELD_COL};
    column-gap: 24px;
    align-items: start;
    margin: 0 !important;
    padding: 20px ${CARD_X};
    border-top: 1px solid var(--border-subtle);
  }
  & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > * { grid-column: 2; min-width: 0; margin-top: 0; }
  & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > * + * { margin-top: 12px; }
  /* Links and buttons sitting in a row (+ Add notes, + Add exercises…) keep to the left, not stretched */
  & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > button { justify-self: start; }
  & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > :first-child:not(:only-child) {
    grid-column: 1;
    grid-row: 1 / span 20;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    padding-top: 9px;
  }
  & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > :first-child:not(:only-child) > :first-child { ${cardLabel} }
  /* A row whose field is a date | time box (When): the label sits on the date's own line of text, not above it.
     The box starts 12px down the row (the fields' own top margin) and is 52px tall, so its text is centred 38px
     down — the 12px label, on its ~16px line, goes 30px down to meet it */
  & ${CustomFieldsBody} section:has(${DateTimeBox}):not(${CustomFieldsBody} section section) > :first-child:not(:only-child) { padding-top: 30px; }
  & ${SectionLabel}, & ${RowLabel} { ${cardLabel} }
  /* A group that runs the card's width (the meal's Nutrition panel, a media item's cover + details) */
  & ${CustomFieldsBody} section[data-card-wide]:not(${CustomFieldsBody} section section) > * { grid-column: 1 / -1; grid-row: auto; }
  /* A group whose only content is the (hidden) title box: no row at all */
  && ${CustomFieldsBody} section:has(> ${TitleField}:only-child) { display: none; }
  /* Forms built from labelled rows: the same rows, no box of their own */
  & ${CustomFieldsBody} > * > ${RowBox} { margin: 0 !important; border: none; border-radius: 0; overflow: visible; }
  && ${CustomFieldsBody} > * > ${RowBox} > ${LabelledRow} {
    grid-template-columns: ${LABEL_COL} ${FIELD_COL};
    column-gap: 24px;
    min-height: 68px;
    padding: 12px ${CARD_X};
    border-top: 1px solid var(--border-subtle);
  }
  /* A switch card (On my habits, Currently taking, Sync to calendar…): a row too */
  & .card-row {
    margin: 0 !important;
    padding: 18px ${CARD_X};
    border: none;
    border-top: 1px solid var(--border-subtle);
    border-radius: 0;
  }
  /* A row split in two (Task's Deadline | Planned for): the halves side by side, the
     first keeping the label column so its field lines up with the rows above */
  &&& ${CustomFieldsBody} > * > ${RowBox} > .card-split { grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: calc(${LABEL_COL} + ${FIELD_MAX} + 24px + 2 * ${CARD_X}); column-gap: 0; padding: 0; }
  &&& ${CustomFieldsBody} > * > ${RowBox} > .card-split > :first-child { grid-template-columns: ${LABEL_COL} minmax(0, 1fr); column-gap: 24px; padding: 12px 24px 12px ${CARD_X}; }
  &&& ${CustomFieldsBody} > * > ${RowBox} > .card-split > :first-child + * { padding: 12px ${CARD_X} 12px 24px; }
  /* Wrappers that only group rows (Routine's Duration | Times) step aside */
  & .card-contents { display: contents; }
  /* Anything else a form puts between its rows keeps the card's side margins */
  & ${CustomFieldsBody} > * > :not(section):not(${RowBox}):not(${TitleField}):not(.card-row):not(.card-contents) {
    margin-inline: ${CARD_X};
  }
  @container entrycard (max-width: 600px) {
    & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section), && ${CustomFieldsBody} > * > ${RowBox} > ${LabelledRow} {
      grid-template-columns: minmax(0, 1fr); row-gap: 10px; padding: 16px 20px;
    }
    & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > *, & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > :first-child:not(:only-child) { grid-column: 1; grid-row: auto; }
    & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > :first-child:not(:only-child) { flex-direction: row; flex-wrap: wrap; padding-top: 0; }
    /* Stacked, the When label sits over its box like the others */
    & ${CustomFieldsBody} section:has(${DateTimeBox}):not(${CustomFieldsBody} section section) > :first-child:not(:only-child) { padding-top: 0; }
    & ${CustomFieldsBody} section:not(${CustomFieldsBody} section section) > * + * { margin-top: 10px; }
    & .card-row { padding: 16px 20px; }
    & ${CustomFieldsBody} > * > :not(section):not(${RowBox}):not(${TitleField}):not(.card-row):not(.card-contents) { margin-inline: 20px; }
  }
`;

/* The Quick entry: the form fading in under the question once a topic is picked */
const quickFade = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
`;

const EntryCard = styled.div<{ $quick?: boolean; $flat?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--border-card);
  border-radius: 14px;
  background: var(--bg-panel);
  overflow: clip;
  /* Its rows stack (label over field) by the card's own width, not the window's */
  container: entrycard / inline-size;
  /* The journal: no card — the same rows, edge to edge in the editor pane */
  ${({ $flat }) => ($flat ? css`
    border: none;
    border-radius: 0;
    background: transparent;
    overflow: visible;
    /* The formatting bar paints the page, not a card */
    && ${EditorArea} { --editor-surface: var(--bg-app); padding-top: 18px; }
  ` : '')}
  ${({ $quick }) => ($quick ? css`
    margin-top: 24px;
    /* Its contents a little further in from the left edge than the journal's */
    padding-left: 10px;
    @media (max-width: 600px) { padding-left: 6px; }
    /* Not clipped: the topic menu in its first line drops out past the card's foot,
       over what follows it (the foot band rounds its own corners instead) */
    overflow: visible;
    z-index: 6;
    /* Open: the form fades in under the question */
    &[data-quick-open] { animation: ${quickFade} 320ms ease-out; }
    @media (prefers-reduced-motion: reduce) { &[data-quick-open] { animation: none; } }
    /* Frosted glass: the panel colour at 70% with the photo blurred behind it, so it
       reads as glass on the photo rather than a grey slab over it (the other cards sit
       off the photo and stay solid); the formatting bar stays clear on it — 92%, nearly solid */
    background: color-mix(in srgb, var(--bg-panel) 92%, transparent);
    -webkit-backdrop-filter: blur(16px) saturate(1.1);
    backdrop-filter: blur(16px) saturate(1.1);
    && ${EditorArea} { --editor-surface: transparent; }
    /* Light: the page's own colour, solid (no glass) */
    html[data-theme='light'] && { background: var(--bg-app); -webkit-backdrop-filter: none; backdrop-filter: none; }
    /* Typing in the Quick entry never highlights the writing area: no focus outline
       in the accent (the global [tabindex]:focus-visible rule) on the editor */
    && .tiptap:focus, && .tiptap:focus-visible, && [contenteditable]:focus, && [contenteditable]:focus-visible { outline: none; box-shadow: none; }
    /* No outline: the same soft shadow as the other dashboard cards
       */
    border-color: transparent;
    box-shadow: var(--shadow-card); /* even, all the way round the card */
    /* "Enter title/text..." a step brighter than the tools beside it */
    && input::placeholder, && textarea::placeholder, && .tiptap p.is-editor-empty:first-child::before { color: var(--text-secondary); opacity: 0.8; }
    @media (max-width: 768px) { margin-top: 18px; }
    /* The title / text box has no outline here (the card is its frame); its tools strip stays */
    && ${TitleBox} { border-color: transparent; border-radius: 0; }
    /* …so its tools strip starts at the hairline's left end: the Status pill flush with it */
    && ${TitleFoot} { padding-left: 0; }
    /* With no Status, the T tool leads: its icon (not its button's padding) on the edge */
    && ${TitleFoot} > ${TitleTools}:first-child { margin-left: -9px; }
    /* …and the writing (and its placeholder) starts level with the row's label: its left edge and top */
    &&&&& ${TitleBox} ${EditorArea} { padding-left: 0; padding-top: 18px; }
  ` : '')}
  /* The writing area is the card's title row; the tools sit at its top right */
  && ${EditorArea} { margin: 0; padding: 28px ${CARD_X} 22px; border: none; border-radius: 0; }
  && ${EditorArea} .tiptap { padding-bottom: 0; }
  &&[data-tools-beside] ${EditorArea} { padding-right: 150px; }
  /* The Quick entry: the question is the card's first line, the writing straight under it,
     its "Enter title/text..." the standard text size (the title grows once it's written) */
  && > [data-card-prompt] ~ ${EditorArea} { padding-top: 20px; }
  &&&[data-card-prompt-centered]:not(:has(.tiptap:focus)) ${EditorArea} .tiptap p.is-editor-empty:first-child::before { opacity: 0; }
  @container entrycard (max-width: 600px) {
    && ${EditorArea} { padding: 22px 20px 18px; }
    &&[data-tools-beside] ${EditorArea} { padding-right: 124px; }
  }
  /* Placeholders faded (each field keeps its own hint);
     the topic menu's search (in QuickPrompt) keeps its own */
  & input::placeholder, & textarea::placeholder { color: var(--text-muted); font-style: normal; opacity: 0.55; }
  && .tiptap p.is-editor-empty:first-child::before { font-style: normal; color: var(--text-muted); opacity: 0.55; }
  /* The fields: straight under the title row, as the card's rows */
  && ${CustomFieldsSection} { margin: 0; padding: 0; border: none; }
  /* The journal: a little more room between the writing and the fields, and its
     placeholders a step brighter */
  ${({ $flat }) => ($flat ? css`
    && ${CustomFieldsSection}[data-after-text] { margin-top: 16px; }
    && .tiptap p.is-editor-empty:first-child::before, & input::placeholder, & textarea::placeholder { opacity: 0.85; }
  ` : '')}
  ${cardRows}
`;

/* The Quick entry's finance forms (Bill, Spending): a card like the entry card, their rows edge to edge */
const QuickExtraBox = styled.div`
  margin-top: 24px;
  /* Not clipped: the topic menu in its first line (the question) drops out past it,
     over what follows; the form under it clips itself (QuickExtraForm) */
  position: relative;
  z-index: 6;
  border-radius: 14px;
  /* Frosted like the Quick entry card: the panel colour at 92%, the photo blurred behind */
  background: color-mix(in srgb, var(--bg-panel) 92%, transparent);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  backdrop-filter: blur(16px) saturate(1.1);
  box-shadow: var(--shadow-card); /* even, all the way round the card */
  /* Light: the page's own colour, like the Quick entry card */
  html[data-theme='light'] && { background: var(--bg-app); -webkit-backdrop-filter: none; backdrop-filter: none; }
  /* Its joined switches (Bill | Subscription, Active / Paused / Cancelled): clear on the
     glass, no frosted fill of their own */
  && [role='radiogroup'], html[data-wallpaper] && [role='radiogroup'] {
    background: transparent;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  /* …and the chosen one's fill faded */
  && [role='radiogroup'] [aria-checked='true'] { background: color-mix(in srgb, var(--bg-tab-active) 45%, transparent); }
  @media (max-width: 640px) { margin-top: 18px; }
`;

/* Bill / Spending's form under the question: its rows run edge to edge, its foot band
   rounded with the card's bottom corners */
const QuickExtraForm = styled.div`
  overflow: clip;
  border-radius: 0 0 14px 14px;
`;

/* The card's foot: a tinted band — what's left of the footer on the left, Save on the right */
const CardFoot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
  padding: 14px 24px 14px ${CARD_X};
  /* The same tone as the rule under the topic picker row */
  border-top: 1px solid var(--border-default);
  background: var(--bg-app);
  & > :last-child { margin-left: auto; }
  @media (max-width: 640px) { padding: 12px 20px; }
`;

/* "What would you like to write down? a journal entry ⌄" — thin italic Work
   Sans, the topic picker inline as underlined words */
/* "What would you like to write down? a journal entry ⌄" — thin italic Work Sans,
   the topic picker inline as underlined words (the Quick entry and the journal) */
const PromptLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 16px;
  min-width: 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 300;
  font-style: italic;
  line-height: 1.5;
  color: var(--text-primary);
  /* Above the writing area, so the topic menu drops over it */
  position: relative;
  z-index: 5;
  & > h2 { margin: 0; font: inherit; color: inherit; }
  /* The picker: the chosen topic as words over a hairline, a small chevron */
  & > div > button {
    gap: 16px;
    padding: 0 6px 6px;
    border: none;
    border-bottom: 1px solid var(--border-default);
    border-radius: 0;
    background: none;
    font: inherit;
    font-style: normal; /* the picker's words are upright, never italic */
    text-transform: none;
    color: var(--color-accent-soft);
  }
  /* Hover changes nothing — the underline keeps its colour */
  & > div > button:hover { background: none; border-bottom-color: var(--border-default); }
  & > div > button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  & > div > button > span:last-child { font-size: 12px; color: inherit; }
  & > div > div { font-style: normal; font-family: var(--font-sans); font-weight: 400; text-shadow: none; }
  & input::placeholder { color: var(--text-placeholder, var(--text-muted)); opacity: 1; }
  @media (max-width: 768px) { font-size: 20px; }
  @media (max-width: 400px) { font-size: 19px; }
`;

/* The journal's: a step smaller, beside the editor's actions */
const JournalPrompt = styled(PromptLine)`
  /* At the top of the writing area (no bar): 18px — a step under the entry's 22px
     title line — wrapping when the pane is narrow */
  font-size: 18px;
  column-gap: 8px;
  /* The picker's words without the underline here */
  & > div > button, & > div > button:hover { padding: 0; border-bottom: none; gap: 10px; }
  @media (max-width: 768px) { font-size: 17px; }
`;

/* The Quick entry's: on the photo — white text, its picker's menu dark */
const QuickPrompt = styled(PromptLine)`
  /* Centred, waiting or open, so it never jumps sideways when the form opens */
  justify-content: center;
  text-align: center;
  /* A little lower under the greeting */
  margin-top: 20px;
  @media (max-width: 640px) { margin-top: 12px; }
  /* A touch more room between the question and the card under it */
  margin-bottom: 2px;
  /* Phones: a little smaller */
  @media (max-width: 768px) { font-size: 18px; }
  @media (max-width: 400px) { font-size: 17px; }
  ${photoTokens}
  ${onPhoto}
  /* Over the photo the picker's words are bright white like the question (an accent
     can sink into a dark photo) */
  html[data-wallpaper] & > div > button { color: #fff; text-shadow: 0 1px 10px rgba(0, 0, 0, 0.35); }
  html[data-wallpaper][data-theme='light'] & > div > button { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28); }
  /* Its menu over the photo: the lines between topics barely there */
  html[data-wallpaper] & > div > div { --border-faint: rgba(255, 255, 255, 0.12); }
`;

/* Under the card: Save entry (and the tools when the writing area is hidden) */
const QuickFoot = styled(CardFoot)`
  /* The card doesn't clip (its topic menu drops out of it), so the tinted foot rounds its own corners */
  border-radius: 0 0 14px 14px;
  /* The card's own colour (the same glass as the rest of it), ruled off from the fields by a hairline */
  background: transparent;
  border-top: 1px solid var(--border-default);
  margin-top: 14px;
  /* Save entry: an accent outline with accent text once there's something to save (a quiet grey
     outline until then), filling in as a solid accent pill with dark text on hover and while pressed */
  && ${SaveButton}, html[data-theme='light'] && ${SaveButton} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    order: 0;
    height: 40px;
    padding: 0 28px;
    border: 1px solid var(--color-accent-line);
    border-radius: var(--r-full, 999px);
    background: transparent;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-accent-line);
    text-shadow: none;
    transition: background 150ms, border-color 150ms;
  }
  && ${SaveButton}:is(:hover, :active):not(:disabled), html[data-theme='light'] && ${SaveButton}:is(:hover, :active):not(:disabled) {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: #15181d;
  }
  && ${SaveButton}:disabled, html[data-theme='light'] && ${SaveButton}:disabled {
    border-color: var(--border-card);
    background: transparent;
    color: var(--text-muted);
  }
  @media (max-width: 480px) { && ${SaveButton} { padding: 0 24px; } }
`;

/* The journal's foot: the Quick entry's (Save entry a solid accent pill once there's
   something to save), on the page — no tinted band */
const JournalFoot = styled(CardFoot)`
  background: transparent;
  /* Pushed to the bottom of the pane when the entry is short (EdBody's min-height) */
  margin-top: auto;
  /* Close and Delete: outlines only — no white fill (light theme's --bg-control) */
  && button:not(${SaveButton}) { background: transparent; }
  && button:not(${SaveButton}):hover:not(:disabled) { background: var(--bg-hover); }
  /* Save entry: the strongest thing at the foot — filled in the accent with dark text
     (a quiet grey outline while there's nothing to save) */
  && ${SaveButton}:not(:disabled), html[data-theme='light'] && ${SaveButton}:not(:disabled) {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: #15181d;
  }
  && ${SaveButton}:hover:not(:disabled), html[data-theme='light'] && ${SaveButton}:hover:not(:disabled) {
    border-color: var(--color-accent-hover);
    background: var(--color-accent-hover);
    color: #15181d;
  }
`;

/* The journal's head (no bar): the question and topic picker, full screen / close on the
   right — clear of the corner reminders bell on wide screens */
/* The question and topic picker. Its icons sit at the pane's right edge, except
   in full screen, where they stop clear of the corner reminders bell. With no
   text area (Exercise, Wellness…) the fields get room under it. */
const JournalHead = styled.div<{ $expanded?: boolean; $roomy?: boolean }>`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  /* 28px on the right puts the close ×'s glyph on the content's 36px edge (its button is 34px round an 18px icon).
     Full width needs no extra room: the corner reminders bell isn't shown over a full-width editor */
  padding: 28px 28px 14px 36px;
  margin-bottom: 32px;
  /* A rule under the row, between the content's edges (the row's own padding differs left and right) */
  position: relative;
  &::after {
    content: '';
    position: absolute;
    left: 36px;
    right: 36px;
    bottom: 0;
    /* The same tone as the hairline above the Save row */
    border-bottom: 1px solid var(--border-subtle);
  }
  ${NAV_COMPACT} { padding-right: 24px; padding-top: 18px; }
  @media (max-width: 640px) {
    padding: 16px 12px 12px 20px;
    margin-bottom: ${({ $roomy }) => ($roomy ? '18px' : '8px')};
    &::after { left: 20px; right: 20px; }
  }
`;

const HeadIcons = styled.div`
  display: flex;
  gap: 4px;
  flex: none;
  & > button { width: 34px; height: 34px; color: var(--text-muted); }
`;

/* The tool row's left side: the entry's tools as plain icons */
const JournalTools = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: -8px;
  & > button, & > div > button { width: 36px; height: 36px; color: var(--text-secondary); }
  & > button[aria-pressed="true"] { color: var(--color-accent); }
`;

const JournalSaveSide = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;
`;

/* T, the pencil and the mic — plain, in the text colour */
const QuickTools = styled.div<{ $beside?: boolean }>`
  display: flex;
  gap: 2px;
  margin-left: -6px;
  /* Quiet tools (the writing comes first); full colour on hover */
  & > button { width: 34px; height: 34px; color: var(--text-muted); opacity: 0.8; }
  & > button:hover { opacity: 1; }
  & > button[aria-pressed="true"] { color: var(--color-accent); opacity: 1; }
  /* Beside the writing area, at its top right — in reach without scrolling down */
  ${({ $beside }) => ($beside ? `
    position: absolute;
    top: 24px;
    right: 24px;
    z-index: 3;
    margin-left: 0;
    @media (max-width: 640px) { top: 18px; right: 12px; }
  ` : '')}
`;

/* The Quick entry open: the question and topic picker as the card's first line, where
   the writing area's placeholder was (that placeholder is left empty) */
const QuickCardPrompt = styled(PromptLine)`
  /* A little room under the question before the writing starts */
  padding: 28px ${CARD_X} 12px;
  /* The journal picker's size: 18px, 17px on phones */
  font-size: 18px;
  [data-tools-beside] > & { padding-right: 150px; }
  @container entrycard (max-width: 600px) {
    padding: 22px 20px 10px;
    [data-tools-beside] > & { padding-right: 124px; }
  }
  @media (max-width: 768px) { font-size: 17px; }
  /* The question's words a little less bright than the text (the picker keeps its colour) */
  & > h2 { color: color-mix(in srgb, var(--text-primary) 72%, transparent); }
  /* The picker here: no underline */
  && > div > button, && > div > button:hover { border-bottom: none; padding-bottom: 0; }
  /* Gliding back up to the top once a topic is picked */
  transition: transform 260ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
  /* Nothing picked or written yet: the question sits halfway down the empty writing
     area (still aligned left), the field's placeholder hidden. Only moved down — it keeps its place in the
     card, so nothing is shortened or resized. Clicking into the field (or picking a
     topic) brings it back up */
  &[data-centered] {
    transform: translateY(var(--prompt-drop, 66px));
    & > h2 { pointer-events: none; }
  }
  @container entrycard (max-width: 600px) { &[data-centered] { --prompt-drop: 60px; } }
  [data-card-prompt-centered]:has(.tiptap:focus) > &[data-centered] { transform: none; }
  /* A rule under the picker row, between the card's content edges (both themes), with a
     little room before the writing starts */
  &[data-ruled] { position: relative; margin-bottom: 14px; }
  &[data-ruled]::after {
    content: '';
    position: absolute;
    left: ${CARD_X};
    right: ${CARD_X};
    bottom: 0;
    /* The same tone as the line above the Tags row and the other field rows */
    border-bottom: 1px solid var(--border-subtle);
    pointer-events: none;
  }
  @container entrycard (max-width: 600px) { &[data-ruled]::after { left: 20px; right: 20px; } }
`;

/* The Quick entry waiting: just the question and topic picker, bare on the page (no
   card) where the open form's question sits. Only choosing from the picker opens the form */
const QuickIdle = styled(QuickPrompt)`
  /* A little lower under the greeting, and room under it before what follows */
  margin-top: 20px;
  margin-bottom: 36px;
  @media (max-width: 640px) { margin-top: 12px; margin-bottom: 24px; }
  /* A light blur behind the line, fading out softly at its edges (no box edge shows) */
  &::before {
    content: '';
    position: absolute;
    inset: -90px -240px;
    z-index: -1;
    pointer-events: none;
    -webkit-backdrop-filter: blur(5px);
    backdrop-filter: blur(5px);
    /* Full only at the centre, then thinning gradually to nothing, so it blends out
       with no edge (eased stops, not a straight fade) */
    -webkit-mask-image: radial-gradient(closest-side, #000 0%, rgba(0, 0, 0, 0.85) 25%, rgba(0, 0, 0, 0.55) 50%, rgba(0, 0, 0, 0.25) 72%, rgba(0, 0, 0, 0.07) 88%, transparent 100%);
    mask-image: radial-gradient(closest-side, #000 0%, rgba(0, 0, 0, 0.85) 25%, rgba(0, 0, 0, 0.55) 50%, rgba(0, 0, 0, 0.25) 72%, rgba(0, 0, 0, 0.07) 88%, transparent 100%);
    /* Phones: kept inside the screen, so it never makes the page scroll sideways */
    @media (max-width: 768px) { inset: -44px -12px; }
  }
  /* A soft shadow under the words — firmer on the photo */
  & > h2, & > div > button { text-shadow: 0 1px 8px rgba(0, 0, 0, 0.16); }
  html[data-wallpaper] & > h2, html[data-wallpaper] & > div > button { text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45), 0 2px 16px rgba(0, 0, 0, 0.4); }
  /* Light: no glow around the words — just a tight, very light drop shadow */
  html[data-theme='light'] & > h2, html[data-theme='light'] & > div > button { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28) !important; }
`;

/* Only shown when a save fails */
const QuickError = styled.p`
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-danger);
`;

/* The media form, able to rename or remove a tag on every other media entry that has it
   (the open entry changes in its form). Its own component so the save hook only runs for
   media entries */
/* A milestone's form with its tasks saved for real (tick, attach, detach, create go to the server
   through useSaveFields / useCreateEntry) — its own component so the hooks only run for milestones.
   Before the milestone has an id, attached tasks are held in its fields (_attachTasks) and listed
   with the others; they're joined to it as soon as it's saved (here in the journal, in QuickEntry's
   save for the Quick entry) */
/* A goal's Habits row, saved for real: a habit joins or leaves the goal through its own
   `parentGoalId` (useSaveFields), and + New habit makes a Habit already on it. Its own
   component so useHabits only runs for a saved goal */
function GoalHabits({ goalId }: { goalId: number }) {
  const { habits, paused, entryOf } = useHabits();
  const saveEntryFields = useSaveFields();
  const openInJournal = useOpenInJournal();
  const createEntry = useCreateEntry();
  const setGoal = (habitId: number, parentGoalId: number | null) => {
    const e = entryOf.get(habitId);
    if (!e) return;
    const cf = ((e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
    void saveEntryFields(e, { ...cf, parentGoalId }).then(ok => { if (!ok) showFlash('Couldn’t save that habit. Try again.'); });
  };
  const all = [...habits, ...paused];
  const linked = all.filter(h => h.goalId === goalId)
    .map(h => ({ id: h.id, name: h.name, target: describeTarget(h, describeDays), paused: !h.active }));
  const attachable = habits.filter(h => h.goalId !== goalId).map(h => ({ id: h.id, name: h.name }));
  return (
    <LinkedHabits habits={linked} attachable={attachable} onOpen={id => openInJournal(id)}
      onDetach={id => setGoal(id, null)} onAttach={id => setGoal(id, goalId)}
      onCreate={name => {
        void createEntry({ name: HABIT_TOPIC, icon: HABIT_ICON }, name, { ...HABIT_DEFAULTS, habitName: name, parentGoalId: goalId })
          .then(id => { if (id === null) showFlash('That habit didn’t save. Try again.'); });
      }} />
  );
}

function MilestoneFieldsWithTasks({ entryId, linkedTasks = [], attachableTasks = [], ...props }: React.ComponentProps<typeof MilestoneFields> & { entryId?: number | null }) {
  const saveEntryFields = useSaveFields();
  const openInJournal = useOpenInJournal();
  const createEntry = useCreateEntry();
  const entries = useEntriesStore(st => st.decryptedEntries);
  const { values, onChange } = props;
  const pending = Array.isArray(values._attachTasks) ? values._attachTasks : [];
  const fieldsOf = (id: number) => {
    const e = entries.find(x => x.id === id);
    return e ? { e, cf: ((e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {} } : null;
  };
  const change = (taskId: number, patch: Record<string, unknown>) => {
    const f = fieldsOf(taskId);
    if (!f) return;
    void saveEntryFields(f.e, { ...f.cf, ...patch }).then(ok => { if (!ok) showFlash('Couldn’t save that task. Try again.'); });
  };
  const linkPatch = (id: number) => ({ parentMilestoneId: id, ...(values.parentGoalId ? { parentGoalId: values.parentGoalId } : {}) });

  // Saved now: join the tasks held for it, then let the field go
  useEffect(() => {
    if (!entryId || pending.length === 0) return;
    for (const id of pending) change(id, linkPatch(entryId));
    const { _attachTasks: _, ...rest } = values;
    onChange(rest as typeof values);
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shown: the tasks on it, then the ones held for it
  const held = pending.filter(id => !linkedTasks.some(t => t.id === id)).flatMap(id => {
    const f = fieldsOf(id);
    return f ? [{ id, title: stripHtml(f.e.content).slice(0, 60) || `Task #${id}`, isCompleted: !!f.cf.isCompleted }] : [];
  });
  const shown = [...linkedTasks, ...held];
  const attachable = attachableTasks.filter(t => !pending.includes(t.id));

  return (
    <MilestoneFields {...props} linkedTasks={shown} attachableTasks={attachable}
      onToggleTaskComplete={(id, done) => change(id, { isCompleted: done, ...(done ? { isInProgress: false, isBacklog: false } : {}) })}
      onUnlinkTask={id => (pending.includes(id)
        ? onChange({ ...values, _attachTasks: pending.filter(x => x !== id) })
        : change(id, { parentMilestoneId: null }))}
      onLinkTask={id => (entryId ? change(id, linkPatch(entryId)) : onChange({ ...values, _attachTasks: [...pending, id] }))}
      onOpenTask={id => openInJournal(id)}
      onCreateTask={title => {
        void createEntry({ name: 'Task', icon: 'circle-check' }, title, {
          taskDescription: title, isInProgress: false, isCompleted: false, isAutoMigrating: false,
          parentGoalId: values.parentGoalId ?? null, parentMilestoneId: entryId ?? null, deadline: '', priority: 'none',
        }).then(id => {
          if (id === null) { showFlash('That task didn’t save. Try again.'); return; }
          if (!entryId) onChange({ ...values, _attachTasks: [...pending, id] });
        });
      }} />
  );
}

function MediaFieldsWithTags({ entryId, ...props }: React.ComponentProps<typeof MediaFields> & { entryId?: number | null }) {
  const saveEntryFields = useSaveFields();
  // One rename at a time: a second waits for the first, so they never interleave
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const retag = (from: string, to: string | null): Promise<boolean> => {
    const run = queue.current.then(async () => {
      const result = await retagMedia(from, to, {
        entries: () => useEntriesStore.getState().decryptedEntries,
        mediaTopicIds: mediaTopicIds(useEntriesStore.getState().allTopics),
        skipId: entryId,
        save: saveEntryFields,
      });
      if (result === 'rolled-back') showFlash('Couldn’t change that tag on every item, so nothing was changed. Try again.');
      if (result === 'partial') showFlash('Couldn’t change that tag on every item, and some kept the change. Try again.');
      return result === 'done';
    });
    queue.current = run.catch(() => {});
    return run;
  };
  return <MediaFields {...props} onRenameTag={(from, to) => retag(from, to)} onRemoveTag={tag => retag(tag, null)} />;
}

/** The Quick entry's question, now the writing area's placeholder (the topic picker sits alone on the card's first line) */
const QUICK_QUESTION = 'What would you like to write down?';

/** The topic picker's words for a topic: its name in lower case ("journal", "exercise") */
export function quickTopicPhrase(name: string): string {
  return name.trim().toLowerCase() || 'journal';
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
  /** Save the entry, then start a timer on it (time-tracked topics). `fill` is what to save
   *  when nothing has been typed yet (a dated name), so the timer never waits on a title */
  onSaveAndStartTimer?: (fill?: { content: string; fields: Record<string, unknown> }) => Promise<void>;
  onAutoSave?: () => void;
  onDelete?: () => Promise<void>;
  onNew: () => void;
  onBookmark?: () => void;
  onShare?: () => void;
  /** Duplicate: open a copy as a new entry (⋯ More) */
  onDuplicate?: () => void;
  /** Hidden from AI (the In-App AI row's Hide checkbox; only offered while an AI is on) */
  aiHidden?: boolean;
  /** Present only while an AI is on (In-App AI or the Chronicles AI app) */
  onToggleAiHidden?: () => void;
  /** The entry's topic is on the "Don't share with AI" list (it's hidden whatever its own switch says) */
  aiHiddenByTopic?: boolean;
  onBack?: () => void;
  /** Recipe view actions (injected by JournalView) */
  /** Full-screen editor toggle in the toolbar (journal only — other views open expanded) */
  expanded?: boolean;
  /** Lay out full width (defaults to expanded) — false in the journal's modal card, where it's still "expanded" */
  fullWidth?: boolean;
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
  /** Move what stays in view when a photo is cropped (the featured banner, board avatars) */
  onImageFocus?: (key: string, x: number, y: number) => void;
  imageUploading?: boolean;
  imageError?: string;
  imagesReady?: boolean;
  /** 'quick': the dashboard's Quick entry — the same editor and fields in a
   *  card: the topic pill on top, Format / Draw / Dictate and
   *  Save entry under it (no top bar, images or Delete) */
  variant?: 'journal' | 'quick';
  /** Quick entry: choices beside the topics (Bill, Spending), the one chosen,
   *  and what shows in place of the writing area and Save while it's chosen */
  quickExtras?: { key: string; name: string; icon: string }[];
  quickExtra?: string | null;
  onQuickExtra?: (key: string) => void;
  quickExtraBody?: ReactNode;
  /** Quick entry: false = waiting, just the question centred in the card (the form
   *  opens once a topic is chosen from the picker); true = the form */
  quickOpen?: boolean;
}

export function EntryForm({
  entryId, content, onContentChange, topicId, onTopicChange, topics,
  customFields, onCustomFieldsChange, onSave, onSaveAndStartTimer, onAutoSave, onDelete, onNew,
  onBookmark, onShare, onDuplicate, aiHidden = false, onToggleAiHidden, aiHiddenByTopic = false, onBack, expanded, fullWidth = expanded, onToggleExpand, onClose,
  isEditing, isSaving, saveStatus, lastSavedAt, placeholder = 'Start writing...',
  dictationControlRef,
  images = [], featuredKey = null, onImagesSelected, onExistingImagesSelected, onImageRemoved, onSetFeatured, onImageFocus,
  imageUploading = false, imageError, imagesReady = false,
  variant = 'journal',
  quickExtras, quickExtra = null, onQuickExtra, quickExtraBody,
  quickOpen = true,
}: EntryFormProps) {
  const quick = variant === 'quick';
  // Quick entry: Escape, once open, clears it back to the question (as Clear does).
  // Heard on the document — after React's own handlers, so an Escape a field already
  // used (closing its own add box) is left alone — for a key pressed inside the Quick
  // entry, or with nothing focused at all (picking a topic swaps the picker out, which
  // leaves the focus on the page); never from another field on the page, a menu or
  // something portalled out of it (the drawing canvas, the lightbox)
  useEffect(() => {
    if (!quick || !quickOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const root = quickRef.current;
      const target = e.target as HTMLElement | null;
      const nothingFocused = target === document.body || target === document.documentElement;
      // The writing area: the editor itself marks every Escape handled (ProseMirror),
      // though nothing there uses it, so that mark doesn't count from in there
      const inEditor = !!target?.closest('.ProseMirror');
      if (e.key !== 'Escape' || (e.defaultPrevented && !inEditor) || e.isComposing || !root || !target) return;
      if (!nothingFocused && !root.contains(target)) return;
      if (target.closest('[role="listbox"], [role="menu"], [role="dialog"]')) return;
      e.preventDefault();
      onNew();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [quick, quickOpen, onNew]);

  // Quick entry: once it opens, the cursor goes to the first place to type (the writing
  // area, else the topic's first field) — once the editor has mounted
  const wasQuickOpen = useRef(quickOpen);
  useEffect(() => {
    const opened = quickOpen && !wasQuickOpen.current;
    wasQuickOpen.current = quickOpen;
    if (!quick || !opened) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const card = quickRef.current?.querySelector('[data-quick-open]');
        const target = card?.querySelector<HTMLElement>(
          '.tiptap[contenteditable="true"], textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])');
        target?.focus();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [quick, quickOpen]);
  // Quick entry: number fields read "0"; every other field keeps its own hint (Venue name, Attendees…)
  const quickRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = quickRef.current;
    if (!quick || !root) return;
    const apply = () => {
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach(el => {
        if (el.closest('[data-keep-placeholder]')) return;
        if (el instanceof HTMLInputElement && !['text', 'search', 'url', 'number', 'email', 'tel', ''].includes(el.type)) return;
        // Number fields (exercise stats, nutrients, amounts…) read just "0"
        if (el instanceof HTMLInputElement && (el.type === 'number' || el.inputMode === 'decimal' || el.inputMode === 'numeric')) {
          if (el.placeholder !== '0') el.placeholder = '0';
        }
      });
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder'] });
    return () => mo.disconnect();
  }, [quick]);
  // Time tracking on this entry (tasks, goals, milestones, exercise, Time Tracking activities)
  const timer = useTimeTracking(entryId);
  // Symptom chips: the built-in list plus the owner's own (encrypted setting)
  const [symptomChips, saveSymptomChips, chipsLoaded] = useEncryptedSetting<SymptomChipConfig>('symptomChips', EMPTY_SYMPTOM_CHIPS);
  // Task types: Regular task / Small victory plus the owner's own (encrypted setting)
  const [savedTaskTypes, saveTaskTypes, taskTypesLoaded] = useEncryptedSetting<string[]>('taskTypes', NO_TASK_TYPES);
  const taskTypes = Array.isArray(savedTaskTypes) ? savedTaskTypes.filter((t): t is string => typeof t === 'string') : NO_TASK_TYPES;
  // Goal categories: the built-in list plus the owner's own (see GoalFields)
  const [savedCategories, saveCategories, categoriesLoaded] = useEncryptedSetting<GoalCategoryConfig>('goalCategories', EMPTY_GOAL_CATEGORIES);
  const goalCategories = useMemo(() => parseGoalCategories(savedCategories), [savedCategories]);
  const goalCategoryNames = useMemo(() => goalCategoryList(goalCategories), [goalCategories]);
  const ownDictationRef = useRef<DictationControls | null>(null);
  const dictRef = dictationControlRef ?? ownDictationRef;
  const [listening, setListening] = useState(false);
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
    // Heard on the document (before the journal's window listener) and marked used,
    // so this Escape closes only the menu, never the whole entry
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMoreOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [moreOpen]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // No featured banner any more: photos show under the text. A recipe's formatted page
  // still leads with one — the one chosen before, else the first
  const recipePhoto = (featuredKey ? images.find(img => img.key === featuredKey) : undefined) ?? images[0] ?? null;
  const recipeFocus = recipePhoto && onImageFocus ? (x: number, y: number) => onImageFocus(recipePhoto.key, x, y) : undefined;
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
  const cycleTrackingEnabled = useUIStore(s => s.cycleTrackingEnabled);
  const calendarSyncEnabled = useUIStore(s => s.calendarSyncEnabled);

  const userFieldDefs = topicId != null ? (topicCustomFields[topicId] ?? []) : [];

  const selectedTopic = topics.find(t => t.id === topicId);
  const customType = topicKind(selectedTopic?.name);
  // Custom tags: text entries only (the journal, a plain topic, a topic with the person's own
  // fields) — never a task, goal or other built-in kind. Offered from every text entry's tags
  const tagsOn = !customType;
  const entryTags = tagsOf(customFields);
  // Worked out only when the tag box opens, never on every change to the journal
  const tagSuggestions = useCallback(() => {
    const typeOf = new Map(topics.map(t => [t.id, topicKind(t.name)]));
    return tagsInUse(entries
      .filter(e => !typeOf.get((e.metadata as Record<string, unknown> | undefined)?._taxonomyId as number))
      .map(e => (e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown> | undefined));
  }, [entries, topics]);
  const setEntryTags = (tags: string[]) => {
    const next = { ...customFields };
    if (tags.length) next.tags = tags; else delete next.tags;
    onCustomFieldsChange(next);
  };
  const tagsField = <EntryTagsField value={entryTags} getSuggestions={tagSuggestions} onChange={setEntryTags} />;
  // Every tag on the media shelf, for a media entry's Tags chips
  const mediaTagOptions = useMemo(() => {
    if (customType !== 'media') return [];
    const out: string[] = [];
    for (const e of entries) {
      const tags = ((e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown> | undefined)?.tags;
      if (!Array.isArray(tags) || (e.metadata as Record<string, unknown>)?._customFields === undefined) continue;
      for (const t of mediaTags(tags)) if (!out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t);
    }
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [entries, customType]);
  const aiReady = useAiReady();
  // Hidden from AI (its own switch or its topic): no Estimate button and no AI
  // fill of a media item's details. Nothing of it is sent, even on request
  const aiPrivacy = useAiPrivacy();
  const hiddenFromAi = isHiddenFromAi({ _taxonomyId: topicId, _aiHidden: aiHidden }, aiPrivacy);
  const calorieEstimate = useCalorieEstimate(
    customType === 'food' || customType === 'exercise' ? customType : null,
    content, customFields, onCustomFieldsChange, hiddenFromAi,
  );

  // Build goal options for milestone linking
  const goalOptions = useMemo(() => entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && topicKind(t.name) === 'goal';
    })
    .map(e => ({ id: e.id, title: stripHtml(e.content).slice(0, 60) || `Goal #${e.id}` })), [entries, topics, entryId]);

  // Build milestone options for task linking (include parentGoalId for cascading)
  const milestoneOptions = useMemo(() => entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && topicKind(t.name) === 'milestone';
    })
    .map(e => {
      const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
      return {
        id: e.id,
        title: stripHtml(e.content).slice(0, 60) || `Milestone #${e.id}`,
        parentGoalId: (cf?.parentGoalId as number) || undefined,
      };
    }), [entries, topics, entryId]);

  // Training plan categories, for Exercise / Routine's Training category
  const needsCategories = customType === 'exercise' || customType === 'routine';
  const trainingCategoryOptions = useMemo(() => {
    if (!needsCategories) return [];
    const planTopic = topics.find(t => topicKind(t.name) === 'training_plan');
    return categoryNames(trainingPlans(entries, planTopic?.id, stripHtml));
  }, [entries, topics, needsCategories]);

  // Build recipe options for shopping list linking
  const recipeOptions = useMemo(() => entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && topicKind(t.name) === 'recipe' && e.id !== entryId;
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
      return t && topicKind(t.name) === 'shopping_list' && e.id !== entryId;
    })
    .map(e => ({ id: e.id, title: stripHtml(e.content).slice(0, 60) || `Shopping List #${e.id}` })), [entries, topics, entryId]);

  // Build linked tasks for the current milestone (tasks whose parentMilestoneId === this entry)
  const linkedTasks = useMemo(() => entryId ? entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const cf = meta?._customFields as Record<string, unknown> | undefined;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && topicKind(t.name) === 'task' && cf?.parentMilestoneId === entryId;
    })
    .map(e => {
      const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
      return { id: e.id, title: stripHtml(e.content).slice(0, 60) || `Task #${e.id}`, isCompleted: !!cf?.isCompleted };
    }) : [], [entries, topics, entryId]);

  // Tasks that could be attached: not on this milestone, not done (newest first)
  const attachableTasks = useMemo(() => entries
    .filter(e => {
      const meta = e.metadata as Record<string, unknown>;
      const cf = meta?._customFields as Record<string, unknown> | undefined;
      const tid = meta?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && topicKind(t.name) === 'task' && (entryId == null || cf?.parentMilestoneId !== entryId) && !cf?.isCompleted;
    })
    .map(e => ({ id: e.id, title: stripHtml(e.content).slice(0, 60) || `Task #${e.id}` })), [entries, topics, entryId]);

  // Every task, for a task's Blocked by: the open ones are offered, and the rest
  // say whether a blocker has cleared (done, or not there any more)
  const blockerTasks = useMemo(() => customType !== 'task' ? [] : entries
    .filter(e => {
      const tid = (e.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
      const t = tid ? topics.find(tp => tp.id === tid) : undefined;
      return t && topicKind(t.name) === 'task';
    })
    .map(e => {
      const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
      return { id: e.id, title: stripHtml(e.content).trim().slice(0, 80) || builtinEntryName(cf ?? {}) || `Task #${e.id}`, isCompleted: !!cf?.isCompleted };
    }), [entries, topics, customType]);

  const userFieldValues = (customFields._userFields as Record<string, unknown>) ?? {};
  // Any filled-in field makes an entry saveable — topics without a text area
  // (books, exercise, custom topics with only yes/no fields…) must still save
  const isFilled = (v: unknown) => v !== '' && v != null && v !== false && !(Array.isArray(v) && v.length === 0);
  // (a new task's Idea / Backlog default alone doesn't make it saveable)
  const hasFieldValue = Object.entries(customFields).some(([k, v]) => !k.startsWith('_') && k !== 'isBacklog' && isFilled(v))
    || Object.values(userFieldValues).some(isFilled);
  const canSave = stripHtml(content).length > 0
    || hasFieldValue
    || builtinEntryName(customFields) !== ''
    || images.length > 0;

  // The main text area is hidden entirely (no affordance) for every topic
  // except Journal: built-in structured topics always, custom topics via
  // their "Hide main text field" option — the fields simply move up. That
  // option always wins: an entry's text (often just the generated field
  // summary) stays saved but hidden; Format / dictate / draw reveal it.
  // Otherwise existing text keeps the text area showing.
  const [notesExpanded, setNotesExpanded] = useState(false);
  useEffect(() => { setNotesExpanded(false); }, [entryId]);
  // Format reveals a hidden text area; closing it hides that space again
  // (text already written keeps it showing where the topic allows)
  const setFormatOpen = (open: boolean) => { setToolbarOpen(open); setNotesExpanded(open); };
  const hasTextContent = stripHtml(content).trim().length > 0 || content.includes('data-type="drawing"');
  const isJournalTopic = !selectedTopic || selectedTopic.name.toLowerCase() === 'journal';
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
  // Menu plans too: their text is just "Menu: Oct 12 – Oct 18"; and Priorities
  // lists ("Priorities: 10/18/2026")
  // Name-led topics (nameKey) show the text area: its first line IS the name
  const titleOnlyTopic = customType === 'shopping_list' || customType === 'menu_plan' || customType === 'priorities' || customType === 'wins';
  // Wellness is fields only: its auto-save writes a summary ("3/8 glasses · …")
  // as the text, which must not bring the text area back
  const editorCollapsed = !notesExpanded && (
    customType === 'wellness' || titleOnlyTopic ||
    (!hasTextContent && !isJournalTopic && !nameKey
      && (customType !== null || fieldLedTopic))
  );

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
  // A media item's photos sit at the foot of its card, after the cover and details
  const photosAtFoot = customType === 'media';
  // A quote typed into the text area (Quote field empty) moves into the field once
  const migratedQuoteRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isQuoteTopic || !quoteDef || entryId == null || migratedQuoteRef.current === entryId) return;
    migratedQuoteRef.current = entryId;
    if (!quoteValue && contentText && !contentIsSummary) {
      onCustomFieldsChange({ ...customFields, _userFields: { ...userFieldValues, [quoteDef.id]: contentText } });
    }
  }, [entryId, isQuoteTopic, quoteDef?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The name is the text area's first line (utils/nameFields): the name field —
  // or an own topic's leading Title / Name field — is kept as a copy written from
  // it, for everything that reads the field. Opening an entry whose first line
  // isn't its name (an older entry) puts the name in front, once.
  const customTitle = !fieldLedTopic && !summaryLedTopic && customType === null ? titleFieldOf(userFieldDefs) : undefined;
  const nameTarget = nameKey ?? (customTitle ? `_userFields.${customTitle.id}` : undefined);
  const storedName = nameKey ? nameValue
    : customTitle ? String(userFieldValues[customTitle.id] ?? '').trim() : '';
  // Switching to a Quote / Books topic after typing: the words go into its Quote / Title field
  const carriedTopicRef = useRef(topicId);
  useEffect(() => {
    if (carriedTopicRef.current === topicId) return;
    carriedTopicRef.current = topicId;
    if (!contentText || contentIsSummary) return;
    const ledTitle = (fieldLedTopic || summaryLedTopic) ? titleFieldOf(userFieldDefs) : undefined;
    if (isQuoteTopic && quoteDef && !quoteValue) {
      onCustomFieldsChange({ ...customFields, _userFields: { ...userFieldValues, [quoteDef.id]: contentText } });
    } else if (ledTitle && !String(userFieldValues[ledTitle.id] ?? '').trim()) {
      // Books / Music: a summary topic whose own Title field is the entry's name
      onCustomFieldsChange({ ...customFields, _userFields: { ...userFieldValues, [ledTitle.id]: contentText } });
    }
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps
  const repairedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!nameTarget) return;
    const key = `${entryId}:${nameTarget}`;
    if (repairedRef.current !== key) {
      repairedRef.current = key;
      if (storedName && nameFromContent(content) !== storedName.slice(0, NAME_MAX)) {
        onContentChange(contentWithName(content, storedName));
        return;
      }
    }
    const line = nameFromContent(content);
    // A new task starts as Idea / Backlog (one write with the name, so neither change is lost)
    const backlogDefault = customType === 'task' && entryId == null
      && !['isBacklog', 'isInProgress', 'isCompleted'].some(k => k in customFields);
    if (line === storedName && !backlogDefault) return;
    if (nameKey) onCustomFieldsChange({ ...customFields, [nameKey]: line, ...(backlogDefault ? { isBacklog: true } : {}) });
    else if (customTitle) onCustomFieldsChange({ ...customFields, _userFields: { ...userFieldValues, [customTitle.id]: line } });
  }, [content, entryId, nameTarget]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving a summary-led topic (e.g. Exercise → Journal) takes its generated
  // line with it, so "Running · 30 min" never lingers as another topic's text
  const prevTopicRef = useRef(topicId);
  useEffect(() => {
    if (prevTopicRef.current === topicId) return;
    prevTopicRef.current = topicId;
    const last = lastSummaryRef.current;
    if (!summaryLedTopic && last.id === entryId && last.text && contentText === last.text) {
      lastSummaryRef.current = { id: entryId, text: '' };
      onContentChange('');
    }
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!summaryLedTopic) return;
    lastSummaryRef.current = { id: entryId, text: fieldSummary };
    if (fieldSummary && contentIsSummary && contentText !== fieldSummary) {
      onContentChange(`<p>${escapeHtml(fieldSummary)}</p>`);
    }
  }, [fieldSummary, entryId, summaryLedTopic]); // eslint-disable-line react-hooks/exhaustive-deps

  const editorHidden = editorCollapsed || recipeViewMode || (summaryHidesEditor && !notesExpanded);
  // Quick entry: a new topic starts with the formatting bar closed
  useEffect(() => {
    if (!quick) return;
    setToolbarOpen(false);
    setNotesExpanded(false);
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const saveButton = (
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
  );


  // Exercise and an exercise routine: the Time panel opens from a stopwatch beside Duration (no Time section of their own)
  const exerciseTimer = !['exercise', 'routine', 'goal', 'milestone'].includes(customType ?? '') ? undefined : quick
    ? (onSaveAndStartTimer ? (
      <TimeTracker
        sessions={[]} totalMs={0} running={false} otherRunning={timer.otherRunning} now={timer.now}
        disabled={isSaving || !timer.loaded}
        onStart={() => void onSaveAndStartTimer(canSave ? undefined : timerFill(customType, nameKey, new Date()))} onStop={timer.stop} onAdd={() => {}} onRemove={() => {}}
        noAdd
        note={timer.otherRunning ? 'Starting the timer saves this entry and stops the one running now.' : 'Starting the timer saves this entry.'}
      />
    ) : undefined)
    : (
      <TimeTracker
        sessions={timer.sessions} totalMs={timer.totalMs} running={timer.running} otherRunning={timer.otherRunning} now={timer.now}
        disabled={(entryId === null && !onSaveAndStartTimer) || isSaving || !timer.loaded}
        onStart={entryId === null && onSaveAndStartTimer
          ? () => void onSaveAndStartTimer(canSave ? undefined : timerFill(customType, nameKey, new Date()))
          : timer.start}
        onStop={timer.stop} onAdd={timer.addManual} onRemove={timer.remove}
        note={entryId === null && onSaveAndStartTimer ? 'Starting the timer saves this entry.' : undefined}
        onUseAsDuration={customType === 'exercise' ? m => onCustomFieldsChange({ ...customFields, duration: String(m) }) : undefined}
      />
    );

  // The writing area itself (in the body below, or in a task card's title box)
  const editorEl = (
    <Editor
      content={content}
      onChange={onContentChange}
      // The Quick entry asks its question in the writing area itself
      placeholder={quick && customType !== 'task' ? QUICK_QUESTION : !nameTarget ? placeholder
        : (nameKey && customType ? NAME_PLACEHOLDER_BY_TYPE[customType] : customTitle?.label) || placeholder}
      onEnterSave={canSave && !isSaving ? onSave : undefined}
      toolbarOpen={toolbarOpen}
      onToolbarToggle={setFormatOpen}
      hideToolbarToggle
      dictationControlRef={dictRef}
      drawingControlRef={drawingControlRef}
      onDictationChange={quick ? setListening : undefined}
    />
  );

  // The writing area and the topic's fields — the same in both layouts. Every topic but a task
  // (its own card) and a recipe's formatted page is framed: the writing area in a box with the tools
  const framed = !recipeViewMode;
  // A topic with no fields of its own (Journal, a plain topic): just the writing area, tools in the foot
  const textOnly = !customType && userFieldDefs.length === 0 && !editorHidden;
  const renderBody = () => (
    <>
      {/* Featured image hero — at the top, above the topic / actions row
          (recipes place it inside their own layout) */}

      {imageError && <ImageErrorText>{imageError}</ImageErrorText>}

      {/* Recipe read view — the formatted recipe page */}
      {recipeViewMode && (
        <RecipePad>
          <RecipeEntry
            values={recipeValues}
            hero={imagesReady && recipePhoto ? <EntryHeroBanner image={recipePhoto} onFocusChange={recipeFocus} /> : null}
            onToggleIngredient={toggleRecipeIngredient}
            onEdit={() => setRecipeEditing(true)}
          />
        </RecipePad>
      )}


      {/* Rich text editor — hidden entirely for structured topics */}
      {framed ? (editorHidden ? (
        // No text box on this topic: the editor stays mounted, hidden, as before
        <EditorArea $hidden $quick={quick}>{editorEl}</EditorArea>
      ) : textOnly ? (
        // Only text: no label or box, the tools go to the foot
        <>
          <PlainText><EditorArea $quick={quick} $roomy={quick} $journalTitle={isJournalTopic}>{editorEl}</EditorArea></PlainText>
          {tagsOn && <TagsLine><span>Tags</span>{tagsField}</TagsLine>}
        </>
      ) : (
        <TextRow>
          <div>{nameTarget ? 'Title' : 'Text'}</div>
          <TitleBox>
            <EditorArea $quick={quick}>{editorEl}</EditorArea>
            {/* Status is the first field row (where it's reached for); the foot holds what was there —
                a goal's Category, a milestone's Goal — leading, with the tools on the right. Other topics
                (a meal's Breakfast / Lunch… is in its When row) just have the tools, at the left */}
            <TitleFoot style={customType === 'goal' || customType === 'milestone' ? undefined : { justifyContent: 'flex-start' }}>
              {customType === 'milestone' && (
                <MilestoneGoalPick values={{ milestoneStatus: 'not_started', targetDate: '', isCompleted: false, parentGoalId: null, ...customFields } as MilestoneFieldValues}
                  goalOptions={goalOptions} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />
              )}
              {customType === 'goal' && (
                <GoalCategoryPick values={{ goalType: 'short_term', goalStatus: 'new', targetDate: '', ...customFields } as GoalFieldValues}
                  categories={goalCategoryNames}
                  onAddCategory={categoriesLoaded ? l => { void saveCategories(addGoalCategory(goalCategories, l)); } : undefined}
                  onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />
              )}
              {taskTools}
            </TitleFoot>
          </TitleBox>
        </TextRow>
      )) : (
        <EditorArea $hidden={editorHidden} $quick={quick} $titled={!!nameTarget} $journalTitle={!nameTarget && isJournalTopic} $roomy={quick && !customType && userFieldDefs.length === 0}>
          {editorEl}
        </EditorArea>
      )}

      {/* Photos under the text: one larger, more in a row (no featured banner).
          A media item's go at the foot of the card instead, after its cover and details */}
      {!recipeViewMode && !photosAtFoot && images.length + (imageUploading ? 1 : 0) > 0 && (
        <PhotosRow>
          <EntryPhotos images={images} uploading={imageUploading} onRemove={key => onImageRemoved?.(key)} onOpen={setLightboxIndex} />
        </PhotosRow>
      )}

      {/* Custom fields, below editor — recipes in view mode render the
          formatted page instead; "Edit recipe" brings the fields back */}
      {customType && !recipeViewMode && (
        <CustomFieldsSection $noRule={editorHidden} data-after-text={editorHidden ? undefined : ''}>
            {isRecipe && recipeHasContent && (
              <ViewRecipeBtn type="button" onClick={() => setRecipeEditing(false)}>
                <Icon name="check" size={12} strokeWidth={2.5} />
                Done editing — view recipe
              </ViewRecipeBtn>
            )}
            <CustomFieldsBody $nameInText={!!nameTarget}>
              <FieldRowLayoutContext.Provider value={true}>
              {customType === 'task' && <TaskFields values={{ isInProgress: false, isCompleted: false, isAutoMigrating: false, parentGoalId: null, parentMilestoneId: null, priority: 'none', deadline: '', ...customFields } as TaskFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} goalOptions={goalOptions} milestoneOptions={milestoneOptions}
                blockerTasks={blockerTasks} selfId={entryId ?? null}
                types={taskTypeList(taskTypes)} onAddType={taskTypesLoaded ? l => { void saveTaskTypes(addTaskType(taskTypes, l)); } : undefined}
                onRemoveType={taskTypesLoaded ? l => { void saveTaskTypes(removeTaskType(taskTypes, l)); } : undefined} />}
              {customType === 'goal' && <GoalFields categoryInFoot values={{ goalType: 'short_term', goalStatus: 'new', targetDate: '', ...customFields } as GoalFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)}
                categories={goalCategoryNames} onAddCategory={categoriesLoaded ? l => { void saveCategories(addGoalCategory(goalCategories, l)); } : undefined}
                timer={exerciseTimer} timerRunning={timer.running} habits={entryId ? <GoalHabits goalId={entryId} /> : undefined} />}
              {customType === 'habit' && <HabitFields values={{ ...HABIT_DEFAULTS, parentGoalId: null, ...customFields } as HabitFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} goalOptions={goalOptions}
                categories={goalCategoryNames} onAddCategory={categoriesLoaded ? l => { void saveCategories(addGoalCategory(goalCategories, l)); } : undefined}
                onRemoveCategory={categoriesLoaded ? l => { void saveCategories(removeGoalCategory(goalCategories, l)); } : undefined} />}
              {customType === 'milestone' && <MilestoneFieldsWithTasks goalInFoot values={{ milestoneStatus: 'not_started', targetDate: '', isCompleted: false, parentGoalId: null, ...customFields } as MilestoneFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} goalOptions={goalOptions} linkedTasks={linkedTasks} attachableTasks={attachableTasks} entryId={entryId}
                timer={exerciseTimer} timerRunning={timer.running} />}
              {customType === 'food' && <FoodFields values={{ mealType: 'breakfast', consumedDate: '', consumedTime: '', ingredients: '', calories: '', notes: '', ...customFields } as FoodFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} onEstimateCalories={calorieEstimate.estimate} estimatingCalories={calorieEstimate.estimating} calorieError={calorieEstimate.error} />}
              {customType === 'medication' && <MedicationFields values={{ dosage: '', frequency: 'once_daily', scheduleTimes: ['08:00'], isActive: true, notes: '', ...customFields } as MedicationFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} entryName={(typeof customFields.medicationName === 'string' && customFields.medicationName.trim()) || content.replace(/<[^>]+>/g, ' ').trim()} />}
              {customType === 'routine' && <RoutineFields values={{ ...ROUTINE_DEFAULTS, duration: '', items: [], days: [], isActive: true, notes: '', ...customFields } as RoutineFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} categoryOptions={trainingCategoryOptions}
                timer={exerciseTimer} timerRunning={timer.running} />}
              {customType === 'training_plan' && <TrainingPlanFields values={{ startDate: '', eventDate: '', categories: [], phases: [], isActive: true, notes: '', ...customFields } as TrainingPlanFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
              {customType === 'change' && <ChangeFields values={{ changeWhat: '', changeDate: '', notes: '', ...customFields } as ChangeFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
              {customType === 'symptom' && <SymptomFields values={{ symptomName: '', severity: 5, occurredDate: '', occurredTime: '', duration: '', notes: '', ...customFields } as SymptomFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)}
                chips={symptomChipList(symptomChips)} onAddChip={chipsLoaded ? l => { void saveSymptomChips(addSymptomChip(symptomChips, l)); } : undefined}
                onRemoveChip={chipsLoaded ? l => { void saveSymptomChips(removeSymptomChip(symptomChips, l)); } : undefined} />}
              {customType === 'exercise' && <ExerciseFields values={{ exerciseType: 'running', duration: '', intensity: 'medium', distance: '', distanceUnit: 'miles', calories: '', performedDate: '', performedTime: '', notes: '', ...customFields } as ExerciseFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} onEstimateCalories={calorieEstimate.estimate} estimatingCalories={calorieEstimate.estimating} calorieError={calorieEstimate.error} categoryOptions={trainingCategoryOptions}
                timer={exerciseTimer} timerRunning={timer.running} />}
              {customType === 'event' && <EventFields values={{ startDate: '', startTime: '', endDate: '', endTime: '', location: '', address: '', phone: '', notes: '', ...customFields } as EventFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} showCalendarSync={calendarSyncEnabled} />}
              {customType === 'meeting' && <MeetingFields values={{ startDate: '', startTime: '', endDate: '', endTime: '', meetingTopic: '', attendees: '', location: '', address: '', phone: '', notes: '', ...customFields } as MeetingFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} showCalendarSync={calendarSyncEnabled} />}
              {customType === 'allergy' && <AllergyFields values={{ allergen: '', severity: 5, reaction: '', occurredDate: '', occurredTime: '', notes: '', ...customFields } as AllergyFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
              {customType === 'menu_plan' && <MenuPlanFields values={{ weekStart: '', days: {}, ...(customFields as Partial<MenuPlanFieldValues>) } as MenuPlanFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} recipeOptions={recipeOptions} />}
              {customType === 'shopping_list' && <ShoppingListFields values={{ items: [], notes: '', linkedRecipeIds: [], ...(customFields as Partial<ShoppingListFieldValues>) } as ShoppingListFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} recipeOptions={recipeOptions} />}
              {customType === 'recipe' && <RecipeFields values={{ servings: '', prepTime: '', cookTime: '', cuisine: '', ingredients: [], instructions: '', linkedShoppingListIds: [], ...(customFields as Partial<RecipeFieldValues>) } as RecipeFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} shoppingListOptions={shoppingListOptions} />}
              {customType === 'wins' && <WinsFields values={{ wins: [], ...(customFields as Partial<WinsFieldValues>) } as WinsFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
              {customType === 'priorities' && <PrioritiesFields values={{ priorities: [], ...(customFields as Partial<PrioritiesFieldValues>) } as PrioritiesFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
              {customType === 'wellness' && <WellnessFields values={{ date: '', waterGlasses: 0, waterGoal: 8, moodScore: 0, sleepHours: 0, sleepQuality: 0, ...customFields } as WellnessFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} cycleTrackingEnabled={cycleTrackingEnabled} onAutoSave={onAutoSave} />}
              {customType === 'media' && <MediaFieldsWithTags values={{ ...MEDIA_DEFAULTS, ...customFields } as MediaFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} onAiDetails={aiReady && !hiddenFromAi ? aiMediaDetails : undefined} allTags={mediaTagOptions} entryId={entryId} />}
              {customType === 'time_tracking' && <TimeTrackingFields values={{ activityName: '', notes: '', ...customFields } as TimeTrackingFieldValues} onChange={v => onCustomFieldsChange(v as unknown as Record<string, unknown>)} />}
              {customType && !['exercise', 'routine', 'goal', 'milestone'].includes(customType) && TIME_TRACKED_TYPES.has(customType) && quick && onSaveAndStartTimer && (
                <div style={{ marginTop: 32 }}>
                  <TimeTracker
                    sessions={[]} totalMs={0} running={false} otherRunning={timer.otherRunning} now={timer.now}
                    disabled={isSaving || !timer.loaded}
                    onStart={() => void onSaveAndStartTimer(canSave ? undefined : timerFill(customType, nameKey, new Date()))} onStop={timer.stop} onAdd={() => {}} onRemove={() => {}}
                    noAdd
                    note={timer.otherRunning ? 'Starting the timer saves this entry and stops the one running now.' : 'Starting the timer saves this entry.'}
                  />
                </div>
              )}
              {customType && !['exercise', 'routine', 'goal', 'milestone'].includes(customType) && TIME_TRACKED_TYPES.has(customType) && !quick && (
                <div>
                  <TimeTracker
                    sessions={timer.sessions} totalMs={timer.totalMs} running={timer.running} otherRunning={timer.otherRunning} now={timer.now}
                    disabled={(entryId === null && !onSaveAndStartTimer) || isSaving || !timer.loaded}
                    onStart={entryId === null && onSaveAndStartTimer
                      ? () => void onSaveAndStartTimer(canSave ? undefined : timerFill(customType, nameKey, new Date()))
                      : timer.start}
                    onStop={timer.stop} onAdd={timer.addManual} onRemove={timer.remove}
                    note={entryId === null && onSaveAndStartTimer ? 'Starting the timer saves this entry.' : undefined}
                    onUseAsDuration={customType === 'exercise' ? m => onCustomFieldsChange({ ...customFields, duration: String(m) }) : undefined}
                  />
                </div>
              )}
              </FieldRowLayoutContext.Provider>
            </CustomFieldsBody>
        </CustomFieldsSection>
      )}

      {/* User-defined custom fields */}
      {userFieldDefs.length > 0 && !recipeViewMode && (
        <CustomFieldsSection $noRule={editorHidden} data-after-text={editorHidden ? undefined : ''}>
            <CustomFieldsBody $nameInText={!!nameTarget}>
              <FieldRowLayoutContext.Provider value={true}>
                <UserFieldsForm
                  fieldDefs={userFieldDefs}
                  values={(customFields._userFields as Record<string, unknown>) ?? {}}
                  onChange={vals => onCustomFieldsChange({ ...customFields, _userFields: vals })}
                />
              </FieldRowLayoutContext.Provider>
              {tagsOn && (
                <section>
                  <div><SectionLabel>Tags</SectionLabel></div>
                  {tagsField}
                </section>
              )}
            </CustomFieldsBody>
        </CustomFieldsSection>
      )}

      {/* A media item's own photos, at the foot of its card (one stands in for the cover on the shelf) */}
      {!recipeViewMode && photosAtFoot && images.length + (imageUploading ? 1 : 0) > 0 && (
        <PhotosRow $foot>
          <EntryPhotos images={images} uploading={imageUploading} onRemove={key => onImageRemoved?.(key)} onOpen={setLightboxIndex} />
        </PhotosRow>
      )}

    </>
  );

  /* ── A task: its own card (the task card mock) ── */
  const isTaskCard = customType === 'task' && !recipeViewMode;
  const taskValues = { isInProgress: false, isCompleted: false, isAutoMigrating: false, parentGoalId: null, parentMilestoneId: null, priority: 'none', deadline: '', ...customFields } as TaskFieldValues;
  const setTask = (v: TaskFieldValues) => onCustomFieldsChange(v as unknown as Record<string, unknown>);
  // The timer behind the stopwatch: view the time, start a timer, add time
  const taskTimer = quick
    ? (onSaveAndStartTimer ? (
      <TimeTracker
        sessions={[]} totalMs={0} running={false} otherRunning={timer.otherRunning} now={timer.now}
        disabled={isSaving || !timer.loaded}
        onStart={() => void onSaveAndStartTimer(canSave ? undefined : timerFill('task', nameKey, new Date()))} onStop={timer.stop} onAdd={() => {}} onRemove={() => {}}
        noAdd
        note={timer.otherRunning ? 'Starting the timer saves this entry and stops the one running now.' : 'Starting the timer saves this entry.'}
      />
    ) : undefined)
    : (
      <TimeTracker
        sessions={timer.sessions} totalMs={timer.totalMs} running={timer.running} otherRunning={timer.otherRunning} now={timer.now}
        disabled={(entryId === null && !onSaveAndStartTimer) || isSaving || !timer.loaded}
        onStart={entryId === null && onSaveAndStartTimer
          ? () => void onSaveAndStartTimer(canSave ? undefined : timerFill('task', nameKey, new Date()))
          : timer.start}
        onStop={timer.stop} onAdd={timer.addManual} onRemove={timer.remove}
        note={entryId === null && onSaveAndStartTimer ? 'Starting the timer saves this entry.' : undefined}
      />
    );
  // Shared with AI, or hidden from it: one button in the tools (journal only, while an AI
  // is on). The AI sparkle while the entry can go to AI; a slash through it once hidden.
  // An entry whose whole topic is hidden shows the slash and can't be switched here.
  const aiOff = aiHidden || aiHiddenByTopic;
  const aiHideLabel = aiHiddenByTopic ? 'Hidden from AI: its topic is hidden (Settings → In-App AI)'
    : aiHidden ? 'Hidden from AI. Share with AI again'
    : aiPrivacy.appEnabled ? 'Shared with AI. Hide from every AI feature and the Chronicles AI app'
    : 'Shared with AI. Hide from every AI feature';
  const aiHideBtn = !quick && onToggleAiHidden ? (
    <IconBtn type="button" aria-label={aiHideLabel} title={aiHiddenByTopic ? aiHideLabel : aiHidden ? 'Hidden from AI' : 'Hide from AI'}
      aria-pressed={aiOff} disabled={aiHiddenByTopic}
      onClick={() => { if (!aiHiddenByTopic) onToggleAiHidden(); }}
      style={aiHiddenByTopic ? { opacity: 0.5, cursor: 'default' } : undefined}>
      <AiMark $off={aiOff}><MaterialIcon $size={19} aria-hidden="true">auto_awesome</MaterialIcon></AiMark>
    </IconBtn>
  ) : null;
  const taskTools = (
    <TitleTools aria-label="Entry tools">
      <IconBtn type="button" $active={toolbarOpen} aria-label="Formatting" title="Format" aria-pressed={toolbarOpen}
        onClick={() => setFormatOpen(!toolbarOpen)}>
        <Icon name="type" size={18} strokeWidth={1.7} />
      </IconBtn>
      <IconBtn type="button" aria-label="Draw" title="Draw"
        onClick={() => { setNotesExpanded(true); drawingControlRef.current?.open(); }}>
        <Icon name="pencil" size={17} strokeWidth={1.7} />
      </IconBtn>
      <IconBtn type="button" $active={listening} aria-label={listening ? 'Stop dictation' : 'Dictate'} title="Dictate" aria-pressed={listening}
        onClick={() => { setNotesExpanded(true); dictRef.current?.toggle(); }}>
        <Icon name="mic" size={17} strokeWidth={1.7} />
      </IconBtn>
      {!quick && imagesReady && (
        <>
          <input ref={fileInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} multiple style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) onImagesSelected?.(files);
              e.target.value = '';
            }} />
          <IconBtn type="button" aria-label="Add images" title={imagesFull ? 'Maximum of 7 images per entry' : 'Add images'}
            disabled={imagesFull || imageUploading}
            onClick={() => !imagesFull && !imageUploading && fileInputRef.current?.click()}
            style={{ opacity: imagesFull ? 0.35 : 1, cursor: imagesFull ? 'default' : 'pointer' }}>
            {imageUploading ? <Spinner size={14} /> : <Icon name="image" size={18} strokeWidth={1.7} />}
          </IconBtn>
          {onExistingImagesSelected && (
            <IconBtn type="button" aria-label="Add image from library" title={imagesFull ? 'Maximum of 7 images per entry' : 'Add from library'}
              disabled={imagesFull} onClick={() => !imagesFull && setLibraryOpen(true)}
              style={{ opacity: imagesFull ? 0.35 : 1, cursor: imagesFull ? 'default' : 'pointer' }}>
              <MaterialIcon $size={20} aria-hidden="true">photo_library</MaterialIcon>
            </IconBtn>
          )}
        </>
      )}
      {!quick && (
        <IconBtn type="button" $active={isFavorite} $activeColor={accentColor}
          aria-label={isFavorite ? 'Remove bookmark' : 'Bookmark entry'} title="Bookmark"
          onClick={() => entryId && onBookmark?.()}
          style={{ opacity: entryId ? 1 : 0.35, cursor: entryId ? 'pointer' : 'default' }}>
          <Icon name="bookmark" size={18} strokeWidth={1.7} />
        </IconBtn>
      )}
      {aiHideBtn}
    </TitleTools>
  );
  // A topic with no text box (Exercise, Wellness…): no Format, Draw or Dictate (nothing to format) —
  // just Add images and Bookmark, in the journal's foot
  const noTextTools = quick ? null : (
    <TitleTools aria-label="Entry tools">
      {imagesReady && (
        <>
          <input ref={fileInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} multiple style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) onImagesSelected?.(files);
              e.target.value = '';
            }} />
          <IconBtn type="button" aria-label="Add images" title={imagesFull ? 'Maximum of 7 images per entry' : 'Add images'}
            disabled={imagesFull || imageUploading}
            onClick={() => !imagesFull && !imageUploading && fileInputRef.current?.click()}
            style={{ opacity: imagesFull ? 0.35 : 1, cursor: imagesFull ? 'default' : 'pointer' }}>
            {imageUploading ? <Spinner size={14} /> : <Icon name="image" size={18} strokeWidth={1.7} />}
          </IconBtn>
          {onExistingImagesSelected && (
            <IconBtn type="button" aria-label="Add image from library" title={imagesFull ? 'Maximum of 7 images per entry' : 'Add from library'}
              disabled={imagesFull} onClick={() => !imagesFull && setLibraryOpen(true)}
              style={{ opacity: imagesFull ? 0.35 : 1, cursor: imagesFull ? 'default' : 'pointer' }}>
              <MaterialIcon $size={20} aria-hidden="true">photo_library</MaterialIcon>
            </IconBtn>
          )}
        </>
      )}
      <IconBtn type="button" $active={isFavorite} $activeColor={accentColor}
        aria-label={isFavorite ? 'Remove bookmark' : 'Bookmark entry'} title="Bookmark"
        onClick={() => entryId && onBookmark?.()}
        style={{ opacity: entryId ? 1 : 0.35, cursor: entryId ? 'pointer' : 'default' }}>
        <Icon name="bookmark" size={18} strokeWidth={1.7} />
      </IconBtn>
      {aiHideBtn}
    </TitleTools>
  );

  // Full screen and close, at the right of the head (the journal)
  const headIcons = (onToggleExpand || onClose) ? (
    <HeadIcons>
      {onToggleExpand && (
        <IconBtn type="button" $active={expanded} aria-label={expanded ? 'Exit full screen' : 'Expand editor'}
          title={expanded ? 'Exit full screen' : 'Expand'} aria-pressed={!!expanded} onClick={onToggleExpand}>
          <Icon name={expanded ? 'minimize' : 'maximize'} size={18} strokeWidth={1.8} />
        </IconBtn>
      )}
      {onClose && (
        <IconBtn type="button" aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={18} strokeWidth={1.8} />
        </IconBtn>
      )}
    </HeadIcons>
  ) : null;
  const deleteBtn = entryId && onDelete ? (
    <TaskDelete type="button" onClick={onDelete}>
      <Icon name="trash" size={17} strokeWidth={1.8} /> Delete
    </TaskDelete>
  ) : null;
  const taskBody = (
    <TaskBody>
      {imageError && <ImageErrorText>{imageError}</ImageErrorText>}
      <TaskRow style={{ alignItems: 'start', paddingTop: 2, paddingBottom: 32 }}>
        <TaskRowName style={{ paddingTop: 18 }}>Title</TaskRowName>
        <TitleBox>
          <EditorArea $quick={quick}>{editorEl}</EditorArea>
          <TitleFoot>
            {/* Priority here; Status is the row under the title */}
            <TaskPriorityPick values={taskValues} onChange={setTask} />
            {taskTools}
          </TitleFoot>
        </TitleBox>
      </TaskRow>
      {images.length + (imageUploading ? 1 : 0) > 0 && (
        <PhotosRow>
          <EntryPhotos images={images} uploading={imageUploading} onRemove={key => onImageRemoved?.(key)} onOpen={setLightboxIndex} />
        </PhotosRow>
      )}
      <TaskCardRows values={taskValues} onChange={setTask} goalOptions={goalOptions} milestoneOptions={milestoneOptions}
        blockerTasks={blockerTasks} selfId={entryId ?? null}
        types={taskTypeList(taskTypes)} onAddType={taskTypesLoaded ? l => { void saveTaskTypes(addTaskType(taskTypes, l)); } : undefined}
        timer={taskTimer} timerRunning={timer.running} />
    </TaskBody>
  );

  // Format, Draw and Dictate: at the left of the foot (Save entry on the right)
  const quickTools = (
    <QuickTools aria-label="Entry tools">
          <IconBtn type="button" $active={toolbarOpen} aria-label="Formatting" title="Format" aria-pressed={toolbarOpen}
            onClick={() => setFormatOpen(!toolbarOpen)}>
            <Icon name="type" size={18} strokeWidth={1.7} />
          </IconBtn>
          <IconBtn type="button" aria-label="Draw" title="Draw"
            onClick={() => { setNotesExpanded(true); drawingControlRef.current?.open(); }}>
            <Icon name="pencil" size={17} strokeWidth={1.7} />
          </IconBtn>
          <IconBtn type="button" $active={listening} aria-label={listening ? 'Stop dictation' : 'Dictate'} title="Dictate" aria-pressed={listening}
            onClick={() => { setNotesExpanded(true); dictRef.current?.toggle(); }}>
            <Icon name="mic" size={17} strokeWidth={1.7} />
          </IconBtn>
        </QuickTools>
  );

  const quickPicker = (
    <TopicSelector selectedId={topicId} onSelect={id => onTopicChange(id)} topics={topics} hideIcon label={quickTopicPhrase}
      extras={quickExtras} selectedExtra={quickExtra} onSelectExtra={onQuickExtra}
      journalFirst noClearRow onClear={quickOpen ? onNew : undefined} />
  );

  // The Quick entry with nothing picked or written yet: its question waits in the middle
  // of the writing area (Journal's empty field), and goes back up once a topic is picked
  // The question starts at the top of the card (no longer waiting halfway down the empty field)
  const promptCentered = false;

  if (quick) return (
    <QuickCard role="region" aria-label="Quick entry" ref={quickRef}>
      {!quickOpen ? (
        <>
          {/* The picker sits straight in the line (no wrapper), so it takes the question's
              font — thin italic Work Sans at the same size */}
          <QuickIdle data-keep-placeholder>
            <h2>What would you like to write down?</h2>
            {/* Waiting: the picker asks for a topic ("choose a topic ⌄"), never names one,
                so nobody has to reselect Journal; picking one opens the form */}
            <TopicSelector selectedId={topicId} onSelect={id => onTopicChange(id)} topics={topics} hideIcon
              label={() => 'choose a topic'} extras={quickExtras} selectedExtra={quickExtra} onSelectExtra={onQuickExtra}
              journalFirst noClearRow />
          </QuickIdle>
        </>
      ) : (
        <>
          {/* The question is the card's first line — an entry's or Bill / Spending's */}
          {quickExtra && quickExtraBody ? (
            <QuickExtraBox>
              <QuickCardPrompt data-keep-placeholder data-ruled="">
                {quickPicker}
              </QuickCardPrompt>
              <QuickExtraForm>{quickExtraBody}</QuickExtraForm>
            </QuickExtraBox>
) : isTaskCard ? (
            <EntryCard $quick data-quick-open="" data-task-card="">
              <TaskHead>
                <QuickCardPrompt data-keep-placeholder style={{ padding: 0 }}>{quickPicker}</QuickCardPrompt>
                <TaskFormatToggle values={taskValues} onChange={setTask} />
              </TaskHead>
              {taskBody}
              <QuickFoot>
                <span />
                {saveButton}
              </QuickFoot>
            </EntryCard>
          ) : framed ? (
            <EntryCard $quick data-quick-open="" data-framed="">
              <TaskHead style={{ paddingLeft: CARD_X, '--head-x': CARD_X } as CSSProperties}>
                <QuickCardPrompt data-keep-placeholder style={{ padding: 0 }}>{quickPicker}</QuickCardPrompt>
              </TaskHead>
              {renderBody()}
              <QuickFoot>
                {textOnly ? taskTools : <span />}
                {saveButton}
              </QuickFoot>
            </EntryCard>
          ) : (
            <EntryCard $quick data-quick-open="" 
              data-card-prompt-centered={promptCentered ? '' : undefined}>
              <QuickCardPrompt data-keep-placeholder data-ruled="" data-card-prompt="" data-centered={promptCentered ? '' : undefined}>
                {quickPicker}
              </QuickCardPrompt>
              {renderBody()}
              {/* Format, Draw and Dictate on the left, Save entry on the right */}
              <QuickFoot>
                {quickTools}
                {saveButton}
              </QuickFoot>
            </EntryCard>
          )}
        </>
      )}
      {quickOpen && !(quickExtra && quickExtraBody) && saveStatus === 'Save failed' && <QuickError role="alert">Save failed</QuickError>}
    </QuickCard>
  );

  return (
    <FormWrapper>
      {/* No top bar: the question, the writing area, the fields and the tool row all in one scroll */}
      <ScrollArea>
        <EdBody $full={!quick && !!fullWidth}>
          {quickExtra && quickExtraBody ? (
          // Bill / Spending picked in the journal's topic picker: Budget & bills' own form
          // in place of the entry (saved to the finance tables, never the journal)
          <EntryCard $flat data-framed="" style={{ maxWidth: FIELDS_ROW_MAX }}>
            <TaskHead data-journal="" data-full={fullWidth ? '' : undefined} style={{ paddingLeft: CARD_X, '--head-x': CARD_X } as CSSProperties}>
              <JournalPrompt>
                <TopicSelector selectedId={topicId} onSelect={id => onTopicChange(id)} topics={topics} hideIcon
                  label={name => (topicId === null ? 'choose a topic' : quickTopicPhrase(name))}
                  extras={quickExtras} selectedExtra={quickExtra} onSelectExtra={onQuickExtra} />
              </JournalPrompt>
              {headIcons}
            </TaskHead>
            <QuickExtraForm>{quickExtraBody}</QuickExtraForm>
          </EntryCard>
          ) : isTaskCard ? (
          <EntryCard $flat data-task-card="" style={{ maxWidth: TASK_ROW_MAX }}>
            <TaskHead data-journal="" data-full={fullWidth ? '' : undefined}>
              <JournalPrompt>
                <TopicSelector selectedId={topicId} onSelect={id => onTopicChange(id)} topics={topics} hideIcon
                  label={name => (topicId === null ? 'choose a topic' : quickTopicPhrase(name))}
                  extras={quickExtras} selectedExtra={quickExtra} onSelectExtra={onQuickExtra} />
              </JournalPrompt>
              <TaskFormatToggle values={taskValues} onChange={setTask} />
              {(onToggleExpand || onClose) && (
                <HeadIcons>
                  {onToggleExpand && (
                    <IconBtn type="button" $active={expanded} aria-label={expanded ? 'Exit full screen' : 'Expand editor'}
                      title={expanded ? 'Exit full screen' : 'Expand'} aria-pressed={!!expanded} onClick={onToggleExpand}>
                      <Icon name={expanded ? 'minimize' : 'maximize'} size={18} strokeWidth={1.8} />
                    </IconBtn>
                  )}
                  {onClose && (
                    <IconBtn type="button" aria-label="Close" title="Close" onClick={onClose}>
                      <Icon name="x" size={18} strokeWidth={1.8} />
                    </IconBtn>
                  )}
                </HeadIcons>
              )}
            </TaskHead>
            {taskBody}
            <QuickFoot style={{ marginTop: 'auto' }}>
              <FootLeft>
                {deleteBtn}
              </FootLeft>
              <JournalSaveSide>
                {saveStatusNode && <StatusSlot $failed={saveStatus === 'Save failed'}>{saveStatusNode}</StatusSlot>}
                {saveButton}
              </JournalSaveSide>
            </QuickFoot>
          </EntryCard>
          ) : framed ? (
          <EntryCard $flat data-framed="" style={{ maxWidth: textOnly ? TEXT_ROW_MAX : FIELDS_ROW_MAX }}>
            <TaskHead data-journal="" data-full={fullWidth ? '' : undefined} style={{ paddingLeft: CARD_X, '--head-x': CARD_X } as CSSProperties}>
              <JournalPrompt>
                <TopicSelector selectedId={topicId} onSelect={id => onTopicChange(id)} topics={topics} hideIcon
                  label={name => (topicId === null ? 'choose a topic' : quickTopicPhrase(name))}
                  extras={quickExtras} selectedExtra={quickExtra} onSelectExtra={onQuickExtra} />
              </JournalPrompt>
              {headIcons}
            </TaskHead>
            {renderBody()}
            <QuickFoot style={{ marginTop: 'auto' }}>
              <FootLeft>
                {/* A topic with no text box keeps its tools here */}
                {editorHidden && noTextTools}
                {textOnly && taskTools}
                {deleteBtn}
              </FootLeft>
              <JournalSaveSide>
                {saveStatusNode && <StatusSlot $failed={saveStatus === 'Save failed'}>{saveStatusNode}</StatusSlot>}
                {saveButton}
              </JournalSaveSide>
            </QuickFoot>
          </EntryCard>
          ) : (
          <EntryCard $flat>
            <JournalHead $expanded={!!fullWidth} $roomy={editorHidden && !recipeViewMode}>
              <JournalPrompt>
                {/* Just the picker (no question). No topic picked asks for one ("choose a topic ⌄") rather than naming
                    Journal — saved without one (the autosave too) it still goes under Journal */}
                <TopicSelector selectedId={topicId} onSelect={id => onTopicChange(id)} topics={topics} hideIcon
                  label={name => (topicId === null ? 'choose a topic' : quickTopicPhrase(name))}
                  extras={quickExtras} selectedExtra={quickExtra} onSelectExtra={onQuickExtra} />
              </JournalPrompt>
              {(onToggleExpand || onClose) && (
                <HeadIcons>
                  {onToggleExpand && (
                    <IconBtn type="button" $active={expanded} aria-label={expanded ? 'Exit full screen' : 'Expand editor'}
                      title={expanded ? 'Exit full screen' : 'Expand'} aria-pressed={!!expanded} onClick={onToggleExpand}>
                      <Icon name={expanded ? 'minimize' : 'maximize'} size={18} strokeWidth={1.8} />
                    </IconBtn>
                  )}
                  {onClose && (
                    <IconBtn type="button" aria-label="Close" title="Close" onClick={onClose}>
                      <Icon name="x" size={18} strokeWidth={1.8} />
                    </IconBtn>
                  )}
                </HeadIcons>
              )}
            </JournalHead>
            {renderBody()}
            {/* The tool row: Format, Draw, Dictate, images, Bookmark and ⋯ on the left; Save entry on the right */}
            <JournalFoot>
              <JournalTools aria-label="Entry tools">
                <IconBtn type="button" $active={toolbarOpen} aria-label="Formatting" title="Format" aria-pressed={toolbarOpen}
                  onClick={() => setFormatOpen(!toolbarOpen)}>
                  <Icon name="type" size={18} strokeWidth={1.7} />
                </IconBtn>
                <IconBtn type="button" aria-label="Draw" title="Draw"
                  onClick={() => { setNotesExpanded(true); drawingControlRef.current?.open(); }}>
                  <Icon name="pencil" size={17} strokeWidth={1.7} />
                </IconBtn>
                <IconBtn type="button" $active={listening} aria-label={listening ? 'Stop dictation' : 'Dictate'} title="Dictate" aria-pressed={listening}
                  onClick={() => { setNotesExpanded(true); dictRef.current?.toggle(); }}>
                  <Icon name="mic" size={17} strokeWidth={1.7} />
                </IconBtn>
                {/* Fields-only entries (no text area, e.g. a symptom) with no photos: no image tools */}
                {imagesReady && !(editorHidden && !recipeViewMode && images.length === 0 && !imageUploading) && (
                  <>
                    <input ref={fileInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} multiple style={{ display: 'none' }}
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0) onImagesSelected?.(files);
                        e.target.value = '';
                      }} />
                    <IconBtn type="button" aria-label="Add images" title={imagesFull ? 'Maximum of 7 images per entry' : 'Add images'}
                      disabled={imagesFull || imageUploading}
                      onClick={() => !imagesFull && !imageUploading && fileInputRef.current?.click()}
                      style={{ opacity: imagesFull ? 0.35 : 1, cursor: imagesFull ? 'default' : 'pointer' }}>
                      {imageUploading ? <Spinner size={14} /> : <Icon name="image" size={18} strokeWidth={1.7} />}
                    </IconBtn>
                    {onExistingImagesSelected && (
                      <IconBtn type="button" aria-label="Add image from library" title={imagesFull ? 'Maximum of 7 images per entry' : 'Add from library'}
                        disabled={imagesFull} onClick={() => !imagesFull && setLibraryOpen(true)}
                        style={{ opacity: imagesFull ? 0.35 : 1, cursor: imagesFull ? 'default' : 'pointer' }}>
                        <MaterialIcon $size={20} aria-hidden="true">photo_library</MaterialIcon>
                      </IconBtn>
                    )}
                  </>
                )}
                <IconBtn type="button" $active={isFavorite} $activeColor={accentColor}
                  aria-label={isFavorite ? 'Remove bookmark' : 'Bookmark entry'} title="Bookmark"
                  onClick={() => entryId && onBookmark?.()}
                  style={{ opacity: entryId ? 1 : 0.35, cursor: entryId ? 'pointer' : 'default' }}>
                  <Icon name="bookmark" size={18} strokeWidth={1.7} />
                </IconBtn>
                {/* ⋯ More: Share, Duplicate, Close and Delete (opens upward) */}
                {aiHideBtn}
                <MoreWrap ref={moreRef}>
                  <IconBtn type="button" $active={moreOpen} aria-label="More actions" title="More" aria-haspopup="menu" aria-expanded={moreOpen}
                    onClick={() => setMoreOpen(o => !o)}>
                    <Icon name="more-horizontal" size={18} strokeWidth={2} />
                  </IconBtn>
                  {moreOpen && (
                    <MoreMenu role="menu" $up>
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
                      {onDuplicate && (
                        <MoreItem type="button" role="menuitem" disabled={!entryId}
                          onClick={() => { setMoreOpen(false); if (entryId) onDuplicate(); }}>
                          <Icon name="copy" size={16} strokeWidth={1.8} />
                          <MoreText>
                            Duplicate
                            {!entryId && <MoreHint>Save the entry first</MoreHint>}
                          </MoreText>
                        </MoreItem>
                      )}
                      <MoreItem type="button" role="menuitem" onClick={() => { setMoreOpen(false); onNew(); }}>
                        <Icon name="x" size={16} strokeWidth={1.8} />
                        <MoreText>Close<MoreHint>Unsaved changes are dropped</MoreHint></MoreText>
                      </MoreItem>
                      {entryId && onDelete && (
                        <MoreItem type="button" role="menuitem" style={{ color: 'var(--color-danger)' }}
                          onClick={() => { setMoreOpen(false); onDelete(); }}>
                          <Icon name="trash" size={16} strokeWidth={1.8} />
                          <MoreText>Delete entry</MoreText>
                        </MoreItem>
                      )}
                    </MoreMenu>
                  )}
                </MoreWrap>
              </JournalTools>
              <JournalSaveSide>
                {saveStatusNode && <StatusSlot $failed={saveStatus === 'Save failed'}>{saveStatusNode}</StatusSlot>}
                {saveButton}
              </JournalSaveSide>
            </JournalFoot>
          </EntryCard>
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

    </FormWrapper>
  );
}
