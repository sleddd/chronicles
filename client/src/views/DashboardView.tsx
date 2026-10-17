import { useState, useMemo, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { entries as entriesApi } from '../services/api.js';
import { getOrCreateJournalTopic } from '../utils/getOrCreateJournalTopic.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { stripHtml } from '../utils/stripHtml.js';
import { generatedEntryText } from '../utils/entryText.js';
import { TopicSelector } from '../components/organisms/TopicSelector.js';
import { Editor, type DictationControls } from '../components/organisms/Editor.js';
import type { Topic } from '../types/topics.js';
import { UserFieldsForm } from '../components/molecules/fields/UserFieldsForm.js';
import { GoalFields } from '../components/molecules/fields/GoalFields.js';
import { MilestoneFields } from '../components/molecules/fields/MilestoneFields.js';
import { MenuPlanFields, type MenuPlanFieldValues } from '../components/molecules/fields/MenuPlanFields.js';
import { ShoppingListFields } from '../components/molecules/fields/ShoppingListFields.js';
import { RecipeFields } from '../components/molecules/fields/RecipeFields.js';
import { FoodFields } from '../components/molecules/fields/FoodFields.js';
import { SymptomFields } from '../components/molecules/fields/SymptomFields.js';
import { ExerciseFields } from '../components/molecules/fields/ExerciseFields.js';
import { EventFields } from '../components/molecules/fields/EventFields.js';
import { MeetingFields } from '../components/molecules/fields/MeetingFields.js';
import { AllergyFields } from '../components/molecules/fields/AllergyFields.js';
import { TaskFields } from '../components/molecules/fields/TaskFields.js';
import { MedicationFields } from '../components/molecules/fields/MedicationFields.js';
import type { GoalFieldValues, MilestoneFieldValues, RecipeFieldValues, ShoppingListFieldValues, FoodFieldValues, SymptomFieldValues, ExerciseFieldValues, EventFieldValues, MeetingFieldValues, AllergyFieldValues, TaskFieldValues, MedicationFieldValues } from '../types/fields.js';
import { defaultShoppingListTitle } from '../utils/kitchen.js';
import { TextInput } from '../components/atoms/TextInput.js';
import { Select } from '../components/atoms/Select.js';
import { Checkbox } from '../components/atoms/Checkbox.js';
import { FormField, FieldRowLayoutContext } from '../components/molecules/FormField.js';
import { NutritionPanel } from '../components/molecules/NutritionPanel.js';
import { WellnessPanel, WATER_GOAL, type FlowIntensity } from '../components/molecules/WellnessPanel.js';
import { toDateStr } from '../utils/dateUtils.js';
import { NUTRIENTS, type NutrientKey } from '../types/nutrition.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { UnitLabel } from '../components/atoms/UnitLabel.js';
import { useAiReady } from '../hooks/useAiReady.js';
import { autoNutritionOnSave } from '../services/aiAssistant.js';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';

/* ── Constants ── */

const REFLECTION_PROMPTS = [
  'What does success look like for you today?',
  'What\'s one thing you\'re grateful for right now?',
  'What challenge are you working through, and how might you approach it differently?',
  'What would make today a great day?',
  'What\'s something you\'ve been putting off that you should address?',
  'Who has positively influenced your week and why?',
  'What\'s one small step you can take today toward a bigger goal?',
  'How are you feeling right now, and what\'s behind that feeling?',
  'What\'s one thing you could let go of today?',
  'What have you accomplished recently that you\'re proud of?',
  'What do you need more of in your life right now?',
  'What would your ideal version of today look like?',
  'What\'s one habit you\'d like to start, stop, or change?',
  'What did you learn this week that surprised you?',
  'What\'s on your mind that you haven\'t said out loud yet?',
  'Where is your energy best spent today?',
  'What boundaries do you need to set or maintain today?',
  'What are you looking forward to this week?',
  'What conversation have you been avoiding?',
  'What does rest mean to you right now?',
];

const DAILY_QUOTES: { text: string; author: string }[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'You are never too old to set another goal or to dream a new dream.', author: 'C.S. Lewis' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { text: 'Don\'t watch the clock; do what it does. Keep going.', author: 'Sam Levenson' },
  { text: 'Keep your face always toward the sunshine, and shadows will fall behind you.', author: 'Walt Whitman' },
  { text: 'You miss 100% of the shots you don\'t take.', author: 'Wayne Gretzky' },
  { text: 'Whether you think you can or you think you can\'t, you\'re right.', author: 'Henry Ford' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'An unexamined life is not worth living.', author: 'Socrates' },
  { text: 'Spread love everywhere you go. Let no one ever come to you without leaving happier.', author: 'Mother Teresa' },
  { text: 'When you reach the end of your rope, tie a knot in it and hang on.', author: 'Franklin D. Roosevelt' },
  { text: 'Always remember that you are absolutely unique. Just like everyone else.', author: 'Margaret Mead' },
  { text: 'Do not go where the path may lead, go instead where there is no path and leave a trail.', author: 'Ralph Waldo Emerson' },
  { text: 'You will face many defeats in life, but never let yourself be defeated.', author: 'Maya Angelou' },
  { text: 'The greatest glory in living lies not in never falling, but in rising every time we fall.', author: 'Nelson Mandela' },
  { text: 'In the end, it\'s not the years in your life that count. It\'s the life in your years.', author: 'Abraham Lincoln' },
  { text: 'Life is what happens when you\'re busy making other plans.', author: 'John Lennon' },
  { text: 'Spread your wings and let the fairy in you fly.', author: 'Unknown' },
  { text: 'You have brains in your head. You have feet in your shoes. You can steer yourself any direction you choose.', author: 'Dr. Seuss' },
  { text: 'If life were predictable it would cease to be life, and be without flavor.', author: 'Eleanor Roosevelt' },
  { text: 'If you look at what you have in life, you\'ll always have more.', author: 'Oprah Winfrey' },
  { text: 'If you want to live a happy life, tie it to a goal, not to people or things.', author: 'Albert Einstein' },
  { text: 'Never let the fear of striking out keep you from playing the game.', author: 'Babe Ruth' },
  { text: 'Money and success don\'t change people; they merely amplify what is already there.', author: 'Will Smith' },
  { text: 'Your time is limited, so don\'t waste it living someone else\'s life.', author: 'Steve Jobs' },
  { text: 'Not how long, but how well you have lived is the main thing.', author: 'Seneca' },
  { text: 'If life is not a great adventure, it is nothing.', author: 'Helen Keller' },
  { text: 'Many of life\'s failures are people who did not realize how close they were to success when they gave up.', author: 'Thomas A. Edison' },
  { text: 'You only live once, but if you do it right, once is enough.', author: 'Mae West' },
];

function getDailyQuote() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ── Layout Styled Components ── */

const Page = styled.div`
  display: flex;
  flex-direction: column;
  padding: 44px 56px 72px;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
  /* Phones: narrow side margins so Quick Entry uses the width */
  @media (max-width: 640px) { padding: 28px 18px 56px; }
`;

/* DS dashboard header: big date numeral left, weather right, under a hairline rule. */
const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 22px;
  padding-bottom: 36px;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: nowrap;
  @media (max-width: 640px) { gap: 12px; margin-bottom: 18px; padding-bottom: 28px; }
`;

const GreetingBlock = styled.div`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 32px;
  min-width: 0;
  @media (max-width: 640px) { gap: 16px; }
`;

const SidebarToggleBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0;
  line-height: 1;
  color: var(--ink-3, ${({ theme }) => theme.colors.textMuted});
  cursor: pointer;
  font-size: 18px;
  transition: color 120ms ease;
  &:hover { color: var(--ink); }

  @media (max-width: 1366px) { display: none; }
`;

/* DS big date numeral block. */
const DateNumeral = styled.div`
  font-family: var(--font-display);
  font-size: 88px;
  font-weight: 200;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
  padding: 0;
  flex-shrink: 0;
`;

const DateInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  /* Nudge the text block down so its first line aligns with the visible top
     of the big numeral (which has font ascent space above the digit). */
  padding-top: 12px;
`;

const DateLabel = styled.p`
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 2px 0 0 0;
`;

const DailyPrompt = styled.p`
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 300;
  font-style: italic;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
  max-width: 720px;
`;

/* The quote's author on its own line, a step dimmer (same type as the quote) */
const QuoteBy = styled(DailyPrompt)`
  margin-top: -4px;
  color: var(--text-tertiary);
`;

const Greeting = styled.h1`
  font-family: var(--font-display, ${({ theme }) => theme.fontFamily.serif});
  font-size: 40px;
  font-weight: 200;
  font-style: normal;
  line-height: 1.2;
  color: var(--text-primary, ${({ theme }) => theme.colors.text});
  margin: 0;
  letter-spacing: -0.01em;
  @media (max-width: 640px) { font-size: 28px; }
`;

const DateLine = styled.p`
  font-family: var(--font-label, ${({ theme }) => theme.fontFamily.sans});
  font-size: 10px;
  font-weight: 700;
  font-style: normal;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-tertiary, ${({ theme }) => theme.colors.textFaint});
  margin: 6px 0 0;
