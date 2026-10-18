import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import {
  Note, StatBoxRow, StatCell, SheetHead, SheetHeading, SheetBox, SHEET_RULE,
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

/* Search pill + three picker pills in one row */
const Filters = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 32px 0 24px;
`;

const pill = `
  display: flex;
  align-items: center;
  height: 40px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  &:focus-within { border-color: var(--control-border); }
`;

const Search = styled.label`
  ${pill}
  flex: 1 1 260px;
  gap: 10px;
  padding: 0 18px;
  color: var(--text-muted);
  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
  }
  input::placeholder { color: var(--text-hint); }
  input::-webkit-search-cancel-button { display: none; }
`;

const Picker = styled.label`
  ${pill}
  position: relative;
  flex: 0 0 auto;
  select {
    height: 100%;
    padding: 0 38px 0 18px;
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
  & > span { position: absolute; right: 14px; display: inline-flex; color: var(--text-muted); pointer-events: none; }
`;

const DateBox = styled(Picker)`
  input {
    height: 100%;
    padding: 0 14px;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
    color-scheme: light dark;
  }
`;

const Section = styled.section`
  margin-top: 44px;
`;

/* Sheet rows: by bill */
const BillGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 90px 110px 110px;
  align-items: center;
  gap: 16px;
  padding: 14px 28px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  & > :nth-child(n+3) { text-align: right; }
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  small { display: block; margin-top: 2px; font-size: 13px; color: var(--text-muted); }
  .muted { color: var(--text-muted); }
  b { font-weight: 500; }
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 100px;
    padding: 12px 16px;
    & > :nth-child(2), & > :nth-child(3), & > :nth-child(4) { display: none; }
  }
`;

const BillHeadGrid = styled(BillGrid)`
  padding-top: 16px;
  padding-bottom: 12px;
  font-size: 13px;
  color: var(--text-muted);
`;

/* By month: month | bar | payments | total */
const MonthGrid = styled.div<{ $empty?: boolean; $total?: boolean }>`
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) 120px 110px;
  align-items: center;
  gap: 24px;
  padding: 12px 28px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $empty }) => ($empty ? 'var(--text-muted)' : 'var(--text-secondary)')};
  background: ${({ $total }) => ($total ? 'var(--bg-panel)' : 'transparent')};
  font-weight: ${({ $total }) => ($total ? 500 : 400)};
  font-variant-numeric: tabular-nums;
  & > :nth-child(n+3) { text-align: right; }
  & > :nth-child(3) { font-size: 14px; color: var(--text-muted); font-weight: 400; }
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 100px;
    padding: 12px 16px;
    & > :nth-child(2), & > :nth-child(3) { display: none; }
  }
`;

const MonthBar = styled.div<{ $pct: number }>`
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(var(--color-accent), var(--color-accent)) no-repeat left / ${({ $pct }) => $pct}% 100%, ${SHEET_RULE};
`;

/* Every payment, grouped by day */
const DayHead = styled.div`
  padding: 10px 28px;
  background: var(--bg-panel);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  & + * { border-top: 1px solid ${SHEET_RULE}; }
  * + & { border-top: 1px solid ${SHEET_RULE}; }
`;

const PayGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px 110px;
  align-items: center;
  gap: 16px;
  padding: 12px 28px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  & > :nth-child(2) { font-size: 14px; color: var(--text-muted); }
  & > :nth-child(3) { text-align: right; }
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  em { margin-left: 8px; font-style: normal; font-size: 12px; color: var(--text-muted); }
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) 100px;
    padding: 12px 16px;
    & > :nth-child(2) { display: none; }
  }
