import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../atoms/core/Icon.jsx';
import { useEncryptedSetting } from '../../hooks/useEncryptedSetting.js';
import { EMPTY_SYMPTOM_CHIPS, symptomChipList, hasSymptom, toggleSymptom, addSymptomChip, type SymptomChipConfig } from '../../utils/symptomChips.js';
import { SeveritySection } from '../molecules/fields/SymptomFields.js';
import styled from 'styled-components';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { mealForNow, nowTime } from '../../utils/foodLog.js';
import { useAiReady } from '../../hooks/useAiReady.js';
import { useNewEntryInJournal } from '../../hooks/useOpenInJournal.js';
import { estimateEntryCalories } from '../../services/aiAssistant.js';
import { exerciseSummary, EXERCISE_TYPES } from '../../utils/exerciseSummary.js';
import { useFoodLogActions } from './FoodLog.js';
import { PillButton } from '../atoms/PillButton.js';
import { DashPanel, DashPanelHead } from '../molecules/DashPanel.js';
import {
  Section, TitleInput, Chips, Chip, DateTimeBox, DateTimeField, Unit, BoxText, FieldNote,
} from '../molecules/fields/formKit.js';

/* Health dashboard "Quick log": a Meal | Exercise switch, then the few fields
   you need right now — meal name + meal chips, or activity chips — a
   date | time | kcal (or min) box, then an outlined accent Log pill.
   Notes live under "More details", which opens the full form in the
   journal with what's typed so far. Unset date/time = now. */

/* ── Styled ── */

/* The quick form runs a size down from the journal's field forms */
const QTitle = styled(TitleInput)`
  && { font-size: 26px; }
`;

const QChip = styled(Chip)`
  height: 28px;
  padding: 0 13px;
  font-size: 14px;
`;

const QField = styled(DateTimeField)`
  && { height: 38px; padding: 0 14px; font-size: 14px; }
`;

const QNotes = styled(BoxText)`
  && { min-height: 64px; padding: 10px 14px; font-size: 13px; }
`;

const QNote = styled(FieldNote)`
  font-size: 12px;
  margin-top: 8px;
`;

/* Log a change, one line: what changed | Today ⌄ | Log in one outlined box */
const ChangeBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 50px;
  padding: 6px 6px 6px 16px;
  border: 1px solid var(--border-card);
  border-radius: 8px;
  background: var(--bg-control, transparent);
  &:focus-within { border-color: var(--color-accent); }
`;

const ChangeInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-primary);
  }
  &::placeholder { color: var(--text-hint); }
`;

/* The grey buttons inside the box */
const BoxBtn = styled.button`
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  white-space: nowrap;
  cursor: pointer;
  &:disabled { color: var(--text-muted); cursor: default; }
  &:not(:disabled):hover { background: color-mix(in srgb, var(--text-muted) 22%, transparent); }
  &:focus-within, &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

const LogBtn = styled(BoxBtn)`
  &:not(:disabled) { color: var(--color-accent-link); font-weight: 500; }
`;

/* The real date input, invisible over "Today ⌄" — a click opens its picker */
const HiddenDate = styled.input`
  && {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    opacity: 0;
    cursor: pointer;
  }