`;

const DateLineRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

/* Sun icon beside a column of temperature over city, right-aligned */
const InlineWeatherWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
`;

const WeatherText = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
`;

/* Weather sits up at the top, level with the date line */
const WeatherSlot = styled.div`
  align-self: flex-start;
  padding-top: 12px;
  flex-shrink: 0;
  /* Phones: leave the header to the date and quote */
  @media (max-width: 640px) { display: none; }
`;

const InlineTemp = styled.div`
  font-family: var(--font-display);
  font-size: 33px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
`;

const WeatherCity = styled.div`
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--text-tertiary);
  text-align: right;
`;

const InlineHiLo = styled.span`
  font-family: var(--sans, ${({ theme }) => theme.fontFamily.sans});
  font-style: normal;
  font-size: 10px;
  color: var(--ink-4, ${({ theme }) => theme.colors.textFaint});
`;

const QuoteBlock = styled.blockquote`
  margin: 0;
  max-width: 320px;
  text-align: right;
  align-self: end;
  padding-bottom: 4px;
  @media (max-width: 640px) { display: none; }
`;

const QuoteText = styled.p`
  font-family: var(--serif, ${({ theme }) => theme.fontFamily.serif});
  font-size: 15px;
  font-weight: 400;
  font-style: italic;
  color: var(--ink-2, ${({ theme }) => theme.colors.textSecondary});
  margin: 0;
  line-height: 1.5;
`;

const QuoteAuthor = styled.cite`
  display: block;
  margin-top: 4px;
  font-family: var(--mono, ${({ theme }) => theme.fontFamily.mono});
  font-size: 10px;
  font-style: normal;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-4, ${({ theme }) => theme.colors.textFaint});
`;

/* Widget = flat section sitting directly on the canvas — no fill, border, or shadow. */
const DashCard = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const CardBody = styled.div`
  padding: 0;
  flex: 1;
