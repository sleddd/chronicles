import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { TextInput } from '../atoms/TextInput.js';
import { Select } from '../atoms/Select.js';
import { PillButton } from '../atoms/PillButton.js';
import { FormField } from '../molecules/FormField.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { useAiReady } from '../../hooks/useAiReady.js';
import { estimateEntryCalories } from '../../services/aiAssistant.js';

/* ── Styled ── */

/* ── Helpers ── */

const EXERCISE_TYPES = [
  { value: 'walking', label: 'Walking' },
  { value: 'running', label: 'Running' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'swimming', label: 'Swimming' },
  { value: 'strength', label: 'Strength Training' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Other' },
];

/** Meal that fits the current time of day — the form's starting choice. */
function mealForNow(): string {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function labelFor(options: { value: string; label: string }[], value: unknown): string {
  const v = String(value ?? '').toLowerCase();
  return options.find(o => o.value === v)?.label ?? String(value ?? '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Topic id by name — the server seeds Meals/Exercise, but recreate if deleted. */
async function getOrCreateTopicId(name: string, icon: string): Promise<number> {
  const { allTopics, setTopics } = useEntriesStore.getState();
  let topic = allTopics.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (!topic) {
    topic = await topicsApi.create({ name, icon });
    setTopics([...allTopics, topic]);
  }
  return topic.id;
}

/** Encrypt + create an entry tagged with the topic, and add it to the store. */
function useCreateEntry() {
  const { encryptPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  return async (topicId: number, content: string, customFields: Record<string, unknown>) => {
    const metadata: Record<string, unknown> = { _taxonomyId: topicId, _customFields: customFields };
    const encrypted = await encryptPost(content, metadata);
    const result = await entriesApi.create({
      contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      isEncrypted: true, taxonomyIds: [topicId],
    });
    addDecryptedEntry({
      id: result.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(result.createdAt as string),
      updatedAt: new Date((result.updatedAt || result.createdAt) as string),
    });
  };
}

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;

const FormFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 18px;
`;

const Note = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
`;

/* ── Exercise ── */

export function ExerciseQuickLog() {
  const createEntry = useCreateEntry();
  const aiReady = useAiReady();

  const [what, setWhat] = useState('');
  const [exerciseType, setExerciseType] = useState('walking');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<'miles' | 'km'>('miles');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const canSave = !!what.trim() || !!duration.trim() || !!distance.trim();

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSave || saving) return;
    setSaving(true); setStatus('');
    try {
      const typeLabel = labelFor(EXERCISE_TYPES, exerciseType);
      const unitLabel = distanceUnit === 'km' ? 'km' : 'mi';
      const text = what.trim() || [
        typeLabel,
        duration.trim() ? `${duration.trim()} min` : '',
        distance.trim() ? `${distance.trim()} ${unitLabel}` : '',
      ].filter(Boolean).join(' · ');
      let fields: Record<string, unknown> = {
        exerciseType,
        duration: duration.trim(),
        intensity: 'medium',
        distance: distance.trim(),
        distanceUnit,
        calories: '',
        performedDate: toDateStr(new Date()),
        performedTime: nowTime(),
        notes: '',
      };
      // AI on → calculate calories burned; a failed estimate still saves the workout
      let note = '';
      if (aiReady && (duration.trim() || distance.trim())) {
        setStatus('Calculating calories burned…');
        try { fields = await estimateEntryCalories('exercise', what.trim(), fields); }
        catch (err) { note = ` — calories not calculated (${err instanceof Error ? err.message : 'error'})`; }
      }
      const topicId = await getOrCreateTopicId('Exercise', 'dumbbell');
      await createEntry(topicId, `<p>${escapeHtml(text)}</p>`, fields);
      setWhat(''); setDuration(''); setDistance('');
      setStatus(fields.calories ? `Logged · ${String(fields.calories)} cal burned` : `Logged${note}`);
      setTimeout(() => setStatus(''), note ? 5000 : 2500);
    } catch (err) {
      console.error('Failed to log exercise:', err);
      setStatus('Could not save — try again');
    } finally { setSaving(false); }
  };

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void handleSubmit(); } };
  const numeric = (v: string) => v.replace(/[^\d.]/g, '');

  return (
    <div>
      <FormField label="Activity">
        <TextInput aria-label="Activity" placeholder="Optional — e.g. Morning run around the park" value={what} onChange={e => setWhat(e.target.value)} onKeyDown={onEnter} autoComplete="off" />
      </FormField>
      <FieldGrid>
        <FormField label="Type">
          <Select aria-label="Exercise type" value={exerciseType} onChange={e => setExerciseType(e.target.value)}>
            {EXERCISE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Minutes">
          <TextInput aria-label="Minutes" placeholder="0" inputMode="numeric" value={duration} onChange={e => setDuration(numeric(e.target.value))} onKeyDown={onEnter} />
        </FormField>
        <FormField label="Distance">
          <TextInput aria-label="Distance" placeholder="0" inputMode="decimal" value={distance} onChange={e => setDistance(numeric(e.target.value))} onKeyDown={onEnter} />
        </FormField>
        <FormField label="Unit">
          <Select aria-label="Distance unit" value={distanceUnit} onChange={e => setDistanceUnit(e.target.value as 'miles' | 'km')}>
            <option value="miles">Miles</option>
            <option value="km">Kilometers</option>
          </Select>
        </FormField>
      </FieldGrid>
      <FormFooter>
        <Note role="status">{status}</Note>
        <PillButton type="button" onClick={() => void handleSubmit()} disabled={saving || !canSave}>{saving ? 'Logging…' : 'Log exercise'}</PillButton>
      </FormFooter>

    </div>
  );
}
