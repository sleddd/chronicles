import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { TextInput } from '../atoms/TextInput.js';
import { Select } from '../atoms/Select.js';
import { PillButton } from '../atoms/PillButton.js';
import { FormField } from '../molecules/FormField.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { stripHtml } from '../../utils/stripHtml.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { useAiReady } from '../../hooks/useAiReady.js';
import { estimateEntryCalories } from '../../services/aiAssistant.js';

/* ── Styled ── */

const LogList = styled.ul`
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  border-bottom: 1px solid var(--border-subtle);
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
  { value: 'supplement', label: 'Supplement' },
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

const SubLabel = styled.h3`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 28px 0 0;
`;

/* ── Food: today's items (the form is the shared Log food form) ── */

/** Today's Meals entries as a compact list — select one to edit it in the journal. */
export function TodayFoodList() {
  const openInJournal = useOpenInJournal();
  const todays = useTodaysEntries('Meals', 'consumedDate');
  return (
    <>
      <SubLabel>Eaten today</SubLabel>
      {todays.length === 0 ? (
        <Empty style={{ marginTop: 10 }}>Nothing logged yet today.</Empty>
      ) : (
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
      )}
    </>
  );
}

/* ── Exercise ── */

export function ExerciseQuickLog() {
  const createEntry = useCreateEntry();
  const openInJournal = useOpenInJournal();
  const aiReady = useAiReady();
  const todays = useTodaysEntries('Exercise', 'performedDate');

  const [what, setWhat] = useState('');
  const [exerciseType, setExerciseType] = useState('walking');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<'miles' | 'km'>('miles');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const totalMinutes = todays.reduce((sum, e) => sum + (parseFloat(String(e.cf.duration)) || 0), 0);
  const totalBurned = todays.reduce((sum, e) => sum + (parseFloat(String(e.cf.calories)) || 0), 0);
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
        <Note role="status">{status || (aiReady ? 'Calories burned are calculated for you.' : 'Turn on the AI assistant in Settings to calculate calories burned.')}</Note>
        <PillButton type="button" onClick={() => void handleSubmit()} disabled={saving || !canSave}>{saving ? 'Logging…' : 'Log exercise'}</PillButton>
      </FormFooter>

      <SubLabel>Today</SubLabel>
      {todays.length === 0 ? (
        <Empty style={{ marginTop: 10 }}>No exercise logged today.</Empty>
      ) : (
        <>
          <LogList>
            {todays.map(e => {
              const meta = [
                e.cf.duration ? `${String(e.cf.duration)} min` : '',
                e.cf.distance ? `${String(e.cf.distance)} ${e.cf.distanceUnit === 'km' ? 'km' : 'mi'}` : '',
                e.cf.calories ? `${String(e.cf.calories)} cal` : '',
              ].filter(Boolean).join(' · ');
              return (
                <LogRow key={e.id}>
                  <LogBtn type="button" onClick={() => openInJournal(e.id)}>
                    <LogTag>{labelFor(EXERCISE_TYPES, e.cf.exerciseType) || 'Exercise'}</LogTag>
                    <LogText>{e.text || 'Exercise'}</LogText>
                    {meta && <LogMeta>{meta}</LogMeta>}
                  </LogBtn>
                </LogRow>
              );
            })}
          </LogList>
          {(totalMinutes > 0 || totalBurned > 0) && (
            <Total>
              Today · {[totalMinutes > 0 ? `${Math.round(totalMinutes)} min` : '', totalBurned > 0 ? `${Math.round(totalBurned)} cal burned` : ''].filter(Boolean).join(' · ')}
            </Total>
          )}
        </>
      )}
    </div>
  );
}