`;

/* Quick Entry = full-width, untitled, directly under the date header. */
const QuickEntryDashCard = styled(DashCard)`
  /* Fill the rest of the page so the save bar sits at the bottom. */
  flex: 1 0 auto;

  & ${CardBody} {
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: visible;
    background: transparent;
  }

  /* Topic picker trigger only (direct child button), not dropdown options. */
  /* An outlined pill; the entry text below starts on its left edge */
  & .qe-topic-picker > div > button {
    border: 1px solid var(--border-default);
    border-radius: 999px;
    background: transparent;
    padding: 8px 16px 8px 18px;
    gap: 14px;
  }
  & .qe-topic-picker > div > button:hover { background: transparent; border-color: var(--border-strong); }
  /* Dropdown menu: the absolutely-positioned div inside the picker wrapper. */
  & .qe-topic-picker > div > div { border: none; }
`;

const QuickEditorWrap = styled.div`
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  background: transparent;
  margin-bottom: 0;

  > div { min-height: 120px; height: auto; }
  /* EditorContent's wrapper — stretch so .tiptap (flex: 1) fills the area. */
  div:has(> .tiptap) { flex: 1; display: flex; flex-direction: column; }

  .tiptap {
    /* Flush left — the text starts on the same edge as the topic picker */
    padding: 24px 16px 16px 0;
    font-family: var(--font-display);
    font-style: italic;
    font-size: 17px;
    font-weight: 300;
    line-height: 1.5;
    min-height: 130px;
    height: auto;
    color: var(--text-primary);
    outline: none;
  }

  &:focus-within {
    background: transparent;
  }
`;

/* Rule above the fields only when the editor sits above them — with no text
   area the fields follow the topic picker directly (like the journal editor) */
const FieldsBlock = styled.div<{ $ruled: boolean }>`
  margin-top: 8px;
  padding-top: ${({ $ruled }) => ($ruled ? '8px' : '0')};
  border-top: ${({ $ruled }) => ($ruled ? '1px solid var(--border-strong)' : 'none')};
`;

/* Always a rule above Save — the card's one consistent bottom edge */
const SaveRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  padding-bottom: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--border-strong);
`;

/* Topic picker on the left, dictation + formatting toggles across from it. */
const TopicRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
`;

const TopicRowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

const FooterIconBtn = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  border-radius: 0;
  color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--text-secondary)'};
  font-size: 17px;
  cursor: pointer;
  transition: color 120ms ease;
  &:hover { color: var(--text-primary); }
`;

/* DS "Capture"/Save action — outlined accent pill. */
const SaveBtn = styled.button<{ $accent: string; $active?: boolean }>`
  padding: 7px 20px;
  font-family: var(--font-label, ${({ theme }) => theme.fontFamily.sans});
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  background: transparent;
  color: var(--color-accent);
  border: 1px solid var(--color-accent);
  border-radius: var(--r-full, 999px);
  cursor: ${({ $active }) => $active ? 'pointer' : 'not-allowed'};
  transition: background 150ms ease, color 150ms ease;
  &:hover:not(:disabled) { background: var(--color-accent-subtle); }
`;

const StatusText = styled.span`
  font-family: var(--mono, ${({ theme }) => theme.fontFamily.mono});
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--success, ${({ theme }) => theme.colors.success});
`;

/* ── Topic field definitions ── */

type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'time' | 'select';
interface FieldDef { key: string; label: string; type: FieldType; options?: string[]; unit?: string; }

/* Topics that are written in their fields, not a text area — the same set the
   journal editor hides its text area for (where Quick Entry has the fields).
   Their text is generated on save (utils/entryText). */
/** Meals nutrients — shown together in the nutrition panel */
const NUTRIENT_KEYS = new Set<string>(NUTRIENTS.map(n => n.key));

/** Topics whose Quick Entry fields are the journal editor's own field forms */
const JOURNAL_FIELDS: Record<string, string> = {
  meals: 'food', medication: 'medication', symptom: 'symptom', exercise: 'exercise',
  event: 'event', events: 'event', meeting: 'meeting', meetings: 'meeting',
  allergy: 'allergy', task: 'task',
};

const QE_FIELDS_ONLY = new Set([
  'meals', 'medication', 'allergy', 'exercise', 'event', 'events', 'meeting', 'meetings',
  'book', 'books', 'quote', 'quotes', 'music', 'wellness',
  'goal', 'goals', 'milestone', 'milestones',
  'shopping list', 'shopping lists', 'menu plan', 'meal plan', 'recipe', 'recipes',
]);

const SHOPPING_TOPICS = ['shopping list', 'shopping lists'];
const MENU_PLAN_TOPICS = ['menu plan', 'meal plan'];

