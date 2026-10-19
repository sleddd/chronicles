import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import styled from 'styled-components';
import { Select } from '../atoms/Select.js';
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
  NUTRIENTS, formatNutrient, nutrientNumber, nutrientSourceOf,
  type NutrientGoals, type NutrientKey,
} from '../../types/nutrition.js';

/* ══ Shared section chrome: a thin Work Sans heading row, content under it ══ */

export const Section = styled.section`
  margin-top: 44px;
  @media (max-width: 768px) { margin-top: 44px; }
`;

export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 24px;
  min-height: 32px;
`;

export const SectionLabel = styled.h2`
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  line-height: 1.15;
  color: var(--text-secondary);
  margin: 0;
  @media (max-width: 480px) { font-size: 20px; }
  padding-left: 16px;
`;

export const SectionNote = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
  margin: 0;
`;

/** Accent text action used in section heads ("See all", "Fill missing with AI"). */
export const TextAction = styled.button`
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-accent-link);
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

/* One field per row. */


/* ══ Actions ══ */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Create, update, delete and AI-fill food entries, keeping the store in sync. */
export function useFoodLogActions(topicName: string) {
  const { encryptPost, encryptNewPost } = useEncryption();
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
    const encrypted = await encryptPost(id, content, meta);
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
    const encrypted = await encryptNewPost(content, metadata);
    const isToday = day === toDateStr(new Date());
    const result = await entriesApi.create({ id: encrypted.id,
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
  }, [topicId, encryptNewPost, addDecryptedEntry]);

  const remove = useCallback((id: number) => deleteEntryWithImages(id), []);

  return { create, save, fill, remove, pending, aiError, setAiError, topicId };
}

export type FoodLogActions = ReturnType<typeof useFoodLogActions>;


/* ══ Today at a glance ══ */

/* One outlined --bg-panel strip, a cell per nutrient split by rules: the name,
   a thin figure with "/ goal unit", and a 4px progress rule */
const Glance = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
  @media (max-width: 860px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 480px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 18px 22px 20px;
  box-shadow: -1px 0 0 var(--border-subtle), 0 -1px 0 var(--border-subtle); /* rules between cells */
  @media (max-width: 480px) { padding: 18px 18px 22px; }
`;

const StatLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-soft);
`;

const StatValue = styled.span<{ $met?: boolean }>`
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 300;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ $met }) => ($met ? 'var(--chart-green)' : 'var(--text-primary)')};
  small { font-family: var(--font-sans); font-size: 13px; font-weight: 400; color: var(--text-muted); margin-left: 8px; }
  @media (max-width: 480px) { font-size: 22px; small { font-size: 12px; } }
`;

const Track = styled.div`
  height: 4px;
  margin-top: 4px;
  background: var(--border-card);
  border-radius: 2px;
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number; $met: boolean }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ $met }) => ($met ? 'var(--chart-green)' : 'var(--color-accent)')};
  border-radius: 2px;
  transition: width 300ms ease-out;
`;

/** The selected day's totals against goals — one outlined strip of five cells with progress rules. */
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
            <StatValue $met={met} title={met ? 'Goal met' : undefined}>
              {total === null ? '0' : formatNutrient(total, n.key)}
              <small>{goal ? `/ ${formatNutrient(goal, n.key)} ${n.unit || 'kcal'}` : (n.unit || 'kcal')}</small>
            </StatValue>
            <Track>{goal ? <Fill $pct={pct} $met={met} /> : null}</Track>
          </Stat>
        );
      })}
    </Glance>
  );
}

/* ══ Day navigation ══ */

export function longDay(day: string): string {
  const t = parseDay(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return day === toDateStr(new Date()) ? `Today — ${t}` : t;
}

/* ‹ Today › in one outlined pill; the label opens a date picker */
const DayNav = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 10px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
`;

const NavIcon = styled.button`
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const DayPick = styled.label`
  position: relative;
  min-width: 96px;
  padding: 0 8px;
  text-align: center;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
    color-scheme: light dark;
  }
`;

export function DayNavigator({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const isToday = day === toDateStr(new Date());
  return (
    <DayNav>
      <NavIcon type="button" onClick={() => onChange(shiftDay(day, -1))} aria-label="Previous day">‹</NavIcon>
      <DayPick>
        {isToday ? 'Today' : parseDay(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        <input type="date" value={day} onChange={e => e.target.value && onChange(e.target.value)} aria-label="Day to show" />
      </DayPick>
      <NavIcon type="button" onClick={() => onChange(shiftDay(day, 1))} aria-label="Next day">›</NavIcon>
    </DayNav>
  );
}

export const DayTitle = styled.p`
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 40px;
  line-height: 1.1;
  color: var(--text-secondary);
  margin: 0 0 18px;
  @media (max-width: 480px) { font-size: 30px; }
