import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import { InlineEditPanel } from '../molecules/InlineEditPanel.js';
import { Editor } from './Editor.js';
import { TaskFields } from '../molecules/fields/TaskFields.js';
import { GoalFields } from '../molecules/fields/GoalFields.js';
import { MilestoneFields } from '../molecules/fields/MilestoneFields.js';
import { FoodFields } from '../molecules/fields/FoodFields.js';
import { MedicationFields } from '../molecules/fields/MedicationFields.js';
import { SymptomFields } from '../molecules/fields/SymptomFields.js';
import { AllergyFields } from '../molecules/fields/AllergyFields.js';
import { ExerciseFields } from '../molecules/fields/ExerciseFields.js';
import { EventFields } from '../molecules/fields/EventFields.js';
import { MeetingFields } from '../molecules/fields/MeetingFields.js';
import { WellnessFields, type WellnessFieldValues } from '../molecules/fields/WellnessFields.js';
import { ShoppingListFields, type ShoppingListFieldValues } from '../molecules/fields/ShoppingListFields.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useUIStore } from '../../stores/uiStore.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi } from '../../services/api.js';
import type { Topic } from '../../types/topics.js';

const TOPIC_TO_TYPE: Record<string, string> = {
  task: 'task', goal: 'goal', milestone: 'milestone',
  meals: 'food', medication: 'medication', symptom: 'symptom',
  exercise: 'exercise', event: 'event', meeting: 'meeting',
  allergy: 'allergy', wellness: 'wellness', 'shopping list': 'shopping_list',
};

function getCustomType(topicName: string | undefined): string | null {
  if (!topicName) return null;
  return TOPIC_TO_TYPE[topicName.toLowerCase()] || null;
}

const AddButton = styled.button<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px 24px;
  font-family: var(--ui, 'Montserrat', sans-serif);
  font-size: 13px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink, ${({ theme }) => theme.colors.text});
  background: transparent;
  border: none;
  border-radius: var(--r-sm, 2px);
  cursor: pointer;
  width: 100%;
  min-height: 52px;
  transition: background 120ms;
  &:hover { background: var(--paper-well, rgba(0,0,0,0.03)); }
  @media (max-width: 768px) { padding: 14px 16px; }
  @media (max-width: 480px) { padding: 12px 12px; }
`;

const Card = styled.div<{ $accentColor?: string }>`
  background: transparent;
  border: none;
  margin: 6px 0;
  &:first-child { margin-top: 12px; }
`;

const EditWrapper = styled.div`
  margin: 20px;