const TOPIC_FIELDS: Record<string, FieldDef[]> = {
  'medication':  [],
  'symptom':     [{ key: 'severity', label: 'Severity', type: 'select', options: ['Mild', 'Moderate', 'Severe'] }, { key: 'duration', label: 'Duration', type: 'text' }],
  'meals':       [
    { key: 'mealDescription', label: 'Meal Description', type: 'text' },
    { key: 'mealType', label: 'Meal', type: 'select', options: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Supplement'] },
    { key: 'calories', label: 'Calories', type: 'number' },
    { key: 'iron', label: 'Iron', type: 'number', unit: 'mg' },
    { key: 'vitaminD', label: 'Vitamin D', type: 'number', unit: 'mcg' },
    { key: 'vitaminB12', label: 'Vitamin B12', type: 'number', unit: 'mcg' },
    { key: 'vitaminC', label: 'Vitamin C', type: 'number', unit: 'mg' },
    { key: 'ingredients', label: 'Ingredients', type: 'text' },
  ],
  'exercise':    [{ key: 'exerciseType', label: 'Type', type: 'text' }, { key: 'duration', label: 'Duration (min)', type: 'number' }, { key: 'intensity', label: 'Intensity', type: 'select', options: ['Low', 'Medium', 'High'] }],
  'allergy':     [{ key: 'allergen', label: 'Allergen', type: 'text' }, { key: 'severity', label: 'Severity', type: 'select', options: ['Mild', 'Moderate', 'Severe'] }, { key: 'reaction', label: 'Reaction', type: 'text' }],
  'task':        [{ key: 'priority', label: 'Priority', type: 'select', options: ['urgent', 'high', 'medium', 'low', 'none'] }],
  'event':       [{ key: 'eventName', label: 'Event Name', type: 'text' }, { key: 'startDate', label: 'Date', type: 'date' }, { key: 'startTime', label: 'Time', type: 'time' }],
  'meeting':     [{ key: 'meetingName', label: 'Meeting Name', type: 'text' }, { key: 'startDate', label: 'Date', type: 'date' }, { key: 'startTime', label: 'Time', type: 'time' }],
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Widget: Quick Entry ── */

function QuickEntryCard({ accentColor, topics }: { accentColor: string; topics: Topic[] }) {
  const { encryptPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const cycleTrackingEnabled = useUIStore(s => s.cycleTrackingEnabled);
  const [content, setContent] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  /** Shopping lists: their text is just a title */
  const [listTitle, setListTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [dictationInterim, setDictationInterim] = useState('');
  const dictationControlRef = useRef<DictationControls | null>(null);

  const reflectionPrompt = useMemo(() => {
    const d = new Date();
    const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
    return REFLECTION_PROMPTS[dayOfYear % REFLECTION_PROMPTS.length];
  }, []);

  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const allEntries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const selectedTopic = topics.find(t => t.id === selectedTopicId) ?? null;
  // Same field forms as the journal editor where there is one; the generic rows otherwise
  const journalType = selectedTopic ? JOURNAL_FIELDS[selectedTopic.name.toLowerCase()] : undefined;
  const fieldDefs = selectedTopic && !journalType ? (TOPIC_FIELDS[selectedTopic.name.toLowerCase()] ?? []) : [];
  const calendarSyncEnabled = useUIStore(s => s.calendarSyncEnabled);
  const isMealsTopic = selectedTopic?.name.toLowerCase() === 'meals';
  const aiReady = useAiReady();
  const userFieldDefs = selectedTopicId != null ? (topicCustomFields[selectedTopicId] ?? []) : [];

  const isTaskTopic = selectedTopic?.name.toLowerCase() === 'task';
  const isMedicationTopic = selectedTopic?.name.toLowerCase() === 'medication';
  const isWellnessTopic = selectedTopic?.name.toLowerCase() === 'wellness';
  const isGoalTopic = ['goal', 'goals'].includes(selectedTopic?.name.toLowerCase() ?? '');
  const isMilestoneTopic = ['milestone', 'milestones'].includes(selectedTopic?.name.toLowerCase() ?? '');
  const isShoppingTopic = SHOPPING_TOPICS.includes(selectedTopic?.name.toLowerCase() ?? '');
  const isMenuPlanTopic = MENU_PLAN_TOPICS.includes(selectedTopic?.name.toLowerCase() ?? '');
  const isRecipeTopic = ['recipe', 'recipes'].includes(selectedTopic?.name.toLowerCase() ?? '');
  // Shopping lists a recipe can link to (as in the journal editor)
  const shoppingListOptions = useMemo(() => {
    const listIds = new Set(allTopics.filter(t => SHOPPING_TOPICS.includes(t.name.toLowerCase())).map(t => t.id));
    if (!listIds.size) return [];
    return allEntries
      .filter(e => listIds.has((e.metadata as Record<string, unknown>)?._taxonomyId as number))
      .map(e => ({ id: e.id, title: stripHtml(e.content).slice(0, 60) || `Shopping List #${e.id}` }));
  }, [allEntries, allTopics]);
  // Recipes to link from shopping lists and menu plans (as in the journal editor)
  const recipeOptions = useMemo(() => {
    const recipeIds = new Set(allTopics.filter(t => ['recipe', 'recipes'].includes(t.name.toLowerCase())).map(t => t.id));
    if (!recipeIds.size) return [];
    return allEntries
      .filter(e => recipeIds.has((e.metadata as Record<string, unknown>)?._taxonomyId as number))
      .map(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
        const name = typeof cf?.recipeName === 'string' ? cf.recipeName.trim() : '';
        return { id: e.id, title: name || stripHtml(e.content).slice(0, 60) || `Recipe #${e.id}` };
      });
  }, [allEntries, allTopics]);
  const goalTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'goal')?.id, [allTopics]);
  const milestoneTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'milestone')?.id, [allTopics]);
  const goalOptions = useMemo(() => {
    if (!goalTopicId) return [];
    return allEntries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === goalTopicId)
      .map(e => ({ id: e.id, title: stripHtml(e.content).slice(0, 60) || 'Untitled' }));
  }, [allEntries, goalTopicId]);
  const milestoneOptions = useMemo(() => {
    if (!milestoneTopicId) return [];
    return allEntries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === milestoneTopicId)
      .map(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> || {};
        return { id: e.id, title: stripHtml(e.content).slice(0, 60) || 'Untitled', parentGoalId: (cf.parentGoalId as number) || null };
      });
  }, [allEntries, milestoneTopicId]);
  const visibleMilestones = useMemo(() => {
    const selectedGoalId = customFields.parentGoalId as number | undefined;
    if (!selectedGoalId) return milestoneOptions;
    return milestoneOptions.filter(m => m.parentGoalId === selectedGoalId);
  }, [milestoneOptions, customFields.parentGoalId]);

  const hasContent = !!stripHtml(content).trim();
  const userFields = (customFields._userFields as Record<string, unknown>) ?? {};
  const topicHideText = useUIStore(s => s.topicHideText);
  const topicLower = selectedTopic?.name.toLowerCase() ?? '';
  // Same as the journal editor: no text area for field-written topics (and
  // custom topics set to hide it), unless text was already typed
  const fieldsOnly = selectedTopic !== null && !hasContent
    && (QE_FIELDS_ONLY.has(topicLower) || (!!topicHideText[selectedTopic.id] && userFieldDefs.length > 0));
  const menuWeek = typeof customFields.weekStart === 'string' ? customFields.weekStart : '';
  const generatedText = !selectedTopic ? ''
    : isShoppingTopic ? (listTitle.trim() || defaultShoppingListTitle())
    : isMenuPlanTopic ? (menuWeek ? `Menu: week of ${menuWeek}` : 'Menu plan')
    : isRecipeTopic ? (typeof customFields.recipeName === 'string' ? customFields.recipeName.trim() : '')
    : generatedEntryText(topicLower, customFields, userFieldDefs);
  const isFilled = (v: unknown) => v !== '' && v != null && v !== false && !(Array.isArray(v) && v.length === 0);
  const hasFieldValue = Object.entries(customFields).some(([k, v]) => !k.startsWith('_') && isFilled(v))
    || Object.values(userFields).some(isFilled);
  const hasPlanOrList = (Array.isArray(customFields.items) && customFields.items.length > 0)
    || !!listTitle.trim() || !!menuWeek
    || Object.keys((customFields.days as Record<string, unknown>) ?? {}).length > 0;
  const canSave = hasContent || ((isShoppingTopic || isMenuPlanTopic) ? hasPlanOrList : !!generatedText)
    || (selectedTopic !== null && hasFieldValue);
  const hasFieldsBelow = fieldDefs.length > 0 || !!journalType || isTaskTopic || isMedicationTopic || isWellnessTopic || isGoalTopic || isMilestoneTopic || isShoppingTopic || isMenuPlanTopic || isRecipeTopic || userFieldDefs.length > 0;

  const setField = (key: string, value: unknown) => setCustomFields(prev => ({ ...prev, [key]: value }));

  // Wellness is one check-in per day: start from today's values (same entry the
  // Health dashboard and journal edit)
  const todaysCheckIn = () => {
    const day = toDateStr(new Date());
    return useEntriesStore.getState().decryptedEntries.find(e => {
      const meta = e.metadata as Record<string, unknown>;
      return meta._widgetType === 'wellness-checkin'
        && (meta._customFields as Record<string, unknown> | undefined)?.date === day;
    }) ?? null;
  };

  const handleTopicChange = (id: number | null) => {
    setSelectedTopicId(id);
    setListTitle('');
    const topic = topics.find(t => t.id === id);
    if (topic?.name.toLowerCase() === 'wellness') {
      const existing = todaysCheckIn();
      setCustomFields({ ...(((existing?.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {}) });
    } else {
      setCustomFields({});
    }
  };

  // Wellness saves into today's check-in entry (created if missing), never a second one
  const saveWellness = async (topicId: number) => {
    const existing = todaysCheckIn();
    const prevCf = ((existing?.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
    const cf: Record<string, unknown> = {
      sleepQuality: 0, waterGoal: WATER_GOAL, ...prevCf, ...customFields, date: toDateStr(new Date()),
    };
    const w = Number(cf.waterGlasses) || 0, g = Number(cf.waterGoal) || WATER_GOAL;
    const m = Number(cf.moodScore) || 0, sl = Number(cf.sleepHours) || 0;
    const parts = [w > 0 ? `${w}/${g} glasses` : '', m > 0 ? `Mood ${m}/5` : '', sl > 0 ? `${sl}h sleep` : ''].filter(Boolean);
    const text = `<p>${parts.join(' · ') || 'Wellness check-in'}</p>`;
    const metadata = { ...((existing?.metadata as Record<string, unknown>) ?? {}), _taxonomyId: topicId, _widgetType: 'wellness-checkin', _customFields: cf };
    const encrypted = await encryptPost(text, metadata);
    const payload = {
      contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      isEncrypted: true as const, taxonomyIds: [topicId],
    };
    if (existing) {
      await entriesApi.update(existing.id, payload);
      updateDecryptedEntry(existing.id, { content: text, metadata });
    } else {
      const result = await entriesApi.create(payload);
      const created = new Date(result.createdAt as string);
      addDecryptedEntry({ id: result.id as number, content: text, metadata, isEncrypted: true, createdAt: created, updatedAt: created });
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isWellnessTopic && selectedTopic) {
        await saveWellness(selectedTopic.id);
        setContent('');
        setSelectedTopicId(null);
        setCustomFields({});
        return;
      }
      // Fields-only entries carry generated text as their title in every list
      const finalContent = !hasContent && generatedText ? `<p>${escapeHtml(generatedText)}</p>` : content;
      const effectiveTopicId = selectedTopic ? selectedTopic.id : await getOrCreateJournalTopic();
      const metadata: Record<string, unknown> = { _taxonomyId: effectiveTopicId };
      // Meals: with the AI assistant on, blank nutrients are filled in (typed ones are kept)
      let fieldsToSave = customFields;
      if (isMealsTopic && aiReady) {
        fieldsToSave = (await autoNutritionOnSave(stripHtml(finalContent), customFields).catch(() => null)) ?? customFields;
      }
      if ((fieldDefs.length > 0 || !!journalType || userFieldDefs.length > 0 || isMedicationTopic || isTaskTopic || isGoalTopic || isMilestoneTopic || isShoppingTopic || isMenuPlanTopic || isRecipeTopic) && selectedTopic) metadata._customFields = fieldsToSave;
      const encrypted = await encryptPost(finalContent, metadata);
      const result = await entriesApi.create({
        contentEncrypted: encrypted.contentEncrypted,
        contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted,
        metadataIv: encrypted.metadataIv,
        isEncrypted: true,
        taxonomyIds: [effectiveTopicId],
      });
      addDecryptedEntry({ id: result.id as number, content: finalContent, metadata, isEncrypted: true, createdAt: new Date(result.createdAt as string), updatedAt: new Date(result.createdAt as string) });
      setContent('');
      setListTitle('');
      setSelectedTopicId(null);
      setCustomFields({});
    } finally {
      setSaving(false);
    }
  };

  return (
    <QuickEntryDashCard>
      <CardBody>
        <TopicRow>
          <div className="qe-topic-picker">
            <TopicSelector selectedId={selectedTopicId} onSelect={handleTopicChange} topics={topics} filled allowNone={false} />
          </div>
          {!fieldsOnly && <TopicRowActions>
            <FooterIconBtn
              title={isListening ? 'Stop dictation' : 'Dictate'}
              $active={isListening}
              onClick={() => dictationControlRef.current?.toggle()}
              type="button"
            >
              <MaterialIcon $size={25}>mic</MaterialIcon>
            </FooterIconBtn>
            <FooterIconBtn
              title={toolbarOpen ? 'Hide formatting' : 'Show formatting'}
              $active={toolbarOpen}
              onClick={() => setToolbarOpen(o => !o)}
              type="button"
            >
              <MaterialIcon $size={25}>stylus_fountain_pen</MaterialIcon>
            </FooterIconBtn>
          </TopicRowActions>}
        </TopicRow>
        {!fieldsOnly && (
          <QuickEditorWrap>
            <Editor
              content={content}
              onChange={setContent}
              placeholder={selectedTopicId === null ? reflectionPrompt : 'Add a note...'}
              onEnterSave={handleSave}
              hideToolbarToggle
              toolbarOpen={toolbarOpen}
              onToolbarToggle={setToolbarOpen}
              dictationControlRef={dictationControlRef}
              onDictationChange={(listening, interim) => { setIsListening(listening); setDictationInterim(interim); }}
            />
          </QuickEditorWrap>
        )}
        {dictationInterim && (
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--ink-4)', padding: '2px 0 4px' }}>
            {dictationInterim}
          </div>
        )}
        {/* The topic's fields sit under a rule when the editor is above them */}
        {hasFieldsBelow && <FieldsBlock $ruled={!fieldsOnly}>
        <FieldRowLayoutContext.Provider value={true}>
        {journalType && (() => {
          const cf = customFields;
          const set = (v: unknown) => setCustomFields(v as Record<string, unknown>);
          switch (journalType) {
            case 'food': return <FoodFields values={{ mealType: 'breakfast', consumedDate: '', consumedTime: '', ingredients: '', calories: '', notes: '', ...cf } as FoodFieldValues} onChange={set} />;
            case 'medication': return <MedicationFields values={{ dosage: '', frequency: 'once_daily', scheduleTimes: ['08:00'], isActive: true, notes: '', ...cf } as MedicationFieldValues} onChange={set} entryName={typeof cf.medicationName === 'string' ? cf.medicationName.trim() : ''} />;
            case 'symptom': return <SymptomFields values={{ severity: 5, occurredDate: '', occurredTime: '', duration: '', notes: '', ...cf } as SymptomFieldValues} onChange={set} />;
            case 'exercise': return <ExerciseFields values={{ exerciseType: 'running', duration: '', intensity: 'medium', distance: '', distanceUnit: 'miles', calories: '', performedDate: '', performedTime: '', notes: '', ...cf } as ExerciseFieldValues} onChange={set} />;
            case 'event': return <EventFields values={{ startDate: '', startTime: '', endDate: '', endTime: '', location: '', address: '', phone: '', notes: '', ...cf } as EventFieldValues} onChange={set} showCalendarSync={calendarSyncEnabled} />;
            case 'meeting': return <MeetingFields values={{ startDate: '', startTime: '', endDate: '', endTime: '', meetingTopic: '', attendees: '', location: '', address: '', phone: '', notes: '', ...cf } as MeetingFieldValues} onChange={set} showCalendarSync={calendarSyncEnabled} />;
            case 'allergy': return <AllergyFields values={{ allergen: '', severity: 5, reaction: '', occurredDate: '', occurredTime: '', notes: '', ...cf } as AllergyFieldValues} onChange={set} />;
            case 'task': return <TaskFields values={{ isInProgress: false, isCompleted: false, isAutoMigrating: true, parentGoalId: null, parentMilestoneId: null, priority: 'none', deadline: '', ...cf } as TaskFieldValues} onChange={set} goalOptions={goalOptions} milestoneOptions={milestoneOptions} />;
            default: return null;
          }
        })()}
        {fieldDefs.length > 0 && fieldDefs.map(f => isMealsTopic && NUTRIENT_KEYS.has(f.key) ? (
          // Meals: the nutrients share one panel, placed where calories sit
          f.key === 'calories' && (
            <NutritionPanel
              key="nutrition"
              values={customFields as Partial<Record<NutrientKey, unknown>>}
              onChange={(key, v) => setField(key, v === '' ? '' : Number(v))}
            />
          )
        ) : (
          <FormField key={f.key} label={f.unit ? <UnitLabel label={f.label} unit={f.unit} /> : f.label}>
            {f.type === 'boolean' ? (
              <Checkbox
                checked={!!customFields[f.key]}
                onChange={checked => setField(f.key, checked)}
                label={f.label}
              />
            ) : f.type === 'select' ? (
              <Select value={(customFields[f.key] as string) || ''} onChange={e => setField(f.key, e.target.value)}>
                <option value=""></option>
                {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : (
              <TextInput
                type={f.type}
                placeholder={f.type === 'number' ? '0' : `Add ${f.label.toLowerCase()}…`}
                value={(customFields[f.key] as string) ?? ''}
                onChange={e => setField(f.key, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
              />
            )}
          </FormField>
        ))}
        {isTaskTopic && !journalType && (
          <>
            <FormField label="Goal">
              <Select
                value={(customFields.parentGoalId as number | undefined) ?? ''}
                onChange={e => setCustomFields(prev => ({ ...prev, parentGoalId: e.target.value ? Number(e.target.value) : undefined, parentMilestoneId: undefined }))}
              >
                <option value="">No goal</option>
                {goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </Select>
            </FormField>
            <FormField label="Milestone">
              <Select
                value={(customFields.parentMilestoneId as number | undefined) ?? ''}
                onChange={e => setField('parentMilestoneId', e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">No milestone</option>
                {visibleMilestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </Select>
            </FormField>
          </>
        )}
        {isMedicationTopic && !journalType && (
          <>
            <FormField label="Medication Name">
              <TextInput
                type="text"
                placeholder="e.g. Montelukast"
                value={(customFields.medicationName as string) ?? ''}
                onChange={e => setField('medicationName', e.target.value)}
              />
            </FormField>
            <FormField label="Dosage">
              <TextInput
                type="text"
                placeholder="e.g. 500mg"
                value={(customFields.dosage as string) ?? ''}
                onChange={e => setField('dosage', e.target.value)}
              />
            </FormField>
            <FormField label="Frequency">
              <Select value={(customFields.frequency as string) || 'once_daily'} onChange={e => setField('frequency', e.target.value)}>
                <option value="once_daily">Once daily</option>
                <option value="twice_daily">Twice daily</option>
                <option value="three_times_daily">Three times daily</option>
                <option value="as_needed">As needed</option>
                <option value="custom">Custom</option>
              </Select>
            </FormField>
            <FormField label="Schedule Times">
              <div>
                {((customFields.scheduleTimes as string[]) ?? []).map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <TextInput
                      type="time"
                      value={t}
                      onChange={e => {
                        const times = [...((customFields.scheduleTimes as string[]) ?? [])];
                        times[i] = e.target.value;
                        setField('scheduleTimes', times);
                      }}
                    />
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.5, fontSize: 12 }}
                      onClick={() => setField('scheduleTimes', ((customFields.scheduleTimes as string[]) ?? []).filter((_, j) => j !== i))}
                    >✕</button>
                  </div>
                ))}
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'inherit', opacity: 0.6, padding: '2px 0' }}
                  onClick={() => setField('scheduleTimes', [...((customFields.scheduleTimes as string[]) ?? []), '08:00'])}
                >+ Add time</button>
              </div>
            </FormField>
            <FormField label="Active">
              <Checkbox
                checked={!!(customFields.isActive ?? true)}
                onChange={checked => setField('isActive', checked)}
                label="Currently active"
              />
            </FormField>
          </>
        )}
        {isShoppingTopic && (
          <>
            <FormField label="Title">
              <TextInput value={listTitle} onChange={e => setListTitle(e.target.value)} placeholder={defaultShoppingListTitle()} />
            </FormField>
            <ShoppingListFields
              values={{ items: [], notes: '', linkedRecipeIds: [], ...customFields } as ShoppingListFieldValues}
              onChange={v => setCustomFields(v as unknown as Record<string, unknown>)}
              recipeOptions={recipeOptions}
            />
          </>
        )}
        {isRecipeTopic && (
          <RecipeFields
            values={{ servings: '', prepTime: '', cookTime: '', cuisine: '', ingredients: [], instructions: '', linkedShoppingListIds: [], ...customFields } as RecipeFieldValues}
            onChange={v => setCustomFields(v as unknown as Record<string, unknown>)}
            shoppingListOptions={shoppingListOptions}
          />
        )}
        {isMenuPlanTopic && (
          <MenuPlanFields
            values={{ weekStart: '', days: {}, ...customFields } as MenuPlanFieldValues}
            onChange={v => setCustomFields(v as unknown as Record<string, unknown>)}
            recipeOptions={recipeOptions}
          />
        )}
        {isGoalTopic && (
          <GoalFields
            values={{ goalType: 'short_term', goalStatus: 'new', targetDate: '', ...customFields } as GoalFieldValues}
            onChange={v => setCustomFields(v as unknown as Record<string, unknown>)}
          />
        )}
        {isMilestoneTopic && (
          <MilestoneFields
            values={{ milestoneStatus: 'not_started', targetDate: '', isCompleted: false, parentGoalId: null, ...customFields } as MilestoneFieldValues}
            onChange={v => setCustomFields(v as unknown as Record<string, unknown>)}
            goalOptions={goalOptions}
          />
        )}
        {isWellnessTopic && (
          <WellnessPanel
            water={Number(customFields.waterGlasses) || 0}
            waterGoal={Number(customFields.waterGoal) || WATER_GOAL}
            sleep={Number(customFields.sleepHours) || 0}
            mood={Number(customFields.moodScore) || 0}
            flow={((customFields.flowIntensity as string) || '') as FlowIntensity}
            onWater={v => setField('waterGlasses', v)}
            onSleep={v => setField('sleepHours', v)}
            onMood={v => setField('moodScore', v)}
            onFlow={f => setCustomFields(prev => ({ ...prev, flowIntensity: f, periodToday: f !== '' }))}
            showCycle={cycleTrackingEnabled}
          />
        )}
        {userFieldDefs.length > 0 && (
          <UserFieldsForm
            fieldDefs={userFieldDefs}
            values={(customFields._userFields as Record<string, unknown>) ?? {}}
            onChange={vals => setCustomFields(prev => ({ ...prev, _userFields: vals }))}
          />
        )}
        </FieldRowLayoutContext.Provider>
        </FieldsBlock>}
        <SaveRow>
          <SaveBtn $accent={accentColor} $active={canSave} onClick={handleSave} disabled={saving || !canSave}>
            {saving ? <Spinner size={10} /> : 'Save'}
          </SaveBtn>
        </SaveRow>
      </CardBody>
    </QuickEntryDashCard>
  );
}

/* ── Weather (inline header) ── */

interface CurrentWeather {
  temp: number;
  code: number;
}

const US_STATES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
  NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',
};

function geocodeCity(cityName: string): Promise<{ latitude: number; longitude: number }> {
  const [cityPart, qualifierRaw] = cityName.split(',');
  const searchName = cityPart.trim();
  const qualifier = qualifierRaw?.trim().toUpperCase() ?? '';
  return fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchName)}&count=10&language=en&format=json`
  )
    .then(r => r.json())
    .then((data: { results?: { latitude: number; longitude: number; admin1?: string; country_code?: string; country?: string }[] }) => {
      if (!data.results?.length) throw new Error(`City "${cityName}" not found`);
      let result = data.results[0];
      if (qualifier) {
        const fullState = US_STATES[qualifier];
        const match = data.results.find(r =>
          (fullState && r.admin1?.toLowerCase() === fullState.toLowerCase()) ||
          r.country_code?.toUpperCase() === qualifier ||
          r.admin1?.toUpperCase().startsWith(qualifier) ||
          r.country?.toUpperCase().startsWith(qualifier)
        );
        if (match) result = match;
      }
      return { latitude: result.latitude, longitude: result.longitude };
    });
}

function InlineWeather() {
  const cityName = useUIStore(s => s.weatherCity);

  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [todayHiLo, setTodayHiLo] = useState<{ max: number; min: number } | null>(null);

  useEffect(() => {
    if (!cityName) { setLat(null); setLon(null); setCurrent(null); setTodayHiLo(null); return; }
    geocodeCity(cityName)
      .then(({ latitude, longitude }) => { setLat(latitude); setLon(longitude); })
      .catch(() => {});
  }, [cityName]);

  useEffect(() => {
    if (lat == null || lon == null) return;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min&current=temperature_2m,weathercode` +
      `&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`
    )
      .then(r => r.json())
      .then((data: {
        current: { temperature_2m: number; weathercode: number };
        daily: { temperature_2m_max: number[]; temperature_2m_min: number[] };
      }) => {
        setCurrent({ temp: Math.round(data.current.temperature_2m), code: data.current.weathercode });
        setTodayHiLo({ max: Math.round(data.daily.temperature_2m_max[0]), min: Math.round(data.daily.temperature_2m_min[0]) });
      })
      .catch(() => {});
  }, [lat, lon]);

  if (!current) return null;

  const condition = current.code === 0 ? 'Sunny' : 'Cloudy';
  return (
    <InlineWeatherWrap>
      <Icon name="sun" size={33} strokeWidth={1.3} style={{ color: 'var(--color-accent)' }} />
      <WeatherText>
        <InlineTemp>{current.temp}°</InlineTemp>
        <WeatherCity>{cityName ? cityName.split(',')[0].trim() : ''}</WeatherCity>
      </WeatherText>
    </InlineWeatherWrap>
  );
}

/* ── Main View ── */

export function DashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const allTopics = useEntriesStore(s => s.allTopics);
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;

  const today = new Date();

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to view your dashboard" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  if (isLoading || !isReady) return (
    <ContentTemplate>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Spinner size={40} />
      </div>
    </ContentTemplate>
  );

  return (
    <ContentTemplate>
      <Page>
        <PageHeader>
          <GreetingBlock>
            <DateNumeral>{today.getDate()}</DateNumeral>
            <DateInfo>
              <DateLabel>{`${today.toLocaleDateString('en-US', { weekday: 'long' })}, ${today.toLocaleDateString('en-US', { month: 'long' })}`}</DateLabel>
              <DailyPrompt>{getDailyQuote().text}</DailyPrompt>
              <QuoteBy>— {getDailyQuote().author}</QuoteBy>
            </DateInfo>
          </GreetingBlock>
          <WeatherSlot><InlineWeather /></WeatherSlot>
        </PageHeader>

        <QuickEntryCard accentColor={accentColor} topics={allTopics} />
      </Page>
    </ContentTemplate>
  );
}
