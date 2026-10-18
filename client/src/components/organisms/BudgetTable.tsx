import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { Icon } from '../atoms/core/Icon.jsx';
import {
  Note, Actions, CellInput, StatBoxRow, StatCell,
  SheetHead, SheetHeading, SheetBox, SheetLink, SHEET_RULE, UNPAID_COLOR,
} from '../molecules/FinanceParts.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import {
  budgetSummary, billTotals, centsToInput, formatCents, formatMonth, parseMoney, UNCATEGORIZED,
} from '../../utils/finance.js';
import { STARTER_CATEGORIES, type BudgetCategory, type FinanceRecord } from '../../types/finance.js';

interface BudgetTableProps {
  categories: FinanceRecord<'budget'>[];
  bills: FinanceRecord<'bills'>[];
  expenses: FinanceRecord<'expenses'>[];
  /** Reconcile's paydays (empty when it's off). */
  paydays: FinanceRecord<'paydays'>[];
  month: string;
  onSave: (category: BudgetCategory & { id?: string }) => Promise<unknown>;
  onDelete: (id: string) => void;
}

/* First block on the page: FinanceShell places it just under the tabs, no top rule. */
const Top = styled.section`
  &&& { margin-top: 32px; }
`;

const Section = styled.section`
  margin-top: 48px;
`;

const COLS = 'minmax(0, 1.6fr) repeat(4, minmax(0, 1fr))';

const Grid = styled.div`
  display: grid;
  grid-template-columns: ${COLS};
  align-items: center;
  gap: 16px;
  padding: 14px 28px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  & > :not(:first-child) { text-align: right; }
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 90px 90px;
    padding: 12px 16px;
    & > :nth-child(3), & > :nth-child(4) { display: none; }
  }
`;

const HeadGrid = styled(Grid)`
  padding-top: 16px;
  padding-bottom: 12px;
  font-size: 13px;
  color: var(--text-muted);
`;

const Name = styled.div`
  min-width: 0;
  span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/* 3px bar under the name: share of the budget used (bills + spending) */
const Bar = styled.div<{ $pct: number; $over: boolean }>`
  width: min(100%, 160px);
  height: 3px;
  margin-top: 8px;
  border-radius: 2px;
  background: linear-gradient(${({ $over }) => ($over ? 'var(--color-danger)' : 'var(--color-accent)')}, ${({ $over }) => ($over ? 'var(--color-danger)' : 'var(--color-accent)')}) no-repeat left / ${({ $pct }) => $pct}% 100%, ${SHEET_RULE};
`;

const Unpaid = styled.span`
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: ${UNPAID_COLOR};
`;

const Quiet = styled.span`
  color: var(--text-muted);
`;

/* Categories: one outlined box of rows — ↑/↓, the name (click to rename),
   archive and delete icons — ending in an "+ Add a category" row */
const CatRow = styled.div<{ $archived?: boolean }>`
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 46px;
  padding: 4px 16px 4px 10px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $archived }) => ($archived ? 'var(--text-muted)' : 'var(--text-secondary)')};
  & + & { border-top: 1px solid ${SHEET_RULE}; }
`;

const Move = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  button {
    display: inline-flex;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    &:hover:not(:disabled) { color: var(--text-primary); }
    &:disabled { opacity: 0.3; cursor: default; }
  }
`;

const CatName = styled.button`
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
  small { margin-left: 8px; font-size: 12px; color: var(--text-muted); }
`;

const IconBtns = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
`;

const IconBtn = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $danger }) => ($danger ? 'var(--color-danger)' : 'var(--text-primary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

const RenameInput = styled.input`
  && {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
  }
`;

const AddCat = styled.form`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  padding: 0 20px;
  background: var(--bg-panel);
  border-top: 1px solid ${SHEET_RULE};
  color: var(--text-muted);
  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-secondary);
  }
  input::placeholder { color: var(--text-hint); }
