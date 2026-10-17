import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { CollapsibleCard } from './CollapsibleCard.js';
import {
  Note, StatStrip, Stat, Table, Row, TotalRow, Cell,
  InlineForm, Field, SmallBtn, Actions, ConfirmDelete, ProgressRing, CellInput, Money, SubText,
} from '../molecules/FinanceParts.js';
import {
  budgetSummary, billTotals, centsToInput, formatCents, formatMonth, parseMoney, shiftMonth, UNCATEGORIZED,
} from '../../utils/finance.js';
import { STARTER_CATEGORIES, type BudgetCategory, type FinanceRecord } from '../../types/finance.js';

interface BudgetTableProps {
  categories: FinanceRecord<'budget'>[];
  bills: FinanceRecord<'bills'>[];
  expenses: FinanceRecord<'expenses'>[];
  /** Reconcile's paydays (empty when it's off). */
  paydays: FinanceRecord<'paydays'>[];
  month: string;
  onMonthChange: (month: string) => void;
  onSave: (category: BudgetCategory & { id?: string }) => Promise<unknown>;
  onDelete: (id: string) => void;
}

const COLS = 'minmax(0, 1.4fr) 120px repeat(3, minmax(0, 1fr))';
const PHONE_COLS = 'minmax(0, 1fr) 100px 100px';

/* First block on the page: FinanceShell places it just under the tabs, no top rule. */
const Top = styled.section`
  /* Month switcher sits closer to the tabs than other tabs' first blocks */
  &&& { margin-top: 8px; }
`;

const BudgetRow = styled(Row)`
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 100px 100px;
    & > :nth-child(3), & > :nth-child(4) { display: none; }
  }
`;

const BudgetTotal = styled(TotalRow)`
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 100px 100px;
    & > :nth-child(3), & > :nth-child(4) { display: none; }
  }
`;

/* Totals row: rule on top, the card heading font a touch smaller (like Bills'
   Total Active Bills), amounts italic */
const BudgetTotals = styled(BudgetTotal)`
  & > * { padding-top: 14px; }
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 300;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  & > :not(:first-child) { font-style: italic; }
`;

const HeadRow = styled(BudgetTotal)`
  /* Sits right on the stats' hairline; the gap is inside the cells so the column rules reach it */
  & > * { padding-top: 14px; }
  font-size: 10px;
  color: var(--text-tertiary);
`;

/* Month switcher: ‹ on the left, the month centred, › on the right, with a
   hairline under it (none above — it's the first thing under the tabs). */
const Month = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin: 0 0 36px;
  padding: 0 0 12px;
  border-bottom: 1px solid var(--border-subtle);
  span { flex: 1; text-align: center; }
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: var(--text-primary);
`;

/* Large plain prev/next carets for the month switcher */
const CaretBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  &:hover { color: var(--text-primary); background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/** Open/closed memory for the Budget & Bills cards. */
export const FINANCE_CARDS_KEY = 'finance-budget-collapsed-v1';

const CardGap = styled.div`
  margin-top: 32px;
`;

/* Category name on the left, its budget-used ring on the right */
const NameCell = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  & > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* Ring sits in a little from the column's right edge */
  & > svg { margin-right: 20px; }
`;

const ManageRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  & > :first-child { flex: 1; min-width: 0; }
`;

/** Planned amount typed straight into the row; saved on blur / Enter. */
function PlannedInput({ category, onSave }: { category: FinanceRecord<'budget'>; onSave: BudgetTableProps['onSave'] }) {
  const [text, setText] = useState(centsToInput(category.monthlyPlannedCents));
  const commit = () => {
    const cents = parseMoney(text || '0');
    if (cents === null || cents < 0) { setText(centsToInput(category.monthlyPlannedCents)); return; }
    if (cents !== category.monthlyPlannedCents) void onSave({ ...category, monthlyPlannedCents: cents });
    setText(centsToInput(cents));
  };
  return (
    <CellInput
      inputMode="decimal"
      aria-label={`${category.name} planned per month`}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{ textAlign: 'right' }}
    />
  );
}

/**
 * Monthly budget: each category's planned amount against the bills due that
 * month (straight from the bills list — paid ones are marked, not counted
 * twice) and what was spent.
 */
export function BudgetTable({ categories, bills, expenses, paydays, month, onMonthChange, onSave, onDelete }: BudgetTableProps) {
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const sortedCats = useMemo(() => [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), [categories]);
  const summary = useMemo(() => budgetSummary(sortedCats, bills, expenses, month, paydays), [sortedCats, bills, expenses, month, paydays]);
  const committed = useMemo(() => billTotals(bills).monthly, [bills]);
  const nextOrder = sortedCats.reduce((m, c) => Math.max(m, c.order), -1) + 1;

  const addStarters = async () => {
    setSeeding(true);
    let order = nextOrder;
    for (const c of STARTER_CATEGORIES) {
      if (sortedCats.some(x => x.name.toLowerCase() === c.name.toLowerCase())) continue;
      await onSave({ name: c.name, monthlyPlannedCents: c.monthlyPlannedCents, order: order++ });
    }
    setSeeding(false);
  };

  return (
    <Top>
      {/* Month switcher first, right under the tabs; the stats and table below are for this month */}
      <Month>
        <CaretBtn type="button" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          <Icon name="chevron-left" size={32} strokeWidth={1.5} />
        </CaretBtn>
        <span>{formatMonth(month)}</span>
        <CaretBtn type="button" aria-label="Next month" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          <Icon name="chevron-right" size={32} strokeWidth={1.5} />
        </CaretBtn>
      </Month>

      {/* Hairline between the stats and the category table's headers */}
      <StatStrip $cols={4} style={{ paddingBottom: 36, borderBottom: '1px solid var(--border-subtle)' }}>
        <Stat label="Planned" cents={summary.totals.plannedCents} sub={`Bills scheduled ${formatCents(committed)}/mo`} />
        <Stat label="Bills" cents={summary.totals.billsCents} sub={`Due this month · ${formatCents(summary.totals.paidCents)} paid`} />
        <Stat label="Spending" cents={summary.totals.spendingCents} sub="Logged below" />
        <Stat label="Left" cents={summary.totals.leftCents} tone={summary.totals.leftCents < 0 ? 'danger' : 'default'} />
      </StatStrip>


      {sortedCats.length === 0 ? (
        <>
          <Note>Set up categories with a planned amount each month — start with a set below, or add your own under Categories. Bills count in their category as soon as you add them, and spending you log fills in the rest.</Note>
          <Actions style={{ justifyContent: 'flex-start', marginTop: 12 }}>
            <PillButton type="button" disabled={seeding} onClick={() => void addStarters()}>Add starter categories</PillButton>
          </Actions>
        </>
      ) : (
        <Table $cols={COLS} $phoneCols={PHONE_COLS}>
          <HeadRow $cols={COLS} aria-hidden="true">
            <span>Category</span><Cell $right>Planned</Cell><Cell $right>Bills</Cell><Cell $right>Spending</Cell><Cell $right>Left</Cell>
          </HeadRow>
          {summary.rows.map(r => {
            const cat = sortedCats.find(c => c.id === r.categoryId);
            const used = r.billsCents + r.spendingCents;
            const over = r.leftCents < 0;
            return (
              <BudgetRow key={r.categoryId} $cols={COLS} $muted={cat?.archived}>
                <NameCell>
                  <span>{r.name}</span>
                  {r.plannedCents > 0 && (
                    <ProgressRing
                      fraction={used / r.plannedCents}
                      tone={over ? 'danger' : 'default'}
                      label={`${r.name}: ${Math.round((used / r.plannedCents) * 100)}% of budget used`}
                    />
                  )}
                </NameCell>
                {cat && r.categoryId !== UNCATEGORIZED
                  ? <Cell $right><PlannedInput key={`${cat.id}:${cat.monthlyPlannedCents}`} category={cat} onSave={onSave} /></Cell>
                  : <Cell $right $muted>—</Cell>}
                <Cell $right>
                  <Money cents={r.billsCents} />
                  {r.billsCents > 0 && <SubText>{r.paidCents >= r.billsCents ? 'all paid' : r.paidCents ? `${formatCents(r.paidCents)} paid` : 'unpaid'}</SubText>}
                </Cell>
                <Cell $right><Money cents={r.spendingCents} /></Cell>
                <Cell $right style={over ? { color: 'var(--color-danger)' } : undefined}>
                  {over ? `${formatCents(-r.leftCents)} over` : formatCents(r.leftCents)}
                </Cell>
              </BudgetRow>
            );
          })}
          <BudgetTotals $cols={COLS}>
            <span>Totals</span>
            <Cell $right>{formatCents(summary.totals.plannedCents)}</Cell>
            <Cell $right>{formatCents(summary.totals.billsCents)}</Cell>
            <Cell $right>{formatCents(summary.totals.spendingCents)}</Cell>
            <Cell $right>{formatCents(summary.totals.leftCents)}</Cell>
          </BudgetTotals>
        </Table>
      )}

      <CardGap>
        <CollapsibleCard id="categories" title="Categories" storageKey={FINANCE_CARDS_KEY} defaultOpen={false}>
          {sortedCats.length === 0 && <Note>No categories yet.</Note>}
          {sortedCats.map((c, idx) => (
            <ManageRow key={c.id}>
              {renaming?.id === c.id ? (
                <CellInput
                  aria-label="Category name"
                  value={renaming.name}
                  autoFocus
                  onChange={e => setRenaming({ id: c.id, name: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && renaming.name.trim()) { void onSave({ ...c, name: renaming.name.trim() }); setRenaming(null); }
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span style={{ color: c.archived ? 'var(--text-tertiary)' : undefined }}>{c.name}{c.archived ? ' (archived)' : ''}</span>
              )}
              <Actions>
                {renaming?.id === c.id
                  ? <SmallBtn type="button" disabled={!renaming.name.trim()} onClick={() => { void onSave({ ...c, name: renaming.name.trim() }); setRenaming(null); }}>Save</SmallBtn>
                  : <SmallBtn type="button" onClick={() => setRenaming({ id: c.id, name: c.name })}>Rename</SmallBtn>}
                <SmallBtn type="button" disabled={idx === 0} aria-label={`Move ${c.name} up`} onClick={() => {
                  const prev = sortedCats[idx - 1];
                  void onSave({ ...c, order: prev.order });
                  void onSave({ ...prev, order: c.order === prev.order ? c.order + 1 : c.order });
                }}>↑</SmallBtn>
                <SmallBtn type="button" onClick={() => void onSave({ ...c, archived: !c.archived || undefined })}>{c.archived ? 'Restore' : 'Archive'}</SmallBtn>
                <ConfirmDelete onConfirm={() => onDelete(c.id)} />
              </Actions>
            </ManageRow>
          ))}
          <InlineForm style={{ marginTop: 24 }} onSubmit={e => {
            e.preventDefault();
            if (!newName.trim()) return;
            void onSave({ name: newName.trim(), monthlyPlannedCents: 0, order: nextOrder });
            setNewName('');
          }}>
            <Field $grow><input aria-label="New category" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Type to add a new category (e.g. pets, kids, gifts…)" /></Field>
            <Actions><PillButton type="submit" disabled={!newName.trim()}>Add</PillButton></Actions>
          </InlineForm>
          <Note style={{ marginTop: 20, fontStyle: 'italic' }}>Archive keeps a category's history but hides it from new bills and spending. Deleting leaves its lines uncategorized.</Note>
        </CollapsibleCard>
      </CardGap>
    </Top>
  );
}
