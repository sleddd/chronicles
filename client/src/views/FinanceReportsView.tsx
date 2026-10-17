import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { CollapsibleCard } from '../components/organisms/CollapsibleCard.js';
import {
  Note, StatStrip, Stat, Table, Row, TotalRow, Cell, SubText, Tag, InlineForm, Field, Money,
} from '../components/molecules/FinanceParts.js';
import { useFinance } from '../hooks/useFinance.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import {
  averagePerMonth, billPaymentRecords, filterPayments, formatCents, formatDay, formatMonth, periodRange, reportSummary,
  todayStr, UNCATEGORIZED, type ReportPeriod,
} from '../utils/finance.js';
import type { Bill } from '../types/finance.js';

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

const Filters = styled(InlineForm)`
  margin-bottom: 32px;
`;

const Cards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 32px;
`;

const CARDS_KEY = 'finance-reports-collapsed-v1';

const BILL_COLS = 'minmax(0, 1fr) 140px 90px 130px 130px';
const MONTH_COLS = 'minmax(0, 1fr) 90px 140px';
const PAY_COLS = '130px minmax(0, 1fr) 140px 120px';

const BillRow = styled(Row)`
  & > :nth-child(2) { text-align: center; }
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 110px;
    & > :nth-child(2), & > :nth-child(3), & > :nth-child(4) { display: none; }
  }
`;

const BillHead = styled(TotalRow)`
  padding-top: 0;
  font-size: 10px;
  color: var(--text-tertiary);
  & > :nth-child(2) { text-align: center; }
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 110px;
    & > :nth-child(2), & > :nth-child(3), & > :nth-child(4) { display: none; }
  }
`;

const MonthHead = styled(TotalRow)`
  padding-top: 0;
  font-size: 10px;
  color: var(--text-tertiary);
`;

const PayRow = styled(Row)`
  @media (max-width: 640px) {
    grid-template-columns: 100px minmax(0, 1fr) 100px;
    & > :nth-child(3) { display: none; }
  }
`;

/* Totals: the card heading font, a touch smaller, amounts italic */
const Totals = styled(TotalRow)`
  margin-top: 12px;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 300;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  & > :not(:first-child) { font-style: italic; }