`;

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

/* The planned amount reads as plain text until you click into it */
const PlainInput = styled(CellInput)`
  && {
    min-height: 28px;
    padding: 0 6px;
    background-color: transparent !important;
    font-size: 15px;
    color: var(--text-secondary);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  &&:hover { background-color: var(--bg-row-hover) !important; }
  &&:focus { background-color: var(--bg-sunken) !important; }
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
    <PlainInput
      inputMode="decimal"
      aria-label={`${category.name} planned per month`}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

/**
 * Monthly budget: each category's planned amount against the bills due that
 * month (straight from the bills list — paid ones are marked, not counted
 * twice) and what was spent.
 */
export function BudgetTable({ categories, bills, expenses, paydays, month, onSave, onDelete }: BudgetTableProps) {
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

  const [deleting, setDeleting] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const remaining = summary.totals.plannedCents > 0 ? Math.max(0, Math.round((summary.totals.leftCents / summary.totals.plannedCents) * 100)) : 0;
  const activeCount = sortedCats.filter(c => !c.archived).length;
  const move = (idx: number, dir: -1 | 1) => {
    const c = sortedCats[idx];
    const other = sortedCats[idx + dir];
    if (!other) return;
    void onSave({ ...c, order: other.order });
    void onSave({ ...other, order: c.order === other.order ? c.order - dir : c.order });
  };
  const commitRename = (c: FinanceRecord<'budget'>) => {
    if (renaming && renaming.name.trim() && renaming.name.trim() !== c.name) void onSave({ ...c, name: renaming.name.trim() });
    setRenaming(null);
  };

  return (
    <Top>
      <StatBoxRow $cols={4}>
        <StatCell label="Planned" cents={summary.totals.plannedCents} sub={`Bills scheduled ${formatCents(committed)}/mo`} />
        <StatCell label="Bills" cents={summary.totals.billsCents} sub={`Due this month · ${formatCents(summary.totals.paidCents)} paid`} />
        <StatCell label="Spending" cents={summary.totals.spendingCents} sub="Logged below" />
        <StatCell label="Left" cents={summary.totals.leftCents} tone={summary.totals.leftCents < 0 ? 'danger' : 'accent'}
          sub={summary.totals.leftCents < 0 ? 'Over plan' : `${remaining}% of plan remaining`} />
      </StatBoxRow>

      <Section aria-label="By category">
        <SheetHead><SheetHeading>By category</SheetHeading></SheetHead>
        {sortedCats.length === 0 ? (
          <>
            <Note>Set up categories with a planned amount each month — start with a set below, or add your own under Categories. Bills count in their category as soon as you add them, and spending you log fills in the rest.</Note>
            <Actions style={{ justifyContent: 'flex-start', marginTop: 12 }}>
              <PillButton type="button" disabled={seeding} onClick={() => void addStarters()}>Add starter categories</PillButton>
            </Actions>
          </>
        ) : (
          <SheetBox role="table" aria-label={`Budget for ${formatMonth(month)}`}>
            <HeadGrid role="row">
              <span>Category</span><span>Planned</span><span>Bills</span><span>Spent</span><span>Left</span>
            </HeadGrid>
            {summary.rows.map(r => {
              const cat = sortedCats.find(c => c.id === r.categoryId);
              const used = r.billsCents + r.spendingCents;
              const over = r.leftCents < 0;
              const unpaid = r.billsCents - r.paidCents;
              return (
                <Grid key={r.categoryId} role="row" style={cat?.archived ? { color: 'var(--text-muted)' } : undefined}>
                  <Name>
                    <span>{r.name}</span>
                    <Bar $pct={r.plannedCents > 0 ? Math.min(100, (used / r.plannedCents) * 100) : 0} $over={over}
                      aria-label={r.plannedCents > 0 ? `${Math.round((used / r.plannedCents) * 100)}% of budget used` : undefined} />
                  </Name>
                  {cat && r.categoryId !== UNCATEGORIZED
                    ? <span><PlannedInput key={`${cat.id}:${cat.monthlyPlannedCents}`} category={cat} onSave={onSave} /></span>
                    : <Quiet>—</Quiet>}
                  <span>
                    {formatCents(r.billsCents)}
                    {unpaid > 0 && <Unpaid>{formatCents(unpaid)} unpaid</Unpaid>}
                  </span>
                  {r.spendingCents ? <span>{formatCents(r.spendingCents)}</span> : <Quiet>{formatCents(0)}</Quiet>}
                  {over
                    ? <span style={{ color: 'var(--color-danger)' }}>{formatCents(-r.leftCents)} over</span>
                    : r.leftCents > 0
                      ? <span style={{ color: 'var(--color-accent-link)' }}>{formatCents(r.leftCents)}</span>
                      : <Quiet>{formatCents(0)}</Quiet>}
                </Grid>
              );
            })}
          </SheetBox>
        )}
        {/* The category editor stays folded away until asked for */}
        <SheetLink type="button" style={{ marginTop: 18 }} aria-expanded={managing} onClick={() => setManaging(m => !m)}>
          {managing ? 'Done managing categories' : 'Manage categories'}
        </SheetLink>
      </Section>

      {managing && <Section aria-label="Categories">
        <SheetHead>
          <SheetHeading>Categories</SheetHeading>
          <Count>{activeCount} active</Count>
        </SheetHead>
        <SheetBox>
          {sortedCats.map((c, idx) => (
            <CatRow key={c.id} $archived={c.archived}>
              <Move>
                <button type="button" aria-label={`Move ${c.name} up`} disabled={idx === 0} onClick={() => move(idx, -1)}>
                  <Icon name="chevron-up" size={16} strokeWidth={2} />
                </button>
                <button type="button" aria-label={`Move ${c.name} down`} disabled={idx === sortedCats.length - 1} onClick={() => move(idx, 1)}>
                  <Icon name="chevron-down" size={16} strokeWidth={2} />
                </button>
              </Move>
              {renaming?.id === c.id ? (
                <RenameInput
                  aria-label="Category name"
                  value={renaming.name}
                  autoFocus
                  onChange={e => setRenaming({ id: c.id, name: e.target.value })}
                  onBlur={() => commitRename(c)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(c);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <CatName type="button" title="Rename" onClick={() => setRenaming({ id: c.id, name: c.name })}>
                  {c.name}{c.archived && <small>Archived</small>}
                </CatName>
              )}
              <IconBtns>
                <IconBtn type="button" title={c.archived ? 'Restore' : 'Archive'} aria-label={c.archived ? `Restore ${c.name}` : `Archive ${c.name}`}
                  onClick={() => void onSave({ ...c, archived: !c.archived || undefined })}>
                  <MaterialIcon $size={20}>{c.archived ? 'unarchive' : 'archive'}</MaterialIcon>
                </IconBtn>
                {deleting === c.id ? (
                  <IconBtn type="button" $danger autoFocus onBlur={() => setDeleting(null)}
                    onClick={() => { setDeleting(null); onDelete(c.id); }} aria-label={`Confirm delete ${c.name}`}>
                    <MaterialIcon $size={20}>delete</MaterialIcon>Delete?
                  </IconBtn>
                ) : (
                  <IconBtn type="button" title="Delete" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c.id)}>
                    <MaterialIcon $size={20}>delete</MaterialIcon>
                  </IconBtn>
                )}
              </IconBtns>
            </CatRow>
          ))}
          <AddCat onSubmit={e => {
            e.preventDefault();
            if (!newName.trim()) return;
            void onSave({ name: newName.trim(), monthlyPlannedCents: 0, order: nextOrder });
            setNewName('');
          }}>
            <Icon name="plus" size={16} strokeWidth={2} />
            <input aria-label="Add a category" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a category, e.g. pets, kids, gifts" />
          </AddCat>
        </SheetBox>
        <Note style={{ marginTop: 12, color: 'var(--text-muted)' }}>Click a name to rename it. Archive keeps a category's history but hides it from new bills and spending; deleting leaves its lines uncategorized.</Note>
      </Section>}
    </Top>
  );
}