`;

/* ══ Tables ══ */

/* Tables sit in one outlined --bg-panel box; rows split by hairlines, no column rules */
const Scroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
`;

const Table = styled.table<{ $min: number }>`
  width: 100%;
  min-width: ${({ $min }) => $min}px;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);

  th, td {
    text-align: left;
    padding: 16px 14px;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: top;
  }
  th:first-child, td:first-child { padding-left: 24px; }
  th:last-child, td:last-child { padding-right: 24px; }
  tbody tr:last-child td { border-bottom: none; }
  th {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-tertiary);
    white-space: nowrap;
    padding-top: 18px;
    padding-bottom: 4px;
    border-bottom: none;
  }
  th .unit { font-weight: 500; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.ai { color: var(--text-muted); font-style: italic; }
  td.muted { color: var(--text-disabled); }
  td.met { color: var(--color-accent); }
`;

const ItemRow = styled.tr`
  cursor: pointer;
  &:hover td { background: var(--bg-row-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .actions { opacity: 0; transition: opacity 120ms; }
  &:hover .actions, &:focus-within .actions { opacity: 1; }
  @media (hover: none) { .actions { opacity: 1; } }
`;

const ItemName = styled.div`
  font-size: 15px;
  color: var(--text-secondary);
`;

const ItemMeta = styled.div`
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
  span.note { margin-left: 6px; }
`;

const RowActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const RowAction = styled.button<{ $danger?: boolean }>`
  font-family: var(--font-sans);
  font-size: 13px;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger, #c0392b)' : 'var(--text-muted)')};
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
    border-top: 1px solid var(--border-card);
  }
  td.lbl { font-weight: 500; color: var(--text-secondary); }
  td.met { color: var(--color-accent); }
`;

const EmptyCell = styled.td`
  text-align: center !important;
  color: var(--text-muted);
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
  onStatus: (msg: string) => void;
}

/**
 * The day's items as a quiet read-only table — select a row to edit it in the
 * journal (like every other list). Italic grey values are AI estimates.
 */
export function FoodDayList({ rows, goals, actions, aiReady, onStatus }: FoodDayListProps) {
  const openInJournal = useOpenInJournal();
  const [armed, setArmed] = useState<number | null>(null);
  const summary = useMemo(() => summarizeDay(rows), [rows]);
  const mealLabel = (v: string) => MEAL_TYPE_OPTIONS.find(m => m.value === v)?.label ?? '';

  const stop = (e: MouseEvent) => e.stopPropagation();

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
                    {aiReady && row.mealType !== 'medication' && (
                      <RowAction type="button" disabled={busy} onClick={() => void actions.fill(row.id, { refreshAi: true })} title="Re-estimate AI values (typed values are kept)">
                        {busy ? 'Estimating…' : 'Estimate'}
                      </RowAction>
                    )}
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

/** "Fill N missing with AI" for a day's rows; renders nothing when AI is off or nothing is missing. */
export function FillMissingAction({ rows, actions, aiReady }: { rows: FoodRow[]; actions: FoodLogActions; aiReady: boolean }) {
  if (!aiReady) return null;
  const missing = rows.filter(r => nutrientsToEstimate(r.item, r.cf).length > 0);
  const busy = actions.pending.size > 0;
  if (!missing.length && !busy) return null;
  return (
    <TextAction
      type="button"
      disabled={busy}
      onClick={async () => { for (const r of missing) await actions.fill(r.id); }}
    >
      {busy ? 'Estimating…' : `Fill ${missing.length} missing with AI`}
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
  td { background: ${({ $sel }) => ($sel ? 'var(--bg-row-hover)' : 'transparent')}; }
  &:hover td { background: var(--bg-row-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  td.day { white-space: nowrap; }
  td.list {
    min-width: 220px;
    max-width: 440px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-secondary);
    div { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  }
`;

