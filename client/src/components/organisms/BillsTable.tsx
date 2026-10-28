import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { FormField } from '../molecules/FormField.js';
import {
  Actions, ErrorNote, RowMenu, type RowMenuItem,
  SheetHead, SheetHeading, SheetBox, SHEET_RULE, Seg, SegBtn, RowBtn, DueBadge,
} from '../molecules/FinanceParts.js';
import {
  billCounts, billTotals, centsToInput, daysBetween, formatCents, formatDay, latestPayment, markBillPaid, primaryBillAction,
  newId, nextUnpaidDue, parseMoney, todayStr, undoLastPayment, billPeriodSuffix,
} from '../../utils/finance.js';
import { BILL_FREQUENCIES, BILL_STATUSES, type Bill, type BillStatus, type FinanceRecord } from '../../types/finance.js';

type BillRecord = FinanceRecord<'bills'>;

interface BillsTableProps {
  bills: BillRecord[];
  categories: FinanceRecord<'budget'>[];
  onSave: (bill: Bill & { id?: string }) => Promise<unknown>;
  onDelete: (id: string) => void;
}

type Filter = 'all' | 'subscriptions' | 'paused' | 'cancelled';

const Wrap = styled.section`
  margin-top: 56px;
  @media (max-width: 768px) { margin-top: 44px; }
`;

const HeadRight = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
`;

/* name + "Bill · Category" | amount (its own: "/quarter") | due | Mark paid | ⋯ */
const BillLine = styled.div<{ $muted?: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 130px 170px 96px 32px;
  align-items: center;
  gap: 16px;
  padding: 14px 20px 14px 28px;
  font-family: var(--font-sans);
  color: ${({ $muted }) => ($muted ? 'var(--text-muted)' : 'var(--text-secondary)')};
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 12px 16px;
    & > :nth-child(3) { grid-column: 1; }
    & > :nth-child(4) { grid-column: 2; grid-row: 2; justify-self: end; }
    & > :nth-child(5) { display: none; }
  }
`;

const BillName = styled.div`
  min-width: 0;
  font-size: 15px;
  span { display: block; margin-top: 3px; font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const Amount = styled.div<{ $strike?: boolean }>`
  text-align: right;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  text-decoration: ${({ $strike }) => ($strike ? 'line-through' : 'none')};
  small { margin-left: 3px; font-size: 12px; color: var(--text-muted); }
`;

const Due = styled.div`
  font-size: 14px;
  color: var(--text-secondary);
  small { display: block; margin-top: 2px; font-size: 12px; color: var(--text-muted); }
`;

const TagNote = styled.em`
  margin-left: 8px;
  font-style: normal;
  font-size: 12px;
  color: var(--text-muted);
`;

/* Monthly · Yearly · Subscriptions, right-aligned on a --bg-panel footer */
const Totals = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px 28px;
  padding: 16px 28px;
  background: var(--bg-panel);
  border-top: 1px solid ${SHEET_RULE};
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  b { margin-left: 6px; font-size: 16px; font-weight: 500; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
`;

const EmptyNote = styled.p`
  margin: 0;
  padding: 22px 28px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const EditorBox = styled.div`
  grid-column: 1 / -1;
  padding: 8px 0 16px;
  input[type='checkbox'] { width: 18px; height: 18px; flex: 0 0 auto; }
`;

const EditorActions = styled(Actions)`
  justify-content: flex-start;
  margin-top: 8px;
