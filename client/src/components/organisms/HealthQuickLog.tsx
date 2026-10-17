import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { useAiReady } from '../../hooks/useAiReady.js';
import { estimateEntryCalories } from '../../services/aiAssistant.js';
import { exerciseSummary } from '../../utils/exerciseSummary.js';
import { ExerciseFields } from '../molecules/fields/ExerciseFields.js';
import type { ExerciseFieldValues } from '../../types/fields.js';

/* ── Styled ── */

/* ── Helpers ── */


function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

const emptyExercise = (): ExerciseFieldValues => ({
  exerciseType: 'walking', duration: '', intensity: 'medium', distance: '', distanceUnit: 'miles',
  calories: '', performedDate: '', performedTime: '', notes: '',
});

export function ExerciseQuickLog() {
  const createEntry = useCreateEntry();
  const aiReady = useAiReady();

  // The same exercise form as the journal editor and Quick Entry
  const [values, setValues] = useState<ExerciseFieldValues>(emptyExercise);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const canSave = !!values.duration.trim() || !!values.distance.trim() || !!values.calories.trim();

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSave || saving) return;
    setSaving(true); setStatus('');
    try {
      const text = exerciseSummary(values as unknown as Record<string, unknown>);
      let fields: Record<string, unknown> = {
        ...values,
        duration: values.duration.trim(),
        distance: values.distance.trim(),
        // Unset date/time = now
        performedDate: values.performedDate || toDateStr(new Date()),
        performedTime: values.performedTime || nowTime(),
      };
      // AI on and no calories typed → calculate them; a failed estimate still saves the workout
      let note = '';
      if (aiReady && !values.calories.trim() && (values.duration.trim() || values.distance.trim())) {
        setStatus('Calculating calories burned…');
        try { fields = await estimateEntryCalories('exercise', values.notes.trim(), fields); }
        catch (err) { note = ` — calories not calculated (${err instanceof Error ? err.message : 'error'})`; }
      }
      const topicId = await getOrCreateTopicId('Exercise', 'dumbbell');
      await createEntry(topicId, `<p>${escapeHtml(text)}</p>`, fields);
      setValues(emptyExercise());
      setStatus(fields.calories ? `Logged · ${String(fields.calories)} cal burned` : `Logged${note}`);
      setTimeout(() => setStatus(''), note ? 5000 : 2500);
    } catch (err) {
      console.error('Failed to log exercise:', err);
      setStatus('Could not save — try again');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <ExerciseFields values={values} onChange={setValues} />
      <FormFooter>
        <Note role="status">{status}</Note>
        <PillButton type="button" onClick={() => void handleSubmit()} disabled={saving || !canSave}>{saving ? 'Logging…' : 'Log exercise'}</PillButton>
      </FormFooter>
    </div>
  );
}
