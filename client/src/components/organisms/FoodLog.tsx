import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import styled from 'styled-components';
import { TextInput } from '../atoms/TextInput.js';
import { Select } from '../atoms/Select.js';
import { Button } from '../atoms/Button.js';
import { FilterTabs } from '../molecules/FilterTabs.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
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

/* ── Shared styles ── */

export const Section = styled.section`
  margin-top: 32px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 12px;
`;

export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 12px;
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

const Muted = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
`;

const LinkBtn = styled.button`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  padding: 4px 2px;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { opacity: 0.7; }
  &:disabled { opacity: 0.45; cursor: default; }
`;

const FieldLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const Scroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const Table = styled.table<{ $min: number }>`
  width: 100%;
  min-width: ${({ $min }) => $min}px;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);

  th, td {
    text-align: left;
    padding: 4px 6px;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
  }
  th {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    white-space: nowrap;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.met { color: var(--color-success); background: var(--color-success-subtle); font-weight: 700; }
`;

/* Inline-editable cell: reads as text until hovered/focused, then fills. */
const CellInput = styled.input<{ $num?: boolean; $ai?: boolean }>`
  width: 100%;
  min-width: ${({ $num }) => ($num ? '64px' : '230px')};
  font: inherit;
  color: ${({ $ai }) => ($ai ? 'var(--text-secondary)' : 'inherit')};
  font-style: ${({ $ai }) => ($ai ? 'italic' : 'normal')};
  text-align: ${({ $num }) => ($num ? 'right' : 'left')};
  font-variant-numeric: tabular-nums;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md, 1px);
  padding: 6px;
  &:hover { border-color: var(--border-subtle); }
  &:focus { outline: none; background: var(--bg-sunken); border-color: var(--border-default); font-style: normal; }
`;

const CellSelect = styled.select`
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md, 1px);
  padding: 6px 2px;
  cursor: pointer;
  &:hover { border-color: var(--border-subtle); }
  &:focus { outline: none; background: var(--bg-sunken); border-color: var(--border-default); }
`;

const TotalRow = styled.tr`
  td { background: var(--bg-sunken); font-weight: 700; padding: 10px 6px; border-bottom: none; }
  td.lbl { font-family: var(--font-label); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-secondary); }
`;

const RowActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 4px;
`;

const IconBtn = styled.button<{ $danger?: boolean }>`
  font-family: var(--font-sans);
  font-size: 12px;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger, #c0392b)' : 'var(--text-tertiary)')};
  font-weight: ${({ $danger }) => ($danger ? 700 : 400)};
  background: transparent;
  border: 1px solid ${({ $danger }) => ($danger ? 'var(--color-danger, #c0392b)' : 'transparent')};
  border-radius: var(--r-md, 1px);
  padding: 4px 6px;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { border-color: var(--border-default); color: var(--text-primary); }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const EmptyCell = styled.td`
  text-align: center !important;
  color: var(--text-tertiary);
  padding: 20px !important;
`;

const DayName = styled.p`
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 18px;
  color: var(--text-secondary);
  margin: 0 0 8px;
`;

const DayNav = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  input[type='date'] {
    font: inherit;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-sunken);
    border: none;
    border-radius: var(--r-md, 1px);
    padding: 6px 8px;
  }
`;

const NavBtn = styled.button`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-sunken);
  border: none;
  border-radius: var(--r-md, 1px);
  padding: 6px 10px;
  cursor: pointer;
  &:hover { background: var(--bg-active); }
`;

/* ── Actions ── */

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

/* ── Add form ── */

export interface LibraryItem {
  id: string;
  name: string;
  mealType: string;
  values: Partial<Record<NutrientKey, number | null>>;
}

const AddGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 10px;
  align-items: end;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const NutrientGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
  @media (max-width: 640px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 14px;
`;

const Chip = styled.button<{ $editing?: boolean }>`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-sunken);
  border: 1px ${({ $editing }) => ($editing ? 'dashed var(--border-strong)' : 'solid transparent')};
  border-radius: var(--r-md, 1px);
  padding: 5px 10px;
  cursor: pointer;
  &:hover { background: var(--bg-active); }
  .x { color: var(--color-danger, #c0392b); font-weight: 700; margin-left: 6px; }
`;

interface FoodAddFormProps {
  day: string;
  actions: FoodLogActions;
  aiReady: boolean;
  library: LibraryItem[];
  onLibraryChange: (next: LibraryItem[]) => Promise<void>;
  onStatus: (msg: string) => void;
}

export function FoodAddForm({ day, actions, aiReady, library, onLibraryChange, onStatus }: FoodAddFormProps) {
  const [item, setItem] = useState('');
  const [mealType, setMealType] = useState(() => mealForNow());
  const [values, setValues] = useState<Record<NutrientKey, string>>(emptyValues);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingQuick, setEditingQuick] = useState(false);

  const add = async (name: string, type: string, vals: Partial<Record<NutrientKey, string>>, note: string) => {
    const cf: Record<string, unknown> = {
      mealDescription: name, mealType: type, consumedDate: day,
      consumedTime: day === toDateStr(new Date()) ? nowTime() : '',
      ingredients: '', notes: note,
    };
    let fields = cf;
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

  const sorted = [...library].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <AddGrid>
        <FieldLabel>Item
          <TextInput value={item} onChange={e => setItem(e.target.value)} onKeyDown={onEnter} placeholder="Chicken sausage, 1 link" autoComplete="off" />
        </FieldLabel>
        <FieldLabel>Type
          <Select value={mealType} onChange={e => setMealType(e.target.value)}>
            {MEAL_TYPE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </FieldLabel>
      </AddGrid>
      <NutrientGrid>
        {NUTRIENTS.map(n => (
          <FieldLabel key={n.key}>{n.unit ? `${n.label} (${n.unit})` : n.label}
            <TextInput
              type="number" step={n.step} min="0" inputMode="decimal"
              value={values[n.key]}
              onChange={e => setValues(v => ({ ...v, [n.key]: e.target.value }))}
              onKeyDown={onEnter}
              placeholder={aiReady ? 'AI' : ''}
            />
          </FieldLabel>
        ))}
      </NutrientGrid>
      <AddGrid style={{ marginTop: 10 }}>
        <FieldLabel>Notes
          <TextInput value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={onEnter} placeholder="Optional" autoComplete="off" />
        </FieldLabel>
        <Button variant="primary" onClick={handleAdd} disabled={saving || !item.trim()}>Add to this day</Button>
      </AddGrid>
      {aiReady && <Muted style={{ marginTop: 8 }}>Leave nutrients blank and the AI fills them in after you add.</Muted>}

      <Chips aria-label="Quick add">
        <Muted style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
          <span>Quick add to the day shown below</span>
          {library.length > 0 && <LinkBtn type="button" onClick={() => setEditingQuick(v => !v)}>{editingQuick ? 'Done' : 'Edit list'}</LinkBtn>}
        </Muted>
        {library.length === 0 && <Muted>Use “Save” on any row to add it here.</Muted>}
        {sorted.map(it => (
          <Chip
            key={it.id}
            type="button"
            $editing={editingQuick}
            aria-label={editingQuick ? `Remove ${it.name} from quick add` : `Add ${it.name}`}
            onClick={() => editingQuick ? void onLibraryChange(library.filter(l => l.id !== it.id)) : void quickAdd(it)}
          >
            {it.name}{editingQuick && <span className="x">×</span>}
          </Chip>
        ))}
      </Chips>
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

/* ── Day sheet ── */

export function longDay(day: string): string {
  const t = parseDay(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return day === toDateStr(new Date()) ? `Today — ${t}` : t;
}

interface DayNavigatorProps { day: string; onChange: (day: string) => void }

export function DayNavigator({ day, onChange }: DayNavigatorProps) {
  return (
    <DayNav>
      <NavBtn type="button" onClick={() => onChange(shiftDay(day, -1))} aria-label="Previous day">‹ Prev</NavBtn>
      <input type="date" value={day} onChange={e => e.target.value && onChange(e.target.value)} aria-label="Day to show" />
      <NavBtn type="button" onClick={() => onChange(shiftDay(day, 1))} aria-label="Next day">Next ›</NavBtn>
      <NavBtn type="button" onClick={() => onChange(toDateStr(new Date()))}>Today</NavBtn>
    </DayNav>
  );
}

interface FoodDaySheetProps {
  day: string;
  rows: FoodRow[];
  goals: NutrientGoals;
  actions: FoodLogActions;
  aiReady: boolean;
  library: LibraryItem[];
  onLibraryChange: (next: LibraryItem[]) => Promise<void>;
  onStatus: (msg: string) => void;
}

export function FoodDaySheet({ day, rows, goals, actions, aiReady, library, onLibraryChange, onStatus }: FoodDaySheetProps) {
  const [armed, setArmed] = useState<number | null>(null);
  const summary = useMemo(() => summarizeDay(rows), [rows]);

  const commit = async (row: FoodRow, patch: { item?: string; mealType?: string; notes?: string; nutrient?: [NutrientKey, string] }) => {
    try {
      let cf = { ...row.cf };
      let content = `<p>${escapeHtml(row.item)}</p>`;
      if (patch.item !== undefined) {
        content = `<p>${escapeHtml(patch.item)}</p>`;
        cf.mealDescription = patch.item;
      }
      if (patch.mealType !== undefined) cf.mealType = patch.mealType;
      if (patch.notes !== undefined) cf.notes = patch.notes;
      if (patch.nutrient) cf = withManualNutrient(cf, patch.nutrient[0], patch.nutrient[1]);
      await actions.save(row.id, content, cf);
      // A changed description makes earlier AI numbers stale — refresh them
      if (aiReady && (patch.item !== undefined || patch.mealType !== undefined)) void actions.fill(row.id);
    } catch (err) {
      console.error('Failed to update food:', err);
      onStatus('That didn’t save — try again');
    }
  };

  const saveToQuickAdd = async (row: FoodRow) => {
    const existing = library.find(l => l.name.toLowerCase() === row.item.toLowerCase());
    const item: LibraryItem = {
      id: existing?.id ?? `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: row.item, mealType: row.mealType || 'snack', values: { ...row.values },
    };
    await onLibraryChange(existing ? library.map(l => (l.id === existing.id ? item : l)) : [...library, item]);
    onStatus(existing ? 'Quick add updated' : 'Saved to quick add');
  };

  const handleDelete = async (row: FoodRow) => {
    if (armed !== row.id) { setArmed(row.id); return; }
    setArmed(null);
    try { await actions.remove(row.id); onStatus('Deleted'); }
    catch { onStatus('That didn’t delete — try again'); }
  };

  const missing = rows.filter(r => nutrientsToEstimate(r.item, r.cf).length > 0);
  const fillMissing = async () => {
    for (const r of missing) await actions.fill(r.id);
  };

  const colCount = NUTRIENTS.length + 4;

  return (
    <div>
      {aiReady && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {actions.aiError && <Muted style={{ color: 'var(--color-danger, #c0392b)' }}>{actions.aiError}</Muted>}
          <LinkBtn type="button" onClick={fillMissing} disabled={missing.length === 0 || actions.pending.size > 0}>
            {actions.pending.size > 0 ? 'Estimating…' : `Fill missing with AI${missing.length ? ` (${missing.length})` : ''}`}
          </LinkBtn>
        </div>
      )}
      <Scroll>
        <Table $min={1020}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              {NUTRIENTS.map(n => <th key={n.key} className="num">{n.short}{n.unit ? ` (${n.unit})` : ''}</th>)}
              <th>Notes</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><EmptyCell colSpan={colCount}>Nothing logged for this day yet.</EmptyCell></tr>
            )}
            {rows.map(row => {
              const busy = actions.pending.has(row.id);
              return (
                <tr key={row.id}>
                  <td>
                    <CellInput
                      key={`item-${row.item}`}
                      defaultValue={row.item}
                      aria-label="Item"
                      onBlur={e => { const v = e.target.value.trim(); if (!v) { e.target.value = row.item; return; } if (v !== row.item) void commit(row, { item: v }); }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                  </td>
                  <td>
                    <CellSelect value={row.mealType || 'snack'} aria-label="Type" onChange={e => void commit(row, { mealType: e.target.value })}>
                      {MEAL_TYPE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </CellSelect>
                  </td>
                  {NUTRIENTS.map(n => {
                    const v = row.values[n.key];
                    const shown = formatNutrient(v, n.key);
                    const isAi = nutrientSourceOf(row.cf, n.key) === 'ai' && v !== null;
                    return (
                      <td key={n.key} className="num">
                        {busy && v === null ? <Muted>…</Muted> : (
                          <CellInput
                            key={`${n.key}-${shown}`}
                            $num
                            $ai={isAi}
                            type="number" step={n.step} min="0" inputMode="decimal"
                            defaultValue={shown}
                            title={isAi ? 'AI estimate — edit to override' : undefined}
                            aria-label={`${n.label}${isAi ? ' (AI estimate)' : ''}`}
                            onBlur={e => {
                              const next = e.target.value.trim();
                              if (next === shown) return;
                              const parsed = nutrientNumber(next);
                              void commit(row, { nutrient: [n.key, parsed === null ? '' : String(parsed)] });
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <CellInput
                      key={`notes-${row.notes}`}
                      defaultValue={row.notes}
                      aria-label="Notes"
                      onBlur={e => { const v = e.target.value.trim(); if (v !== row.notes) void commit(row, { notes: v }); }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                  </td>
                  <td>
                    <RowActions>
                      {aiReady && (
                        <IconBtn type="button" disabled={busy} onClick={() => void actions.fill(row.id, { refreshAi: true })} title="Re-estimate AI values (typed values are kept)">
                          {busy ? '…' : 'AI'}
                        </IconBtn>
                      )}
                      <IconBtn type="button" onClick={() => void saveToQuickAdd(row)} title="Save to quick add">Save</IconBtn>
                      <IconBtn
                        type="button"
                        $danger={armed === row.id}
                        onClick={() => void handleDelete(row)}
                        onBlur={() => setArmed(a => (a === row.id ? null : a))}
                        aria-label={`Delete ${row.item}`}
                      >
                        {armed === row.id ? 'Confirm' : 'Delete'}
                      </IconBtn>
                    </RowActions>
                  </td>
                </tr>
              );
            })}
            <TotalRow>
              <td className="lbl" colSpan={2}>Day total</td>
              {NUTRIENTS.map(n => (
                <td key={n.key} className={`num${goalMet(goals, n.key, summary) ? ' met' : ''}`}>
                  {summary.has[n.key] ? formatNutrient(summary.totals[n.key], n.key) : '—'}
                </td>
              ))}
              <td colSpan={2} />
            </TotalRow>
          </tbody>
        </Table>
      </Scroll>
    </div>
  );
}

/* ── Daily totals ── */

export const TOTAL_WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: 'Year' },
] as const;
export type TotalWindow = typeof TOTAL_WINDOWS[number]['value'];

const ClickRow = styled.tr<{ $sel?: boolean }>`
  cursor: pointer;
  td { background: ${({ $sel }) => ($sel ? 'var(--bg-active)' : 'transparent')}; }
  &:hover td { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  td.day { font-weight: 700; white-space: nowrap; }
  td.met { background: var(--color-success-subtle); }
  td.list { font-size: 12px; min-width: 160px; color: var(--text-secondary); }
`;

const GoalRow = styled.tr`
  td { font-size: 12px; color: var(--text-tertiary); background: var(--bg-sunken); }
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
            {NUTRIENTS.map(n => <th key={n.key} className="num">{n.short}{n.unit ? ` (${n.unit})` : ''}</th>)}
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
              <ClickRow
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
                <td className="list">{noticed.length ? noticed.join('; ') : '—'}</td>
              </ClickRow>
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

/* ── Goals ── */

const GoalGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  @media (max-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

interface NutritionGoalsPanelProps {
  goals: NutrientGoals;
  onChange: (next: NutrientGoals) => Promise<void>;
}

export function NutritionGoalsPanel({ goals, onChange }: NutritionGoalsPanelProps) {
  return (
    <GoalGrid>
      {NUTRIENTS.map(n => (
        <FieldLabel key={`${n.key}-${goals[n.key] ?? ''}`}>
          {n.key === 'calories' ? 'Calories (at least)' : `${n.label} (${n.unit})`}
          <TextInput
            type="number" step={n.step} min="0" inputMode="decimal"
            defaultValue={goals[n.key] === null || goals[n.key] === undefined ? '' : formatNutrient(goals[n.key], n.key)}
            placeholder="No goal"
            onBlur={e => {
              const next = nutrientNumber(e.target.value);
              if (next === goals[n.key]) return;
              void onChange({ ...goals, [n.key]: next });
            }}
          />
        </FieldLabel>
      ))}
    </GoalGrid>
  );
}
