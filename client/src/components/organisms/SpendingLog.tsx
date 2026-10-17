import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { CollapsibleCard } from './CollapsibleCard.js';
import { FINANCE_CARDS_KEY } from './BudgetTable.js';
import {
  Note, Table, Row, TotalRow, Cell, SubText, InlineForm, Field, Actions,
  ConfirmDelete, Money, SmallBtn,
} from '../molecules/FinanceParts.js';
import { centsToInput, formatCents, formatDay, formatMonth, parseMoney, todayStr } from '../../utils/finance.js';
import type { FinanceExpense, FinanceRecord } from '../../types/finance.js';
import { continueRules } from '../../styles/columnRules.js';

interface SpendingLogProps {
  expenses: FinanceRecord<'expenses'>[];
  categories: FinanceRecord<'budget'>[];
  /** YYYY-MM — the month the budget is showing. */
  month: string;
  onSave: (expense: FinanceExpense & { id?: string }) => Promise<unknown>;
  onDelete: (id: string) => void;
}

const CardGap = styled.div`
  margin-top: 24px;
`;

const COLS = 'minmax(0, 1fr) minmax(0, 160px) 110px minmax(0, auto)';
const PHONE_COLS = 'minmax(0, 1fr) 100px';

const SpendRow = styled(Row)`
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 100px;
    & > :nth-child(2) { display: none; }
    && > :nth-child(4) { grid-column: 1 / -1; justify-content: flex-start; border-left: 0; padding-left: 0; padding-top: 0; ${continueRules(100 - 8)} }
  }
`;

const SpendTotal = styled(TotalRow)`
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 100px;
    & > :nth-child(2), & > :nth-child(4) { display: none; }
  }
`;

function CategorySelect({ value, onChange, categories, label }: {
  value: string; onChange: (v: string) => void; categories: FinanceRecord<'budget'>[]; label: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">No category</option>
      {categories.filter(c => !c.archived || c.id === value).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

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
    <InlineForm onSubmit={e => {
      e.preventDefault();
      if (!valid || cents === null) return;
      onSubmit({ date: d.date, description: d.description.trim(), amountCents: cents, categoryId: d.categoryId || undefined });
      if (!onCancel) setD({ ...d, description: '', amount: '' });
    }}>
      <Field $w="170px"><span>Date</span><input type="date" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} /></Field>
      <Field $grow><span>What</span><input value={d.description} onChange={e => setD({ ...d, description: e.target.value })} placeholder="Groceries, gas, takeout…" /></Field>
      <Field $w="120px"><span>Amount</span><input inputMode="decimal" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} placeholder="0.00" /></Field>
      <Field $w="170px"><span>Category</span><CategorySelect label="Category" value={d.categoryId} onChange={v => setD({ ...d, categoryId: v })} categories={categories} /></Field>
      <Actions>
        <PillButton type="submit" disabled={!valid}>{submitLabel}</PillButton>
        {onCancel && <PillButton type="button" $variant="neutral" onClick={onCancel}>Cancel</PillButton>}
      </Actions>
    </InlineForm>
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
    <CardGap>
      <CollapsibleCard
        id="spending"
        title="Spending"
        storageKey={FINANCE_CARDS_KEY}
        action={<Cell $muted $small>{formatMonth(month)}{rows.length ? ` · ${formatCents(total)}` : ''}</Cell>}
      >

        {/* Room between the card title and the add row's field labels */}
        <div style={{ marginTop: 12 }}>
          <ExpenseForm
            key={month}
            initial={{ date: defaultDate, description: '', amount: '', categoryId: '' }}
            categories={categories}
            submitLabel="Add"
            onSubmit={e => void onSave(e)}
          />
        </div>

        {rows.length === 0 ? (
          <Note style={{ marginTop: 14, fontStyle: 'italic' }}>Log what you spend outside your bills (groceries, gas, eating out) and it counts against that category's budget.</Note>
        ) : (
          <Table $cols={COLS} $phoneCols={PHONE_COLS} style={{ marginTop: 16 }}>
            {rows.map(e => (editingId === e.id ? (
              <div key={e.id} style={{ padding: '12px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <ExpenseForm
                  initial={{ date: e.date, description: e.description, amount: centsToInput(e.amountCents), categoryId: e.categoryId ?? '' }}
                  categories={categories}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={next => { void onSave({ ...next, id: e.id }); setEditingId(null); }}
                />
              </div>
            ) : (
              <SpendRow key={e.id} $cols={COLS}>
                <span>{e.description}<SubText>{formatDay(e.date)}</SubText></span>
                <Cell $muted $small>{catName(e.categoryId) ?? 'No category'}</Cell>
                <Cell $right><Money cents={e.amountCents} out /></Cell>
                <Actions>
                  <SmallBtn type="button" onClick={() => setEditingId(e.id)}>Edit</SmallBtn>
                  <ConfirmDelete label="Remove" onConfirm={() => onDelete(e.id)} />
                </Actions>
              </SpendRow>
            )))}
            <SpendTotal $cols={COLS}>
              <span>Total</span>
              <span />
              <Cell $right>{formatCents(total)}</Cell>
              <span />
            </SpendTotal>
          </Table>
        )}
      </CollapsibleCard>
    </CardGap>
  );
}
