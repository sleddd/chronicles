import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { FormField } from '../molecules/FormField.js';
import {
  SectionHead, Note, SmallPill, Table, Row, TotalRow, Cell, SubText, Tag,
  SmallBtn, Chips, Actions, ConfirmDelete, Money, ErrorNote,
} from '../molecules/FinanceParts.js';
import {
  billCounts, billTotals, centsToInput, formatCents, formatDay, latestPayment, markBillPaid, monthlyEquivalent,
  newId, nextUnpaidDue, parseMoney, todayStr, undoLastPayment,
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

/* Bordered like the Categories / Spending cards, but always open (not collapsible) */
const BillsSection = styled.section`
  margin-top: 24px;
  border: 1px solid var(--border-default);
  border-radius: var(--r-lg, 2px);
  padding: 20px 24px;
  @media (max-width: 480px) { padding: 16px; }
`;

/* Same title style as the CollapsibleCard titles */
const CardTitle = styled.h3`
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-primary);
`;

// Name · category (centred, compact) · amount (with room either side) · due · actions
const COLS = 'minmax(0, 1fr) 140px 170px 120px minmax(0, auto)';

const BillRow = styled(Row)`
  & > :nth-child(2) { text-align: center; }
  & > :nth-child(3) { padding: 0 28px; }
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr) 100px;
    & > :nth-child(2), & > :nth-child(4) { display: none; }
    & > :nth-child(5) { grid-column: 1 / -1; justify-content: flex-start; }
    & > :nth-child(3) { padding: 0; }
  }
`;

/* Totals row: title and amounts all in the card heading font, a touch smaller */
const BillTotal = styled(TotalRow)`
  & > :nth-child(3) { padding: 0 28px; }
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 300;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  /* The amounts are italic; the title stays upright */
  & > :not(:first-child) { font-style: italic; }
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr) 100px;
    & > :nth-child(2), & > :nth-child(4), & > :nth-child(5) { display: none; }
    & > :nth-child(3) { padding: 0; }
  }
`;

const EditorBox = styled.div`
  padding: 8px 0 16px;
  border-top: 1px solid var(--border-subtle);
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

  return (
    <BillsSection>
      <SectionHead style={{ marginBottom: 32 }}>
        <CardTitle>Bills &amp; subscriptions</CardTitle>
        <SmallPill type="button" onClick={() => setEditing(editing === 'new' ? null : 'new')}>Add bill</SmallPill>
      </SectionHead>
      <Chips style={{ marginBottom: 24 }}>
        {FILTERS.map(f => (
          <SmallBtn key={f.value} type="button" $on={filter === f.value} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </SmallBtn>
        ))}
      </Chips>

      {editing === 'new' && <BillEditor categories={categories} onSave={onSave} onCancel={() => setEditing(null)} />}

      {rows.length === 0 ? (
        <Note>
          {bills.length === 0
            ? 'List your rent, utilities, phone, insurance and subscriptions here. They count in your budget right away; mark each one paid when you pay it.'
            : 'Nothing here for this filter.'}
        </Note>
      ) : (
        <Table>
          {rows.map(({ bill, due }) => (editing === bill.id ? (
            <BillEditor key={bill.id} bill={bill} categories={categories} onSave={onSave} onCancel={() => setEditing(null)} />
          ) : (
            <BillRow key={bill.id} $cols={COLS} $muted={!billCounts(bill)}>
              <span>
                {bill.name}
                {bill.status === 'paused' && <Tag>Paused</Tag>}
                {bill.status === 'cancelled' && <Tag>Cancelled{bill.cancelledOn ? ` ${formatDay(bill.cancelledOn)}` : ''}</Tag>}
                <SubText style={{ fontWeight: 500 }}>{bill.kind === 'subscription' ? 'Subscription' : 'Bill'}</SubText>
              </span>
              <Cell $muted $small>{catName(bill.categoryId) ?? '—'}</Cell>
              <Cell $right>
                <Money cents={monthlyEquivalent(bill)} strike={!billCounts(bill)} />
                <SubText>a month</SubText>
              </Cell>
              <Cell $small $muted={!due}>
                {due ? (due < today ? <span style={{ color: 'var(--color-danger)' }}>Overdue {formatDay(due)}</span> : `Due ${formatDay(due)}`) : billCounts(bill) ? 'Paid' : '—'}
                {latestPayment(bill) && <SubText>Paid {formatDay(latestPayment(bill)!.paidOn)}</SubText>}
              </Cell>
              <Actions>
                {due && <SmallBtn type="button" onClick={() => void onSave(markBillPaid(bill, today, newId()))}>Mark paid</SmallBtn>}
                {latestPayment(bill) && <SmallBtn type="button" onClick={() => void onSave(undoLastPayment(bill))}>Undo paid</SmallBtn>}
                <SmallBtn type="button" onClick={() => setEditing(bill.id)}>Edit</SmallBtn>
                {billCounts(bill) && <SmallBtn type="button" onClick={() => setStatus(bill, 'paused')}>Pause</SmallBtn>}
                {bill.status !== 'cancelled' && <SmallBtn type="button" onClick={() => setStatus(bill, 'cancelled')}>Mark cancelled</SmallBtn>}
                {!billCounts(bill) && <SmallBtn type="button" onClick={() => setStatus(bill, 'active')}>{bill.status === 'paused' ? 'Resume' : 'Reactivate'}</SmallBtn>}
                <ConfirmDelete onConfirm={() => onDelete(bill.id)} />
              </Actions>
            </BillRow>
          )))}
        </Table>
      )}

      {bills.some(billCounts) && (
        <BillTotal $cols={COLS} style={{ marginTop: 16 }}>
          <span>Total Active Bills</span>
          <span />
          <Cell $right>{formatCents(totals.monthly)}/mo</Cell>
          <Cell>{formatCents(totals.yearly)}/yr</Cell>
          <Cell $right>Subscriptions {formatCents(totals.subscriptionsMonthly)}/mo</Cell>
        </BillTotal>
      )}
    </BillsSection>
  );
}