/* The goals sit under the column names, muted, inside the header */
const GoalRow = styled.tr`
  th { font-size: 13px; font-weight: 400; color: var(--text-muted); padding-top: 0; padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle); }
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
          <GoalRow>
            <th>Goal</th>
            {NUTRIENTS.map(n => {
              const g = goals[n.key];
              return <th key={n.key} className="num">{g === null || g === undefined ? '—' : `${formatNutrient(g, n.key)}${n.key === 'calories' ? '+' : ''}`}</th>;
            })}
            <th /><th />
          </GoalRow>
        </thead>
        <tbody>
          {days.map(({ day, rows, noticed }) => {
            const summary = summarizeDay(rows);
            const took = countNames(rows.filter(r => r.mealType === 'supplement' || r.mealType === 'medication').map(r => r.item));
            return (
              <DayRow
                key={day}
                $sel={day === selected}
                tabIndex={0}
                aria-label={`Open ${longDay(day)}`}
                onClick={() => onOpen(day)}
                onKeyDown={e => { if (e.key === 'Enter') onOpen(day); }}
              >
                <td className="day">{parseDay(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                {NUTRIENTS.map(n => (
                  <td key={n.key} className={`num${goalMet(goals, n.key, summary) ? ' met' : ''}`}>
                    {summary.has[n.key] ? formatNutrient(summary.totals[n.key], n.key) : '—'}
                  </td>
                ))}
                <td className="list"><div>{took || '—'}</div></td>
                <td className="list"><div>{noticed.length ? [...new Set(noticed)].join(', ') : '—'}</div></td>
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

/* 7 days / 30 days / 90 days / Year — one outlined group, the chosen one lifted */
const Windows = styled.div`
  display: flex;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const WindowBtn = styled.button<{ $active: boolean }>`
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
  cursor: pointer;
  white-space: nowrap;
  &:hover { color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-secondary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
  @media (max-width: 480px) { padding: 0 9px; font-size: 13px; }
`;

export function TotalsWindowTabs({ value, onChange }: { value: TotalWindow; onChange: (v: TotalWindow) => void }) {
  return (
    <Windows role="tablist" aria-label="History range">
      {TOTAL_WINDOWS.map(w => (
        <WindowBtn key={w.value} type="button" role="tab" aria-selected={value === w.value}
          $active={value === w.value} onClick={() => onChange(w.value)}>{w.label}</WindowBtn>
      ))}
    </Windows>
  );
}

/* ══ Goals ══ */

interface NutritionGoalsPanelProps {
  goals: NutrientGoals;
  onChange: (next: NutrientGoals) => Promise<void>;
}

const GoalsHead = styled.div`
  margin-bottom: 26px;
`;

const GoalsTitle = styled.h3`
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: var(--text-secondary);
  padding-left: 16px;
`;

const GoalsSub = styled.p`
  margin: 4px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  padding-left: 16px;
`;

/* Five outlined boxes: name (+ "at least") on top, the target typed large with its unit */
const GoalGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 18px;
  @media (max-width: 1024px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
`;

const GoalBox = styled.label`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 16px 20px 18px;
  border: 1px solid var(--border-card);
  border-radius: 12px;
  cursor: text;
  &:focus-within { border-color: var(--color-accent); }
  @media (max-width: 560px) { padding: 14px 16px 16px; }
`;

const GoalTop = styled.span`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  small { font-size: 13px; color: var(--text-muted); }
`;

const GoalValue = styled.span`
  display: flex;
  align-items: baseline;
  gap: 8px;
  small { flex: none; font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
`;

const GoalInput = styled.input`
  && {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 300;
    line-height: 1.1;
    color: var(--text-secondary);
    -moz-appearance: textfield;
    appearance: textfield;
  }
  &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  &::placeholder { color: var(--text-hint); font-size: 16px; }
`;

/** Daily targets as five outlined boxes; each saves when you leave it. */
export function NutritionGoalsPanel({ goals, onChange }: NutritionGoalsPanelProps) {
  return (
    <section aria-label="Daily nutrition goals">
      <GoalsHead>
        <GoalsTitle>Daily nutrition goals</GoalsTitle>
        <GoalsSub>Used for the totals above and the goal-met highlights in history.</GoalsSub>
      </GoalsHead>
      <GoalGrid>
        {NUTRIENTS.map(n => (
          <GoalBox key={`${n.key}-${goals[n.key] ?? ''}`}>
            <GoalTop>{n.label}{n.key === 'calories' && <small>at least</small>}</GoalTop>
            <GoalValue>
              <GoalInput
                inputMode="decimal"
                defaultValue={goals[n.key] === null || goals[n.key] === undefined ? '' : formatNutrient(goals[n.key], n.key)}
                placeholder="No goal"
                aria-label={`${n.label} goal`}
                onBlur={e => {
                  const next = nutrientNumber(e.target.value);
                  if (next === goals[n.key]) return;
                  void onChange({ ...goals, [n.key]: next });
                }}
              />
              <small>{n.unit || 'kcal'}</small>
            </GoalValue>
          </GoalBox>
        ))}
      </GoalGrid>
    </section>
  );
}
