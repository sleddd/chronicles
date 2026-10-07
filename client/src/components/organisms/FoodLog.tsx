import { useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import styled from 'styled-components';
import { TextInput } from '../atoms/TextInput.js';
import { Select } from '../atoms/Select.js';
import { PillButton } from '../atoms/PillButton.js';
import { UnitLabel } from '../atoms/UnitLabel.js';
import { FormField } from '../molecules/FormField.js';
import { FilterTabs } from '../molecules/FilterTabs.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { autoNutritionOnSave, estimateEntryNutrition, nutrientsToEstimate } from '../../services/aiAssistant.js';
import { deleteEntryWithImages } from '../../utils/entryActions.js';
import { toDateStr } from '../../utils/dateUtils.js';
import {
  MEAL_TYPE_OPTIONS, goalMet, parseDay, shiftDay, summarizeDay, type FoodRow,
} from '../../utils/foodLog.js';
import {
  NUTRIENTS, formatNutrient, nutrientNumber, nutrientSourceOf, withManualNutrient,
  type NutrientGoals, type NutrientKey,
} from '../../types/nutrition.js';

/* ══ Shared section chrome (flat sections: top rule + tracked label row) ══ */

export const Section = styled.section`
  margin-top: 40px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
`;

export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 14px;
  min-height: 32px;
`;

export const SectionLabel = styled.h2`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
`;

export const SectionNote = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-tertiary);
  margin: 0;
`;

/** Accent text action used in section heads ("See all", "Fill missing with AI"). */
export const TextAction = styled.button`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { opacity: 0.7; }
  &:disabled { color: var(--text-disabled); cursor: default; }
`;

const ErrorNote = styled(SectionNote)`
  color: var(--color-danger, #c0392b);
`;

/* Two FormField columns that collapse to one on narrow screens. */
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

/* ══ Actions ══ */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Create, update, delete and AI-fill food entries, keeping the store in sync. */
export function useFoodLogActions(topicName: string) {
  const { encryptPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [aiError, setAiError] = useState('');

  const topicId = useCallback(async (): Promise<number> => {
    const { allTopics, setTopics } = useEntriesStore.getState();
    let topic = allTopics.find(t => t.name.toLowerCase() === topicName.toLowerCase());
    if (!topic) {
      topic = await topicsApi.create({ name: topicName, icon: 'utensils' });
      setTopics([...allTopics, topic]);
    }
    return topic.id;
  }, [topicName]);

  /** Re-encrypt and save an entry's content + custom fields, keeping its other metadata. */
  const save = useCallback(async (id: number, content: string, cf: Record<string, unknown>) => {
    const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === id);
    if (!entry) return;
    const meta: Record<string, unknown> = { ...((entry.metadata as Record<string, unknown>) ?? {}), _customFields: cf };
    const tid = meta._taxonomyId as number | undefined;
    const encrypted = await encryptPost(content, meta);
    await entriesApi.update(id, {
      contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      taxonomyIds: tid ? [tid] : [],
    });
    updateDecryptedEntry(id, { content, metadata: meta });
  }, [encryptPost, updateDecryptedEntry]);

  /** AI-fill an entry's missing (or stale AI) nutrients in the background. */
  const fill = useCallback(async (id: number, opts: { refreshAi?: boolean } = {}) => {
    const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === id);
    if (!entry) return;
    const cf = ((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) ?? {};
    const text = entry.content.replace(/<[^>]+>/g, '').trim();
    setPending(p => new Set(p).add(id));
    setAiError('');
    try {
      const next = opts.refreshAi ? await estimateEntryNutrition(text, cf, opts) : await autoNutritionOnSave(text, cf);
      if (next) await save(id, entry.content, next);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not estimate nutrients');
    } finally {
      setPending(p => { const n = new Set(p); n.delete(id); return n; });
    }
  }, [save]);

  const create = useCallback(async (day: string, item: string, cf: Record<string, unknown>) => {
    const tid = await topicId();
    const content = `<p>${escapeHtml(item)}</p>`;
    const metadata = { _taxonomyId: tid, _customFields: cf };
    const encrypted = await encryptPost(content, metadata);
    const isToday = day === toDateStr(new Date());
    const result = await entriesApi.create({
      contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      isEncrypted: true, taxonomyIds: [tid],
      ...(isToday ? {} : { createdAt: new Date(`${day}T12:00:00`).toISOString() }),
    });
    const id = result.id as number;
    addDecryptedEntry({
      id, content, metadata, isEncrypted: true,
      createdAt: new Date(result.createdAt as string),
      updatedAt: new Date((result.updatedAt || result.createdAt) as string),
    });
    return id;
  }, [topicId, encryptPost, addDecryptedEntry]);

  const remove = useCallback((id: number) => deleteEntryWithImages(id), []);

  return { create, save, fill, remove, pending, aiError, setAiError };
}

export type FoodLogActions = ReturnType<typeof useFoodLogActions>;


/* ══ Today at a glance ══ */

const Glance = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 24px;
  @media (max-width: 860px) { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 20px; }
  @media (max-width: 480px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const StatLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const StatValue = styled.span<{ $met?: boolean }>`
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 200;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: ${({ $met }) => ($met ? 'var(--color-success)' : 'var(--text-primary)')};
  small { font-family: var(--font-sans); font-size: 12px; font-weight: 400; color: var(--text-tertiary); margin-left: 4px; }
`;

const StatGoal = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-tertiary);
`;

const Track = styled.div`
  height: 3px;
  background: var(--border-subtle);
  border-radius: var(--r-full, 999px);
  overflow: hidden;
  margin-top: 4px;
`;

const Fill = styled.div<{ $pct: number; $met: boolean }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ $met }) => ($met ? 'var(--color-success)' : 'var(--color-accent)')};
  transition: width 300ms ease-out;
`;

/** The selected day's totals against goals — five quiet stat columns with progress rules. */
export function DayAtAGlance({ rows, goals }: { rows: FoodRow[]; goals: NutrientGoals }) {
  const summary = useMemo(() => summarizeDay(rows), [rows]);
  return (
    <Glance>
      {NUTRIENTS.map(n => {
        const total = summary.has[n.key] ? summary.totals[n.key] : null;
        const goal = goals[n.key];
        const met = goalMet(goals, n.key, summary);
        const pct = goal ? Math.min(100, ((total ?? 0) / goal) * 100) : 0;
        return (
          <Stat key={n.key}>
            <StatLabel>{n.label}</StatLabel>
            <StatValue $met={met}>
              {total === null ? '—' : formatNutrient(total, n.key)}
              {total !== null && n.unit && <small>{n.unit}</small>}
            </StatValue>
            <StatGoal>
              {goal ? `${met ? 'Goal met · ' : 'of '}${formatNutrient(goal, n.key)}${n.unit ? ` ${n.unit}` : ''}` : 'No goal set'}
            </StatGoal>
            {goal ? <Track><Fill $pct={pct} $met={met} /></Track> : null}
          </Stat>
        );
      })}
    </Glance>
  );
}

/* ══ Log food form ══ */

export interface LibraryItem {
  id: string;
  name: string;
  mealType: string;
  values: Partial<Record<NutrientKey, number | null>>;
}

const SavedFoods = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 18px;
`;

const Chip = styled.button<{ $editing?: boolean }>`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-sunken);
  border: 1px ${({ $editing }) => ($editing ? 'dashed var(--border-strong)' : 'solid transparent')};
  border-radius: var(--r-md, 2px);
  padding: 6px 12px;
  cursor: pointer;
  transition: background 120ms;
  &:hover { background: var(--bg-active); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
  .x { color: var(--color-danger, #c0392b); font-weight: 700; margin-left: 8px; }
`;

const ChipsLabel = styled(StatLabel)`
  margin-right: 4px;
`;

interface FoodAddFormProps {
  day: string;
  actions: FoodLogActions;
  aiReady: boolean;
  library: LibraryItem[];
  onLibraryChange: (next: LibraryItem[]) => Promise<void>;
  onStatus: (msg: string) => void;
  /** Label for the submit button — "Add to this day" on the log, "Log food" elsewhere */
  submitLabel?: string;
}

/** Item, type and nutrients in the app's label-left field rows; blanks are AI-filled after adding. */
export function FoodAddForm({ day, actions, aiReady, library, onLibraryChange, onStatus, submitLabel = 'Add to this day' }: FoodAddFormProps) {
  const [item, setItem] = useState('');
  const [mealType, setMealType] = useState(() => mealForNow());
  const [values, setValues] = useState<Record<NutrientKey, string>>(emptyValues);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingQuick, setEditingQuick] = useState(false);

  const add = async (name: string, type: string, vals: Partial<Record<NutrientKey, string>>, note: string) => {
    let fields: Record<string, unknown> = {
      mealDescription: name, mealType: type, consumedDate: day,
      consumedTime: day === toDateStr(new Date()) ? nowTime() : '',
      ingredients: '', notes: note,
    };
    for (const n of NUTRIENTS) {
      const v = (vals[n.key] ?? '').trim();
      fields = v ? withManualNutrient(fields, n.key, v) : { ...fields, [n.key]: '' };
    }
    const id = await actions.create(day, name, fields);
    onStatus(`Added ${name}`);
    if (aiReady) void actions.fill(id);
  };

  const handleAdd = async () => {
    if (!item.trim() || saving) return;
    setSaving(true);
    try {
      await add(item.trim(), mealType, values, notes.trim());
      setItem(''); setValues(emptyValues()); setNotes('');
    } catch (err) {
      console.error('Failed to add food:', err);
      onStatus('That didn’t save — try again');
    } finally { setSaving(false); }
  };

  const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); } };

  const quickAdd = async (it: LibraryItem) => {
    const vals: Partial<Record<NutrientKey, string>> = {};
    for (const n of NUTRIENTS) {
      const v = it.values[n.key];
      if (v !== null && v !== undefined) vals[n.key] = String(v);
    }
    try { await add(it.name, it.mealType || 'snack', vals, ''); }
    catch { onStatus('That didn’t save — try again'); }
  };

  const nutrientPlaceholder = aiReady ? 'Auto' : '—';
  const nutrientField = (key: NutrientKey) => {
    const n = NUTRIENTS.find(x => x.key === key)!;
    return (
      <FormField key={key} label={<UnitLabel label={n.label} unit={n.unit || undefined} />}>
        <TextInput
          type="number" step={n.step} min="0" inputMode="decimal"
          value={values[key]}
          onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
          onKeyDown={onEnter}
          placeholder={nutrientPlaceholder}
          aria-label={`${n.label}${n.unit ? ` (${n.unit})` : ''}`}
        />
      </FormField>
    );
  };

  const sorted = [...library].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <FormField label="Item">
        <TextInput value={item} onChange={e => setItem(e.target.value)} onKeyDown={onEnter} placeholder="e.g. Chicken sausage, 1 link" autoComplete="off" aria-label="Item" />
      </FormField>
      <FieldGrid>
        <FormField label="Type">
          <Select value={mealType} onChange={e => setMealType(e.target.value)} aria-label="Type">
            {MEAL_TYPE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </FormField>
        {nutrientField('calories')}
        {nutrientField('iron')}
        {nutrientField('vitaminD')}
        {nutrientField('vitaminB12')}
        {nutrientField('vitaminC')}
      </FieldGrid>
      <FormField label="Notes">
        <TextInput value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={onEnter} placeholder="Optional" autoComplete="off" aria-label="Notes" />
      </FormField>
      <FormFooter>
        <SectionNote>{aiReady ? 'Leave any nutrient blank and the AI fills it in.' : 'Turn on the AI assistant in Settings to fill in nutrients automatically.'}</SectionNote>
        <PillButton type="button" onClick={handleAdd} disabled={saving || !item.trim()}>{saving ? 'Adding…' : submitLabel}</PillButton>
      </FormFooter>

      <SavedFoods aria-label="Saved foods">
        <ChipsLabel>Saved foods</ChipsLabel>
        {library.length === 0 && <SectionNote>Use “Save” on any logged item to keep it here for one-tap adding.</SectionNote>}
        {sorted.map(it => (
          <Chip
            key={it.id}
            type="button"
            $editing={editingQuick}
            aria-label={editingQuick ? `Remove ${it.name} from saved foods` : `Add ${it.name}`}
            onClick={() => editingQuick ? void onLibraryChange(library.filter(l => l.id !== it.id)) : void quickAdd(it)}
          >
            {it.name}{editingQuick && <span className="x" aria-hidden="true">×</span>}
          </Chip>
        ))}
        {library.length > 0 && (
          <TextAction type="button" onClick={() => setEditingQuick(v => !v)}>{editingQuick ? 'Done' : 'Edit'}</TextAction>
        )}
      </SavedFoods>
    </div>
  );
}

function emptyValues(): Record<NutrientKey, string> {
  const v = {} as Record<NutrientKey, string>;
  for (const n of NUTRIENTS) v[n.key] = '';
  return v;
}

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

/* ══ Day navigation ══ */

export function longDay(day: string): string {
  const t = parseDay(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return day === toDateStr(new Date()) ? `Today — ${t}` : t;
}

const DayNav = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const NavIcon = styled.button`
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--r-md, 2px);
  cursor: pointer;
  &:hover { background: var(--bg-hover); color: var(--text-primary); }
`;

const DateInput = styled.input`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-sunken);
  border: none;
  border-radius: var(--r-md, 2px);
  padding: 6px 10px;
  color-scheme: light dark;
`;

export function DayNavigator({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const isToday = day === toDateStr(new Date());
  return (
    <DayNav>
      <NavIcon type="button" onClick={() => onChange(shiftDay(day, -1))} aria-label="Previous day">‹</NavIcon>
      <DateInput type="date" value={day} onChange={e => e.target.value && onChange(e.target.value)} aria-label="Day to show" />
      <NavIcon type="button" onClick={() => onChange(shiftDay(day, 1))} aria-label="Next day">›</NavIcon>
      {!isToday && <TextAction type="button" onClick={() => onChange(toDateStr(new Date()))} style={{ marginLeft: 8 }}>Today</TextAction>}
    </DayNav>
  );
}

export const DayTitle = styled.p`
  font-family: var(--font-display);
  font-weight: 200;
  font-size: 26px;
  line-height: 1.2;
  color: var(--text-primary);
  margin: 0 0 18px;
`;

/* ══ Tables ══ */

const Scroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const Table = styled.table<{ $min: number }>`
  width: 100%;
  min-width: ${({ $min }) => $min}px;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);

  th, td {
    text-align: left;
    padding: 12px 10px;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
  }
  th:first-child, td:first-child { padding-left: 4px; }
  th {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    white-space: nowrap;
    padding-top: 6px;
    padding-bottom: 10px;
  }
  th .unit { text-transform: none; letter-spacing: 0.04em; font-weight: 400; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.ai { color: var(--text-tertiary); font-style: italic; }
  td.muted { color: var(--text-disabled); }
`;

const ItemRow = styled.tr`
  cursor: pointer;
  &:hover td { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .actions { opacity: 0; transition: opacity 120ms; }
  &:hover .actions, &:focus-within .actions { opacity: 1; }
  @media (hover: none) { .actions { opacity: 1; } }
`;

const ItemName = styled.div`
  font-size: 14px;
  color: var(--text-primary);
`;

const ItemMeta = styled.div`
  margin-top: 2px;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  span.note { font-family: var(--font-sans); font-weight: 400; letter-spacing: 0; text-transform: none; margin-left: 6px; }
`;

const RowActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const RowAction = styled.button<{ $danger?: boolean }>`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger, #c0392b)' : 'var(--text-tertiary)')};
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  &:hover:not(:disabled) { color: ${({ $danger }) => ($danger ? 'var(--color-danger, #c0392b)' : 'var(--text-primary)')}; }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const TotalRow = styled.tr`
  td {
    font-weight: 600;
    border-bottom: none;
    border-top: 1px solid var(--border-default);
    padding-top: 14px;
  }
  td.lbl {
    font-family: var(--font-label);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  td.met { color: var(--color-success); }
`;

const EmptyCell = styled.td`
  text-align: center !important;
  color: var(--text-tertiary);
  padding: 28px !important;
`;

function NutrientHead() {
  return (
    <>
      {NUTRIENTS.map(n => (
        <th key={n.key} className="num">{n.short}{n.unit ? <span className="unit"> {n.unit}</span> : null}</th>
      ))}
    </>
  );
}

interface FoodDayListProps {
  rows: FoodRow[];
  goals: NutrientGoals;
  actions: FoodLogActions;
  aiReady: boolean;
  library: LibraryItem[];
  onLibraryChange: (next: LibraryItem[]) => Promise<void>;
  onStatus: (msg: string) => void;
}

/**
 * The day's items as a quiet read-only table — select a row to edit it in the
 * journal (like every other list). Italic grey values are AI estimates.
 */
export function FoodDayList({ rows, goals, actions, aiReady, library, onLibraryChange, onStatus }: FoodDayListProps) {
  const openInJournal = useOpenInJournal();
  const [armed, setArmed] = useState<number | null>(null);
  const summary = useMemo(() => summarizeDay(rows), [rows]);
  const mealLabel = (v: string) => MEAL_TYPE_OPTIONS.find(m => m.value === v)?.label ?? '';

  const stop = (e: MouseEvent) => e.stopPropagation();

  const saveToQuickAdd = async (row: FoodRow) => {
    const existing = library.find(l => l.name.toLowerCase() === row.item.toLowerCase());
    const item: LibraryItem = {
      id: existing?.id ?? `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: row.item, mealType: row.mealType || 'snack', values: { ...row.values },
    };
    await onLibraryChange(existing ? library.map(l => (l.id === existing.id ? item : l)) : [...library, item]);
    onStatus(existing ? 'Saved food updated' : 'Saved to saved foods');
  };

  const handleDelete = async (row: FoodRow) => {
    if (armed !== row.id) { setArmed(row.id); return; }
    setArmed(null);
    try { await actions.remove(row.id); onStatus('Deleted'); }
    catch { onStatus('That didn’t delete — try again'); }
  };

  return (
    <Scroll>
      <Table $min={760}>
        <thead>
          <tr>
            <th>Item</th>
            <NutrientHead />
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><EmptyCell colSpan={NUTRIENTS.length + 2}>Nothing logged for this day yet.</EmptyCell></tr>
          )}
          {rows.map(row => {
            const busy = actions.pending.has(row.id);
            return (
              <ItemRow
                key={row.id}
                tabIndex={0}
                aria-label={`Edit ${row.item} in the journal`}
                onClick={() => openInJournal(row.id)}
                onKeyDown={e => { if (e.key === 'Enter') openInJournal(row.id); }}
              >
                <td>
                  <ItemName>{row.item}</ItemName>
                  <ItemMeta>
                    {mealLabel(row.mealType) || 'Food'}
                    {row.notes && <span className="note">· {row.notes}</span>}
                  </ItemMeta>
                </td>
                {NUTRIENTS.map(n => {
                  const v = row.values[n.key];
                  const isAi = nutrientSourceOf(row.cf, n.key) === 'ai';
                  const cls = v === null ? 'num muted' : `num${isAi ? ' ai' : ''}`;
                  return (
                    <td key={n.key} className={cls} title={isAi && v !== null ? 'AI estimate' : undefined}>
                      {v === null ? (busy ? '…' : '—') : formatNutrient(v, n.key)}
                    </td>
                  );
                })}
                <td onClick={stop}>
                  <RowActions className="actions">
                    {aiReady && (
                      <RowAction type="button" disabled={busy} onClick={() => void actions.fill(row.id, { refreshAi: true })} title="Re-estimate AI values (typed values are kept)">
                        {busy ? 'Estimating…' : 'Estimate'}
                      </RowAction>
                    )}
                    <RowAction type="button" onClick={() => void saveToQuickAdd(row)}>Save</RowAction>
                    <RowAction
                      type="button"
                      $danger={armed === row.id}
                      onClick={() => void handleDelete(row)}
                      onBlur={() => setArmed(a => (a === row.id ? null : a))}
                      aria-label={armed === row.id ? `Confirm delete ${row.item}` : `Delete ${row.item}`}
                    >
                      {armed === row.id ? 'Confirm' : 'Delete'}
                    </RowAction>
                  </RowActions>
                </td>
              </ItemRow>
            );
          })}
          {rows.length > 0 && (
            <TotalRow>
              <td className="lbl">Day total</td>
              {NUTRIENTS.map(n => (
                <td key={n.key} className={`num${goalMet(goals, n.key, summary) ? ' met' : ''}`}>
                  {summary.has[n.key] ? formatNutrient(summary.totals[n.key], n.key) : '—'}
                </td>
              ))}
              <td />
            </TotalRow>
          )}
        </tbody>
      </Table>
    </Scroll>
  );
}

/** "Fill missing with AI (n)" for a day's rows; renders nothing when AI is off. */
export function FillMissingAction({ rows, actions, aiReady }: { rows: FoodRow[]; actions: FoodLogActions; aiReady: boolean }) {
  if (!aiReady) return null;
  const missing = rows.filter(r => nutrientsToEstimate(r.item, r.cf).length > 0);
  const busy = actions.pending.size > 0;
  return (
    <TextAction
      type="button"
      disabled={missing.length === 0 || busy}
      onClick={async () => { for (const r of missing) await actions.fill(r.id); }}
    >
      {busy ? 'Estimating…' : missing.length ? `Fill ${missing.length} missing with AI` : 'All nutrients filled'}
    </TextAction>
  );
}

export function AiErrorNote({ actions }: { actions: FoodLogActions }) {
  return actions.aiError ? <ErrorNote role="alert" style={{ marginBottom: 10 }}>{actions.aiError}</ErrorNote> : null;
}

/* ══ Daily totals ══ */

export const TOTAL_WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: 'Year' },
] as const;
export type TotalWindow = typeof TOTAL_WINDOWS[number]['value'];

const DayRow = styled.tr<{ $sel?: boolean }>`
  cursor: pointer;
  td { background: ${({ $sel }) => ($sel ? 'var(--color-accent-subtle)' : 'transparent')}; }
  td:first-child { box-shadow: ${({ $sel }) => ($sel ? 'inset 2px 0 0 var(--color-accent)' : 'none')}; }
  &:hover td { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  td.day { white-space: nowrap; }
  td.met { color: var(--color-success); font-weight: 600; }
  td.list { font-size: 13px; color: var(--text-secondary); min-width: 160px; max-width: 280px; }
`;

const GoalRow = styled.tr`
  td { font-size: 12px; color: var(--text-tertiary); padding-top: 8px; padding-bottom: 8px; }
  td:first-child { font-family: var(--font-label); font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
`;

interface FoodTotalsTableProps {
  days: { day: string; rows: FoodRow[]; noticed: string[] }[];
  goals: NutrientGoals;
  selected: string;
  onOpen: (day: string) => void;
}

export function FoodTotalsTable({ days, goals, selected, onOpen }: FoodTotalsTableProps) {
  return (
    <Scroll>
      <Table $min={860}>
        <thead>
          <tr>
            <th>Day</th>
            <NutrientHead />
            <th>Took</th>
            <th>Noticed</th>
          </tr>
        </thead>
        <tbody>
          <GoalRow>
            <td>Goal</td>
            {NUTRIENTS.map(n => {
              const g = goals[n.key];
              return <td key={n.key} className="num">{g === null || g === undefined ? '—' : `${formatNutrient(g, n.key)}${n.key === 'calories' ? '+' : ''}`}</td>;
            })}
            <td /><td />
          </GoalRow>
          {days.map(({ day, rows, noticed }) => {
            const summary = summarizeDay(rows);
            const took = countNames(rows.filter(r => r.mealType === 'supplement').map(r => r.item));
            return (
              <DayRow
                key={day}
                $sel={day === selected}
                tabIndex={0}
                aria-label={`Open ${longDay(day)}`}
                onClick={() => onOpen(day)}
                onKeyDown={e => { if (e.key === 'Enter') onOpen(day); }}
              >
                <td className="day">{parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                {NUTRIENTS.map(n => (
                  <td key={n.key} className={`num${goalMet(goals, n.key, summary) ? ' met' : ''}`}>
                    {summary.has[n.key] ? formatNutrient(summary.totals[n.key], n.key) : '—'}
                  </td>
                ))}
                <td className="list">{took || '—'}</td>
                <td className="list">{noticed.length ? [...new Set(noticed)].join('; ') : '—'}</td>
              </DayRow>
            );
          })}
        </tbody>
      </Table>
    </Scroll>
  );
}

function countNames(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
}

export function TotalsWindowTabs({ value, onChange }: { value: TotalWindow; onChange: (v: TotalWindow) => void }) {
  return <FilterTabs options={[...TOTAL_WINDOWS]} active={value} onChange={onChange} flush bordered={false} />;
}

/* ══ Goals ══ */

interface NutritionGoalsPanelProps {
  goals: NutrientGoals;
  onChange: (next: NutrientGoals) => Promise<void>;
}

/** Daily targets in field rows; each saves when you leave the field. */
export function NutritionGoalsPanel({ goals, onChange }: NutritionGoalsPanelProps) {
  return (
    <FieldGrid>
      {NUTRIENTS.map(n => (
        <FormField key={`${n.key}-${goals[n.key] ?? ''}`} label={<UnitLabel label={n.label} unit={n.key === 'calories' ? 'at least' : n.unit || undefined} />}>
          <TextInput
            type="number" step={n.step} min="0" inputMode="decimal"
            defaultValue={goals[n.key] === null || goals[n.key] === undefined ? '' : formatNutrient(goals[n.key], n.key)}
            placeholder="No goal"
            aria-label={`${n.label} goal`}
            onBlur={e => {
              const next = nutrientNumber(e.target.value);
              if (next === goals[n.key]) return;
              void onChange({ ...goals, [n.key]: next });
            }}
          />
        </FormField>
      ))}
    </FieldGrid>
  );
}
