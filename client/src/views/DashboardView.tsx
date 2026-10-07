import { useState, useMemo, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Icon } from '../../../design-system/components/core/Icon.jsx';
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
import { stripHtml, summarizeUserFields } from '../utils/stripHtml.js';
import { TopicSelector } from '../components/organisms/TopicSelector.js';
import { Editor, type DictationControls } from '../components/organisms/Editor.js';
import type { Topic } from '../types/topics.js';
import { UserFieldsForm } from '../components/molecules/fields/UserFieldsForm.js';
import { TextInput } from '../components/atoms/TextInput.js';
import { Select } from '../components/atoms/Select.js';
import { Checkbox } from '../components/atoms/Checkbox.js';
import { FormField, FieldRowLayoutContext } from '../components/molecules/FormField.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { UnitLabel } from '../components/atoms/UnitLabel.js';
import { useAiReady } from '../hooks/useAiReady.js';
import { autoNutritionOnSave } from '../services/aiAssistant.js';

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
  @media (max-width: 640px) { padding: 44px 56px 72px; }
`;

/* DS dashboard header: big date numeral left, weather right, under a hairline rule. */
const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: nowrap;
  @media (max-width: 640px) { gap: 12px; margin-bottom: 20px; }
`;

const GreetingBlock = styled.div`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
  min-width: 0;
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
  gap: 6px;
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
  max-width: 360px;
  @media (max-width: 640px) { max-width: 200px; }
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

const InlineWeatherWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  flex-shrink: 0;
`;

/* Keep the weather vertically centered while the date block top-aligns. */
const WeatherSlot = styled.div`
  align-self: center;
  flex-shrink: 0;
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
  width: 100%;
  display: flex;
  justify-content: space-between;
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
  & .qe-topic-picker > div > button {
    border: none;
    border-radius: 0;
    background: transparent;
  }
  & .qe-topic-picker > div > button:hover { background: transparent; }
  /* Dropdown menu: the absolutely-positioned div inside the picker wrapper. */
  & .qe-topic-picker > div > div { border: none; }
`;

const QuickEditorWrap = styled.div`
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border-strong);
  background: transparent;
  margin-bottom: 0;

  > div { min-height: 120px; height: auto; }
  /* EditorContent's wrapper — stretch so .tiptap (flex: 1) fills the area. */
  div:has(> .tiptap) { flex: 1; display: flex; flex-direction: column; }

  .tiptap {
    padding: 16px;
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

const SaveRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  padding-bottom: 8px;
  margin-top: 8px;
`;

/* Topic picker on the left, dictation + formatting toggles across from it. */
const TopicRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
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

const TOPIC_FIELDS: Record<string, FieldDef[]> = {
  'medication':  [],
  'symptom':     [{ key: 'severity', label: 'Severity', type: 'select', options: ['Mild', 'Moderate', 'Severe'] }, { key: 'duration', label: 'Duration', type: 'text' }],
  'meals':       [
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
  'event':       [{ key: 'startDate', label: 'Date', type: 'date' }, { key: 'startTime', label: 'Time', type: 'time' }],
  'meeting':     [{ key: 'startDate', label: 'Date', type: 'date' }, { key: 'startTime', label: 'Time', type: 'time' }],
};

/* ── Widget: Quick Entry ── */

function QuickEntryCard({ accentColor, topics }: { accentColor: string; topics: Topic[] }) {
  const { encryptPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const [content, setContent] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
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
  const fieldDefs = selectedTopic ? (TOPIC_FIELDS[selectedTopic.name.toLowerCase()] ?? []) : [];
  const isMealsTopic = selectedTopic?.name.toLowerCase() === 'meals';
  const aiReady = useAiReady();
  const userFieldDefs = selectedTopicId != null ? (topicCustomFields[selectedTopicId] ?? []) : [];

  const isTaskTopic = selectedTopic?.name.toLowerCase() === 'task';
  const isMedicationTopic = selectedTopic?.name.toLowerCase() === 'medication';
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
  const hasUserFieldValues = userFieldDefs.length > 0 && summarizeUserFields(userFieldDefs, userFields) !== '';
  const hasBuiltInFieldValues = fieldDefs.length > 0 || isMedicationTopic || isTaskTopic;
  const canSave = hasContent || hasUserFieldValues || (hasBuiltInFieldValues && selectedTopic !== null);

  const setField = (key: string, value: unknown) => setCustomFields(prev => ({ ...prev, [key]: value }));

  const handleTopicChange = (id: number | null) => {
    setSelectedTopicId(id);
    setCustomFields({});
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const finalContent = content;
      const effectiveTopicId = selectedTopic ? selectedTopic.id : await getOrCreateJournalTopic();
      const metadata: Record<string, unknown> = { _taxonomyId: effectiveTopicId };
      // Meals: with the AI assistant on, blank nutrients are filled in (typed ones are kept)
      let fieldsToSave = customFields;
      if (isMealsTopic && aiReady) {
        fieldsToSave = (await autoNutritionOnSave(stripHtml(finalContent), customFields).catch(() => null)) ?? customFields;
      }
      if ((fieldDefs.length > 0 || userFieldDefs.length > 0 || isMedicationTopic || isTaskTopic) && selectedTopic) metadata._customFields = fieldsToSave;
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
          <TopicRowActions>
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
          </TopicRowActions>
        </TopicRow>
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
        {dictationInterim && (
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--ink-4)', padding: '2px 0 4px' }}>
            {dictationInterim}
          </div>
        )}
        <FieldRowLayoutContext.Provider value={true}>
        {fieldDefs.length > 0 && fieldDefs.map(f => (
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
                placeholder={f.type === 'number' ? (isMealsTopic && aiReady ? 'Auto' : '0') : `Add ${f.label.toLowerCase()}…`}
                value={(customFields[f.key] as string) ?? ''}
                onChange={e => setField(f.key, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
              />
            )}
          </FormField>
        ))}
        {isTaskTopic && (
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
        {isMedicationTopic && (
          <>
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
        {userFieldDefs.length > 0 && (
          <UserFieldsForm
            fieldDefs={userFieldDefs}
            values={(customFields._userFields as Record<string, unknown>) ?? {}}
            onChange={vals => setCustomFields(prev => ({ ...prev, _userFields: vals }))}
          />
        )}
        </FieldRowLayoutContext.Provider>
        <SaveRow>
          <SaveBtn $accent={accentColor} $active={canSave} onClick={handleSave} disabled={saving || !canSave}>
            {saving ? <Spinner size={10} /> : (
              <>
                <Icon name="plus" size={12} strokeWidth={2.5} />
                Save
              </>
            )}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="sun" size={33} strokeWidth={1.3} style={{ color: 'var(--color-accent)' }} />
        <InlineTemp>{current.temp}°</InlineTemp>
      </div>
      <WeatherCity>
        {(cityName ? cityName.split(',')[0].trim() : '').split('').map((ch, i) => (
          <span key={i}>{ch === ' ' ? ' ' : ch}</span>
        ))}
      </WeatherCity>
    </InlineWeatherWrap>
  );
}

/* ── Main View ── */

export function DashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const allTopics = useEntriesStore(s => s.allTopics);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';

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
              <DailyPrompt>{getDailyQuote().text} — {getDailyQuote().author}</DailyPrompt>
            </DateInfo>
          </GreetingBlock>
          <WeatherSlot><InlineWeather /></WeatherSlot>
        </PageHeader>

        <QuickEntryCard accentColor={accentColor} topics={allTopics} />
      </Page>
    </ContentTemplate>
  );
}