`;

/* ── Editor ── */

interface Draft {
  name: string;
  kind: Bill['kind'];
  amount: string;
  frequency: Bill['frequency'];
  dueDate: string;
  categoryId: string;
  autopay: boolean;
  status: BillStatus;
  notes: string;
}

function draftFrom(b?: Bill): Draft {
  return {
    name: b?.name ?? '',
    kind: b?.kind ?? 'bill',
    amount: centsToInput(b?.amountCents),
    frequency: b?.frequency ?? 'monthly',
    dueDate: b?.dueDate ?? todayStr(),
    categoryId: b?.categoryId ?? '',
    autopay: b?.autopay ?? false,
    status: b && billCounts(b) ? 'active' : (b?.status ?? 'active'),
    notes: b?.notes ?? '',
  };
}

function BillEditor({ bill, categories, onSave, onCancel }: {
  bill?: BillRecord;
  categories: FinanceRecord<'budget'>[];
  onSave: (bill: Bill & { id?: string }) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [d, setD] = useState(() => draftFrom(bill));
  const [error, setError] = useState('');
  const set = (patch: Partial<Draft>) => setD(p => ({ ...p, ...patch }));
  const uid = bill?.id ?? 'new';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(d.amount);
    if (!d.name.trim()) { setError('Give the bill a name'); return; }
    if (cents === null || cents < 0) { setError('Enter an amount like 15.99'); return; }
    if (!d.dueDate) { setError('Pick a due date'); return; }
    setError('');
    await onSave({
      ...(bill ? { id: bill.id } : {}),
      name: d.name.trim(),
      kind: d.kind,
      amountCents: cents,
      frequency: d.frequency,
      dueDate: d.dueDate,
      categoryId: d.categoryId || undefined,
      autopay: d.autopay || undefined,
      status: d.status,
      cancelledOn: d.status === 'cancelled' ? (bill?.cancelledOn ?? todayStr()) : undefined,
      notes: d.notes.trim() || undefined,
      payments: bill?.payments,
    });
    onCancel();
  };

  return (
    <EditorBox>
      <form onSubmit={e => void submit(e)}>
        <FormField label="Name" htmlFor={`bill-name-${uid}`}>
          <input id={`bill-name-${uid}`} value={d.name} onChange={e => set({ name: e.target.value })} placeholder="Rent, Netflix, car insurance…" autoFocus />
        </FormField>
        <FormField label="Type" htmlFor={`bill-kind-${uid}`}>
          <select id={`bill-kind-${uid}`} value={d.kind} onChange={e => set({ kind: e.target.value as Bill['kind'] })}>
            <option value="bill">Bill</option>
            <option value="subscription">Subscription</option>
          </select>
        </FormField>
        <FormField label="Amount" htmlFor={`bill-amount-${uid}`}>
          <input id={`bill-amount-${uid}`} inputMode="decimal" value={d.amount} onChange={e => set({ amount: e.target.value })} placeholder="0.00" />
        </FormField>
        <FormField label="How often" htmlFor={`bill-freq-${uid}`}>
          <select id={`bill-freq-${uid}`} value={d.frequency} onChange={e => set({ frequency: e.target.value as Bill['frequency'] })}>
            {BILL_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </FormField>
        <FormField label={d.frequency === 'once' ? 'Due date' : 'A due date'} htmlFor={`bill-due-${uid}`}>
          <input id={`bill-due-${uid}`} type="date" value={d.dueDate} onChange={e => set({ dueDate: e.target.value })} />
        </FormField>
        <FormField label="Category" htmlFor={`bill-cat-${uid}`}>
          <select id={`bill-cat-${uid}`} value={d.categoryId} onChange={e => set({ categoryId: e.target.value })}>
            <option value="">No category</option>
            {categories.filter(c => !c.archived || c.id === d.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField label="Autopay" htmlFor={`bill-auto-${uid}`}>
          <input id={`bill-auto-${uid}`} type="checkbox" checked={d.autopay} onChange={e => set({ autopay: e.target.checked })} />
        </FormField>
        <FormField label="Status" htmlFor={`bill-status-${uid}`}>
          <select id={`bill-status-${uid}`} value={d.status} onChange={e => set({ status: e.target.value as BillStatus })}>
            {BILL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FormField>
        <FormField label="Notes" htmlFor={`bill-notes-${uid}`}>
          <textarea id={`bill-notes-${uid}`} rows={2} value={d.notes} onChange={e => set({ notes: e.target.value })} placeholder="Account number hint, how to cancel…" />
        </FormField>
        {error && <ErrorNote>{error}</ErrorNote>}
        <EditorActions>
          <PillButton type="submit">{bill ? 'Save bill' : 'Add bill'}</PillButton>
          <PillButton type="button" $variant="neutral" onClick={onCancel}>Cancel</PillButton>
        </EditorActions>
      </form>
    </EditorBox>
  );
}

/* ── Row actions: one main action that fits the bill's state, Edit, and a ⋯ menu ── */

function BillActions({ bill, due, today, onSave, onEdit, onStatus, onDelete }: {
  bill: BillRecord;
  due: string | null;
  today: string;
  onSave: (bill: Bill & { id?: string }) => Promise<unknown>;
  onEdit: () => void;
  onStatus: (status: BillStatus) => void;
  onDelete: () => void;
}) {
  const primary = primaryBillAction(bill, today);
  const markPaid = () => void onSave(markBillPaid(bill, today, newId()));
  const undoPaid = () => void onSave(undoLastPayment(bill));
  const paid = latestPayment(bill);

  const menu: RowMenuItem[] = [{ label: 'Edit', onSelect: onEdit }];
  // Whichever payment action isn't up front
  if (primary !== 'mark' && due) menu.push({ label: `Mark paid early (due ${formatDay(due)})`, onSelect: markPaid });
  if (primary !== 'undo' && paid) menu.push({ label: `Undo last payment (${formatDay(paid.paidOn)})`, onSelect: undoPaid });
  if (bill.status === 'active') menu.push({ label: 'Pause', onSelect: () => onStatus('paused') });
  if (bill.status === 'paused') menu.push({ label: 'Resume', onSelect: () => onStatus('active') });
  if (bill.status !== 'cancelled') menu.push({ label: 'Mark cancelled', onSelect: () => onStatus('cancelled') });
  else menu.push({ label: 'Reactivate', onSelect: () => onStatus('active') });
  menu.push({ label: 'Delete', danger: true, confirmLabel: 'Click again to delete', onSelect: onDelete });

  return (
    <>
      {primary === 'mark' ? <RowBtn type="button" onClick={markPaid}>Mark paid</RowBtn>
        : primary === 'undo' ? <RowBtn type="button" onClick={undoPaid}>Undo paid</RowBtn>
        : <span />}
      <RowMenu label={`More actions for ${bill.name}`} items={menu} />
    </>
  );
}

/* ── Table ── */

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Every bill and subscription in one place: what it costs a month, when it's
 * next due, Mark paid (recorded on the bill only — nothing posts anywhere
 * else), and quick pause / cancel so you can decide what to keep.
 */
export function BillsTable({ bills, categories, onSave, onDelete }: BillsTableProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const today = todayStr();
  const catName = (id?: string) => (id ? categories.find(c => c.id === id)?.name : undefined);

  const rows = useMemo(() => {
    const withDue = bills.map(b => ({ bill: b, due: billCounts(b) ? nextUnpaidDue(b, today) : null }));
    const shown = withDue.filter(({ bill }) => {
      if (filter === 'subscriptions') return bill.kind === 'subscription' && bill.status !== 'cancelled';
      if (filter === 'paused') return bill.status === 'paused';
      if (filter === 'cancelled') return bill.status === 'cancelled';
      return bill.status !== 'cancelled';
    });
    return shown.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.bill.name.localeCompare(b.bill.name));
  }, [bills, filter, today]);

  const totals = useMemo(() => billTotals(bills), [bills]);
  const setStatus = (b: BillRecord, status: BillStatus) =>
    void onSave({ ...b, status, cancelledOn: status === 'cancelled' ? today : undefined });

  const dueCell = (bill: BillRecord, due: string | null) => {
    if (!due) return billCounts(bill) ? <Due style={{ color: 'var(--text-muted)' }}>Paid</Due> : <Due style={{ color: 'var(--text-muted)' }}>—</Due>;
    const days = daysBetween(today, due);
    const short = formatShort(due, today);
    if (days < 0) return <Due><DueBadge $tone="overdue">Overdue · {short}</DueBadge></Due>;
    if (days === 0) return <Due><DueBadge $tone="soon">Due today</DueBadge></Due>;
    if (days === 1) return <Due><DueBadge $tone="soon">Due tomorrow</DueBadge></Due>;
    return <Due>{short}</Due>;
  };

  return (
    <Wrap aria-label="Bills and subscriptions">
      <SheetHead>
        <SheetHeading>Bills &amp; subscriptions</SheetHeading>
        <HeadRight>
          <Seg role="tablist" aria-label="Show">
            {FILTERS.map(f => (
              <SegBtn key={f.value} type="button" role="tab" aria-selected={filter === f.value} $active={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </SegBtn>
            ))}
          </Seg>
          <PillButton type="button" onClick={() => setEditing(editing === 'new' ? null : 'new')}>+ Add bill</PillButton>
        </HeadRight>
      </SheetHead>

      {editing === 'new' && <BillEditor categories={categories} onSave={onSave} onCancel={() => setEditing(null)} />}

      <SheetBox>
        {rows.length === 0 ? (
          <EmptyNote>
            {bills.length === 0
              ? 'List your rent, utilities, phone, insurance and subscriptions here. They count in your budget right away; mark each one paid when you pay it.'
              : 'Nothing here for this filter.'}
          </EmptyNote>
        ) : rows.map(({ bill, due }) => (editing === bill.id ? (
          <div key={bill.id} style={{ padding: '4px 20px 4px 28px' }}>
            <BillEditor bill={bill} categories={categories} onSave={onSave} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <BillLine key={bill.id} $muted={!billCounts(bill)}>
            <BillName>
              {bill.name}
              {bill.status === 'paused' && <TagNote>Paused</TagNote>}
              {bill.status === 'cancelled' && <TagNote>Cancelled{bill.cancelledOn ? ` ${formatDay(bill.cancelledOn)}` : ''}</TagNote>}
              <span>{bill.kind === 'subscription' ? 'Subscription' : 'Bill'}{catName(bill.categoryId) ? ` · ${catName(bill.categoryId)}` : ''}</span>
            </BillName>
            <Amount $strike={!billCounts(bill)}>
              {formatCents(bill.amountCents)}<small>{billPeriodSuffix(bill.frequency)}</small>
            </Amount>
            {dueCell(bill, due)}
            <BillActions
              bill={bill}
              due={due}
              today={today}
              onSave={onSave}
              onEdit={() => setEditing(bill.id)}
              onStatus={status => setStatus(bill, status)}
              onDelete={() => onDelete(bill.id)}
            />
          </BillLine>
        )))}
        {bills.some(billCounts) && (
          <Totals>
            <span>Monthly<b>{formatCents(totals.monthly)}</b></span>
            <span>Yearly<b>{formatCents(totals.yearly)}</b></span>
            <span>Subscriptions<b>{formatCents(totals.subscriptionsMonthly)}</b>/mo</span>
          </Totals>
        )}
      </SheetBox>
    </Wrap>
  );
}

/** "Oct 15" this year, "Apr 1, 2027" otherwise */
function formatShort(day: string, today: string): string {
  return day.slice(0, 4) === today.slice(0, 4) ? formatDay(day).replace(/, \d{4}$/, '') : formatDay(day);
}