`;

interface NewEntryCardProps {
  /** Topic to pre-tag the new entry with */
  topic: Topic;
  accentColor: string;
  onCreated?: (id: number) => void;
  /** Hide the built-in trigger button — caller provides their own */
  hideButton?: boolean;
  /** Controlled open state (only used when hideButton is true) */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewEntryCard({ topic, accentColor, onCreated, hideButton, isOpen: isOpenProp, onOpenChange }: NewEntryCardProps) {
  const { encryptPost } = useEncryption();
  const cycleTrackingEnabled = useUIStore(s => s.cycleTrackingEnabled);
  const calendarSyncEnabled = useUIStore(s => s.calendarSyncEnabled);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);

  const goalOptions = useMemo(() => {
    const goalTopicId = allTopics.find(t => t.name.toLowerCase() === 'goal')?.id;
    if (!goalTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === goalTopicId)
      .map(e => ({ id: e.id, title: e.content.replace(/<[^>]+>/g, '').slice(0, 80) || 'Untitled goal' }));
  }, [entries, allTopics]);

  const recipeOptions = useMemo(() => {
    const recipeTopicId = allTopics.find(t => t.name.toLowerCase() === 'recipe')?.id;
    if (!recipeTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === recipeTopicId)
      .map(e => ({ id: e.id, title: e.content.replace(/<[^>]+>/g, '').slice(0, 80) || 'Untitled recipe' }));
  }, [entries, allTopics]);

  const milestoneOptions = useMemo(() => {
    const milestoneTopicId = allTopics.find(t => t.name.toLowerCase() === 'milestone')?.id;
    if (!milestoneTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === milestoneTopicId)
      .map(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
        return { id: e.id, title: e.content.replace(/<[^>]+>/g, '').slice(0, 60) || `Milestone #${e.id}`, parentGoalId: (cf?.parentGoalId as number) || undefined };
      });
  }, [entries, allTopics]);

  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const isOpen = hideButton ? !!isOpenProp : isOpenInternal;
  const setIsOpen = (v: boolean) => {
    if (hideButton) { onOpenChange?.(v); }
    else { setIsOpenInternal(v); }
  };
  const [content, setContent] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const customType = getCustomType(topic.name);

  const handleSave = async () => {
    const isWellness = customType === 'wellness';
    const isShoppingList = customType === 'shopping_list';
    const hasText = !!content.trim();
    const hasItems = Array.isArray(customFields.items) && (customFields.items as unknown[]).length > 0;
    if (!hasText && !isWellness && !(isShoppingList && hasItems)) return;
    setSaving(true); setStatus('');
    let finalContent = content;
    if (!hasText && isShoppingList) {
      finalContent = `<p>Shopping List: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>`;
    }
    if (!hasText && isWellness) {
      const w = (customFields.waterGlasses as number) || 0;
      const g = (customFields.waterGoal as number) || 8;
      const m = (customFields.moodScore as number) || 0;
      const s = (customFields.sleepHours as number) || 0;
      const parts = [w > 0 ? `${w}/${g} glasses` : '', m > 0 ? `Mood ${m}/5` : '', s > 0 ? `${s}h sleep` : ''].filter(Boolean);
      finalContent = `<p>${parts.join(' · ') || 'Wellness check-in'}</p>`;
    }
    try {
      const metadata: Record<string, unknown> = { _taxonomyId: topic.id, _widgetType: 'wellness-checkin' };
      if (Object.keys(customFields).length > 0) metadata._customFields = customFields;
      if (!isWellness) delete metadata._widgetType;
      const encrypted = await encryptPost(finalContent, metadata);
      const result = await entriesApi.create({
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        isEncrypted: true, taxonomyIds: [topic.id],
      });
      addDecryptedEntry({
        id: result.id as number, content: finalContent, metadata, isEncrypted: true,
        createdAt: new Date(result.createdAt as string),
        updatedAt: new Date((result.updatedAt || result.createdAt) as string),
      });
      const newId = result.id as number;
      setContent(''); setCustomFields({}); setStatus('Created');
      setTimeout(() => { setStatus(''); setIsOpen(false); if (onCreated) onCreated(newId); }, 600);
    } catch (err) {
      console.error('Create entry failed:', err);
      setStatus('Failed');
    } finally { setSaving(false); }
  };

  const handleCancel = () => {
    setIsOpen(false); setContent(''); setCustomFields({}); setStatus('');
  };

  const renderFields = () => {
    if (!customType) return null;
    const onChange = (v: Record<string, unknown>) => setCustomFields(v as Record<string, unknown>);
    switch (customType) {
      case 'task': return <TaskFields values={{ isInProgress: false, isCompleted: false, isAutoMigrating: true, parentGoalId: null, parentMilestoneId: null, deadline: '', priority: 'none', ...customFields } as never} onChange={onChange as never} goalOptions={goalOptions} milestoneOptions={milestoneOptions} />;
      case 'goal': return <GoalFields values={{ goalType: 'short_term', goalStatus: 'new', targetDate: '', ...customFields } as never} onChange={onChange as never} />;
      case 'milestone': return <MilestoneFields values={{ milestoneStatus: 'active', targetDate: '', isCompleted: false, parentGoalId: null, ...customFields } as never} onChange={onChange as never} goalOptions={goalOptions} />;
      case 'food': return <FoodFields values={{ mealType: 'breakfast', consumedDate: '', consumedTime: '', ingredients: '', calories: '', notes: '', ...customFields } as never} onChange={onChange as never} />;
      case 'medication': return <MedicationFields values={{ dosage: '', frequency: 'once_daily', scheduleTimes: ['08:00'], isActive: true, notes: '', ...customFields } as never} onChange={onChange as never} />;
      case 'symptom': return <SymptomFields values={{ severity: 5, occurredDate: '', occurredTime: '', duration: '', notes: '', ...customFields } as never} onChange={onChange as never} />;
      case 'allergy': return <AllergyFields values={{ allergen: '', severity: 5, reaction: '', occurredDate: '', occurredTime: '', notes: '', ...customFields } as never} onChange={onChange as never} />;
      case 'exercise': return <ExerciseFields values={{ exerciseType: 'running', duration: '', intensity: 'medium', distance: '', distanceUnit: 'miles', calories: '', performedDate: '', performedTime: '', notes: '', ...customFields } as never} onChange={onChange as never} />;
      case 'event': return <EventFields values={{ startDate: '', startTime: '', endDate: '', endTime: '', location: '', address: '', phone: '', notes: '', ...customFields } as never} onChange={onChange as never} showCalendarSync={calendarSyncEnabled} />;
      case 'meeting': return <MeetingFields values={{ startDate: '', startTime: '', endDate: '', endTime: '', meetingTopic: '', attendees: '', location: '', address: '', phone: '', notes: '', ...customFields } as never} onChange={onChange as never} showCalendarSync={calendarSyncEnabled} />;
      case 'wellness': return <WellnessFields values={{ date: '', waterGlasses: 0, waterGoal: 8, moodScore: 0, sleepHours: 0, sleepQuality: 0, ...customFields } as WellnessFieldValues} onChange={onChange as never} cycleTrackingEnabled={cycleTrackingEnabled} />;
      case 'shopping_list': return <ShoppingListFields values={{ items: [], notes: '', linkedRecipeIds: [], ...customFields } as ShoppingListFieldValues} onChange={onChange as never} recipeOptions={recipeOptions} />;
      default: return null;
    }
  };

  if (!isOpen) {
    if (hideButton) return null;
    return (
      <Card $accentColor={accentColor}>
        <AddButton $color={accentColor} onClick={() => setIsOpen(true)}>
          <Icon name="plus" size={14} strokeWidth={2} /> New {topic.name} Entry
        </AddButton>
      </Card>
    );
  }

  const isShoppingList = customType === 'shopping_list';

  return (
    <Card $accentColor={accentColor}>
      <EditWrapper>
        <InlineEditPanel
          editor={isShoppingList ? undefined : <Editor content={content} onChange={setContent} placeholder={`Write a new ${topic.name.toLowerCase()} entry...`} />}
          fields={renderFields()}
          accentColor={accentColor}
          saving={saving}
          status={status}
          onSave={handleSave}
          onCancel={handleCancel}
          hideFieldsHeader={isShoppingList}
        />
      </EditWrapper>
    </Card>
  );
}