`;

const Empty = styled.p`
  margin: 0;
  padding: 20px 28px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
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

  const subsBills = new Set(matches.filter(r => r.kind === 'subscription').map(r => r.billId));
  const maxMonth = Math.max(1, ...summary.byMonth.map(m => m.totalCents));
  const byDay = (() => {
    const map = new Map<string, typeof matches>();
    for (const r of [...matches].reverse()) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    return [...map.entries()];
  })();

  return (
    <section>
      <Filters onSubmit={e => e.preventDefault()}>
        <Search>
          <Icon name="search" size={16} strokeWidth={2} />
          <input type="search" aria-label="Search bills" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search bills, e.g. rent, Netflix" />
        </Search>
        <Picker>
          <select aria-label="Type" value={kind} onChange={e => setKind(e.target.value as Bill['kind'] | 'all')}>
            <option value="all">All types</option>
            <option value="bill">Bills</option>
            <option value="subscription">Subscriptions</option>
          </select>
          <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
        </Picker>
        <Picker>
          <select aria-label="Category" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={UNCATEGORIZED}>No category</option>
          </select>
          <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
        </Picker>
        <Picker>
          <select aria-label="Period" value={period} onChange={e => setPeriod(e.target.value as ReportPeriod)}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
        </Picker>
        {period === 'custom' && (
          <>
            <DateBox><input type="date" aria-label="From" value={from} onChange={e => e.target.value && setFrom(e.target.value)} /></DateBox>
            <DateBox><input type="date" aria-label="To" value={to} onChange={e => e.target.value && setTo(e.target.value)} /></DateBox>
          </>
        )}
      </Filters>

      <StatBoxRow $cols={4}>
        <StatCell label="Total paid" cents={summary.totalCents} sub={rangeLabel} />
        <StatCell
          label="Average a month"
          cents={avg.averageCents}
          sub={avg.months ? `Over ${avg.months} month${avg.months === 1 ? '' : 's'} so far` : 'No payments yet'}
        />
        <StatCell label="Biggest bill" cents={summary.byBill[0]?.totalCents ?? 0} sub={summary.byBill[0]?.name ?? '—'} />
        <StatCell
          label="On subscriptions"
          cents={matches.filter(r => r.kind === 'subscription').reduce((t, r) => t + r.amountCents, 0)}
          sub={`${subsBills.size} subscription${subsBills.size === 1 ? '' : 's'}`}
        />
      </StatBoxRow>

      {records.length === 0 ? (
        <Note style={{ marginTop: 32 }}>
          Nothing paid yet. Use Mark paid on Budget &amp; bills{reconcileOn ? ' or add bills to a payday on Reconcile' : ''}, and your payments show up here.
        </Note>
      ) : (
        <>
          <Section aria-label="By bill">
            <SheetHead><SheetHeading>By bill</SheetHeading></SheetHead>
            <SheetBox>
              {summary.byBill.length === 0 ? <Empty>No payments match these filters.</Empty> : (
                <>
                  <BillHeadGrid aria-hidden="true"><span>Bill</span><span>Category</span><span>Payments</span><span>Last paid</span><span>Total</span></BillHeadGrid>
                  {summary.byBill.map(b => (
                    <BillGrid key={b.billId}>
                      <span>{b.name}<small>{KIND_LABEL[b.kind]}</small></span>
                      <span>{catName(b.categoryId) ?? '—'}</span>
                      <span>{b.count}</span>
                      <span className="muted">{shortDay(b.lastPaid, today)}</span>
                      <b>{formatCents(b.totalCents)}</b>
                    </BillGrid>
                  ))}
                </>
              )}
            </SheetBox>
          </Section>

          <Section aria-label="By month">
            <SheetHead><SheetHeading>By month</SheetHeading></SheetHead>
            <SheetBox>
              {summary.byMonth.map(m => (
                <MonthGrid key={m.month} $empty={m.count === 0}>
                  <span>{formatMonth(m.month)}</span>
                  <MonthBar $pct={(m.totalCents / maxMonth) * 100} />
                  <span>{m.count ? `${m.count} payment${m.count === 1 ? '' : 's'}` : '—'}</span>
                  <span>{m.count ? formatCents(m.totalCents) : '—'}</span>
                </MonthGrid>
              ))}
              <MonthGrid $total>
                <span>Total</span><span />
                <span>{summary.count} payment{summary.count === 1 ? '' : 's'}</span>
                <span>{formatCents(summary.totalCents)}</span>
              </MonthGrid>
            </SheetBox>
          </Section>

          <Section aria-label="Every payment">
            <SheetHead><SheetHeading>Every payment</SheetHeading></SheetHead>
            <SheetBox>
              {byDay.length === 0 ? <Empty>No payments match these filters.</Empty> : byDay.map(([day, rows]) => (
                <div key={day}>
                  <DayHead>{formatDay(day)}</DayHead>
                  {rows.map(r => (
                    <PayGrid key={r.key}>
                      <span>{r.name}{r.source === 'reconcile' && <em>Reconcile</em>}</span>
                      <span>{catName(r.categoryId) ?? '—'}</span>
                      <span>{formatCents(r.amountCents)}</span>
                    </PayGrid>
                  ))}
                </div>
              ))}
            </SheetBox>
          </Section>
        </>
      )}
    </section>
  );
}

/** "Oct 16" this year, "Apr 1, 2027" otherwise */
function shortDay(day: string, today: string): string {
  return day.slice(0, 4) === today.slice(0, 4) ? formatDay(day).replace(/, \d{4}$/, '') : formatDay(day);
}
