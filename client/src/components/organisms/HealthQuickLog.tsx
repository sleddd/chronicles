import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { TextInput } from '../atoms/TextInput.js';
import { Select } from '../atoms/Select.js';
import { Button } from '../atoms/Button.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { stripHtml } from '../../utils/stripHtml.js';
import { toDateStr } from '../../utils/dateUtils.js';

/* ── Styled ── */

const Form = styled.form`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
`;

const Grow = styled.div`
  flex: 1 1 240px;
  min-width: 0;
`;

const Fixed = styled.div<{ $w: number }>`
  flex: 0 0 ${({ $w }) => $w}px;
  @media (max-width: 480px) { flex: 1 1 ${({ $w }) => $w}px; }
`;

const Status = styled.p`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 6px 0 0;
  min-height: 18px;
`;

const LogList = styled.ul`
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
`;

const LogRow = styled.li`
  border-top: 1px solid var(--border-subtle);
`;

const LogBtn = styled.button`
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  padding: 10px 4px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-sans);
  color: var(--text-primary);
  &:hover { background: var(--bg-hover); }
`;

const LogTag = styled.span`
  flex: 0 0 auto;
  min-width: 76px;
  white-space: nowrap;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const LogText = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LogMeta = styled.span`
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
`;

const Total = styled.p`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 8px 0 0;
  padding: 0 4px;
`;

const Empty = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 4px 0 0;
  padding: 0 4px;
`;

/* ── Helpers ── */

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

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

/** Today's entries for a topic, oldest first, with their custom fields. */
function useTodaysEntries(topicName: string, dateKey: string) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  return useMemo(() => {
    const topicId = allTopics.find(t => t.name.toLowerCase() === topicName.toLowerCase())?.id;
    if (!topicId) return [];
    const today = toDateStr(new Date());
    return entries
      .filter(e => {
        const meta = e.metadata as Record<string, unknown> | undefined;
        if (meta?._taxonomyId !== topicId) return false;
        const cf = (meta._customFields as Record<string, unknown>) || {};
        const day = (cf[dateKey] as string) || toDateStr(new Date(e.createdAt));
        return day === today;
      })
      .map(e => ({
        id: e.id,
        text: stripHtml(e.content).trim(),
        cf: ((e.metadata as Record<string, unknown>)._customFields as Record<string, unknown>) || {},
        time: new Date(e.createdAt).getTime(),
      }))
      .sort((a, b) => a.time - b.time);
  }, [entries, allTopics, topicName, dateKey]);
}

/* ── Food ── */