`;

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'custom', label: 'Custom dates' },
];

const KIND_LABEL: Record<Bill['kind'], string> = { bill: 'Bill', subscription: 'Subscription' };

/** Reports: search bill payments by name, type and category, for a month, a year or any dates. */
export function FinanceReportsView() {
  return (
    <FinanceShell>
      <Reports />
    </FinanceShell>
  );
}

function Reports() {
  const reconcileOn = useEntriesStore(s => s.featureFlags.reconcileEnabled === true);
  const bills = useFinance('bills');
  const budget = useFinance('budget');
  const paydays = useFinance('paydays', { enabled: reconcileOn });

  const today = todayStr();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Bill['kind'] | 'all'>('all');
  const [categoryId, setCategoryId] = useState('all');
  const [period, setPeriod] = useState<ReportPeriod>('this-year');
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);

  const range = period === 'custom'
    ? { start: from <= to ? from : to, end: from <= to ? to : from }
    : periodRange(period, today);

  const categories = useMemo(() => [...budget.records].sort((a, b) => a.order - b.order), [budget.records]);
  const catName = (id?: string) => (id ? categories.find(c => c.id === id)?.name : undefined);
  const records = useMemo(
    () => billPaymentRecords(bills.records, reconcileOn ? paydays.records : []),
    [bills.records, paydays.records, reconcileOn],
  );
  const matches = useMemo(
    () => filterPayments(records, { query, kind, categoryId, start: range.start, end: range.end }),
    [records, query, kind, categoryId, range.start, range.end],
  );
  const summary = useMemo(() => reportSummary(matches, range.start, range.end), [matches, range.start, range.end]);

  const statuses = [bills.status, budget.status, ...(reconcileOn ? [paydays.status] : [])];
  if (statuses.some(s => s === 'idle' || s === 'loading')) return <Center><Spinner size={32} /></Center>;

  // Months that have happened since tracking started (same rule wherever an average is shown)
  const avg = averagePerMonth(summary.byMonth, today);
  const rangeLabel = `${formatDay(range.start)} – ${formatDay(range.end)}`;

  return (
    <section>
      <Filters onSubmit={e => e.preventDefault()}>
        <Field $grow><span>Search bills</span>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a bill name (e.g. rent, Netflix…)" />
        </Field>
        <Field $w="150px"><span>Type</span>
          <select value={kind} onChange={e => setKind(e.target.value as Bill['kind'] | 'all')}>
            <option value="all">All types</option>
            <option value="bill">Bills</option>
            <option value="subscription">Subscriptions</option>
          </select>
        </Field>
        <Field $w="170px"><span>Category</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={UNCATEGORIZED}>No category</option>
          </select>
        </Field>
        <Field $w="160px"><span>Period</span>
          <select value={period} onChange={e => setPeriod(e.target.value as ReportPeriod)}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        {period === 'custom' && (
          <>
            <Field $w="170px"><span>From</span><input type="date" value={from} onChange={e => e.target.value && setFrom(e.target.value)} /></Field>
            <Field $w="170px"><span>To</span><input type="date" value={to} onChange={e => e.target.value && setTo(e.target.value)} /></Field>
          </>
        )}
      </Filters>

      <StatStrip $cols={4}>
        <Stat label="Total paid" cents={summary.totalCents} sub={rangeLabel} />
        <Stat
          label="Average paid a month"
          cents={avg.averageCents}
          sub={avg.months ? `Over ${avg.months} month${avg.months === 1 ? '' : 's'} so far` : 'No payments yet'}
        />
        <Stat label="Biggest bill" cents={summary.byBill[0]?.totalCents ?? 0} sub={summary.byBill[0]?.name ?? '—'} />
        <Stat
          label="On subscriptions"
          cents={matches.filter(r => r.kind === 'subscription').reduce((t, r) => t + r.amountCents, 0)}
          sub={`${summary.count} payment${summary.count === 1 ? '' : 's'} · ${summary.byBill.length} bill${summary.byBill.length === 1 ? '' : 's'}`}
        />
      </StatStrip>

      {records.length === 0 ? (
        <Note style={{ marginTop: 32, fontStyle: 'italic' }}>
          Nothing paid yet. Use Mark paid on Budget &amp; Bills{reconcileOn ? ' or add bills to a payday on Reconcile' : ''}, and your payments show up here.
        </Note>
      ) : (
        <Cards>
          <CollapsibleCard id="by-bill" title="By bill" storageKey={CARDS_KEY}>
            {summary.byBill.length === 0 ? (
              <Note style={{ fontStyle: 'italic' }}>No payments match these filters.</Note>
            ) : (
              <Table>
                <BillHead $cols={BILL_COLS} aria-hidden="true">
                  <span>Bill</span><span>Category</span><Cell $right>Payments</Cell><Cell $right>Last paid</Cell><Cell $right>Total</Cell>
                </BillHead>
                {summary.byBill.map(b => (
                  <BillRow key={b.billId} $cols={BILL_COLS}>
                    <span>{b.name}<SubText style={{ fontWeight: 500 }}>{KIND_LABEL[b.kind]}</SubText></span>
                    <Cell $muted $small>{catName(b.categoryId) ?? '—'}</Cell>
                    <Cell $right>{b.count}</Cell>
                    <Cell $right $muted $small>{formatDay(b.lastPaid)}</Cell>
                    <Cell $right><Money cents={b.totalCents} /></Cell>
                  </BillRow>
                ))}
                <Totals $cols={BILL_COLS}>
                  <span>Total</span><span /><Cell $right>{summary.count}</Cell><span /><Cell $right>{formatCents(summary.totalCents)}</Cell>
                </Totals>
              </Table>
            )}
          </CollapsibleCard>

          <CollapsibleCard id="by-month" title="By month" storageKey={CARDS_KEY}>
            <Table>
              <MonthHead $cols={MONTH_COLS} aria-hidden="true">
                <span>Month</span><Cell $right>Payments</Cell><Cell $right>Paid</Cell>
              </MonthHead>
              {summary.byMonth.map(m => (
                <Row key={m.month} $cols={MONTH_COLS} $muted={m.count === 0}>
                  <span>{formatMonth(m.month)}</span>
                  <Cell $right>{m.count || '—'}</Cell>
                  <Cell $right>{m.count ? <Money cents={m.totalCents} /> : '—'}</Cell>
                </Row>
              ))}
              <Totals $cols={MONTH_COLS}>
                <span>Total</span><Cell $right>{summary.count}</Cell><Cell $right>{formatCents(summary.totalCents)}</Cell>
              </Totals>
            </Table>
          </CollapsibleCard>

          <CollapsibleCard id="payments" title="Every payment" storageKey={CARDS_KEY} defaultOpen={false}>
            {matches.length === 0 ? (
              <Note style={{ fontStyle: 'italic' }}>No payments match these filters.</Note>
            ) : (
              <Table>
                {[...matches].reverse().map(r => (
                  <PayRow key={r.key} $cols={PAY_COLS}>
                    <Cell $small $muted>{formatDay(r.date)}</Cell>
                    <span>{r.name}{r.source === 'reconcile' && <Tag>Reconcile</Tag>}</span>
                    <Cell $muted $small>{catName(r.categoryId) ?? '—'}</Cell>
                    <Cell $right><Money cents={r.amountCents} /></Cell>
                  </PayRow>
                ))}
              </Table>
            )}
          </CollapsibleCard>
        </Cards>
      )}
    </section>
  );
}