`;

const ChangeNote = styled.p`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  a { color: var(--color-accent-link); text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

/** "Today", "Yesterday", else "Oct 12" */
function dayWord(date: string): string {
  const t = today();
  const y = new Date(t + 'T12:00:00');
  y.setDate(y.getDate() - 1);
  if (date === t) return 'Today';
  if (date === toDateStr(y)) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* + Add: a dashed chip that becomes a small box to type a symptom of your own */
const QAddChip = styled(QChip)`
  border-style: dashed;
  color: var(--color-accent-soft);
`;

const QAddBox = styled.input`
  && {
    height: 28px;
    width: 150px;
    padding: 0 13px;
    border: 1px dashed var(--color-accent-line) !important;
    border-radius: 999px;
    background: transparent !important;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
    outline: none;
  }
`;

const QChips = styled(Chips)`
  gap: 8px;
`;

const Switch = styled.div`
  display: flex;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const SwitchBtn = styled.button<{ $active: boolean }>`
  height: 30px;
  padding: 0 13px;
  border: none;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--bg-tab-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 13px;
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-secondary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

/* date | time | amount */
const WhenBox = styled(DateTimeBox)`
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr);
  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    & > :last-child { grid-column: 1 / -1; border-left: none; border-top: 1px solid var(--border-card); }
  }
`;

const Amount = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 16px;
  cursor: text;
  &:focus-within { box-shadow: inset 0 0 0 1px var(--color-accent); }
`;

const AmountInput = styled(QField)`
  && { flex: 1; padding-right: 0; }
  &&:focus { box-shadow: none; }
  &::placeholder { color: var(--text-hint); }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 24px;
`;

const MoreLink = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const Status = styled.span`
  flex: 1;
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
`;


/* ── Helpers ── */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Topic id by name — recreated if deleted. */
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
  const { encryptPost, encryptNewPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  return async (topicId: number, content: string, customFields: Record<string, unknown>) => {
    const metadata: Record<string, unknown> = { _taxonomyId: topicId, _customFields: customFields };
    const encrypted = await encryptNewPost(content, metadata);
    const result = await entriesApi.create({ id: encrypted.id,
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

const MEALS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'medication', label: 'Medication' },
];

const ACTIVITY_LABEL: Record<string, string> = { strength: 'Strength' };

const today = () => toDateStr(new Date());

/* ── Meal ── */

function MealQuick() {
  const aiReady = useAiReady();
  const actions = useFoodLogActions('Meals');
  const openNew = useNewEntryInJournal();
  const blank = () => ({ name: '', mealType: mealForNow(), date: today(), time: nowTime(), calories: '', notes: '' });
  const [v, setV] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const set = (patch: Partial<typeof v>) => setV(prev => ({ ...prev, ...patch }));

  const fields = () => ({
    mealDescription: v.name.trim(), mealType: v.mealType,
    consumedDate: v.date || today(), consumedTime: v.time || nowTime(),
    calories: v.calories.trim(), ...(v.calories.trim() ? { caloriesSource: 'manual' } : {}),
    ingredients: '', notes: v.notes.trim(),
  });

  const log = async () => {
    const name = v.name.trim();
    if (!name || saving) return;
    setSaving(true); setStatus('');
    try {
      const f = fields();
      const id = await actions.create(f.consumedDate, name, f);
      if (aiReady) void actions.fill(id);
      setV(blank());
      setStatus(`Logged ${name}`);
      setTimeout(() => setStatus(''), 2600);
    } catch (err) {
      console.error('Failed to log meal:', err);
      setStatus('That didn’t save — try again');
    } finally { setSaving(false); }
  };

  const more = async () => openNew(await getOrCreateTopicId('Meals', 'utensils'), fields());

  return (
    <>
      <QTitle value={v.name} placeholder="What did you eat?" aria-label="What did you eat?"
        onChange={e => set({ name: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void log(); } }} />
      <Section style={{ marginTop: 20 }}>
        <QChips role="radiogroup" aria-label="Meal">
          {MEALS.map(m => (
            <QChip key={m.value} type="button" role="radio" aria-checked={v.mealType === m.value}
              $active={v.mealType === m.value} onClick={() => set({ mealType: m.value })}>{m.label}</QChip>
          ))}
        </QChips>
      </Section>
      <Section style={{ marginTop: 20 }}>
        <WhenBox>
          <QField type="date" value={v.date} aria-label="Date" onChange={e => set({ date: e.target.value })} />
          <QField type="time" value={v.time} aria-label="Time" onChange={e => set({ time: e.target.value })} />
          <Amount>
            <AmountInput inputMode="numeric" value={v.calories} placeholder="kcal" aria-label="Calories"
              onChange={e => set({ calories: e.target.value.replace(/[^\d.]/g, '') })} />
            {v.calories && <Unit>kcal</Unit>}
          </Amount>
        </WhenBox>
        {aiReady && <QNote>Leave calories and nutrients blank and AI will estimate them.</QNote>}
      </Section>
      <Footer>
        <MoreLink type="button" onClick={() => void more()}>More details</MoreLink>
        <Status role="status" aria-live="polite">{status}</Status>
        <PillButton type="button" onClick={() => void log()} disabled={saving || !v.name.trim()}>
          {saving ? 'Logging…' : 'Log meal'}
        </PillButton>
      </Footer>
    </>
  );
}

/* ── Exercise ── */

function ExerciseQuick() {
  const aiReady = useAiReady();
  const createEntry = useCreateEntry();
  const openNew = useNewEntryInJournal();
  const blank = () => ({ type: 'walking', date: today(), time: nowTime(), duration: '', notes: '' });
  const [v, setV] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const set = (patch: Partial<typeof v>) => setV(prev => ({ ...prev, ...patch }));

  const fields = (): Record<string, unknown> => ({
    exerciseType: v.type, duration: v.duration.trim(), intensity: 'medium', distance: '', distanceUnit: 'miles',
    calories: '', performedDate: v.date || today(), performedTime: v.time || nowTime(), notes: v.notes.trim(),
  });

  const log = async () => {
    if (!v.duration.trim() || saving) return;
    setSaving(true); setStatus('');
    try {
      let f = fields();
      let note = '';
      if (aiReady) {
        setStatus('Calculating calories burned…');
        try { f = await estimateEntryCalories('exercise', v.notes.trim(), f); }
        catch (err) { note = ` — calories not calculated (${err instanceof Error ? err.message : 'error'})`; }
      }
      const topicId = await getOrCreateTopicId('Exercise', 'dumbbell');
      await createEntry(topicId, `<p>${escapeHtml(exerciseSummary(f))}</p>`, f);
      setV(blank());
      setStatus(f.calories ? `Logged · ${String(f.calories)} cal burned` : `Logged${note}`);
      setTimeout(() => setStatus(''), note ? 5000 : 2600);
    } catch (err) {
      console.error('Failed to log exercise:', err);
      setStatus('That didn’t save — try again');
    } finally { setSaving(false); }
  };

  const more = async () => openNew(await getOrCreateTopicId('Exercise', 'dumbbell'), fields());

  return (
    <>
      <QChips role="radiogroup" aria-label="Activity">
        {EXERCISE_TYPES.map(t => (
          <QChip key={t.value} type="button" role="radio" aria-checked={v.type === t.value}
            $active={v.type === t.value} onClick={() => set({ type: t.value })}>{ACTIVITY_LABEL[t.value] ?? t.label}</QChip>
        ))}
      </QChips>
      <Section style={{ marginTop: 20 }}>
        <WhenBox>
          <QField type="date" value={v.date} aria-label="Date" onChange={e => set({ date: e.target.value })} />
          <QField type="time" value={v.time} aria-label="Time" onChange={e => set({ time: e.target.value })} />
          <Amount>
            <AmountInput inputMode="numeric" value={v.duration} placeholder="Duration" aria-label="Duration (min)"
              onChange={e => set({ duration: e.target.value.replace(/[^\d.]/g, '') })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void log(); } }} />
            <Unit>min</Unit>
          </Amount>
        </WhenBox>
        {aiReady && <QNote>Calories burned are calculated by AI when you log.</QNote>}
      </Section>
      <Footer>
        <MoreLink type="button" onClick={() => void more()}>More details</MoreLink>
        <Status role="status" aria-live="polite">{status}</Status>
        <PillButton type="button" onClick={() => void log()} disabled={saving || !v.duration.trim()}>
          {saving ? 'Logging…' : 'Log exercise'}
        </PillButton>
      </Footer>
    </>
  );
}

/* ── Symptom ── */

/** The quick symptom form: the symptom(s) tapped from the same chips as the
 *  journal's symptom form (no title box — + Add saves a chip of your own and
 *  picks it), severity and notes, logged as now.
 *  "More details" opens the full form in the journal. Used by the Health
 *  dashboard (QuickSymptom) and the home dashboard's Log a symptom section. */
export function QuickSymptomForm() {
  const createEntry = useCreateEntry();
  const openNew = useNewEntryInJournal();
  const [chipConfig, saveChips, chipsLoaded] = useEncryptedSetting<SymptomChipConfig>('symptomChips', EMPTY_SYMPTOM_CHIPS);
  const chips = symptomChipList(chipConfig);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const blank = () => ({ name: '', severity: 5, notes: '' });
  const [v, setV] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const set = (patch: Partial<typeof v>) => setV(prev => ({ ...prev, ...patch }));

  const fields = (): Record<string, unknown> => ({
    symptomName: v.name.trim(), severity: v.severity,
    occurredDate: today(), occurredTime: nowTime(), duration: '', notes: v.notes.trim(),
  });

  const log = async () => {
    const name = v.name.trim();
    if (!name || saving) return;
    setSaving(true); setStatus('');
    try {
      const topicId = await getOrCreateTopicId('Symptom', 'flask');
      await createEntry(topicId, `<p>${escapeHtml(name)}</p>`, fields());
      setV(blank());
      setStatus(`Logged ${name}`);
      setTimeout(() => setStatus(''), 2600);
    } catch (err) {
      console.error('Failed to log symptom:', err);
      setStatus('That didn’t save. Try again.');
    } finally { setSaving(false); }
  };

  const more = async () => openNew(await getOrCreateTopicId('Symptom', 'flask'), fields());

  /* + Add: save a chip of your own and pick it */
  const addDraft = () => {
    const label = draft.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (label) {
      if (chipsLoaded) void saveChips(addSymptomChip(chipConfig, label)).catch(err => console.warn('Symptom chip not saved:', err));
      setV(prev => (hasSymptom(prev.name, label) ? prev : { ...prev, name: toggleSymptom(prev.name, label) }));
    }
    setDraft('');
    setAdding(false);
  };

  return (
    <>
      <Section>
        <QChips role="group" aria-label="Symptoms">
          {chips.map(c => (
            <QChip key={c} type="button" aria-pressed={hasSymptom(v.name, c)} $active={hasSymptom(v.name, c)}
              onClick={() => set({ name: toggleSymptom(v.name, c) })}>{c}</QChip>
          ))}
          {/* a picked symptom that isn't a chip (e.g. added while the list was loading) */}
          {v.name && v.name.split(', ').filter(n => !chips.some(c => c.toLowerCase() === n.toLowerCase())).map(n => (
            <QChip key={`own-${n}`} type="button" aria-pressed $active onClick={() => set({ name: toggleSymptom(v.name, n) })}>{n}</QChip>
          ))}
          {adding ? (
            <QAddBox autoFocus value={draft} maxLength={40} placeholder="New symptom" aria-label="New symptom"
              onChange={e => setDraft(e.target.value)} onBlur={addDraft}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addDraft(); }
                if (e.key === 'Escape') { setDraft(''); setAdding(false); }
              }} />
          ) : (
            <QAddChip type="button" $active={false} onClick={() => setAdding(true)}>+ Add</QAddChip>
          )}
        </QChips>
      </Section>
      <div style={{ marginTop: 24 }}>
        <SeveritySection value={v.severity} onChange={n => set({ severity: n })} />
      </div>
      <Section style={{ marginTop: 20 }}>
        <QNotes value={v.notes} placeholder="Notes (optional)" aria-label="Notes"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
      <Footer>
        <MoreLink type="button" onClick={() => void more()}>More details</MoreLink>
        <Status role="status" aria-live="polite">{status}</Status>
        <PillButton type="button" onClick={() => void log()} disabled={saving || !v.name.trim()}>
          {saving ? 'Logging…' : 'Log symptom'}
        </PillButton>
      </Footer>
    </>
  );
}

/* ── Change ── */

/** Log a change — something you changed that the app can't see ("Cut out
 *  dairy"): what changed and when (today by default), saved to the Changes
 *  topic. Reports line these up against the data. */
export function QuickChangeForm() {
  const createEntry = useCreateEntry();
  const blank = () => ({ what: '', date: today() });
  const [v, setV] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const set = (patch: Partial<typeof v>) => setV(prev => ({ ...prev, ...patch }));

  const log = async () => {
    const what = v.what.trim();
    if (!what || saving) return;
    setSaving(true); setStatus('');
    try {
      const topicId = await getOrCreateTopicId('Changes', 'clock');
      await createEntry(topicId, `<p>${escapeHtml(what)}</p>`, { changeWhat: what, changeDate: v.date || today(), notes: '' });
      setV(blank());
      setStatus('Logged');
      setTimeout(() => setStatus(''), 2600);
    } catch (err) {
      console.error('Failed to log change:', err);
      setStatus('That didn’t save. Try again.');
    } finally { setSaving(false); }
  };

  return (
    <>
      <ChangeBox>
        <ChangeInput value={v.what} placeholder="What changed? e.g. Cut out dairy" aria-label="What changed?"
          onChange={e => set({ what: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void log(); } }} />
        <BoxBtn as="label">
          {dayWord(v.date || today())}
          <Icon name="chevron-down" size={13} strokeWidth={2} />
          <HiddenDate type="date" value={v.date} max={today()} aria-label="When did it change?"
            onChange={e => set({ date: e.target.value || today() })}
            onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* not supported */ } }} />
        </BoxBtn>
        <LogBtn type="button" onClick={() => void log()} disabled={saving || !v.what.trim()}>
          {saving ? 'Logging…' : 'Log'}
        </LogBtn>
      </ChangeBox>
      <ChangeNote>
        {status ? <span role="status">{status}</span> : <>Med changes are recorded automatically. <Link to="/health/meds">Med list</Link></>}
      </ChangeNote>
    </>
  );
}

/** Health dashboard panel around the quick change form */
export function QuickChange() {
  return (
    <DashPanel aria-label="Log a change">
      <DashPanelHead title="Log a change" />
      <QuickChangeForm />
    </DashPanel>
  );
}

/** Health dashboard panel around the quick symptom form */
export function QuickSymptom() {
  return (
    <DashPanel aria-label="Log a symptom">
      <DashPanelHead title="Log a symptom" />
      <QuickSymptomForm />
    </DashPanel>
  );
}

/* ── Panel ── */

export function QuickLog({ meal = true, exercise = true }: { meal?: boolean; exercise?: boolean }) {
  const [kind, setKind] = useState<'meal' | 'exercise'>(meal ? 'meal' : 'exercise');
  if (!meal && !exercise) return null;
  return (
    <DashPanel aria-label="Quick log">
      <DashPanelHead
        title="Quick log"
        aside={meal && exercise ? (
          <Switch role="tablist" aria-label="Log a">
            <SwitchBtn type="button" role="tab" aria-selected={kind === 'meal'} $active={kind === 'meal'} onClick={() => setKind('meal')}>Meal</SwitchBtn>
            <SwitchBtn type="button" role="tab" aria-selected={kind === 'exercise'} $active={kind === 'exercise'} onClick={() => setKind('exercise')}>Exercise</SwitchBtn>
          </Switch>
        ) : undefined}
      />
      {kind === 'meal' ? <MealQuick /> : <ExerciseQuick />}
    </DashPanel>
  );
}