export function MealQuickLog() {
  const createEntry = useCreateEntry();
  const openInJournal = useOpenInJournal();
  const todays = useTodaysEntries('Meals', 'consumedDate');

  const [what, setWhat] = useState('');
  const [mealType, setMealType] = useState(mealForNow);
  const [calories, setCalories] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const totalCalories = todays.reduce((sum, e) => sum + (parseFloat(String(e.cf.calories)) || 0), 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!what.trim() || saving) return;
    setSaving(true); setStatus('');
    try {
      const topicId = await getOrCreateTopicId('Meals', 'utensils');
      await createEntry(topicId, `<p>${escapeHtml(what.trim())}</p>`, {
        mealDescription: what.trim(),
        mealType,
        consumedDate: toDateStr(new Date()),
        consumedTime: nowTime(),
        ingredients: '',
        calories: calories.trim(),
        notes: '',
      });
      setWhat(''); setCalories(''); setStatus('Logged');
      setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      console.error('Failed to log meal:', err);
      setStatus('Could not save — try again');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <Form onSubmit={handleSubmit}>
        <Grow>
          <TextInput aria-label="What did you eat?" placeholder="What did you eat?" value={what} onChange={e => setWhat(e.target.value)} />
        </Grow>
        <Fixed $w={130}>
          <Select aria-label="Meal" value={mealType} onChange={e => setMealType(e.target.value)}>
            {MEAL_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Fixed>
        <Fixed $w={100}>
          <TextInput aria-label="Calories" placeholder="Calories" inputMode="numeric" value={calories} onChange={e => setCalories(e.target.value.replace(/[^\d.]/g, ''))} />
        </Fixed>
        <Button type="submit" variant="primary" disabled={saving || !what.trim()}>Log</Button>
      </Form>
      <Status role="status">{status}</Status>
      {todays.length === 0 ? (
        <Empty>Nothing logged today.</Empty>
      ) : (
        <>
          <LogList>
            {todays.map(e => (
              <LogRow key={e.id}>
                <LogBtn type="button" onClick={() => openInJournal(e.id)}>
                  <LogTag>{labelFor(MEAL_TYPES, e.cf.mealType) || 'Meal'}</LogTag>
                  <LogText>{e.text || String(e.cf.mealDescription || 'Meal')}</LogText>
                  {e.cf.calories ? <LogMeta>{String(e.cf.calories)} cal</LogMeta> : null}
                </LogBtn>
              </LogRow>
            ))}
          </LogList>
          {totalCalories > 0 && <Total>Today · {Math.round(totalCalories)} cal</Total>}
        </>
      )}
    </div>
  );
}

/* ── Exercise ── */

export function ExerciseQuickLog() {
  const createEntry = useCreateEntry();
  const openInJournal = useOpenInJournal();
  const todays = useTodaysEntries('Exercise', 'performedDate');

  const [what, setWhat] = useState('');
  const [exerciseType, setExerciseType] = useState('walking');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const totalMinutes = todays.reduce((sum, e) => sum + (parseFloat(String(e.cf.duration)) || 0), 0);
  const canSave = !!what.trim() || !!duration.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true); setStatus('');
    try {
      const topicId = await getOrCreateTopicId('Exercise', 'dumbbell');
      const typeLabel = labelFor(EXERCISE_TYPES, exerciseType);
      const text = what.trim() || [typeLabel, duration.trim() ? `${duration.trim()} min` : ''].filter(Boolean).join(' · ');
      await createEntry(topicId, `<p>${escapeHtml(text)}</p>`, {
        exerciseType,
        duration: duration.trim(),
        intensity: 'medium',
        distance: '',
        distanceUnit: 'miles',
        calories: '',
        performedDate: toDateStr(new Date()),
        performedTime: nowTime(),
        notes: '',
      });
      setWhat(''); setDuration(''); setStatus('Logged');
      setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      console.error('Failed to log exercise:', err);
      setStatus('Could not save — try again');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <Form onSubmit={handleSubmit}>
        <Grow>
          <TextInput aria-label="What did you do?" placeholder="What did you do? (optional)" value={what} onChange={e => setWhat(e.target.value)} />
        </Grow>
        <Fixed $w={160}>
          <Select aria-label="Exercise type" value={exerciseType} onChange={e => setExerciseType(e.target.value)}>
            {EXERCISE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Fixed>
        <Fixed $w={100}>
          <TextInput aria-label="Minutes" placeholder="Minutes" inputMode="numeric" value={duration} onChange={e => setDuration(e.target.value.replace(/[^\d.]/g, ''))} />
        </Fixed>
        <Button type="submit" variant="primary" disabled={saving || !canSave}>Log</Button>
      </Form>
      <Status role="status">{status}</Status>
      {todays.length === 0 ? (
        <Empty>No exercise logged today.</Empty>
      ) : (
        <>
          <LogList>
            {todays.map(e => (
              <LogRow key={e.id}>
                <LogBtn type="button" onClick={() => openInJournal(e.id)}>
                  <LogTag>{labelFor(EXERCISE_TYPES, e.cf.exerciseType) || 'Exercise'}</LogTag>
                  <LogText>{e.text || 'Exercise'}</LogText>
                  {e.cf.duration ? <LogMeta>{String(e.cf.duration)} min</LogMeta> : null}
                </LogBtn>
              </LogRow>
            ))}
          </LogList>
          {totalMinutes > 0 && <Total>Today · {Math.round(totalMinutes)} min</Total>}
        </>
      )}
    </div>
  );
}
