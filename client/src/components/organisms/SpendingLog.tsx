import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { Icon } from '../atoms/core/Icon.jsx';
import {
  Actions, ConfirmDelete, SmallBtn, SheetHead, SheetHeading, SheetBox, SHEET_RULE,
} from '../molecules/FinanceParts.js';
import { centsToInput, formatCents, formatDay, formatMonth, parseMoney, todayStr } from '../../utils/finance.js';
import type { FinanceExpense, FinanceRecord } from '../../types/finance.js';

interface SpendingLogProps {
  expenses: FinanceRecord<'expenses'>[];
  categories: FinanceRecord<'budget'>[];
  /** YYYY-MM — the month the budget is showing. */
  month: string;
  onSave: (expense: FinanceExpense & { id?: string }) => Promise<unknown>;
  onDelete: (id: string) => void;
}

const Wrap = styled.section`
  margin-top: 56px;
  @media (max-width: 768px) { margin-top: 44px; }
`;

/* One outlined row: date | what | $ amount | category | Add */
const AddRow = styled.form`
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) 120px 200px auto;
  align-items: center;
  border: 1px solid var(--border-card);
  border-radius: 12px;
  & > label { display: flex; align-items: center; min-width: 0; height: 44px; padding: 0 14px; }
  & > label + label { border-left: 1px solid var(--border-card); }
  & > :last-child { padding: 0 6px 0 10px; }
  &:focus-within { border-color: var(--control-border); }
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    & > label { border-left: none !important; border-bottom: 1px solid var(--border-card); }
    & > label:nth-child(2) { grid-column: 1 / -1; order: -1; }
    & > label:nth-child(odd):not(:nth-child(1)) { border-left: 1px solid var(--border-card) !important; }
    & > :last-child { grid-column: 1 / -1; padding: 8px; display: flex; justify-content: flex-end; }
  }
`;

const Bare = styled.input`
  && {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
    color-scheme: light dark;
  }
  &::placeholder { color: var(--text-hint); }
  &::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; }
`;

const Dollar = styled.span`
  margin-right: 4px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-hint);
`;

const BareSelect = styled.select`
  && {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0 22px 0 0;
    border: none !important;
    background: transparent !important;
    appearance: none;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
    cursor: pointer;
  }
  option { color: var(--text-primary); background: var(--bg-surface); }
`;

const Chevron = styled.span`
  margin-left: -18px;
  pointer-events: none;
  color: var(--text-muted);
  display: inline-flex;
`;

const Hint = styled.p`
  margin: 12px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const ListBox = styled(SheetBox)`
  margin-top: 16px;
`;

const Line = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  font-family: var(--font-sans);
  & + & { border-top: 1px solid ${SHEET_RULE}; }
`;

const LineName = styled.div`
  min-width: 0;
  font-size: 15px;
  color: var(--text-secondary);
  span { display: block; margin-top: 2px; font-size: 13px; color: var(--text-muted); }
`;

const LineAmount = styled.span`
  font-size: 15px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
`;

const Total = styled(Line)`
  background: var(--bg-panel);
  justify-content: end;
  font-size: 14px;
  color: var(--text-muted);
  b { margin-left: 6px; font-weight: 500; font-size: 15px; color: var(--text-secondary); }
`;

function ExpenseForm({ initial, categories, submitLabel, onSubmit, onCancel }: {
  initial: { date: string; description: string; amount: string; categoryId: string };
  categories: FinanceRecord<'budget'>[];
  submitLabel: string;
  onSubmit: (e: FinanceExpense) => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState(initial);
  const cents = parseMoney(d.amount);
  const valid = d.description.trim() !== '' && cents !== null && cents > 0 && !!d.date;
  return (
    <AddRow onSubmit={e => {
      e.preventDefault();
      if (!valid || cents === null) return;
      onSubmit({ date: d.date, description: d.description.trim(), amountCents: cents, categoryId: d.categoryId || undefined });
      if (!onCancel) setD({ ...d, description: '', amount: '' });
    }}>
      <label><Bare type="date" aria-label="Date" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} /></label>
      <label><Bare aria-label="What" value={d.description} onChange={e => setD({ ...d, description: e.target.value })} placeholder="Groceries, gas, takeout…" /></label>
      <label><Dollar>$</Dollar><Bare aria-label="Amount" inputMode="decimal" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} placeholder="0.00" /></label>
      <label>
        <BareSelect aria-label="Category" value={d.categoryId} onChange={e => setD({ ...d, categoryId: e.target.value })}>
          <option value="">No category</option>
          {categories.filter(c => !c.archived || c.id === d.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </BareSelect>
        <Chevron aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></Chevron>
      </label>
      <Actions>
        {onCancel && <PillButton type="button" $variant="neutral" onClick={onCancel}>Cancel</PillButton>}
        <PillButton type="submit" disabled={!valid}>{submitLabel}</PillButton>
      </Actions>
    </AddRow>
  );
}

/**
 * Spending for the month the budget shows: a quick add row and the month's
 * lines. Counts toward each category's Spending in the budget above.
 */
export function SpendingLog({ expenses, categories, month, onSave, onDelete }: SpendingLogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const catName = (id?: string) => (id ? categories.find(c => c.id === id)?.name : undefined);
  const today = todayStr();
  const defaultDate = today.slice(0, 7) === month ? today : `${month}-01`;

  const rows = useMemo(
    () => expenses.filter(e => e.date.slice(0, 7) === month).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [expenses, month],
  );
  const total = rows.reduce((s, e) => s + e.amountCents, 0);

  return (
    <Wrap aria-label="Log spending">
      <SheetHead>
        <SheetHeading>Log spending</SheetHeading>
        {rows.length > 0 && <Hint style={{ margin: 0 }}>{formatMonth(month)} · {formatCents(total)}</Hint>}
      </SheetHead>
      <ExpenseForm
        key={month}
        initial={{ date: defaultDate, description: '', amount: '', categoryId: '' }}
        categories={categories}
        submitLabel="Add"
        onSubmit={e => void onSave(e)}
      />
      <Hint>Log what you spend outside your bills (groceries, gas, eating out) and it counts against that category's budget.</Hint>

      {rows.length > 0 && (
        <ListBox>
          {rows.map(e => (editingId === e.id ? (
            <div key={e.id} style={{ padding: 12 }}>
              <ExpenseForm
                initial={{ date: e.date, description: e.description, amount: centsToInput(e.amountCents), categoryId: e.categoryId ?? '' }}
                categories={categories}
                submitLabel="Save"
                onCancel={() => setEditingId(null)}
                onSubmit={next => { void onSave({ ...next, id: e.id }); setEditingId(null); }}
              />
            </div>
          ) : (
            <Line key={e.id}>
              <LineName>{e.description}<span>{formatDay(e.date)} · {catName(e.categoryId) ?? 'No category'}</span></LineName>
              <LineAmount>{formatCents(e.amountCents)}</LineAmount>
              <Actions>
                <SmallBtn type="button" onClick={() => setEditingId(e.id)}>Edit</SmallBtn>
                <ConfirmDelete label="Remove" onConfirm={() => onDelete(e.id)} />
              </Actions>
            </Line>
          )))}
          <Total><span /><span>Total<b>{formatCents(total)}</b></span><span /></Total>
        </ListBox>
      )}
    </Wrap>
  );
}
